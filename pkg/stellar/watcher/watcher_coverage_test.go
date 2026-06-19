package watcher

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

// ---------------------------------------------------------------------------
// isQuietWindow() — all branches
// ---------------------------------------------------------------------------

func TestIsQuietWindow_BothEmpty_ReturnsFalse(t *testing.T) {
	t.Setenv("STELLAR_QUIET_START", "")
	t.Setenv("STELLAR_QUIET_END", "")
	if isQuietWindow() {
		t.Error("isQuietWindow() with no config should return false")
	}
}

func TestIsQuietWindow_OnlyStartSet_ReturnsFalse(t *testing.T) {
	t.Setenv("STELLAR_QUIET_START", "22:00")
	t.Setenv("STELLAR_QUIET_END", "")
	if isQuietWindow() {
		t.Error("isQuietWindow() with only STELLAR_QUIET_START set should return false")
	}
}

func TestIsQuietWindow_OnlyEndSet_ReturnsFalse(t *testing.T) {
	t.Setenv("STELLAR_QUIET_START", "")
	t.Setenv("STELLAR_QUIET_END", "06:00")
	if isQuietWindow() {
		t.Error("isQuietWindow() with only STELLAR_QUIET_END set should return false")
	}
}

func TestIsQuietWindow_ForwardWindow_SpansFullDay(t *testing.T) {
	// start < end spanning most of the day: any current time should be inside
	t.Setenv("STELLAR_QUIET_START", "00:00")
	t.Setenv("STELLAR_QUIET_END", "23:59")
	if !isQuietWindow() {
		t.Error("isQuietWindow() 00:00–23:59 should return true for any time of day")
	}
}

func TestIsQuietWindow_ForwardWindow_NarrowRange_MatchesExpected(t *testing.T) {
	// Use a deterministic check: set the window and compare against time.Now()
	t.Setenv("STELLAR_QUIET_START", "08:00")
	t.Setenv("STELLAR_QUIET_END", "18:00")
	now := time.Now().Format("15:04")
	expected := now >= "08:00" && now < "18:00"
	got := isQuietWindow()
	if got != expected {
		t.Errorf("isQuietWindow() 08:00–18:00 at %s = %v, want %v", now, got, expected)
	}
}

// TestIsQuietWindow_WrapAroundWindow exercises the overnight quiet-window branch
// (start > end, e.g. 22:00 to 06:00). This is the code path:
//
//	return now >= start || now < end
func TestIsQuietWindow_WrapAroundWindow_MatchesExpected(t *testing.T) {
	t.Setenv("STELLAR_QUIET_START", "22:00")
	t.Setenv("STELLAR_QUIET_END", "06:00")
	now := time.Now().Format("15:04")
	expected := now >= "22:00" || now < "06:00"
	got := isQuietWindow()
	if got != expected {
		t.Errorf("isQuietWindow() wraparound 22:00–06:00 at %s = %v, want %v", now, got, expected)
	}
}

func TestIsQuietWindow_WrapAroundWindow_Always(t *testing.T) {
	// start > end: "00:01" to "00:00" — means all times >= 00:01 are inside
	t.Setenv("STELLAR_QUIET_START", "00:01")
	t.Setenv("STELLAR_QUIET_END", "00:00")
	now := time.Now().Format("15:04")
	expected := now >= "00:01" || now < "00:00"
	got := isQuietWindow()
	if got != expected {
		t.Errorf("isQuietWindow() wraparound 00:01–00:00 at %s = %v, want %v", now, got, expected)
	}
}

// ---------------------------------------------------------------------------
// truncate() — body-capping helper
// ---------------------------------------------------------------------------

func TestTruncate_ShortString_Unchanged(t *testing.T) {
	t.Parallel()
	s := "short"
	if got := truncate(s, 10); got != s {
		t.Errorf("truncate(%q, 10) = %q, want unchanged", s, got)
	}
}

func TestTruncate_ExactLength_Unchanged(t *testing.T) {
	t.Parallel()
	s := "exactly10c"
	if got := truncate(s, 10); got != s {
		t.Errorf("truncate(%q, 10) = %q, want unchanged at exact length", s, got)
	}
}

func TestTruncate_LongString_Truncated(t *testing.T) {
	t.Parallel()
	s := strings.Repeat("x", 50)
	got := truncate(s, 10)
	if !strings.HasSuffix(got, "...") {
		t.Errorf("truncate() long string should end with '...', got %q", got)
	}
	wantLen := 10 + 3 // max + "..."
	if len(got) != wantLen {
		t.Errorf("truncate() length = %d, want %d", len(got), wantLen)
	}
}

