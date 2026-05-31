package watcher

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------

type mockK8sClient struct {
	listClustersFn       func(ctx context.Context) ([]k8s.ClusterInfo, error)
	getWarningEventsFn   func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error)
	getPodsFn            func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error)
	listClustersCallCount int32
	mu                   sync.Mutex
}

func (m *mockK8sClient) ListClusters(ctx context.Context) ([]k8s.ClusterInfo, error) {
	atomic.AddInt32(&m.listClustersCallCount, 1)
	if m.listClustersFn != nil {
		return m.listClustersFn(ctx)
	}
	return []k8s.ClusterInfo{}, nil
}

func (m *mockK8sClient) GetWarningEvents(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
	if m.getWarningEventsFn != nil {
		return m.getWarningEventsFn(ctx, cluster, namespace, limit)
	}
	return []k8s.Event{}, nil
}

func (m *mockK8sClient) GetPods(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
	if m.getPodsFn != nil {
		return m.getPodsFn(ctx, cluster, namespace)
	}
	return []k8s.PodInfo{}, nil
}

type mockNotificationStore struct {
	createStellarNotificationFn    func(ctx context.Context, notification *store.StellarNotification) error
	notificationExistsByDedupFn    func(ctx context.Context, userID, dedupeKey string) (bool, error)
	listStellarUserIDsFn           func(ctx context.Context) ([]string, error)
	createStellarMemoryEntryFn     func(ctx context.Context, entry *store.StellarMemoryEntry) error
	getRecentMemoryEntriesFn       func(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error)
	createWatchFn                  func(ctx context.Context, w *store.StellarWatch) (string, error)
	createNotificationCallCount    int32
	notificationExistsByDedupCalls int32
}

func (m *mockNotificationStore) CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error {
	atomic.AddInt32(&m.createNotificationCallCount, 1)
	if m.createStellarNotificationFn != nil {
		return m.createStellarNotificationFn(ctx, notification)
	}
	return nil
}

func (m *mockNotificationStore) NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error) {
	atomic.AddInt32(&m.notificationExistsByDedupCalls, 1)
	if m.notificationExistsByDedupFn != nil {
		return m.notificationExistsByDedupFn(ctx, userID, dedupeKey)
	}
	return false, nil
}

func (m *mockNotificationStore) ListStellarUserIDs(ctx context.Context) ([]string, error) {
	if m.listStellarUserIDsFn != nil {
		return m.listStellarUserIDsFn(ctx)
	}
	return []string{"user-1"}, nil
}

func (m *mockNotificationStore) CreateStellarMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error {
	if m.createStellarMemoryEntryFn != nil {
		return m.createStellarMemoryEntryFn(ctx, entry)
	}
	return nil
}

func (m *mockNotificationStore) GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error) {
	if m.getRecentMemoryEntriesFn != nil {
		return m.getRecentMemoryEntriesFn(ctx, userID, cluster, limit)
	}
	return []store.StellarMemoryEntry{}, nil
}

func (m *mockNotificationStore) CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error) {
	if m.createWatchFn != nil {
		return m.createWatchFn(ctx, w)
	}
	return "watch-id", nil
}

type mockBroadcaster struct {
	events []SSEEvent
	mu     sync.Mutex
}

func (m *mockBroadcaster) Broadcast(event SSEEvent) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, event)
}

func (m *mockBroadcaster) EventCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.events)
}

// ---------------------------------------------------------------------------
// New() — constructor tests
// ---------------------------------------------------------------------------

func TestNew_ZeroIntervalDefaultsTo30s(t *testing.T) {
	store := &mockNotificationStore{}
	client := &mockK8sClient{}
	w := New(store, client, 0)
	if w.interval != 30*time.Second {
		t.Errorf("New(interval=0) should default to 30s, got %v", w.interval)
	}
}

func TestNew_NegativeIntervalDefaultsTo30s(t *testing.T) {
	store := &mockNotificationStore{}
	client := &mockK8sClient{}
	w := New(store, client, -5*time.Second)
	if w.interval != 30*time.Second {
		t.Errorf("New(interval<0) should default to 30s, got %v", w.interval)
	}
}

func TestNew_PositiveIntervalPreserved(t *testing.T) {
	store := &mockNotificationStore{}
	client := &mockK8sClient{}
	w := New(store, client, 15*time.Second)
	if w.interval != 15*time.Second {
		t.Errorf("New(interval=15s) should preserve value, got %v", w.interval)
	}
}

func TestNew_BroadcasterOptional(t *testing.T) {
	store := &mockNotificationStore{}
	client := &mockK8sClient{}
	w := New(store, client, 10*time.Second)
	if w.broadcaster != nil {
		t.Error("New without broadcaster should have nil broadcaster")
	}
}

