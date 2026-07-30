package k8s

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
)

// TestConsoleWatcher_HandleEvent_410Gone verifies #6687: a watch.Error event
// carrying a 410 Gone Status must be surfaced as errWatchGone so the retry
// loop re-Lists for a fresh ResourceVersion instead of reconnecting to the
// same dead RV.
func TestConsoleWatcher_HandleEvent_410Gone(t *testing.T) {
	w := &ConsoleWatcher{}

	goneEvent := watch.Event{
		Type: watch.Error,
		Object: &metav1.Status{
			Status:  metav1.StatusFailure,
			Code:    410,
			Reason:  metav1.StatusReasonGone,
			Message: "too old resource version: 1 (5)",
		},
	}
	err := w.handleEvent(goneEvent, "ManagedWorkload")
	if err != errWatchGone {
		t.Fatalf("expected errWatchGone for 410 event, got %v", err)
	}
}

// TestConsoleWatcher_HandleEvent_OtherError verifies that non-410 watch.Error
// events are still treated as transient (anything except errWatchGone so the
// retry loop can back off and retry).
func TestConsoleWatcher_HandleEvent_OtherError(t *testing.T) {
	w := &ConsoleWatcher{}

	otherEvent := watch.Event{
		Type: watch.Error,
		Object: &metav1.Status{
			Status:  metav1.StatusFailure,
			Code:    500,
			Reason:  metav1.StatusReasonInternalError,
			Message: "something broke",
		},
	}
	err := w.handleEvent(otherEvent, "ClusterGroup")
	if err == nil {
		t.Fatal("expected error for 500 event, got nil")
	}
	if err == errWatchGone {
		t.Fatal("500 event must not be classified as Gone")
	}
}

// TestConsoleWatcher_HandleEvent_UnknownErrorObject ensures we never panic
// when the error event payload is not a metav1.Status (defensive: apiserver
// shouldn't send anything else, but client-go's typed Object is interface{}).
func TestConsoleWatcher_HandleEvent_UnknownErrorObject(t *testing.T) {
	w := &ConsoleWatcher{}

	weirdEvent := watch.Event{
		Type:   watch.Error,
		Object: nil,
	}
	err := w.handleEvent(weirdEvent, "WorkloadDeployment")
	if err == nil {
		t.Fatal("expected error for unknown error object, got nil")
	}
}
