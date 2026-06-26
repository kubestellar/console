package observer

import (
	"context"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Enhanced stubs for event processing tests ---

type mockProvider struct {
	generateResp string
	generateErr  error
	callCount    int
}

func (m *mockProvider) Name() string { return "mock" }

func (m *mockProvider) Health(_ context.Context) providers.HealthResult {
	return providers.HealthResult{Available: true}
}

func (m *mockProvider) SupportsStreaming() bool { return false }

func (m *mockProvider) Generate(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
	m.callCount++
	if m.generateErr != nil {
		return nil, m.generateErr
	}
	return &providers.GenerateResponse{Content: m.generateResp}, nil
}

type observerEventStore struct {
	observerStoreStub
	openTasks            []store.StellarTask
	notifications        []store.StellarNotification
	observations         []store.StellarObservation
	memoryEntries        []store.StellarMemoryEntry
	createdObservations  []*store.StellarObservation
	createdNotifications []*store.StellarNotification
	watchesByCluster     []store.StellarWatch
	updatedWatches       []updateWatchCall
	resolvedWatches      []string
	lastCheckedWatches   map[string]time.Time
	dedupExists          bool
}

type updateWatchCall struct {
	id         string
	status     string
	lastUpdate string
}

func (s *observerEventStore) GetOpenTasks(_ context.Context, _ string) ([]store.StellarTask, error) {
	return s.openTasks, nil
}

func (s *observerEventStore) ListStellarNotifications(_ context.Context, _ string, _ int, _ bool) ([]store.StellarNotification, error) {
	return s.notifications, nil
}

func (s *observerEventStore) GetRecentObservations(_ context.Context, _ string, _ int) ([]store.StellarObservation, error) {
	return s.observations, nil
}

func (s *observerEventStore) GetRecentMemoryEntries(_ context.Context, _, _ string, _ int) ([]store.StellarMemoryEntry, error) {
	return s.memoryEntries, nil
}

func (s *observerEventStore) CreateObservation(_ context.Context, obs *store.StellarObservation) (string, error) {
	s.createdObservations = append(s.createdObservations, obs)
	return "obs-id", nil
}

func (s *observerEventStore) CreateStellarNotification(_ context.Context, n *store.StellarNotification) error {
	s.createdNotifications = append(s.createdNotifications, n)
	return nil
}

func (s *observerEventStore) GetActiveWatchesForCluster(_ context.Context, _ string) ([]store.StellarWatch, error) {
	return s.watchesByCluster, nil
}

func (s *observerEventStore) UpdateWatchStatus(_ context.Context, id, status, lastUpdate string) error {
	s.updatedWatches = append(s.updatedWatches, updateWatchCall{id, status, lastUpdate})
	return nil
}

func (s *observerEventStore) ResolveWatch(_ context.Context, id string) error {
	s.resolvedWatches = append(s.resolvedWatches, id)
	return nil
}

func (s *observerEventStore) SetWatchLastChecked(_ context.Context, id string, ts time.Time) error {
	if s.lastCheckedWatches == nil {
		s.lastCheckedWatches = make(map[string]time.Time)
	}
	s.lastCheckedWatches[id] = ts
	return nil
}

func (s *observerEventStore) GetNotificationsSince(_ context.Context, _ time.Time) ([]store.StellarNotification, error) {
	return s.notifications, nil
}

func (s *observerEventStore) NotificationExistsByDedup(_ context.Context, _, _ string) (bool, error) {
	return s.dedupExists, nil
}

type k8sEventClient struct {
	clusters    []k8s.ClusterInfo
	events      []k8s.Event
	deployments []k8s.Deployment
	pods        []k8s.PodInfo
	nodes       []k8s.NodeInfo
}

func (c *k8sEventClient) ListClusters(_ context.Context) ([]k8s.ClusterInfo, error) {
	return c.clusters, nil
}

func (c *k8sEventClient) GetWarningEvents(_ context.Context, _, _ string, _ int) ([]k8s.Event, error) {
	return c.events, nil
}

func (c *k8sEventClient) GetDeployments(_ context.Context, _, _ string) ([]k8s.Deployment, error) {
	return c.deployments, nil
}

func (c *k8sEventClient) GetPods(_ context.Context, _, _ string) ([]k8s.PodInfo, error) {
	return c.pods, nil
}

func (c *k8sEventClient) GetNodes(_ context.Context, _ string) ([]k8s.NodeInfo, error) {
	return c.nodes, nil
}

// --- Tests for observeUser workflow ---

func TestObserveUserCreatesObservation(t *testing.T) {
	mockP := &mockProvider{generateResp: "SURFACE: Memory leak detected\nSUGGEST: Check for goroutine leaks"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{
		openTasks: []store.StellarTask{
			{Title: "Fix prod crash", Priority: 1, Status: "open"},
		},
		notifications: []store.StellarNotification{
			{Severity: "warning", Title: "OOM Kill", Body: "Pod restarted"},
		},
	}

	obs := New(st, nil, registry, 0)
	obs.observeUser(context.Background(), "user-1")

	require.Len(t, st.createdObservations, 1)
	o := st.createdObservations[0]
	assert.Equal(t, "Memory leak detected", o.Summary)
	assert.Equal(t, "SUGGEST: Check for goroutine leaks", o.Detail)
	assert.Equal(t, "noticed", o.Kind)
}

func TestObserveUserSkipsNothingResponse(t *testing.T) {
	mockP := &mockProvider{generateResp: "NOTHING"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{}
	obs := New(st, nil, registry, 0)
	obs.observeUser(context.Background(), "user-1")

	assert.Empty(t, st.createdObservations)
}

func TestObserveUserExtractsReasoning(t *testing.T) {
	mockP := &mockProvider{
		generateResp: "I noticed the pod has restarted 5 times in 10 minutes.\nSURFACE: Pod crash-looping in prod",
	}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{}
	obs := New(st, nil, registry, 0)
	obs.observeUser(context.Background(), "user-1")

	require.Len(t, st.createdObservations, 1)
	assert.Equal(t, "I noticed the pod has restarted 5 times in 10 minutes.", st.createdObservations[0].Reasoning)
}

func TestObserveUserIncludesClusterEvents(t *testing.T) {
	mockP := &mockProvider{generateResp: "SURFACE: test"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	client := &k8sEventClient{
		clusters: []k8s.ClusterInfo{{Name: "prod"}},
		events: []k8s.Event{
			{Reason: "BackOff", Message: "Back-off restarting failed container"},
		},
	}

	st := &observerEventStore{}
	obs := New(st, client, registry, 0)
	obs.observeUser(context.Background(), "user-1")

	assert.Equal(t, 1, mockP.callCount)
	require.Len(t, st.createdObservations, 1)
}

func TestObserveUserIncludesMemoryContext(t *testing.T) {
	mockP := &mockProvider{generateResp: "SURFACE: test"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	client := &k8sEventClient{
		clusters: []k8s.ClusterInfo{{Name: "dev"}},
	}

	st := &observerEventStore{
		memoryEntries: []store.StellarMemoryEntry{
			{Category: "deployment", Summary: "Deployed v2.3.0", CreatedAt: time.Now()},
		},
	}

	obs := New(st, client, registry, 0)
	obs.observeUser(context.Background(), "user-1")

	require.Len(t, st.createdObservations, 1)
}

// --- Tests for generateNudges ---

func TestGenerateNudgesCreatesNotification(t *testing.T) {
	mockP := &mockProvider{generateResp: "Recurring CrashLoopBackOff events suggest image issue"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{
		notifications: []store.StellarNotification{
			{Severity: "warning", Title: "CrashLoop", Body: "nginx pod restarting", Cluster: "prod"},
			{Severity: "warning", Title: "CrashLoop", Body: "nginx pod restarting", Cluster: "prod"},
		},
		dedupExists: false,
	}

	obs := New(st, nil, registry, 0)
	obs.generateNudges(context.Background(), []string{"user-1"})

	require.Len(t, st.createdNotifications, 1)
	n := st.createdNotifications[0]
	assert.Equal(t, "observation", n.Type)
	assert.Equal(t, "info", n.Severity)
	assert.Equal(t, "Stellar observation", n.Title)
	assert.Contains(t, n.Body, "Recurring CrashLoopBackOff")
}

func TestGenerateNudgesSkipsNothingResponse(t *testing.T) {
	mockP := &mockProvider{generateResp: "NOTHING"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{
		notifications: []store.StellarNotification{
			{Severity: "info", Title: "test", Body: "test"},
		},
	}

	obs := New(st, nil, registry, 0)
	obs.generateNudges(context.Background(), []string{"user-1"})

	assert.Empty(t, st.createdNotifications)
}

func TestGenerateNudgesSkipsTooShort(t *testing.T) {
	mockP := &mockProvider{generateResp: "short"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{
		notifications: []store.StellarNotification{{Severity: "info", Title: "test"}},
	}

	obs := New(st, nil, registry, 0)
	obs.generateNudges(context.Background(), []string{"user-1"})

	assert.Empty(t, st.createdNotifications)
}

func TestGenerateNudgesSkipsWhenDedupExists(t *testing.T) {
	mockP := &mockProvider{generateResp: "This is a good observation about cluster health"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{
		notifications: []store.StellarNotification{{Severity: "info", Title: "test"}},
		dedupExists:   true,
	}

	obs := New(st, nil, registry, 0)
	obs.generateNudges(context.Background(), []string{"user-1"})

	assert.Empty(t, st.createdNotifications)
}

func TestGenerateNudgesSkipsEmptyUserID(t *testing.T) {
	mockP := &mockProvider{generateResp: "This is a good nudge message"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{
		notifications: []store.StellarNotification{{Severity: "info", Title: "test"}},
	}

	obs := New(st, nil, registry, 0)
	obs.generateNudges(context.Background(), []string{"", "  "})

	assert.Empty(t, st.createdNotifications)
}

// --- Tests for watch follow-through ---

func TestFollowThroughWatchesProcessesAllWatches(t *testing.T) {
	mockP := &mockProvider{generateResp: "UNCHANGED: Pod still stable"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{
		watchesByCluster: []store.StellarWatch{
			{ID: "w1", Cluster: "prod", Namespace: "default", ResourceKind: "Pod", ResourceName: "nginx", UserID: "user-1"},
			{ID: "w2", Cluster: "dev", Namespace: "app", ResourceKind: "Pod", ResourceName: "api", UserID: "user-1"},
		},
	}

	client := &k8sEventClient{
		pods: []k8s.PodInfo{
			{Name: "nginx", Status: "Running", Ready: "1/1"},
			{Name: "api", Status: "Running", Ready: "1/1"},
		},
	}

	obs := New(st, client, registry, 0)
	obs.followThroughWatches(context.Background())

	require.Len(t, st.lastCheckedWatches, 2)
	assert.Contains(t, st.lastCheckedWatches, "w1")
	assert.Contains(t, st.lastCheckedWatches, "w2")
}

func TestCheckWatchResolves(t *testing.T) {
	mockP := &mockProvider{generateResp: "RESOLVED: Pod is now stable with 0 restarts"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{}
	client := &k8sEventClient{
		pods: []k8s.PodInfo{{Name: "nginx", Status: "Running", Ready: "1/1"}},
	}

	obs := New(st, client, registry, 0)
	w := store.StellarWatch{
		ID:           "w1",
		Cluster:      "prod",
		Namespace:    "default",
		ResourceKind: "Pod",
		ResourceName: "nginx",
		UserID:       "user-1",
	}
	obs.checkWatch(context.Background(), w)

	require.Len(t, st.resolvedWatches, 1)
	assert.Equal(t, "w1", st.resolvedWatches[0])
	require.Len(t, st.createdNotifications, 1)
	n := st.createdNotifications[0]
	assert.Equal(t, "system", n.Type)
	assert.Equal(t, "info", n.Severity)
	assert.Contains(t, n.Title, "Resolved")
}

func TestCheckWatchUpdatesStatus(t *testing.T) {
	mockP := &mockProvider{generateResp: "UPDATE: Restarts increased to 3"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{}
	client := &k8sEventClient{
		pods: []k8s.PodInfo{{Name: "nginx", Status: "Running", Ready: "1/1", Restarts: 3}},
	}

	obs := New(st, client, registry, 0)
	w := store.StellarWatch{
		ID:           "w1",
		Cluster:      "prod",
		Namespace:    "default",
		ResourceKind: "Pod",
		ResourceName: "nginx",
		UserID:       "user-1",
		LastUpdate:   "Restarts: 1",
	}
	obs.checkWatch(context.Background(), w)

	require.Len(t, st.updatedWatches, 1)
	assert.Equal(t, "w1", st.updatedWatches[0].id)
	assert.Equal(t, "active", st.updatedWatches[0].status)
}

func TestCheckWatchUnchangedSkipsObservation(t *testing.T) {
	mockP := &mockProvider{generateResp: "UNCHANGED: Pod stable"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{}
	client := &k8sEventClient{
		pods: []k8s.PodInfo{{Name: "nginx", Status: "Running", Ready: "1/1"}},
	}

	obs := New(st, client, registry, 0)
	w := store.StellarWatch{
		ID:           "w1",
		Cluster:      "prod",
		Namespace:    "default",
		ResourceKind: "Pod",
		ResourceName: "nginx",
		UserID:       "user-1",
	}
	obs.checkWatch(context.Background(), w)

	assert.Empty(t, st.createdObservations)
	assert.Empty(t, st.createdNotifications)
	require.Len(t, st.lastCheckedWatches, 1)
}

func TestCheckWatchSkipsDuplicateUpdate(t *testing.T) {
	mockP := &mockProvider{generateResp: "UPDATE: Restarts: 2"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{}
	client := &k8sEventClient{
		pods: []k8s.PodInfo{{Name: "nginx", Status: "Running", Ready: "1/1", Restarts: 2}},
	}

	obs := New(st, client, registry, 0)
	w := store.StellarWatch{
		ID:           "w1",
		Cluster:      "prod",
		Namespace:    "default",
		ResourceKind: "Pod",
		ResourceName: "nginx",
		UserID:       "user-1",
		LastUpdate:   "Restarts: 2",
	}
	obs.checkWatch(context.Background(), w)

	assert.Empty(t, st.createdObservations)
}

// --- Tests for fetchResourceState edge cases ---

func TestFetchResourceStateDeploymentMultipleConditions(t *testing.T) {
	client := &k8sEventClient{
		deployments: []k8s.Deployment{
			{
				Name:              "web",
				Status:            "Progressing",
				Replicas:          5,
				ReadyReplicas:     3,
				UpdatedReplicas:   4,
				AvailableReplicas: 3,
				Progress:          60,
			},
		},
	}

	obs := New(observerStoreStub{}, client, nil, 0)
	result := obs.fetchResourceState(context.Background(), store.StellarWatch{
		ResourceKind: "Deployment",
		ResourceName: "web",
		Cluster:      "prod",
		Namespace:    "default",
	})

	assert.Contains(t, result, "Progressing")
	assert.Contains(t, result, "3 ready / 5 desired")
	assert.Contains(t, result, "60%")
}

func TestFetchResourceStatePodWithContainerDetails(t *testing.T) {
	client := &k8sEventClient{
		pods: []k8s.PodInfo{
			{
				Name:     "app-pod",
				Status:   "CrashLoopBackOff",
				Ready:    "0/1",
				Restarts: 10,
				Containers: []k8s.ContainerInfo{
					{
						Name:    "main",
						Ready:   false,
						State:   "waiting",
						Reason:  "CrashLoopBackOff",
						Message: "Error: exit code 137",
					},
				},
			},
		},
	}

	obs := New(observerStoreStub{}, client, nil, 0)
	result := obs.fetchResourceState(context.Background(), store.StellarWatch{
		ResourceKind: "Pod",
		ResourceName: "app-pod",
		Cluster:      "prod",
		Namespace:    "default",
	})

	assert.Contains(t, result, "CrashLoopBackOff")
	assert.Contains(t, result, "restarts: 10")
	assert.Contains(t, result, "main")
	assert.Contains(t, result, "exit code 137")
}

func TestFetchResourceStateNodeWithConditions(t *testing.T) {
	client := &k8sEventClient{
		nodes: []k8s.NodeInfo{
			{
				Name:           "node-3",
				Status:         "Ready",
				Unschedulable:  true,
				Conditions: []k8s.NodeCondition{
					{Type: "Ready", Status: "True"},
					{Type: "MemoryPressure", Status: "False"},
					{Type: "DiskPressure", Status: "True"},
				},
			},
		},
	}

	obs := New(observerStoreStub{}, client, nil, 0)
	result := obs.fetchResourceState(context.Background(), store.StellarWatch{
		ResourceKind: "Node",
		ResourceName: "node-3",
		Cluster:      "prod",
	})

	assert.Contains(t, result, "ready: true")
	assert.Contains(t, result, "schedulable: false")
	assert.Contains(t, result, "DiskPressure")
}

// --- Tests for observe() orchestration ---

func TestObserveSkipsEmptyUserID(t *testing.T) {
	mockP := &mockProvider{generateResp: "SURFACE: test"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{
		openTasks: []store.StellarTask{{Title: "test"}},
	}

	obs := New(st, nil, registry, 0)
	obs.observe(context.Background())

	assert.Empty(t, st.createdObservations)
}

func TestObserveLogsClusterMetrics(t *testing.T) {
	client := &k8sEventClient{
		clusters: []k8s.ClusterInfo{
			{Name: "prod"},
			{Name: "dev"},
		},
		events: []k8s.Event{
			{Reason: "BackOff", Message: "test"},
		},
	}

	st := &observerEventStore{}
	obs := New(st, client, nil, 0)
	obs.observe(context.Background())

	// Should not panic and should handle empty user list gracefully
	assert.Empty(t, st.createdObservations)
}

// --- Error path tests ---

func TestObserveUserHandlesProviderError(t *testing.T) {
	mockP := &mockProvider{generateErr: assert.AnError}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{
		openTasks: []store.StellarTask{{Title: "test"}},
	}

	obs := New(st, nil, registry, 0)
	obs.observeUser(context.Background(), "user-1")

	assert.Empty(t, st.createdObservations)
}

func TestGenerateNudgesHandlesNoNotifications(t *testing.T) {
	mockP := &mockProvider{generateResp: "test"}
	registry := providers.NewRegistry()
	registry.Register(mockP, []string{"mock-model"}, true)

	st := &observerEventStore{notifications: nil}
	obs := New(st, nil, registry, 0)
	obs.generateNudges(context.Background(), []string{"user-1"})

	assert.Empty(t, st.createdNotifications)
	assert.Equal(t, 0, mockP.callCount)
}

func TestFollowThroughWatchesHandlesEmptyWatches(t *testing.T) {
	st := &observerEventStore{watchesByCluster: nil}
	obs := New(st, nil, nil, 0)
	obs.followThroughWatches(context.Background())

	assert.Empty(t, st.lastCheckedWatches)
}

func TestCheckWatchHandlesNilProvider(t *testing.T) {
	st := &observerEventStore{}
	client := &k8sEventClient{
		pods: []k8s.PodInfo{{Name: "nginx", Status: "Running"}},
	}

	// Create registry but don't register any provider
	registry := providers.NewRegistry()
	obs := New(st, client, registry, 0)

	w := store.StellarWatch{
		ID:           "w1",
		ResourceKind: "Pod",
		ResourceName: "nginx",
		UserID:       "user-1",
	}
	obs.checkWatch(context.Background(), w)

	// Should not panic, should exit early
	assert.Empty(t, st.updatedWatches)
}