func TestNew_BroadcasterSet(t *testing.T) {
	store := &mockNotificationStore{}
	client := &mockK8sClient{}
	bc := &mockBroadcaster{}
	w := New(store, client, 10*time.Second, bc)
	if w.broadcaster == nil {
		t.Error("New with broadcaster should set broadcaster")
	}
}

// ---------------------------------------------------------------------------
// poll() — nil client/store safety
// ---------------------------------------------------------------------------

func TestPoll_SkipsWhenClientNil(t *testing.T) {
	store := &mockNotificationStore{}
	w := New(store, nil, 10*time.Second)
	ctx := context.Background()
	// Should not panic
	w.poll(ctx)
}

func TestPoll_SkipsWhenStoreNil(t *testing.T) {
	client := &mockK8sClient{}
	w := New(nil, client, 10*time.Second)
	ctx := context.Background()
	// Should not panic
	w.poll(ctx)
}

// ---------------------------------------------------------------------------
// poll() — parallel cluster processing
// ---------------------------------------------------------------------------

func TestPoll_ProcessesClustersInParallel(t *testing.T) {
	var processedClusters sync.Map
	const clusterCount = 10

	store := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
		notificationExistsByDedupFn: func(ctx context.Context, userID, dedupeKey string) (bool, error) {
			return true, nil // Skip creation for this test
		},
	}

	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			clusters := make([]k8s.ClusterInfo, clusterCount)
			for i := 0; i < clusterCount; i++ {
				clusters[i] = k8s.ClusterInfo{Name: fmt.Sprintf("cluster-%d", i)}
			}
			return clusters, nil
		},
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			// Mark cluster as processed
			processedClusters.Store(cluster, true)
			// Simulate work
			time.Sleep(10 * time.Millisecond)
			return []k8s.Event{}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{}, nil
		},
	}

	w := New(store, client, 10*time.Second)
	ctx := context.Background()

	start := time.Now()
	w.poll(ctx)
	duration := time.Since(start)

	// Verify all clusters were processed
	count := 0
	processedClusters.Range(func(key, value interface{}) bool {
		count++
		return true
	})

	if count != clusterCount {
		t.Errorf("Expected %d clusters to be processed, got %d", clusterCount, count)
	}

	// Parallel execution should take ~10ms, sequential would take ~100ms
	// Use 50ms as threshold to detect parallelism
	if duration > 50*time.Millisecond {
		t.Errorf("poll() took %v, expected parallel execution to be faster", duration)
	}
}

func TestPoll_ConcurrencyLimitedToSemaphore(t *testing.T) {
	var concurrentCount int32
	var maxConcurrent int32
	var mu sync.Mutex

	store := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
	}

	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			clusters := make([]k8s.ClusterInfo, 20)
			for i := 0; i < 20; i++ {
				clusters[i] = k8s.ClusterInfo{Name: fmt.Sprintf("cluster-%d", i)}
			}
			return clusters, nil
		},
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			current := atomic.AddInt32(&concurrentCount, 1)
			mu.Lock()
			if current > maxConcurrent {
				maxConcurrent = current
			}
			mu.Unlock()
			time.Sleep(20 * time.Millisecond)
			atomic.AddInt32(&concurrentCount, -1)
			return []k8s.Event{}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{}, nil
		},
	}

	w := New(store, client, 10*time.Second)
	ctx := context.Background()
	w.poll(ctx)

	// Semaphore is set to 5, so max concurrent should be <= 5
	if maxConcurrent > 5 {
		t.Errorf("Max concurrent clusters was %d, expected <= 5 due to semaphore", maxConcurrent)
	}
	if maxConcurrent < 1 {
		t.Error("Expected at least 1 concurrent cluster to be processed")
	}
}

// ---------------------------------------------------------------------------
// poll() — panic recovery per cluster
// ---------------------------------------------------------------------------

func TestPoll_ClusterPanicDoesNotStopOthers(t *testing.T) {
	var processedClusters sync.Map

	store := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
	}

	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			return []k8s.ClusterInfo{
				{Name: "cluster-good-1"},
				{Name: "cluster-panic"},
				{Name: "cluster-good-2"},
			}, nil
		},
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			if cluster == "cluster-panic" {
				panic("mock panic")
			}
			processedClusters.Store(cluster, true)
			return []k8s.Event{}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{}, nil
		},
	}

	w := New(store, client, 10*time.Second)
	ctx := context.Background()
	w.poll(ctx)

	// Verify good clusters were processed despite panic in one
	if _, ok := processedClusters.Load("cluster-good-1"); !ok {
		t.Error("cluster-good-1 should have been processed")
	}
	if _, ok := processedClusters.Load("cluster-good-2"); !ok {
		t.Error("cluster-good-2 should have been processed")
	}
}