func TestTruncate_EmptyString_Unchanged(t *testing.T) {
	t.Parallel()
	if got := truncate("", 10); got != "" {
		t.Errorf("truncate('', 10) = %q, want empty string", got)
	}
}

// ---------------------------------------------------------------------------
// splitEventObjectName() — whitespace edge case
// ---------------------------------------------------------------------------

func TestSplitEventObjectName_WhitespaceOnly_ReturnsUnknown(t *testing.T) {
	t.Parallel()
	got := splitEventObjectName("   ")
	if got != "unknown" {
		t.Errorf("splitEventObjectName('   ') = %q, want unknown", got)
	}
}

func TestSplitEventObjectName_LeadingTrailingWhitespace(t *testing.T) {
	t.Parallel()
	got := splitEventObjectName("  Pod/my-pod  ")
	if got != "my-pod" {
		t.Errorf("splitEventObjectName('  Pod/my-pod  ') = %q, want my-pod", got)
	}
}

func TestSplitEventObjectName_NoSlash_ReturnsFullName(t *testing.T) {
	t.Parallel()
	got := splitEventObjectName("my-pod")
	if got != "my-pod" {
		t.Errorf("splitEventObjectName('my-pod') = %q, want my-pod", got)
	}
}

// ---------------------------------------------------------------------------
// pollCluster() — critical event auto-watch recurrence path
// ---------------------------------------------------------------------------

// TestPollCluster_CriticalEventRecurrence_TriggersAutoWatch verifies that when
// a critical event has recurred ≥2 times in recent memory, an auto-watch is created.
func TestPollCluster_CriticalEventRecurrence_TriggersAutoWatch(t *testing.T) {
	var watchesCreated int
	st := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
		notificationExistsByDedupFn: func(ctx context.Context, userID, dedupeKey string) (bool, error) {
			return false, nil
		},
		createStellarNotificationFn: func(ctx context.Context, n *store.StellarNotification) error {
			return nil
		},
		createStellarMemoryEntryFn: func(ctx context.Context, entry *store.StellarMemoryEntry) error {
			return nil
		},
		getRecentMemoryEntriesFn: func(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error) {
			// 2 prior entries that match resource + reason → triggers auto-watch
			return []store.StellarMemoryEntry{
				{Summary: "OOMKilling api-7c9d — memory limit exceeded"},
				{Summary: "OOMKilling api-7c9d — memory limit exceeded"},
			}, nil
		},
		createWatchFn: func(ctx context.Context, w *store.StellarWatch) (string, error) {
			watchesCreated++
			return "watch-id", nil
		},
	}

	client := &mockK8sClient{
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return []k8s.Event{
				{
					Object:    "Pod/api-7c9d",
					Namespace: "default",
					Reason:    "OOMKilling",
					Message:   "container exceeded memory limit",
					Type:      "Warning",
					Count:     5,
					LastSeen:  time.Now().UTC().Format(time.RFC3339),
				},
			}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return nil, nil
		},
	}

	w := New(st, client, 10*time.Second)
	n := w.pollCluster(context.Background(), "prod-cluster")
	if n != 1 {
		t.Errorf("pollCluster = %d notifications, want 1", n)
	}
	if watchesCreated != 1 {
		t.Errorf("auto-watch creates = %d, want 1 (≥2 recurrences must trigger)", watchesCreated)
	}
}

// TestPollCluster_CriticalEventBelowThreshold_NoAutoWatch verifies that fewer than
// 2 recurrences do NOT trigger auto-watch.
func TestPollCluster_CriticalEventBelowThreshold_NoAutoWatch(t *testing.T) {
	var watchesCreated int
	st := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
		notificationExistsByDedupFn: func(ctx context.Context, userID, dedupeKey string) (bool, error) {
			return false, nil
		},
		createStellarNotificationFn: func(ctx context.Context, n *store.StellarNotification) error {
			return nil
		},
		createStellarMemoryEntryFn: func(ctx context.Context, entry *store.StellarMemoryEntry) error {
			return nil
		},
		getRecentMemoryEntriesFn: func(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error) {
			// Only 1 prior entry → below threshold, no auto-watch
			return []store.StellarMemoryEntry{
				{Summary: "OOMKilling api-7c9d — first occurrence"},
			}, nil
		},
		createWatchFn: func(ctx context.Context, w *store.StellarWatch) (string, error) {
			watchesCreated++
			return "watch-id", nil
		},
	}

	client := &mockK8sClient{
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return []k8s.Event{
				{
					Object:    "Pod/api-7c9d",
					Namespace: "default",
					Reason:    "OOMKilling",
					Message:   "container exceeded memory limit",
					Type:      "Warning",
					Count:     2,
					LastSeen:  time.Now().UTC().Format(time.RFC3339),
				},
			}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return nil, nil
		},
	}

	w := New(st, client, 10*time.Second)
	w.pollCluster(context.Background(), "prod-cluster")
	if watchesCreated != 0 {
		t.Errorf("auto-watch creates = %d, want 0 (only 1 recurrence, below threshold)", watchesCreated)
	}
}

