package k8s

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestGetEvents(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	event := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "event1",
			Namespace: "default",
		},
		InvolvedObject: corev1.ObjectReference{
			Kind: "Pod",
			Name: "pod1",
		},
		Reason:        "Started",
		Message:       "Started container",
		LastTimestamp: metav1.Time{Time: time.Now()},
	}

	fakeCS := k8sfake.NewSimpleClientset(event)
	m.clients["c1"] = fakeCS

	events, err := m.GetEvents(context.Background(), "c1", "default", 10)
	if err != nil {
		t.Fatalf("GetEvents failed: %v", err)
	}

	if len(events) != 1 {
		t.Fatalf("Expected 1 event, got %d", len(events))
	}
	if events[0].Reason != "Started" {
		t.Errorf("Expected Started reason, got %s", events[0].Reason)
	}
}

func TestGetEventsSortedByTimestamp(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	now := time.Now()
	events := []k8sruntime.Object{
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "event-old", Namespace: "default"},
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod1"},
			Reason:         "OldEvent",
			Message:        "old event",
			LastTimestamp:  metav1.Time{Time: now.Add(-2 * time.Hour)},
		},
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "event-new", Namespace: "default"},
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod2"},
			Reason:         "NewEvent",
			Message:        "new event",
			LastTimestamp:  metav1.Time{Time: now},
		},
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "event-mid", Namespace: "default"},
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod3"},
			Reason:         "MidEvent",
			Message:        "mid event",
			LastTimestamp:  metav1.Time{Time: now.Add(-1 * time.Hour)},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(events...)
	m.clients["c1"] = fakeCS

	got, err := m.GetEvents(context.Background(), "c1", "default", 10)
	if err != nil {
		t.Fatalf("GetEvents failed: %v", err)
	}

	if len(got) != 3 {
		t.Fatalf("Expected 3 events, got %d", len(got))
	}

	// Events must be sorted newest-first.
	if got[0].Reason != "NewEvent" || got[1].Reason != "MidEvent" || got[2].Reason != "OldEvent" {
		t.Errorf("Events not sorted by timestamp descending: got %v, %v, %v",
			got[0].Reason, got[1].Reason, got[2].Reason)
	}
}

func TestGetEventsLimitAppliedAfterSort(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	now := time.Now()
	events := []k8sruntime.Object{
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "event-old", Namespace: "default"},
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod1"},
			Reason:         "OldEvent",
			Message:        "old event",
			LastTimestamp:  metav1.Time{Time: now.Add(-2 * time.Hour)},
		},
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "event-new", Namespace: "default"},
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod2"},
			Reason:         "NewEvent",
			Message:        "new event",
			LastTimestamp:  metav1.Time{Time: now},
		},
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "event-mid", Namespace: "default"},
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod3"},
			Reason:         "MidEvent",
			Message:        "mid event",
			LastTimestamp:  metav1.Time{Time: now.Add(-1 * time.Hour)},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(events...)
	m.clients["c1"] = fakeCS

	// limit=2 should return the 2 most recent events, not any arbitrary 2
	got, err := m.GetEvents(context.Background(), "c1", "default", 2)
	if err != nil {
		t.Fatalf("GetEvents failed: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("Expected 2 events, got %d", len(got))
	}

	if got[0].Reason != "NewEvent" || got[1].Reason != "MidEvent" {
		t.Errorf("Limit should keep most recent events: got %v, %v",
			got[0].Reason, got[1].Reason)
	}
}

func TestGetWarningEventsSortedByTimestamp(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	now := time.Now()
	events := []k8sruntime.Object{
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "warn-old", Namespace: "default"},
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod1"},
			Type:           "Warning",
			Reason:         "OldWarning",
			Message:        "old warning",
			LastTimestamp:  metav1.Time{Time: now.Add(-2 * time.Hour)},
		},
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "warn-new", Namespace: "default"},
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod2"},
			Type:           "Warning",
			Reason:         "NewWarning",
			Message:        "new warning",
			LastTimestamp:  metav1.Time{Time: now},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(events...)
	m.clients["c1"] = fakeCS

	got, err := m.GetWarningEvents(context.Background(), "c1", "default", 10)
	if err != nil {
		t.Fatalf("GetWarningEvents failed: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("Expected 2 warning events, got %d", len(got))
	}

	if got[0].Reason != "NewWarning" || got[1].Reason != "OldWarning" {
		t.Errorf("Warning events not sorted by timestamp descending: got %v, %v",
			got[0].Reason, got[1].Reason)
	}
}