// ---------------------------------------------------------------------------
// Start() — restart after panic
// ---------------------------------------------------------------------------

func TestStart_RecoverFromPanic(t *testing.T) {
	var pollCount int32
	panicOnce := int32(1)

	store := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{}, nil
		},
	}

	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			atomic.AddInt32(&pollCount, 1)
			// Panic on first call only
			if atomic.CompareAndSwapInt32(&panicOnce, 1, 0) {
				panic("mock panic for recovery test")
			}
			return []k8s.ClusterInfo{}, nil
		},
	}

	w := New(store, client, 20*time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()

	w.Start(ctx)

	finalCount := atomic.LoadInt32(&pollCount)
	// Should have called at least once before panic and once after recovery
	if finalCount < 2 {
		t.Errorf("Start() should have recovered and continued polling, got %d polls, want >= 2", finalCount)
	}
}

// ---------------------------------------------------------------------------
// runLoop() — context cancellation
// ---------------------------------------------------------------------------

func TestRunLoop_StopsOnContextCancel(t *testing.T) {
	var pollCount int32

	store := &mockNotificationStore{}
	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			atomic.AddInt32(&pollCount, 1)
			return []k8s.ClusterInfo{}, nil
		},
	}

	w := New(store, client, 50*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())

	go w.runLoop(ctx)
	time.Sleep(150 * time.Millisecond) // Allow 2-3 polls
	cancel()
	time.Sleep(100 * time.Millisecond) // Ensure loop stopped

	count1 := atomic.LoadInt32(&pollCount)
	time.Sleep(100 * time.Millisecond) // Verify no more polls after cancel
	count2 := atomic.LoadInt32(&pollCount)

	if count2 > count1 {
		t.Error("runLoop should stop polling after context cancel")
	}
}

// ---------------------------------------------------------------------------
// poll() — quiet window
// ---------------------------------------------------------------------------

func TestPoll_SkipsDuringQuietWindow(t *testing.T) {
	// Set quiet window to current time
	now := time.Now().Format("15:04")
	future := time.Now().Add(10 * time.Minute).Format("15:04")
	t.Setenv("STELLAR_QUIET_START", now)
	t.Setenv("STELLAR_QUIET_END", future)

	var pollCount int32
	store := &mockNotificationStore{}
	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			atomic.AddInt32(&pollCount, 1)
			return []k8s.ClusterInfo{}, nil
		},
	}

	w := New(store, client, 10*time.Second)
	ctx := context.Background()
	w.poll(ctx)

	if atomic.LoadInt32(&pollCount) > 0 {
		t.Error("poll() should skip during quiet window")
	}
}

// ---------------------------------------------------------------------------
// pollCluster() — event deduplication
// ---------------------------------------------------------------------------

func TestPollCluster_DeduplicatesEvents(t *testing.T) {
	var createCount int32
	const userID = "test-user"

	store := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{userID}, nil
		},
		notificationExistsByDedupFn: func(ctx context.Context, uid, dedupeKey string) (bool, error) {
			// First call returns false (new), subsequent return true (exists)
			count := atomic.LoadInt32(&createCount)
			return count > 0, nil
		},
		createStellarNotificationFn: func(ctx context.Context, notification *store.StellarNotification) error {
			atomic.AddInt32(&createCount, 1)
			return nil
		},
	}

	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			return []k8s.ClusterInfo{{Name: "test-cluster"}}, nil
		},
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return []k8s.Event{
				{
					Namespace: "default",
					Object:    "Pod/nginx",
					Reason:    "BackOff",
					Message:   "Back-off restarting failed container",
					Type:      "Warning",
					LastSeen:  time.Now().UTC().Format(time.RFC3339),
					Count:     1,
				},
			}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{}, nil
		},
	}

	w := New(store, client, 10*time.Second)
	ctx := context.Background()

	// First poll should create notification
	w.poll(ctx)
	if atomic.LoadInt32(&createCount) != 1 {
		t.Errorf("First poll should create 1 notification, got %d", createCount)
	}

	// Second poll should skip (deduplicated)
	w.poll(ctx)
	if atomic.LoadInt32(&createCount) != 1 {
		t.Errorf("Second poll should not create duplicate, got %d notifications", createCount)
	}
}

// ---------------------------------------------------------------------------
// pollCluster() — crash loop detection
// ---------------------------------------------------------------------------

