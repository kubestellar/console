package workloads

import (
	"strings"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestFormatEvent(t *testing.T) {
	eventTime := time.Date(2026, 1, 2, 10, 20, 30, 0, time.UTC)
	lastTime := time.Date(2026, 1, 2, 9, 15, 45, 0, time.UTC)
	creationTime := time.Date(2026, 1, 2, 8, 5, 0, 0, time.UTC)

	tests := []struct {
		name    string
		ev      corev1.Event
		want    string
		wantHas []string
	}{
		{
			name: "normal event uses EventTime and no warning prefix",
			ev: corev1.Event{
				EventTime:     metav1.NewMicroTime(eventTime),
				LastTimestamp: metav1.NewTime(lastTime),
				ObjectMeta:    metav1.ObjectMeta{CreationTimestamp: metav1.NewTime(creationTime)},
				Type:          "Normal",
				Reason:        "Scheduled",
				Message:       "Successfully assigned pod",
			},
			want: "10:20:30 Scheduled: Successfully assigned pod",
		},
		{
			name: "warning event uses warning prefix",
			ev: corev1.Event{
				EventTime: metav1.NewMicroTime(eventTime),
				Type:      "Warning",
				Reason:    "FailedScheduling",
				Message:   "no nodes available",
			},
			want: "10:20:30 ⚠ FailedScheduling: no nodes available",
		},
		{
			name: "falls back to LastTimestamp when EventTime is zero",
			ev: corev1.Event{
				LastTimestamp: metav1.NewTime(lastTime),
				ObjectMeta:    metav1.ObjectMeta{CreationTimestamp: metav1.NewTime(creationTime)},
				Type:          "Normal",
				Reason:        "Pulled",
				Message:       "Image pulled",
			},
			want: "09:15:45 Pulled: Image pulled",
		},
		{
			name: "falls back to CreationTimestamp when EventTime and LastTimestamp are zero but FirstTimestamp is also zero",
			ev: corev1.Event{
				ObjectMeta: metav1.ObjectMeta{CreationTimestamp: metav1.NewTime(creationTime)},
				Type:       "Normal",
				Reason:     "Created",
				Message:    "Container created",
			},
			want: "08:05:00 Created: Container created",
		},
		{
			name: "empty reason and message still render",
			ev: corev1.Event{
				EventTime: metav1.NewMicroTime(eventTime),
				Type:      "Warning",
			},
			want: "10:20:30 ⚠ : ",
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := formatEvent(tc.ev)
			if tc.want != "" && got != tc.want {
				t.Fatalf("formatEvent() mismatch\n want: %q\n  got: %q", tc.want, got)
			}
			for _, s := range tc.wantHas {
				if !strings.Contains(got, s) {
					t.Errorf("formatEvent() = %q, expected to contain %q", got, s)
				}
			}
		})
	}
}

// TestFormatEvent_FirstTimestampFallback covers the EffectiveEventTime path
// where only FirstTimestamp is populated (EventTime and LastTimestamp both zero).
func TestFormatEvent_FirstTimestampFallback(t *testing.T) {
	first := time.Date(2026, 3, 14, 15, 9, 26, 0, time.UTC)
	ev := corev1.Event{
		FirstTimestamp: metav1.NewTime(first),
		Type:           "Normal",
		Reason:         "Started",
		Message:        "Container started",
	}
	got := formatEvent(ev)
	want := "15:09:26 Started: Container started"
	if got != want {
		t.Fatalf("formatEvent() = %q, want %q", got, want)
	}
}
