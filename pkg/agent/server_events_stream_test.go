package agent

import (
	"testing"

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
