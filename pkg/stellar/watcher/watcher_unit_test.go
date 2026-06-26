package watcher

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------

type unitMockK8sClient struct {
	mu           sync.Mutex
	listClusters func(ctx context.Context) ([]k8s.ClusterInfo, error)
	getEvents    func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error)
	getPods      func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error)
}

func (m *unitMockK8sClient) ListClusters(ctx context.Context) ([]k8s.ClusterInfo, error) {
	if m.listClusters != nil {
		return m.listClusters(ctx)
	}
	return nil, nil
}

func (m *unitMockK8sClient) GetWarningEvents(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
	if m.getEvents != nil {
		return m.getEvents(ctx, cluster, namespace, limit)
	}
	return nil, nil
}

func (m *unitMockK8sClient) GetPods(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
	if m.getPods != nil {
		return m.getPods(ctx, cluster, namespace)
	}
	return nil, nil
}

type unitMockNotifStore struct {
	mu             sync.Mutex
	userIDs        []string
	listUserIDsErr error
	created        []*store.StellarNotification
	existsByDedup  func(ctx context.Context, userID, dedupeKey string) (bool, error)
}

func (m *unitMockNotifStore) ListStellarUserIDs(ctx context.Context) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.userIDs, m.listUserIDsErr
}

func (m *unitMockNotifStore) CreateStellarNotification(ctx context.Context, n *store.StellarNotification) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.created = append(m.created, n)
	return nil
}

func (m *unitMockNotifStore) NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error) {
	if m.existsByDedup != nil {
		return m.existsByDedup(ctx, userID, dedupeKey)
	}
	return false, nil
}

func (m *unitMockNotifStore) CreateStellarMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error {
	return nil
}

func (m *unitMockNotifStore) GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error) {
	return nil, nil
}

func (m *unitMockNotifStore) CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error) {
	return "watch-id", nil
}

// ---------------------------------------------------------------------------
// New()
// ---------------------------------------------------------------------------

func TestNew_DefaultInterval(t *testing.T) {
	w := New(nil, nil, 0)
	if w.interval != 30*time.Second {
		t.Errorf("New(nil, nil, 0).interval = %v, want 30s", w.interval)
	}
}

func TestNew_NegativeInterval(t *testing.T) {
	w := New(nil, nil, -1*time.Second)
	if w.interval != 30*time.Second {
		t.Errorf("New(nil, nil, -1s).interval = %v, want 30s", w.interval)
	}
}

func TestNew_CustomInterval(t *testing.T) {
	w := New(nil, nil, 2*time.Minute)
	if w.interval != 2*time.Minute {
		t.Errorf("New(nil, nil, 2m).interval = %v, want 2m", w.interval)
	}
}

func TestNew_WithoutBroadcaster(t *testing.T) {
	w := New(nil, nil, 10*time.Second)
	if w.broadcaster != nil {
		t.Error("expected broadcaster to be nil when not provided")
	}
}

func TestNew_LastSeenInitialized(t *testing.T) {
	w := New(nil, nil, 10*time.Second)
	if w.lastSeen == nil {
		t.Error("lastSeen map should be initialized")
	}
}

// ---------------------------------------------------------------------------
// poll() guard rails
// ---------------------------------------------------------------------------

func TestPoll_NilClientSkips(t *testing.T) {
	st := &unitMockNotifStore{userIDs: []string{"user-1"}}
	w := New(st, nil, 10*time.Second)
	// poll should return without panicking when client is nil
	ctx := context.Background()
	w.poll(ctx)
}

func TestPoll_NilStoreSkips(t *testing.T) {
	client := &unitMockK8sClient{
		listClusters: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			t.Error("ListClusters should not be called when store is nil")
			return nil, nil
		},
	}
	w := New(nil, client, 10*time.Second)
	ctx := context.Background()
	w.poll(ctx)
}

func TestPoll_ListClustersError(t *testing.T) {
	client := &unitMockK8sClient{
		listClusters: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			return nil, errors.New("connection refused")
		},
	}
	st := &unitMockNotifStore{userIDs: []string{"user-1"}}
	w := New(st, client, 10*time.Second)
	ctx := context.Background()
	// Should not panic
	w.poll(ctx)
}

func TestPoll_EmptyClusterList(t *testing.T) {
	client := &unitMockK8sClient{
		listClusters: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			return []k8s.ClusterInfo{}, nil
		},
	}
	st := &unitMockNotifStore{userIDs: []string{"user-1"}}
	w := New(st, client, 10*time.Second)
	ctx := context.Background()
	w.poll(ctx)
}

// ---------------------------------------------------------------------------
// pollCluster() — empty user IDs skips creation
// ---------------------------------------------------------------------------

func TestPollCluster_NoUsers(t *testing.T) {
	st := &unitMockNotifStore{userIDs: []string{}} // no users
	client := &unitMockK8sClient{
		getEvents: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			t.Error("GetWarningEvents should not be called when no users exist")
			return nil, nil
		},
	}
	w := New(st, client, 10*time.Second)
	n := w.pollCluster(context.Background(), "test-cluster")
	if n != 0 {
		t.Errorf("pollCluster with no users = %d, want 0", n)
	}
}

func TestPollCluster_UserIDsError(t *testing.T) {
	st := &unitMockNotifStore{
		userIDs:        nil,
		listUserIDsErr: errors.New("db error"),
	}
	w := New(st, &unitMockK8sClient{}, 10*time.Second)
	n := w.pollCluster(context.Background(), "test-cluster")
	if n != 0 {
		t.Errorf("pollCluster with store error = %d, want 0", n)
	}
}