// ---------------------------------------------------------------------------
// pollCluster() — broadcaster is called on notification creation
// ---------------------------------------------------------------------------

func TestPollCluster_CriticalEvent_BroadcastsSSEEvent(t *testing.T) {
	bc := &mockBroadcaster{}
	st := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
		notificationExistsByDedupFn: func(ctx context.Context, userID, dedupeKey string) (bool, error) {
			return false, nil
		},
		createStellarNotificationFn: func(ctx context.Context, n *store.StellarNotification) error {
			return nil
		},
		createStellarMemoryEntryFn: func(ctx context.Context, entry *store.StellarMemoryEntry) error {
			return nil
		},
		getRecentMemoryEntriesFn: func(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error) {
			return nil, nil
		},
		createWatchFn: func(ctx context.Context, w *store.StellarWatch) (string, error) {
			return "watch-id", nil
		},
	}

	client := &mockK8sClient{
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return []k8s.Event{
				{
					Object:    "Pod/api-7c9d",
					Namespace: "default",
					Reason:    "OOMKilling",
					Message:   "OOM",
					Type:      "Warning",
					Count:     1,
					LastSeen:  time.Now().UTC().Format(time.RFC3339),
				},
			}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return nil, nil
		},
	}

	w := New(st, client, 10*time.Second, bc)
	n := w.pollCluster(context.Background(), "prod-cluster")
	if n != 1 {
		t.Errorf("pollCluster = %d notifications, want 1", n)
	}
	if bc.EventCount() < 1 {
		t.Errorf("broadcaster.EventCount() = %d, want ≥1 (broadcaster must be called on notification creation)", bc.EventCount())
	}
	events := bc.events
	if len(events) < 1 {
		t.Error("broadcaster should have received at least one SSE event")
	} else if events[0].Type != "notification" {
		t.Errorf("SSE event type = %q, want notification", events[0].Type)
	}
}

func TestPollCluster_CrashLoopBackOff_BroadcastsSSEEvent(t *testing.T) {
	bc := &mockBroadcaster{}
	st := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
		notificationExistsByDedupFn: func(ctx context.Context, userID, dedupeKey string) (bool, error) {
			return false, nil
		},
		createStellarNotificationFn: func(ctx context.Context, n *store.StellarNotification) error {
			return nil
		},
		createStellarMemoryEntryFn: func(ctx context.Context, entry *store.StellarMemoryEntry) error {
			return nil
		},
		getRecentMemoryEntriesFn: func(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error) {
			return nil, nil
		},
		createWatchFn: func(ctx context.Context, w *store.StellarWatch) (string, error) {
			return "watch-id", nil
		},
	}

	client := &mockK8sClient{
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return nil, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{
				{
					Name:      "crash-pod",
					Namespace: "default",
					Containers: []k8s.ContainerInfo{
						{Name: "myapp", Reason: "CrashLoopBackOff"},
					},
				},
			}, nil
		},
	}

	w := New(st, client, 10*time.Second, bc)
	n := w.pollCluster(context.Background(), "prod-cluster")
	if n != 1 {
		t.Errorf("pollCluster crash = %d notifications, want 1", n)
	}
	if bc.EventCount() < 1 {
		t.Errorf("broadcaster.EventCount() = %d after CrashLoopBackOff, want ≥1", bc.EventCount())
	}
}

// ---------------------------------------------------------------------------
// Start() — panic recovery and restart
// ---------------------------------------------------------------------------

// TestStart_RecoversPanicAndExitsOnContextCancel verifies that Start() survives
// a panic inside runLoop (via poll/client) and exits cleanly when ctx is cancelled.
func TestStart_RecoversPanicAndExitsOnContextCancel(t *testing.T) {
	// A client that panics on every ListClusters call exercises the recovery path.
	panicClient := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			if ctx.Err() != nil {
				// Stop panicking after ctx is cancelled so Start can exit.
				return nil, ctx.Err()
			}
			panic("simulated panic in ListClusters")
		},
	}
	st := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
	}

	w := New(st, panicClient, 1*time.Second)

	// Cancel quickly after starting — the watcher should survive the panic,
	// enter the restart select, and then exit on ctx.Done().
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	done := make(chan struct{})
	go func() {
		w.Start(ctx)
		close(done)
	}()

	select {
	case <-done:
		// Clean exit after panic recovery + context timeout
	case <-time.After(5 * time.Second):
		t.Error("Start() did not exit after context timeout following panic recovery")
	}
}
