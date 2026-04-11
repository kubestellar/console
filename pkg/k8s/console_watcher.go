package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

// errWatchGone is returned from doWatch when the apiserver sends a 410 Gone
// event on the watch channel (#6687). The caller must re-list to obtain a
// fresh ResourceVersion and restart the watch — treating 410 as a transient
// retry leaks events and can loop forever against a stale RV.
var errWatchGone = fmt.Errorf("watch expired (410 Gone) — must re-list")

// ConsoleResourceEvent represents a change to a console resource
type ConsoleResourceEvent struct {
	Type         string      `json:"type"`         // "ADDED", "MODIFIED", "DELETED"
	ResourceType string      `json:"resourceType"` // "ManagedWorkload", "ClusterGroup", "WorkloadDeployment"
	Name         string      `json:"name"`
	Namespace    string      `json:"namespace"`
	Resource     interface{} `json:"resource,omitempty"` // The full resource (nil for DELETED)
}

// ConsoleResourceEventHandler is called when a console resource changes
type ConsoleResourceEventHandler func(event ConsoleResourceEvent)

// ConsoleWatcher watches console CRDs for changes
type ConsoleWatcher struct {
	client    dynamic.Interface
	namespace string
	handler   ConsoleResourceEventHandler

	stopCh   chan struct{}
	watchers map[schema.GroupVersionResource]watch.Interface
	mu       sync.Mutex
	started  bool
}

// NewConsoleWatcher creates a new ConsoleWatcher
func NewConsoleWatcher(client dynamic.Interface, namespace string, handler ConsoleResourceEventHandler) *ConsoleWatcher {
	return &ConsoleWatcher{
		client:    client,
		namespace: namespace,
		handler:   handler,
		stopCh:    make(chan struct{}),
		watchers:  make(map[schema.GroupVersionResource]watch.Interface),
	}
}

// Start begins watching all console resources.
//
// issue 6472 — Safe to restart after Stop(). Previously Stop() closed
// stopCh but Start() did not recreate it, so the second Start() succeeded
// but every watchResource goroutine returned immediately because reading
// from the closed stopCh always won the select.
func (w *ConsoleWatcher) Start(ctx context.Context) error {
	w.mu.Lock()
	if w.started {
		w.mu.Unlock()
		return fmt.Errorf("watcher already started")
	}
	// Recreate the stop channel on every Start. A nil or closed stopCh from
	// a previous lifecycle would make watchResource exit immediately.
	w.stopCh = make(chan struct{})
	w.started = true
	// Snapshot the stop channel for the goroutines so they read a consistent
	// value even if a subsequent Stop+Start rotates the field concurrently
	// (race detector flags the bare w.stopCh read otherwise).
	stopCh := w.stopCh
	w.mu.Unlock()

	slog.Info("[ConsoleWatcher] starting watch", "namespace", w.namespace)

	// Start watchers for each resource type
	gvrs := []struct {
		gvr          schema.GroupVersionResource
		resourceType string
	}{
		{v1alpha1.ManagedWorkloadGVR, "ManagedWorkload"},
		{v1alpha1.ClusterGroupGVR, "ClusterGroup"},
		{v1alpha1.WorkloadDeploymentGVR, "WorkloadDeployment"},
	}

	for _, r := range gvrs {
		go w.watchResource(ctx, stopCh, r.gvr, r.resourceType)
	}

	return nil
}

// Stop stops all watches
func (w *ConsoleWatcher) Stop() {
	w.mu.Lock()
	defer w.mu.Unlock()

	if !w.started {
		return
	}

	close(w.stopCh)

	for gvr, watcher := range w.watchers {
		slog.Info("[ConsoleWatcher] stopping watch", "resource", gvr.Resource)
		watcher.Stop()
	}

	w.started = false
	w.watchers = make(map[schema.GroupVersionResource]watch.Interface)
	slog.Info("[ConsoleWatcher] All watches stopped")
}

// watchResource watches a single resource type with retry logic.
// The stopCh is passed explicitly rather than read from w.stopCh so that
// a concurrent Stop→Start sequence (which rotates w.stopCh under w.mu)
// does not race with the goroutine's unprotected reads.
func (w *ConsoleWatcher) watchResource(ctx context.Context, stopCh <-chan struct{}, gvr schema.GroupVersionResource, resourceType string) {
	backoff := time.Second
	maxBackoff := time.Minute

	for {
		select {
		case <-stopCh:
			return
		case <-ctx.Done():
			return
		default:
		}

		err := w.doWatch(ctx, stopCh, gvr, resourceType)
		if err != nil {
			slog.Error("[ConsoleWatcher] watch error, retrying", "resourceType", resourceType, "error", err, "retryIn", backoff)

			timer := time.NewTimer(backoff)
			select {
			case <-stopCh:
				timer.Stop()
				return
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}

			// Exponential backoff
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		} else {
			// Reset backoff on successful watch
			backoff = time.Second
		}
	}
}

