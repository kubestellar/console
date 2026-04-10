package handlers

import (
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
)

// TestMultiClusterEventSortOrder verifies that the helper used by
// GetEvents/GetWarningEvents to merge results from multiple clusters sorts
// by time instead of by string comparison. See issue #6043.
func TestMultiClusterEventSortOrder(t *testing.T) {
	// Mixed timezones and a zero LastSeen that previously broke the
	// lexicographic compare. Expected order by actual instant (descending):
	//   cluster-c  (2024-06-01T13:30:00+00:00  -> 13:30 UTC)
	//   cluster-a  (2024-06-01T09:00:00-04:00  -> 13:00 UTC)
	//   cluster-b  (2024-06-01T12:00:00Z       -> 12:00 UTC)
	//   cluster-d  (empty LastSeen, zero time  -> last)
	allEvents := []k8s.Event{
		{Cluster: "cluster-b", Reason: "B", LastSeen: "2024-06-01T12:00:00Z"},
		{Cluster: "cluster-a", Reason: "A", LastSeen: "2024-06-01T09:00:00-04:00"},
		{Cluster: "cluster-d", Reason: "D", LastSeen: ""},
		{Cluster: "cluster-c", Reason: "C", LastSeen: "2024-06-01T13:30:00+00:00"},
	}

	k8s.SortEventsByLastSeenDesc(allEvents)

	wantOrder := []string{"cluster-c", "cluster-a", "cluster-b", "cluster-d"}
	for i, want := range wantOrder {
		if allEvents[i].Cluster != want {
			t.Errorf("position %d: got cluster %q, want %q (full order: %+v)",
				i, allEvents[i].Cluster, want, clusterNames(allEvents))
		}
	}
}

// TestMultiClusterEventSortStability confirms that already-sorted input is
// left untouched and that the sort is stable for equal timestamps.
func TestMultiClusterEventSortStability(t *testing.T) {
	ts := "2024-06-01T12:00:00Z"
	events := []k8s.Event{
		{Cluster: "first", Reason: "A", LastSeen: ts},
		{Cluster: "second", Reason: "B", LastSeen: ts},
		{Cluster: "third", Reason: "C", LastSeen: ts},
	}

	k8s.SortEventsByLastSeenDesc(events)

	wantOrder := []string{"first", "second", "third"}
	for i, want := range wantOrder {
		if events[i].Cluster != want {
			t.Errorf("stable sort broken at %d: got %q, want %q", i, events[i].Cluster, want)
		}
	}
}

func clusterNames(events []k8s.Event) []string {
	names := make([]string, len(events))
	for i, e := range events {
		names[i] = e.Cluster
	}
	return names
}
