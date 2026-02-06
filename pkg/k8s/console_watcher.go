package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

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

// Start begins watching all console resources
func (w *ConsoleWatcher) Start(ctx context.Context) error {
	w.mu.Lock()
	if w.started {
		w.mu.Unlock()
		return fmt.Errorf("watcher already started")
	}
	w.started = true
	w.mu.Unlock()

	log.Printf("[ConsoleWatcher] Starting watch on namespace %s", w.namespace)

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
		go w.watchResource(ctx, r.gvr, r.resourceType)
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
		log.Printf("[ConsoleWatcher] Stopping watch for %s", gvr.Resource)
		watcher.Stop()
	}

	w.started = false
	w.watchers = make(map[schema.GroupVersionResource]watch.Interface)
	log.Printf("[ConsoleWatcher] All watches stopped")
}

// watchResource watches a single resource type with retry logic
func (w *ConsoleWatcher) watchResource(ctx context.Context, gvr schema.GroupVersionResource, resourceType string) {
	backoff := time.Second
	maxBackoff := time.Minute

	for {
		select {
		case <-w.stopCh:
			return
		case <-ctx.Done():
			return
		default:
		}

		err := w.doWatch(ctx, gvr, resourceType)
		if err != nil {
			log.Printf("[ConsoleWatcher] Watch error for %s: %v, retrying in %v", resourceType, err, backoff)

			select {
			case <-w.stopCh:
				return
			case <-ctx.Done():
				return
			case <-time.After(backoff):
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

// doWatch performs the actual watch operation
func (w *ConsoleWatcher) doWatch(ctx context.Context, gvr schema.GroupVersionResource, resourceType string) error {
	log.Printf("[ConsoleWatcher] Starting watch for %s in namespace %s", resourceType, w.namespace)

	watcher, err := w.client.Resource(gvr).Namespace(w.namespace).Watch(ctx, metav1.ListOptions{})
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
		case <-w.stopCh:
			return nil
		case <-ctx.Done():
			return nil
		case event, ok := <-watcher.ResultChan():
			if !ok {
				return fmt.Errorf("watch channel closed")
			}

			if err := w.handleEvent(event, resourceType); err != nil {
				log.Printf("[ConsoleWatcher] Error handling %s event: %v", resourceType, err)
			}
		}
	}
}

// handleEvent processes a watch event
func (w *ConsoleWatcher) handleEvent(event watch.Event, resourceType string) error {
	if event.Type == watch.Error {
		return fmt.Errorf("watch error event")
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

	log.Printf("[ConsoleWatcher] %s %s: %s/%s", eventType, resourceType, u.GetNamespace(), u.GetName())

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
