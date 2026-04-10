package k8s

import (
	"sort"
	"time"

	corev1 "k8s.io/api/core/v1"
)

// EffectiveEventTime returns the most recent observation timestamp for a
// Kubernetes Event, preferring the modern EventTime (events.k8s.io/v1) and
// falling back to the deprecated LastTimestamp, then FirstTimestamp, for
// older clusters.
//
// Modern kubelets populate only EventTime and leave LastTimestamp as the
// zero metav1.Time{}. Reading LastTimestamp directly causes recent events to
// appear at the Unix epoch and sort incorrectly. See issue #6042.
func EffectiveEventTime(e *corev1.Event) time.Time {
	if e == nil {
		return time.Time{}
	}
	if !e.EventTime.IsZero() {
		return e.EventTime.Time
	}
	if !e.LastTimestamp.IsZero() {
		return e.LastTimestamp.Time
	}
	return e.FirstTimestamp.Time
}

// SortEventsByLastSeenDesc sorts Events in-place by their LastSeen RFC3339
// string interpreted as time.Time, newest first. Unparseable or empty
// LastSeen values sort to the end (treated as the zero time). This avoids
// the fragile lexicographic comparison on mixed-timezone strings used
// previously. See issue #6043.
func SortEventsByLastSeenDesc(events []Event) {
	// Cache parsed times once to avoid O(n log n) reparsing inside the
	// sort comparator.
	parsed := make([]time.Time, len(events))
	for i := range events {
		if events[i].LastSeen == "" {
			continue
		}
		if t, err := time.Parse(time.RFC3339, events[i].LastSeen); err == nil {
			parsed[i] = t
		}
	}

	indices := make([]int, len(events))
	for i := range indices {
		indices[i] = i
	}
	sort.SliceStable(indices, func(i, j int) bool {
		return parsed[indices[i]].After(parsed[indices[j]])
	})

	sorted := make([]Event, len(events))
	for newIdx, oldIdx := range indices {
		sorted[newIdx] = events[oldIdx]
	}
	copy(events, sorted)
}
