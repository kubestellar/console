package observer

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

// --- Helper stubs ---

type observerTestStore struct {
	observerStoreStub
	userIDs              []string
	notifications        []store.StellarNotification
	watches              []store.StellarWatch
	watchByResource      *store.StellarWatch
	createdWatches       []*store.StellarWatch
	createdNotifications []*store.StellarNotification
	createdObservations  []*store.StellarObservation
	dedupExists          bool
}

func (s *observerTestStore) ListStellarUserIDs(context.Context) ([]string, error) {
	return s.userIDs, nil
}

func (s *observerTestStore) GetNotificationsSince(_ context.Context, _ time.Time) ([]store.StellarNotification, error) {
	return s.notifications, nil
}

func (s *observerTestStore) GetActiveWatchesForCluster(context.Context, string) ([]store.StellarWatch, error) {
	return s.watches, nil
}

func (s *observerTestStore) GetActiveWatches(context.Context, string) ([]store.StellarWatch, error) {
	return s.watches, nil
}

func (s *observerTestStore) GetWatchByResource(_ context.Context, _, _, _, _, _ string) (*store.StellarWatch, error) {
	return s.watchByResource, nil
}

func (s *observerTestStore) CreateWatch(_ context.Context, w *store.StellarWatch) (string, error) {
	s.createdWatches = append(s.createdWatches, w)
	return "watch-id", nil
}

func (s *observerTestStore) CreateStellarNotification(_ context.Context, n *store.StellarNotification) error {
	s.createdNotifications = append(s.createdNotifications, n)
	return nil
}

func (s *observerTestStore) CreateObservation(_ context.Context, obs *store.StellarObservation) (string, error) {
	s.createdObservations = append(s.createdObservations, obs)
	return "obs-id", nil
}

func (s *observerTestStore) NotificationExistsByDedup(_ context.Context, _, _ string) (bool, error) {
	return s.dedupExists, nil
}

type k8sTestClient struct {
	clusters    []k8s.ClusterInfo
	events      []k8s.Event
	deployments []k8s.Deployment
	pods        []k8s.PodInfo
	nodes       []k8s.NodeInfo
}

func (c *k8sTestClient) ListClusters(context.Context) ([]k8s.ClusterInfo, error) {
	return c.clusters, nil
}

func (c *k8sTestClient) GetWarningEvents(context.Context, string, string, int) ([]k8s.Event, error) {
	return c.events, nil
}

func (c *k8sTestClient) GetDeployments(context.Context, string, string) ([]k8s.Deployment, error) {
	return c.deployments, nil
}

func (c *k8sTestClient) GetPods(context.Context, string, string) ([]k8s.PodInfo, error) {
	return c.pods, nil
}

func (c *k8sTestClient) GetNodes(context.Context, string) ([]k8s.NodeInfo, error) {
	return c.nodes, nil
}

// --- Tests ---

func TestNewObserverDefaults(t *testing.T) {
	obs := New(observerStoreStub{}, nil, nil, 0)
	if obs.interval != defaultObserverInterval {
		t.Fatalf("interval = %v, want %v", obs.interval, defaultObserverInterval)
	}
	if obs.registry == nil {
		t.Fatal("registry should not be nil when nil passed")
	}
}

func TestNewObserverCustomInterval(t *testing.T) {
	obs := New(observerStoreStub{}, nil, nil, 30*time.Second)
	if obs.interval != 30*time.Second {
		t.Fatalf("interval = %v, want 30s", obs.interval)
	}
}

func TestNewObserverNegativeInterval(t *testing.T) {
	obs := New(observerStoreStub{}, nil, nil, -5*time.Second)
	if obs.interval != defaultObserverInterval {
		t.Fatalf("interval = %v, want default %v", obs.interval, defaultObserverInterval)
	}
}

func TestParseObserverResponse(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		wantSurface string
		wantSuggest string
	}{
		{
			name:        "NOTHING response",
			input:       "NOTHING",
			wantSurface: "",
			wantSuggest: "",
		},
		{
			name:        "NOTHING case insensitive",
			input:       "nothing",
			wantSurface: "",
			wantSuggest: "",
		},
		{
			name:        "SURFACE only",
			input:       "SURFACE: Pod crash-looping in prod namespace",
			wantSurface: "Pod crash-looping in prod namespace",
			wantSuggest: "",
		},
		{
			name:        "SURFACE and SUGGEST",
			input:       "SURFACE: Memory pressure on node-2\nSUGGEST: Check recent deployments",
			wantSurface: "Memory pressure on node-2",
			wantSuggest: "Check recent deployments",
		},
		{
			name:        "multiline with reasoning prefix",
			input:       "I notice recurring OOM kills.\nSURFACE: Repeated OOM kills in ns/app\nSUGGEST: Increase memory limit",
			wantSurface: "Repeated OOM kills in ns/app",
			wantSuggest: "Increase memory limit",
		},
		{
			name:        "empty string",
			input:       "",
			wantSurface: "",
			wantSuggest: "",
		},
		{
			name:        "whitespace only",
			input:       "   \n  ",
			wantSurface: "",
			wantSuggest: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			surface, suggest := parseObserverResponse(tt.input)
			if surface != tt.wantSurface {
				t.Fatalf("surface = %q, want %q", surface, tt.wantSurface)
			}
			if suggest != tt.wantSuggest {
				t.Fatalf("suggest = %q, want %q", suggest, tt.wantSuggest)
			}
		})
	}
}

