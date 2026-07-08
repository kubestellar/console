package k8s

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestEffectiveEventTime_NilEvent(t *testing.T) {
	result := EffectiveEventTime(nil)
	require.True(t, result.IsZero(), "nil event should return zero time")
}

func TestEffectiveEventTime_AllZero(t *testing.T) {
	e := &corev1.Event{}
	result := EffectiveEventTime(e)
	require.True(t, result.IsZero(), "event with no timestamps should return zero time")
}

func TestEffectiveEventTime_PrefersEventTime(t *testing.T) {
	eventTime := time.Date(2025, 6, 15, 10, 0, 0, 0, time.UTC)
	lastTime := time.Date(2025, 6, 14, 10, 0, 0, 0, time.UTC)
	firstTime := time.Date(2025, 6, 13, 10, 0, 0, 0, time.UTC)

	e := &corev1.Event{
		EventTime:      metav1.NewMicroTime(eventTime),
		LastTimestamp:  metav1.NewTime(lastTime),
		FirstTimestamp: metav1.NewTime(firstTime),
	}

	result := EffectiveEventTime(e)
	require.Equal(t, eventTime, result, "should prefer EventTime when set")
}

func TestEffectiveEventTime_FallsBackToLastTimestamp(t *testing.T) {
	lastTime := time.Date(2025, 6, 14, 10, 0, 0, 0, time.UTC)
	firstTime := time.Date(2025, 6, 13, 10, 0, 0, 0, time.UTC)

	e := &corev1.Event{
		LastTimestamp:  metav1.NewTime(lastTime),
		FirstTimestamp: metav1.NewTime(firstTime),
	}

	result := EffectiveEventTime(e)
	require.Equal(t, lastTime, result, "should fall back to LastTimestamp when EventTime is zero")
}

func TestEffectiveEventTime_FallsBackToFirstTimestamp(t *testing.T) {
	firstTime := time.Date(2025, 6, 13, 10, 0, 0, 0, time.UTC)

	e := &corev1.Event{
		FirstTimestamp: metav1.NewTime(firstTime),
	}

	result := EffectiveEventTime(e)
	require.Equal(t, firstTime, result, "should fall back to FirstTimestamp when both EventTime and LastTimestamp are zero")
}

func TestEffectiveEventTime_OnlyEventTime(t *testing.T) {
	eventTime := time.Date(2025, 6, 15, 12, 30, 0, 0, time.UTC)

	e := &corev1.Event{
		EventTime: metav1.NewMicroTime(eventTime),
	}

	result := EffectiveEventTime(e)
	require.Equal(t, eventTime, result)
}

func TestSortEventsByLastSeenDesc_EmptySlice(t *testing.T) {
	var events []Event
	SortEventsByLastSeenDesc(events)
	require.Empty(t, events)
}

func TestSortEventsByLastSeenDesc_SingleEvent(t *testing.T) {
	events := []Event{
		{Reason: "Created", LastSeen: "2025-06-15T10:00:00Z"},
	}
	SortEventsByLastSeenDesc(events)
	require.Len(t, events, 1)
	require.Equal(t, "Created", events[0].Reason)
}

func TestSortEventsByLastSeenDesc_MultipleEvents(t *testing.T) {
	events := []Event{
		{Reason: "Oldest", LastSeen: "2025-06-13T10:00:00Z"},
		{Reason: "Newest", LastSeen: "2025-06-15T10:00:00Z"},
		{Reason: "Middle", LastSeen: "2025-06-14T10:00:00Z"},
	}

	SortEventsByLastSeenDesc(events)

	require.Equal(t, "Newest", events[0].Reason)
	require.Equal(t, "Middle", events[1].Reason)
	require.Equal(t, "Oldest", events[2].Reason)
}

func TestSortEventsByLastSeenDesc_EmptyLastSeenSortsToEnd(t *testing.T) {
	events := []Event{
		{Reason: "NoTime", LastSeen: ""},
		{Reason: "HasTime", LastSeen: "2025-06-15T10:00:00Z"},
		{Reason: "AlsoNoTime", LastSeen: ""},
	}

	SortEventsByLastSeenDesc(events)

	require.Len(t, events, 3, "sort should not drop any events")
	require.Equal(t, "HasTime", events[0].Reason)
	require.Equal(t, "NoTime", events[1].Reason)
	require.Equal(t, "AlsoNoTime", events[2].Reason)
}

func TestSortEventsByLastSeenDesc_UnparseableLastSeenSortsToEnd(t *testing.T) {
	events := []Event{
		{Reason: "BadTime", LastSeen: "not-a-date"},
		{Reason: "GoodTime", LastSeen: "2025-06-15T10:00:00Z"},
	}

	SortEventsByLastSeenDesc(events)

	require.Equal(t, "GoodTime", events[0].Reason)
	require.Equal(t, "BadTime", events[1].Reason)
}

func TestSortEventsByLastSeenDesc_StableSort(t *testing.T) {
	// Events with the same timestamp should preserve relative order
	events := []Event{
		{Reason: "First", LastSeen: "2025-06-15T10:00:00Z"},
		{Reason: "Second", LastSeen: "2025-06-15T10:00:00Z"},
		{Reason: "Third", LastSeen: "2025-06-15T10:00:00Z"},
	}

	SortEventsByLastSeenDesc(events)

	require.Equal(t, "First", events[0].Reason)
	require.Equal(t, "Second", events[1].Reason)
	require.Equal(t, "Third", events[2].Reason)
}

func TestSortEventsByLastSeenDesc_MixedTimezones(t *testing.T) {
	events := []Event{
		{Reason: "UTC", LastSeen: "2025-06-15T10:00:00Z"},
		{Reason: "PlusFive", LastSeen: "2025-06-15T12:00:00+05:00"},  // 07:00 UTC
		{Reason: "MinusThree", LastSeen: "2025-06-15T09:00:00-03:00"}, // 12:00 UTC
	}

	SortEventsByLastSeenDesc(events)

	// MinusThree = 12:00 UTC, UTC = 10:00 UTC, PlusFive = 07:00 UTC
	require.Equal(t, "MinusThree", events[0].Reason)
	require.Equal(t, "UTC", events[1].Reason)
	require.Equal(t, "PlusFive", events[2].Reason)
}