// ---------------------------------------------------------------------------
// pollCluster() — event creates notification
// ---------------------------------------------------------------------------

func TestPollCluster_CreatesNotificationForWarningEvent(t *testing.T) {
	st := &unitMockNotifStore{
		userIDs:       []string{"user-1"},
		existsByDedup: func(ctx context.Context, userID, dedupeKey string) (bool, error) { return false, nil },
	}
	client := &unitMockK8sClient{
		getEvents: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return []k8s.Event{
				{
					Object:    "Deployment/my-app",
					Namespace: "default",
					Reason:    "BackOff",
					Message:   "Back-off restarting failed container",
					Type:      "Warning",
					Count:     3,
					LastSeen:  time.Now().UTC().Format(time.RFC3339),
				},
			}, nil
		},
		getPods: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return nil, nil
		},
	}
	w := New(st, client, 10*time.Second)
	n := w.pollCluster(context.Background(), "prod-cluster")
	if n != 1 {
		t.Errorf("pollCluster = %d notifications, want 1", n)
	}
	if len(st.created) != 1 {
		t.Fatalf("expected 1 notification created, got %d", len(st.created))
	}
	notif := st.created[0]
	if notif.Cluster != "prod-cluster" {
		t.Errorf("notification.Cluster = %q, want %q", notif.Cluster, "prod-cluster")
	}
	if notif.Severity == "" {
		t.Error("notification.Severity should not be empty")
	}
}

// ---------------------------------------------------------------------------
// pollCluster() — deduplication skips existing notifications
// ---------------------------------------------------------------------------

func TestPollCluster_DeduplicatesExistingNotification(t *testing.T) {
	st := &unitMockNotifStore{
		userIDs:       []string{"user-1"},
		existsByDedup: func(ctx context.Context, userID, dedupeKey string) (bool, error) { return true, nil },
	}
	client := &unitMockK8sClient{
		getEvents: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return []k8s.Event{
				{
					Object:    "Deployment/my-app",
					Namespace: "default",
					Reason:    "BackOff",
					Type:      "Warning",
					Count:     1,
					LastSeen:  time.Now().UTC().Format(time.RFC3339),
				},
			}, nil
		},
		getPods: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return nil, nil
		},
	}
	w := New(st, client, 10*time.Second)
	n := w.pollCluster(context.Background(), "prod-cluster")
	if n != 0 {
		t.Errorf("deduped pollCluster = %d, want 0", n)
	}
	if len(st.created) != 0 {
		t.Errorf("expected 0 notifications created, got %d", len(st.created))
	}
}

// ---------------------------------------------------------------------------
// pollCluster() — CrashLoopBackOff pod creates critical notification
// ---------------------------------------------------------------------------

func TestPollCluster_CrashLoopBackOffCreatesNotification(t *testing.T) {
	st := &unitMockNotifStore{
		userIDs:       []string{"user-1"},
		existsByDedup: func(ctx context.Context, userID, dedupeKey string) (bool, error) { return false, nil },
	}
	client := &unitMockK8sClient{
		getEvents: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return nil, nil
		},
		getPods: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{
				{
					Name:      "bad-pod",
					Namespace: "kube-system",
					Containers: []k8s.ContainerInfo{
						{Name: "coredns", Reason: "CrashLoopBackOff"},
					},
				},
			}, nil
		},
	}
	w := New(st, client, 10*time.Second)
	n := w.pollCluster(context.Background(), "prod-cluster")
	if n != 1 {
		t.Errorf("CrashLoopBackOff pollCluster = %d, want 1", n)
	}
	if len(st.created) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(st.created))
	}
	if st.created[0].Severity != "critical" {
		t.Errorf("crash notification severity = %q, want critical", st.created[0].Severity)
	}
}

// ---------------------------------------------------------------------------
// splitEventObjectName
// ---------------------------------------------------------------------------

func TestSplitEventObjectName_WithSlash(t *testing.T) {
	got := splitEventObjectName("Deployment/my-app")
	if got != "my-app" {
		t.Errorf("splitEventObjectName(Deployment/my-app) = %q, want my-app", got)
	}
}

func TestSplitEventObjectName_NoSlash(t *testing.T) {
	got := splitEventObjectName("my-pod")
	if got != "my-pod" {
		t.Errorf("splitEventObjectName(my-pod) = %q, want my-pod", got)
	}
}

func TestSplitEventObjectName_Empty(t *testing.T) {
	got := splitEventObjectName("")
	if got != "unknown" {
		t.Errorf("splitEventObjectName('') = %q, want unknown", got)
	}
}

// ---------------------------------------------------------------------------
// parseEventTimestamp
// ---------------------------------------------------------------------------

func TestParseEventTimestamp_ValidRFC3339(t *testing.T) {
	ts := "2026-01-15T10:30:00Z"
	got := parseEventTimestamp(ts)
	want, _ := time.Parse(time.RFC3339, ts)
	if !got.Equal(want) {
		t.Errorf("parseEventTimestamp(%q) = %v, want %v", ts, got, want)
	}
}

func TestParseEventTimestamp_Invalid(t *testing.T) {
	before := time.Now().Add(-time.Second)
	got := parseEventTimestamp("not-a-timestamp")
	if got.Before(before) {
		t.Errorf("invalid parseEventTimestamp should return near-now time, got %v", got)
	}
}

// ---------------------------------------------------------------------------
// Start() exits on context cancellation
// ---------------------------------------------------------------------------

func TestStart_ExitsOnContextCancel(t *testing.T) {
	w := New(nil, nil, 30*time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		w.Start(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Error("Start() did not exit after context cancellation")
	}
}