func TestBuildObserverContext(t *testing.T) {
	t.Run("empty state", func(t *testing.T) {
		result := buildObserverContext(nil, nil, nil)
		if !strings.Contains(result, "- none") {
			t.Fatal("expected '- none' for empty tasks")
		}
	})

	t.Run("with tasks and events", func(t *testing.T) {
		tasks := []store.StellarTask{
			{Priority: 1, Title: "Fix prod", Status: "open"},
			{Priority: 2, Title: "Update docs", Status: "in_progress"},
		}
		events := []store.StellarNotification{
			{Severity: "warning", Title: "OOM Kill", Body: "Pod restarted"},
		}
		observations := []store.StellarObservation{
			{Summary: "Previous observation about memory"},
		}
		result := buildObserverContext(tasks, events, observations)
		if !strings.Contains(result, "Fix prod") {
			t.Fatal("missing task title")
		}
		if !strings.Contains(result, "OOM Kill") {
			t.Fatal("missing event title")
		}
		if !strings.Contains(result, "Previous observation about memory") {
			t.Fatal("missing observation summary")
		}
	})

	t.Run("respects recent limit", func(t *testing.T) {
		tasks := make([]store.StellarTask, 10)
		for i := range tasks {
			tasks[i] = store.StellarTask{Priority: i, Title: "mytask", Status: "open"}
		}
		result := buildObserverContext(tasks, nil, nil)
		// Should have at most observerRecentLimit tasks listed
		count := strings.Count(result, "mytask")
		if count > observerRecentLimit {
			t.Fatalf("got %d task entries, want at most %d", count, observerRecentLimit)
		}
	})
}

func TestSeverityRank(t *testing.T) {
	tests := []struct {
		severity string
		want     int
	}{
		{"critical", 0},
		{"warning", 1},
		{"info", 2},
		{"unknown", 3},
		{"", 3},
	}

	for _, tt := range tests {
		t.Run(tt.severity, func(t *testing.T) {
			if got := severityRank(tt.severity); got != tt.want {
				t.Fatalf("severityRank(%q) = %d, want %d", tt.severity, got, tt.want)
			}
		})
	}
}

func TestParseResourceFromEvents(t *testing.T) {
	tests := []struct {
		name     string
		events   []store.StellarNotification
		title    string
		wantKind string
		wantName string
	}{
		{
			name: "from dedupeKey with ev prefix",
			events: []store.StellarNotification{
				{DedupeKey: "ev:prod-cluster:default:my-pod:CrashLoopBackOff"},
			},
			title:    "CrashLoopBackOff",
			wantKind: "Pod",
			wantName: "my-pod",
		},
		{
			name: "from dedupeKey without ev prefix",
			events: []store.StellarNotification{
				{DedupeKey: "prod-cluster:default:nginx-pod:OOMKilled"},
			},
			title:    "OOMKilled",
			wantKind: "Pod",
			wantName: "nginx-pod",
		},
		{
			name:     "from title with dash separator",
			events:   []store.StellarNotification{{DedupeKey: ""}},
			title:    "CrashLoopBackOff \u2014 default/my-app",
			wantKind: "Pod",
			wantName: "my-app",
		},
		{
			name:     "empty events and no parseable title",
			events:   []store.StellarNotification{{DedupeKey: ""}},
			title:    "Some random title",
			wantKind: "",
			wantName: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			kind, name := parseResourceFromEvents(tt.events, tt.title)
			if kind != tt.wantKind {
				t.Fatalf("kind = %q, want %q", kind, tt.wantKind)
			}
			if name != tt.wantName {
				t.Fatalf("name = %q, want %q", name, tt.wantName)
			}
		})
	}
}

func TestTruncateObserver(t *testing.T) {
	tests := []struct {
		input string
		max   int
		want  string
	}{
		{"hello", 10, "hello"},
		{"hello", 5, "hello"},
		{"hello world", 5, "hello\u2026"},
		{"", 5, ""},
	}

	for _, tt := range tests {
		got := truncate(tt.input, tt.max)
		if got != tt.want {
			t.Fatalf("truncate(%q, %d) = %q, want %q", tt.input, tt.max, got, tt.want)
		}
	}
}

