package observer

import (
	"context"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

type observerStoreStub struct{}

type k8sClientStub struct{}

var _ ObserverStore = (*observerStoreStub)(nil)
var _ K8sClient = (*k8sClientStub)(nil)

func (observerStoreStub) ListStellarUserIDs(context.Context) ([]string, error) {
	return nil, nil
}

func (observerStoreStub) GetOpenTasks(context.Context, string) ([]store.StellarTask, error) {
	return nil, nil
}

func (observerStoreStub) ListStellarNotifications(context.Context, string, int, bool) ([]store.StellarNotification, error) {
	return nil, nil
}

func (observerStoreStub) GetRecentObservations(context.Context, string, int) ([]store.StellarObservation, error) {
	return nil, nil
}

func (observerStoreStub) CreateObservation(context.Context, *store.StellarObservation) (string, error) {
	return "", nil
}

func (observerStoreStub) GetRecentMemoryEntries(context.Context, string, string, int) ([]store.StellarMemoryEntry, error) {
	return nil, nil
}

func (observerStoreStub) GetActiveWatchesForCluster(context.Context, string) ([]store.StellarWatch, error) {
	return nil, nil
}

func (observerStoreStub) GetActiveWatches(context.Context, string) ([]store.StellarWatch, error) {
	return nil, nil
}

func (observerStoreStub) UpdateWatchStatus(context.Context, string, string, string) error {
	return nil
}

func (observerStoreStub) ResolveWatch(context.Context, string) error {
	return nil
}

func (observerStoreStub) SetWatchLastChecked(context.Context, string, time.Time) error {
	return nil
}

func (observerStoreStub) CreateStellarNotification(context.Context, *store.StellarNotification) error {
	return nil
}

func (observerStoreStub) GetNotificationsSince(context.Context, time.Time) ([]store.StellarNotification, error) {
	return nil, nil
}

func (observerStoreStub) GetWatchByResource(context.Context, string, string, string, string, string) (*store.StellarWatch, error) {
	return nil, nil
}

func (observerStoreStub) CreateWatch(context.Context, *store.StellarWatch) (string, error) {
	return "", nil
}

func (observerStoreStub) NotificationExistsByDedup(context.Context, string, string) (bool, error) {
	return false, nil
}

func (k8sClientStub) ListClusters(context.Context) ([]k8s.ClusterInfo, error) {
	return nil, nil
}

func (k8sClientStub) GetWarningEvents(context.Context, string, string, int) ([]k8s.Event, error) {
	return nil, nil
}

func (k8sClientStub) GetDeployments(context.Context, string, string) ([]k8s.Deployment, error) {
	return nil, nil
}

func (k8sClientStub) GetPods(context.Context, string, string) ([]k8s.PodInfo, error) {
	return nil, nil
}

func (k8sClientStub) GetNodes(context.Context, string) ([]k8s.NodeInfo, error) {
	return nil, nil
}

func TestObserverConstants(t *testing.T) {
	if defaultObserverInterval != 60*time.Second {
		t.Fatalf("defaultObserverInterval = %v, want %v", defaultObserverInterval, 60*time.Second)
	}
	if observerRecentLimit != 5 {
		t.Fatalf("observerRecentLimit = %d, want 5", observerRecentLimit)
	}
	if observerMaxRecentFlags != 3 {
		t.Fatalf("observerMaxRecentFlags = %d, want 3", observerMaxRecentFlags)
	}
}

func TestResolveProviderForUserFallsBackWithoutLookup(t *testing.T) {
	registry := providers.NewRegistry()
	obs := New(observerStoreStub{}, nil, registry, 0)

	got := obs.resolveProviderForUser(context.Background(), "user-1")
	want := registry.Resolve("", "", nil)

	if got.Source != want.Source {
		t.Fatalf("source = %q, want %q", got.Source, want.Source)
	}
	if got.Model != want.Model {
		t.Fatalf("model = %q, want %q", got.Model, want.Model)
	}
	if got.Provider == nil {
		t.Fatal("provider should not be nil")
	}
	if want.Provider == nil {
		t.Fatal("expected registry fallback provider to be non-nil")
	}
	if got.Provider.Name() != want.Provider.Name() {
		t.Fatalf("provider = %q, want %q", got.Provider.Name(), want.Provider.Name())
	}
}
