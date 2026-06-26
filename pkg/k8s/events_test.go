package k8s

import (
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestEffectiveEventTime(t *testing.T) {
	// Canonical reference times for the test cases.
	var (
		eventT = time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		lastT  = time.Date(2024, 6, 1, 11, 0, 0, 0, time.UTC)
		firstT = time.Date(2024, 6, 1, 10, 0, 0, 0, time.UTC)
	)

	tests := []struct {
		name  string
		event *corev1.Event
		want  time.Time
	}{
		{
			name: "prefers EventTime when populated",
			event: &corev1.Event{
				EventTime:      metav1.MicroTime{Time: eventT},
				LastTimestamp:  metav1.Time{Time: lastT},
				FirstTimestamp: metav1.Time{Time: firstT},
			},
			want: eventT,
		},
		{
			name: "falls back to LastTimestamp when EventTime is zero",
			event: &corev1.Event{
				LastTimestamp:  metav1.Time{Time: lastT},
				FirstTimestamp: metav1.Time{Time: firstT},
			},
			want: lastT,
		},
		{
			name: "falls back to FirstTimestamp when EventTime and LastTimestamp are zero",
			event: &corev1.Event{
				FirstTimestamp: metav1.Time{Time: firstT},
			},
			want: firstT,
		},
		{
			name:  "returns zero time when all timestamps are zero",
			event: &corev1.Event{},
			want:  time.Time{},
		},
		{
			name:  "nil event returns zero time",
			event: nil,
			want:  time.Time{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := EffectiveEventTime(tt.event)
			if !got.Equal(tt.want) {
				t.Errorf("EffectiveEventTime() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSortEventsByLastSeenDesc(t *testing.T) {
	// Fixed reference instants so the test is deterministic.
	newest := "2024-06-01T12:00:00Z"
	middle := "2024-06-01T11:00:00Z"
	oldest := "2024-06-01T10:00:00Z"

	events := []Event{
		{Reason: "Old", LastSeen: oldest},
		{Reason: "Newest", LastSeen: newest},
		{Reason: "Empty", LastSeen: ""},
		{Reason: "Middle", LastSeen: middle},
		{Reason: "Garbage", LastSeen: "not-a-date"},
	}

	SortEventsByLastSeenDesc(events)

	if events[0].Reason != "Newest" {
		t.Errorf("expected Newest first, got %q", events[0].Reason)
	}
	if events[1].Reason != "Middle" {
		t.Errorf("expected Middle second, got %q", events[1].Reason)
	}
	if events[2].Reason != "Old" {
		t.Errorf("expected Old third, got %q", events[2].Reason)
	}
	// Empty and Garbage LastSeen both parse to zero time; they sort last.
	lastTwo := map[string]bool{events[3].Reason: true, events[4].Reason: true}
	if !lastTwo["Empty"] || !lastTwo["Garbage"] {
		t.Errorf("expected Empty and Garbage in trailing positions, got %q, %q",
			events[3].Reason, events[4].Reason)
	}
}

func TestSortEventsByLastSeenDesc_MixedTimezones(t *testing.T) {
	// Lexicographic comparison would get this wrong: the -04:00 string sorts
	// before "Z" but is actually the more recent instant.
	events := []Event{
		{Reason: "Z-formatted", LastSeen: "2024-06-01T12:00:00Z"},
		{Reason: "Offset-formatted", LastSeen: "2024-06-01T09:00:00-04:00"}, // = 13:00 UTC
	}

	SortEventsByLastSeenDesc(events)

	if events[0].Reason != "Offset-formatted" {
		t.Errorf("time-typed sort must rank 13:00 UTC before 12:00 UTC; got %q first",
			events[0].Reason)
	}
}

func TestSortEventsByLastSeenDesc_EmptySlice(t *testing.T) {
	var events []Event
	SortEventsByLastSeenDesc(events) // must not panic
}