func TestExtractReasoning(t *testing.T) {
	tests := []struct {
		name     string
		response string
		surface  string
		want     string
	}{
		{
			name:     "reasoning before SURFACE",
			response: "The pod has been restarting for 30 minutes.\nSURFACE: Pod crash-looping",
			surface:  "Pod crash-looping",
			want:     "The pod has been restarting for 30 minutes.",
		},
		{
			name:     "REASONING prefix stripped",
			response: "REASONING: Memory leak suspected.\nSURFACE: OOM kills increasing",
			surface:  "OOM kills increasing",
			want:     "Memory leak suspected.",
		},
		{
			name:     "no reasoning when SURFACE at start",
			response: "SURFACE: Something happened",
			surface:  "Something happened",
			want:     "",
		},
		{
			name:     "empty response",
			response: "",
			surface:  "",
			want:     "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractReasoning(tt.response, tt.surface)
			if got != tt.want {
				t.Fatalf("extractReasoning() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestIsQuietWindow(t *testing.T) {
	// Save and restore env
	origStart := os.Getenv("STELLAR_QUIET_START")
	origEnd := os.Getenv("STELLAR_QUIET_END")
	defer func() {
		os.Setenv("STELLAR_QUIET_START", origStart)
		os.Setenv("STELLAR_QUIET_END", origEnd)
	}()

	t.Run("no env vars returns false", func(t *testing.T) {
		os.Unsetenv("STELLAR_QUIET_START")
		os.Unsetenv("STELLAR_QUIET_END")
		if isQuietWindow() {
			t.Fatal("expected false when env vars not set")
		}
	})

	t.Run("only start set returns false", func(t *testing.T) {
		os.Setenv("STELLAR_QUIET_START", "22:00")
		os.Unsetenv("STELLAR_QUIET_END")
		if isQuietWindow() {
			t.Fatal("expected false when only start set")
		}
	})
}

func TestEvaluateRecentCriticalEvents(t *testing.T) {
	t.Run("creates watch for critical events", func(t *testing.T) {
		st := &observerTestStore{
			notifications: []store.StellarNotification{
				{
					UserID:    "user-1",
					Type:      "event",
					Severity:  "critical",
					Title:     "CrashLoopBackOff \u2014 default/nginx",
					Cluster:   "prod",
					Namespace: "default",
					DedupeKey: "ev:prod:default:nginx:CrashLoopBackOff",
				},
			},
			watchByResource: nil, // no existing watch
		}
		obs := New(st, nil, nil, 0)
		obs.evaluateRecentCriticalEvents(context.Background(), []string{"user-1"})
		if len(st.createdWatches) != 1 {
			t.Fatalf("expected 1 watch created, got %d", len(st.createdWatches))
		}
		w := st.createdWatches[0]
		if w.ResourceName != "nginx" {
			t.Fatalf("watch resource = %q, want nginx", w.ResourceName)
		}
		if w.Cluster != "prod" {
			t.Fatalf("watch cluster = %q, want prod", w.Cluster)
		}
	})

	t.Run("creates watch for recurring events", func(t *testing.T) {
		notifications := make([]store.StellarNotification, observerRecurringThreshold)
		for i := range notifications {
			notifications[i] = store.StellarNotification{
				UserID:    "user-1",
				Type:      "event",
				Severity:  "warning",
				Title:     "BackOff \u2014 default/my-app",
				Cluster:   "dev",
				Namespace: "default",
				DedupeKey: "ev:dev:default:my-app:BackOff",
			}
		}
		st := &observerTestStore{notifications: notifications}
		obs := New(st, nil, nil, 0)
		obs.evaluateRecentCriticalEvents(context.Background(), []string{"user-1"})
		if len(st.createdWatches) != 1 {
			t.Fatalf("expected 1 watch, got %d", len(st.createdWatches))
		}
	})

	t.Run("skips non-event notifications", func(t *testing.T) {
		st := &observerTestStore{
			notifications: []store.StellarNotification{
				{UserID: "user-1", Type: "action", Severity: "critical", Title: "test"},
			},
		}
		obs := New(st, nil, nil, 0)
		obs.evaluateRecentCriticalEvents(context.Background(), []string{"user-1"})
		if len(st.createdWatches) != 0 {
			t.Fatalf("expected 0 watches, got %d", len(st.createdWatches))
		}
	})

	t.Run("skips already watched resources", func(t *testing.T) {
		st := &observerTestStore{
			notifications: []store.StellarNotification{
				{
					UserID:    "user-1",
					Type:      "event",
					Severity:  "critical",
					Title:     "OOM \u2014 default/app",
					Cluster:   "prod",
					Namespace: "default",
					DedupeKey: "ev:prod:default:app:OOMKilled",
				},
			},
			watchByResource: &store.StellarWatch{ID: "existing-watch"},
		}
		obs := New(st, nil, nil, 0)
		obs.evaluateRecentCriticalEvents(context.Background(), []string{"user-1"})
		if len(st.createdWatches) != 0 {
			t.Fatalf("expected 0 watches when already watched, got %d", len(st.createdWatches))
		}
	})
}

func TestFetchResourceState(t *testing.T) {
	t.Run("nil client", func(t *testing.T) {
		obs := New(observerStoreStub{}, nil, nil, 0)
		result := obs.fetchResourceState(context.Background(), store.StellarWatch{})
		if result != "cluster client not available" {
			t.Fatalf("got %q, want 'cluster client not available'", result)
		}
	})

	t.Run("deployment found", func(t *testing.T) {
		client := &k8sTestClient{
			deployments: []k8s.Deployment{
				{Name: "my-deploy", Status: "Available", ReadyReplicas: 3, Replicas: 3, UpdatedReplicas: 3, AvailableReplicas: 3, Progress: 100},
			},
		}
		obs := New(observerStoreStub{}, client, nil, 0)
		result := obs.fetchResourceState(context.Background(), store.StellarWatch{
			ResourceKind: "Deployment",
			ResourceName: "my-deploy",
			Cluster:      "prod",
			Namespace:    "default",
		})
		if !strings.Contains(result, "3 ready / 3 desired") {
			t.Fatalf("result = %q, expected replica info", result)
		}
	})

	t.Run("deployment not found", func(t *testing.T) {
		client := &k8sTestClient{deployments: []k8s.Deployment{}}
		obs := New(observerStoreStub{}, client, nil, 0)
		result := obs.fetchResourceState(context.Background(), store.StellarWatch{
			ResourceKind: "Deployment",
			ResourceName: "missing",
			Cluster:      "prod",
			Namespace:    "default",
		})
		if !strings.Contains(result, "not found") {
			t.Fatalf("result = %q, expected 'not found'", result)
		}
	})

	t.Run("pod found", func(t *testing.T) {
		client := &k8sTestClient{
			pods: []k8s.PodInfo{
				{Name: "my-pod", Status: "Running", Ready: "1/1", Restarts: 2},
			},
		}
		obs := New(observerStoreStub{}, client, nil, 0)
		result := obs.fetchResourceState(context.Background(), store.StellarWatch{
			ResourceKind: "Pod",
			ResourceName: "my-pod",
			Cluster:      "prod",
			Namespace:    "default",
		})
		if !strings.Contains(result, "Running") {
			t.Fatalf("result = %q, expected 'Running'", result)
		}
		if !strings.Contains(result, "restarts: 2") {
			t.Fatalf("result = %q, expected restarts info", result)
		}
	})

	t.Run("node found", func(t *testing.T) {
		client := &k8sTestClient{
			nodes: []k8s.NodeInfo{
				{Name: "node-1", Status: "Ready", Unschedulable: false, Conditions: []k8s.NodeCondition{
					{Type: "Ready", Status: "True"},
				}},
			},
		}
		obs := New(observerStoreStub{}, client, nil, 0)
		result := obs.fetchResourceState(context.Background(), store.StellarWatch{
			ResourceKind: "Node",
			ResourceName: "node-1",
			Cluster:      "prod",
		})
		if !strings.Contains(result, "ready: true") {
			t.Fatalf("result = %q, expected 'ready: true'", result)
		}
	})

	t.Run("unsupported kind", func(t *testing.T) {
		client := &k8sTestClient{}
		obs := New(observerStoreStub{}, client, nil, 0)
		result := obs.fetchResourceState(context.Background(), store.StellarWatch{
			ResourceKind: "ConfigMap",
			ResourceName: "my-cm",
			Cluster:      "prod",
			Namespace:    "default",
		})
		if !strings.Contains(result, "not yet supported") {
			t.Fatalf("result = %q, expected unsupported message", result)
		}
	})
}

func TestResolveProviderForUserEmptyUserID(t *testing.T) {
	registry := providers.NewRegistry()
	obs := New(observerStoreStub{}, nil, registry, 0)
	got := obs.resolveProviderForUser(context.Background(), "")
	want := registry.Resolve("", "", nil)
	if got.Source != want.Source {
		t.Fatalf("source = %q, want %q", got.Source, want.Source)
	}
}

func TestObserveStopsOnContextCancel(t *testing.T) {
	obs := New(observerStoreStub{}, nil, nil, 10*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		obs.Start(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Start did not return after context cancel")
	}
}