// doWatch performs the actual watch operation.
//
// #6686 — We List first to capture the current ResourceVersion and start
// the Watch from that RV. Watching without a ResourceVersion causes the
// apiserver to replay state from an arbitrary point, producing duplicate
// events on reconnect and (worse) gaps if the watch cache has already
// compacted past the implicit starting point. By doing List → Watch we
// get deterministic semantics: any event delivered is strictly newer than
// what the caller observed from the List result.
//
// #6687 — If the apiserver sends a watch.Error event whose Status is 410
// Gone, the watch cache has compacted past our ResourceVersion. This is a
// fatal signal: the RV is no longer usable, and re-dialing the same watch
// would fail again. We surface errWatchGone so the retry loop in
// watchResource re-runs doWatch (which triggers a fresh List and a new RV),
// rather than treating it as a transient error.
func (w *ConsoleWatcher) doWatch(ctx context.Context, stopCh <-chan struct{}, gvr schema.GroupVersionResource, resourceType string) error {
	slog.Info("[ConsoleWatcher] starting watch for resource", "resourceType", resourceType, "namespace", w.namespace)

	// List first to capture ResourceVersion (#6686).
	list, err := w.client.Resource(gvr).Namespace(w.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list %s for initial ResourceVersion: %w", resourceType, err)
	}
	initialRV := list.GetResourceVersion()

	watcher, err := w.client.Resource(gvr).Namespace(w.namespace).Watch(ctx, metav1.ListOptions{
		ResourceVersion: initialRV,
	})
	if err != nil {
		return fmt.Errorf("failed to create watch: %w", err)
	}

	w.mu.Lock()
	w.watchers[gvr] = watcher
	w.mu.Unlock()

	defer func() {
		watcher.Stop()
		w.mu.Lock()
		delete(w.watchers, gvr)
		w.mu.Unlock()
	}()

	for {
		select {
		case <-stopCh:
			return nil
		case <-ctx.Done():
			return nil
		case event, ok := <-watcher.ResultChan():
			if !ok {
				return fmt.Errorf("watch channel closed")
			}

			if err := w.handleEvent(event, resourceType); err != nil {
				// #6687 — 410 Gone is fatal: propagate up so the retry
				// loop re-lists to obtain a fresh ResourceVersion.
				if err == errWatchGone {
					slog.Warn("[ConsoleWatcher] watch expired (410 Gone), will re-list",
						"resourceType", resourceType)
					return err
				}
				slog.Error("[ConsoleWatcher] error handling event", "resourceType", resourceType, "error", err)
			}
		}
	}
}

// handleEvent processes a watch event.
//
// #6687 — Inspect watch.Error events for status 410 Gone. Previously all
// errors collapsed to `watch error event`, so a permanent "watch cache
// compacted past RV" condition looked identical to a transient hiccup and
// the retry loop happily reconnected to the same dead RV until the next
// deploy. Now we return errWatchGone for 410s so the caller knows to
// re-List; all other error events remain transient.
func (w *ConsoleWatcher) handleEvent(event watch.Event, resourceType string) error {
	if event.Type == watch.Error {
		if status, ok := event.Object.(*metav1.Status); ok {
			// apierrors.IsGone works on a StatusError wrapping metav1.Status
			if status.Code == 410 || apierrors.IsGone(&apierrors.StatusError{ErrStatus: *status}) {
				return errWatchGone
			}
			return fmt.Errorf("watch error event: %s (code=%d reason=%s)",
				status.Message, status.Code, status.Reason)
		}
		return fmt.Errorf("watch error event (unknown object type %T)", event.Object)
	}

	u, ok := event.Object.(*unstructured.Unstructured)
	if !ok {
		return fmt.Errorf("unexpected object type: %T", event.Object)
	}

	var eventType string
	switch event.Type {
	case watch.Added:
		eventType = "ADDED"
	case watch.Modified:
		eventType = "MODIFIED"
	case watch.Deleted:
		eventType = "DELETED"
	default:
		return nil // Ignore other event types
	}

	// Convert to typed resource
	var resource interface{}
	if event.Type != watch.Deleted {
		var err error
		switch resourceType {
		case "ManagedWorkload":
			resource, err = v1alpha1.ManagedWorkloadFromUnstructured(u)
		case "ClusterGroup":
			resource, err = v1alpha1.ClusterGroupFromUnstructured(u)
		case "WorkloadDeployment":
			resource, err = v1alpha1.WorkloadDeploymentFromUnstructured(u)
		}
		if err != nil {
			return fmt.Errorf("failed to convert resource: %w", err)
		}
	}

	consoleEvent := ConsoleResourceEvent{
		Type:         eventType,
		ResourceType: resourceType,
		Name:         u.GetName(),
		Namespace:    u.GetNamespace(),
		Resource:     resource,
	}

	slog.Info("[ConsoleWatcher] resource event", "eventType", eventType, "resourceType", resourceType, "namespace", u.GetNamespace(), "name", u.GetName())

	// Call handler
	if w.handler != nil {
		w.handler(consoleEvent)
	}

	return nil
}

// ConsoleResourceEventToJSON converts an event to JSON bytes
func ConsoleResourceEventToJSON(event ConsoleResourceEvent) ([]byte, error) {
	return json.Marshal(event)
}

// WebSocketMessage wraps a console resource event for WebSocket broadcast
type WebSocketMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// NewConsoleResourceChangedMessage creates a WebSocket message for console resource changes
func NewConsoleResourceChangedMessage(event ConsoleResourceEvent) WebSocketMessage {
	return WebSocketMessage{
		Type: "console_resource_changed",
		Data: event,
	}
}
