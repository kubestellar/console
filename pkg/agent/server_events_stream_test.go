package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/watch"
)

// TestSummarizeEvent_TypedNil ensures summarizeEvent does not panic when the
// watch event carries a typed-nil *corev1.Event. A type assertion succeeds for
// typed nils (ok == true), so the nil guard must be explicit.
func TestSummarizeEvent_TypedNil(t *testing.T) {
	t.Parallel()
	var ev *corev1.Event // typed nil
	evt := watch.Event{
		Type:   watch.Modified,
		Object: ev,
	}
	// Must not panic.
	got := summarizeEvent(evt, "test-cluster")
	if got.Cluster != "test-cluster" {
		t.Errorf("expected cluster %q, got %q", "test-cluster", got.Cluster)
	}
}

// TestSummarizeEvent_WrongType ensures summarizeEvent returns a zero-valued
// summary when the watch event carries a non-Event object.
func TestSummarizeEvent_WrongType(t *testing.T) {
	t.Parallel()
	evt := watch.Event{
		Type:   watch.Added,
		Object: &corev1.Pod{},
	}
	got := summarizeEvent(evt, "test-cluster")
	if got.Cluster != "test-cluster" {
		t.Errorf("expected cluster %q, got %q", "test-cluster", got.Cluster)
	}
	if got.Type != "" || got.Reason != "" || got.Message != "" {
		t.Errorf("expected empty summary fields for wrong type, got %+v", got)
	}
}

// TestSummarizeEvent_ValidEvent ensures summarizeEvent populates all fields
// from a well-formed *corev1.Event.
func TestSummarizeEvent_ValidEvent(t *testing.T) {
	t.Parallel()
	ev := &corev1.Event{
		Type:    "Warning",
		Reason:  "BackOff",
		Message: "Back-off restarting failed container",
	}
	ev.Namespace = "default"
	ev.InvolvedObject.Kind = "Pod"
	ev.InvolvedObject.Name = "my-pod"
	evt := watch.Event{
		Type:   watch.Added,
		Object: ev,
	}
	got := summarizeEvent(evt, "prod")
	if got.Type != "Warning" {
		t.Errorf("Type: want %q got %q", "Warning", got.Type)
	}
	if got.Reason != "BackOff" {
		t.Errorf("Reason: want %q got %q", "BackOff", got.Reason)
	}
	if got.Object != "Pod/my-pod" {
		t.Errorf("Object: want %q got %q", "Pod/my-pod", got.Object)
	}
	if got.Namespace != "default" {
		t.Errorf("Namespace: want %q got %q", "default", got.Namespace)
	}
	if got.Cluster != "prod" {
		t.Errorf("Cluster: want %q got %q", "prod", got.Cluster)
	}
	if got.Message != "Back-off restarting failed container" {
		t.Errorf("Message: want %q got %q", "Back-off restarting failed container", got.Message)
	}
}

// TestForwardEventToStellar_BackendAcceptsEvent verifies that a 202 response
// from the Stellar backend is handled without error.
func TestForwardEventToStellar_BackendAcceptsEvent(t *testing.T) {
	var received map[string]interface{}
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Errorf("backend: decode body: %v", err)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer backend.Close()

	t.Setenv("BACKEND_URL", backend.URL)

	s := &Server{
		stellarClient:     backend.Client(),
		stellarForwardSem: make(chan struct{}, maxConcurrentForwards),
	}

	event := sseEventSummary{
		Cluster:   "prod",
		Namespace: "default",
		Object:    "Pod/my-pod",
		Reason:    "BackOff",
		Message:   "container crashed",
		Type:      "Warning",
	}
	s.forwardEventToStellar(event)

	if received["cluster"] != "prod" {
		t.Errorf("cluster: want %q got %v", "prod", received["cluster"])
	}
	if received["namespace"] != "default" {
		t.Errorf("namespace: want %q got %v", "default", received["namespace"])
	}
	if received["kind"] != "Pod" {
		t.Errorf("kind: want %q got %v", "Pod", received["kind"])
	}
	if received["name"] != "my-pod" {
		t.Errorf("name: want %q got %v", "my-pod", received["name"])
	}
}

// TestForwardEventToStellar_BackendRejectsEvent verifies that a non-202
// response from the Stellar backend is handled gracefully (no panic).
func TestForwardEventToStellar_BackendRejectsEvent(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer backend.Close()

	t.Setenv("BACKEND_URL", backend.URL)

	s := &Server{
		stellarClient:     backend.Client(),
		stellarForwardSem: make(chan struct{}, maxConcurrentForwards),
	}

	// Must not panic on a non-202 response.
	s.forwardEventToStellar(sseEventSummary{Cluster: "c1", Namespace: "ns", Object: "Pod/p", Reason: "r", Type: "Warning"})
}

// TestForwardEventToStellar_SemaphoreTimeout verifies that forwardEventToStellar
// drops an event (rather than blocking) when all semaphore slots are occupied.
func TestForwardEventToStellar_SemaphoreTimeout(t *testing.T) {
	// Use a semaphore of size 1 and pre-occupy it so the next call times out.
	sem := make(chan struct{}, 1)
	sem <- struct{}{} // occupy the single slot

	// Backend should never be called — the event is dropped before the request.
	called := false
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusAccepted)
	}))
	defer backend.Close()

	t.Setenv("BACKEND_URL", backend.URL)

	s := &Server{
		stellarClient:     backend.Client(),
		stellarForwardSem: sem,
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		s.forwardEventToStellar(sseEventSummary{Cluster: "c1", Namespace: "ns", Object: "Pod/p", Reason: "r", Type: "Warning"})
	}()

	// Must complete within semaphoreAcquireTimeout + a small buffer.
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		// Good — the call returned promptly after dropping the event.
	case <-time.After(semaphoreAcquireTimeout + 2*time.Second):
		t.Fatal("forwardEventToStellar blocked longer than expected (semaphore timeout not working)")
	}

	if called {
		t.Error("backend was called despite semaphore being full — event should have been dropped")
	}
}