func TestPollCluster_DetectsCrashLoopBackOff(t *testing.T) {
	var notifications []*store.StellarNotification
	var mu sync.Mutex

	store := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
		notificationExistsByDedupFn: func(ctx context.Context, userID, dedupeKey string) (bool, error) {
			return false, nil
		},
		createStellarNotificationFn: func(ctx context.Context, notification *store.StellarNotification) error {
			mu.Lock()
			notifications = append(notifications, notification)
			mu.Unlock()
			return nil
		},
	}

	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			return []k8s.ClusterInfo{{Name: "test-cluster"}}, nil
		},
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return []k8s.Event{}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{
				{
					Name:      "crash-pod",
					Namespace: "default",
					Containers: []k8s.ContainerInfo{
						{
							Name:   "app",
							Reason: "CrashLoopBackOff",
						},
					},
				},
			}, nil
		},
	}

	w := New(store, client, 10*time.Second)
	ctx := context.Background()
	w.poll(ctx)

	mu.Lock()
	defer mu.Unlock()

	if len(notifications) != 1 {
		t.Fatalf("Expected 1 crash notification, got %d", len(notifications))
	}

	notif := notifications[0]
	if notif.Severity != "critical" {
		t.Errorf("CrashLoopBackOff should be critical, got %q", notif.Severity)
	}
	if notif.Namespace != "default" {
		t.Errorf("Expected namespace=default, got %q", notif.Namespace)
	}
}

// ---------------------------------------------------------------------------
// Broadcaster integration
// ---------------------------------------------------------------------------

func TestPoll_BroadcastsNotifications(t *testing.T) {
	bc := &mockBroadcaster{}

	store := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
		notificationExistsByDedupFn: func(ctx context.Context, userID, dedupeKey string) (bool, error) {
			return false, nil
		},
		createStellarNotificationFn: func(ctx context.Context, notification *store.StellarNotification) error {
			return nil
		},
	}

	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			return []k8s.ClusterInfo{{Name: "test-cluster"}}, nil
		},
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return []k8s.Event{
				{
					Namespace: "default",
					Object:    "Pod/nginx",
					Reason:    "BackOff",
					Message:   "test",
					Type:      "Warning",
					LastSeen:  time.Now().UTC().Format(time.RFC3339),
					Count:     1,
				},
			}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{}, nil
		},
	}

	w := New(store, client, 10*time.Second, bc)
	ctx := context.Background()
	w.poll(ctx)

	if bc.EventCount() != 1 {
		t.Errorf("Expected 1 broadcast event, got %d", bc.EventCount())
	}
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

func TestPoll_HandlesListClustersError(t *testing.T) {
	store := &mockNotificationStore{}
	client := &mockK8sClient{
		listClustersFn: func(ctx context.Context) ([]k8s.ClusterInfo, error) {
			return nil, errors.New("mock error")
		},
	}

	w := New(store, client, 10*time.Second)
	ctx := context.Background()
	// Should not panic
	w.poll(ctx)

	if atomic.LoadInt32(&client.listClustersCallCount) != 1 {
		t.Error("Should attempt to list clusters even if it fails")
	}
}

func TestPollCluster_HandlesNoUserIDs(t *testing.T) {
	store := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{}, nil
		},
	}

	client := &mockK8sClient{
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return []k8s.Event{
				{
					Namespace: "default",
					Object:    "Pod/nginx",
					Reason:    "BackOff",
					Message:   "test",
					Type:      "Warning",
					LastSeen:  time.Now().UTC().Format(time.RFC3339),
					Count:     1,
				},
			}, nil
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{}, nil
		},
	}

	w := New(store, client, 10*time.Second)
	ctx := context.Background()
	
	// Should return 0 without panicking
	count := w.pollCluster(ctx, "test-cluster")
	if count != 0 {
		t.Errorf("Expected 0 notifications with no user IDs, got %d", count)
	}
}

func TestPollCluster_HandlesGetEventsError(t *testing.T) {
	var createCount int32

	store := &mockNotificationStore{
		listStellarUserIDsFn: func(ctx context.Context) ([]string, error) {
			return []string{"user-1"}, nil
		},
		notificationExistsByDedupFn: func(ctx context.Context, userID, dedupeKey string) (bool, error) {
			return false, nil
		},
		createStellarNotificationFn: func(ctx context.Context, notification *store.StellarNotification) error {
			atomic.AddInt32(&createCount, 1)
			return nil
		},
	}

	client := &mockK8sClient{
		getWarningEventsFn: func(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error) {
			return nil, errors.New("mock events error")
		},
		getPodsFn: func(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
			return []k8s.PodInfo{
				{
					Name:      "crash-pod",
					Namespace: "default",
					Containers: []k8s.ContainerInfo{
						{Name: "app", Reason: "CrashLoopBackOff"},
					},
				},
			}, nil
		},
	}

	w := New(store, client, 10*time.Second)
	ctx := context.Background()
	count := w.pollCluster(ctx, "test-cluster")

	// Should still process pods even if events fail
	if count != 1 {
		t.Errorf("Expected 1 notification from pod crash, got %d", count)
	}
}
