package handlers

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/rest"
)

// setupReconcileEnv creates a ConsolePersistenceHandlers wired to a fake
// dynamic client for the persistence layer and a test MultiClusterClient.
func setupReconcileEnv(t *testing.T, persistenceObjects ...runtime.Object) (*ConsolePersistenceHandlers, *fake.FakeDynamicClient) {
	t.Helper()

	scheme := runtime.NewScheme()
	fakeDyn := fake.NewSimpleDynamicClient(scheme, persistenceObjects...)

	// Build a persistence store that points at "persist-cluster"
	configPath := filepath.Join(t.TempDir(), "persistence.json")
	ps := store.NewPersistenceStore(configPath)
	_ = ps.UpdateConfig(store.PersistenceConfig{
		Enabled:        true,
		PrimaryCluster: "persist-cluster",
		Namespace:      "test-ns",
		SyncMode:       "primary-only",
	})
	// Wire the client factory to return our fake dynamic client
	ps.SetClientFactory(func(_ string) (dynamic.Interface, *rest.Config, error) {
		return fakeDyn, nil, nil
	})
	ps.SetClusterHealthChecker(func(_ context.Context, _ string) store.ClusterHealth {
		return store.ClusterHealthHealthy
	})

	// Build a MultiClusterClient (used for the actual deployment step)
	k8sClient, _ := k8s.NewMultiClusterClient("")

	h := &ConsolePersistenceHandlers{
		persistenceStore: ps,
		k8sClient:        k8sClient,
	}

	return h, fakeDyn
}

func TestResolveTargetClusters_ExplicitOnly(t *testing.T) {
	h, _ := setupReconcileEnv(t)

	wd := &v1alpha1.WorkloadDeployment{
		ObjectMeta: metav1.ObjectMeta{Name: "wd1", Namespace: "test-ns"},
		Spec: v1alpha1.WorkloadDeploymentSpec{
			WorkloadRef:    v1alpha1.ResourceReference{Name: "my-app"},
			TargetClusters: []string{"cluster-a", "cluster-b"},
		},
	}

	targets, err := h.resolveTargetClusters(context.Background(), wd)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"cluster-a", "cluster-b"}, targets)
}

func TestResolveTargetClusters_FromClusterGroup(t *testing.T) {
	// Seed a ClusterGroup with static members
	cg := &v1alpha1.ClusterGroup{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "ClusterGroup",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "prod-group", Namespace: "test-ns"},
		Spec: v1alpha1.ClusterGroupSpec{
			StaticMembers: []string{"cluster-x", "cluster-y"},
		},
	}
	cgU, err := cg.ToUnstructured()
	require.NoError(t, err)

	h, _ := setupReconcileEnv(t, cgU)

	wd := &v1alpha1.WorkloadDeployment{
		ObjectMeta: metav1.ObjectMeta{Name: "wd1", Namespace: "test-ns"},
		Spec: v1alpha1.WorkloadDeploymentSpec{
			WorkloadRef:    v1alpha1.ResourceReference{Name: "my-app"},
			TargetGroupRef: &v1alpha1.ResourceReference{Name: "prod-group"},
		},
	}

	targets, err := h.resolveTargetClusters(context.Background(), wd)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"cluster-x", "cluster-y"}, targets)
}

func TestResolveTargetClusters_MergesExplicitAndGroup(t *testing.T) {
	cg := &v1alpha1.ClusterGroup{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "ClusterGroup",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "group1", Namespace: "test-ns"},
		Spec: v1alpha1.ClusterGroupSpec{
			StaticMembers: []string{"cluster-b", "cluster-c"},
		},
	}
	cgU, err := cg.ToUnstructured()
	require.NoError(t, err)

	h, _ := setupReconcileEnv(t, cgU)

	wd := &v1alpha1.WorkloadDeployment{
		ObjectMeta: metav1.ObjectMeta{Name: "wd1", Namespace: "test-ns"},
		Spec: v1alpha1.WorkloadDeploymentSpec{
			WorkloadRef:    v1alpha1.ResourceReference{Name: "my-app"},
			TargetClusters: []string{"cluster-a", "cluster-b"}, // cluster-b overlaps
			TargetGroupRef: &v1alpha1.ResourceReference{Name: "group1"},
		},
	}

	targets, err := h.resolveTargetClusters(context.Background(), wd)
	require.NoError(t, err)
	// cluster-b should be deduplicated
	assert.ElementsMatch(t, []string{"cluster-a", "cluster-b", "cluster-c"}, targets)
}

func TestResolveTargetClusters_EmptyTargets(t *testing.T) {
	h, _ := setupReconcileEnv(t)

	wd := &v1alpha1.WorkloadDeployment{
		ObjectMeta: metav1.ObjectMeta{Name: "wd1", Namespace: "test-ns"},
		Spec: v1alpha1.WorkloadDeploymentSpec{
			WorkloadRef: v1alpha1.ResourceReference{Name: "my-app"},
		},
	}

	targets, err := h.resolveTargetClusters(context.Background(), wd)
	require.NoError(t, err)
	assert.Empty(t, targets)
}

func TestResolveManagedWorkload_Found(t *testing.T) {
	mw := &v1alpha1.ManagedWorkload{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "ManagedWorkload",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "my-app", Namespace: "test-ns"},
		Spec: v1alpha1.ManagedWorkloadSpec{
			SourceCluster:   "source-cluster",
			SourceNamespace: "default",
			WorkloadRef: v1alpha1.WorkloadReference{
				Kind: "Deployment",
				Name: "nginx",
			},
		},
	}
	mwU, err := mw.ToUnstructured()
	require.NoError(t, err)

	h, _ := setupReconcileEnv(t, mwU)

	wd := &v1alpha1.WorkloadDeployment{
		ObjectMeta: metav1.ObjectMeta{Name: "wd1", Namespace: "test-ns"},
		Spec: v1alpha1.WorkloadDeploymentSpec{
			WorkloadRef: v1alpha1.ResourceReference{Name: "my-app"},
		},
	}

	resolved, err := h.resolveManagedWorkload(context.Background(), wd)
	require.NoError(t, err)
	assert.Equal(t, "my-app", resolved.Name)
	assert.Equal(t, "source-cluster", resolved.Spec.SourceCluster)
}

func TestResolveManagedWorkload_NotFound(t *testing.T) {
	h, _ := setupReconcileEnv(t)

	wd := &v1alpha1.WorkloadDeployment{
		ObjectMeta: metav1.ObjectMeta{Name: "wd1", Namespace: "test-ns"},
		Spec: v1alpha1.WorkloadDeploymentSpec{
			WorkloadRef: v1alpha1.ResourceReference{Name: "nonexistent"},
		},
	}

	_, err := h.resolveManagedWorkload(context.Background(), wd)
	assert.Error(t, err)
}

func TestReconcileDeployment_NoTargets(t *testing.T) {
	// A WorkloadDeployment with a valid workload ref but no target clusters
	// should end in Failed status.
	mw := &v1alpha1.ManagedWorkload{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "ManagedWorkload",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "my-app", Namespace: "test-ns"},
		Spec: v1alpha1.ManagedWorkloadSpec{
			SourceCluster:   "source-cluster",
			SourceNamespace: "default",
			WorkloadRef: v1alpha1.WorkloadReference{
				Kind: "Deployment",
				Name: "nginx",
			},
		},
	}
	mwU, _ := mw.ToUnstructured()

	wd := &v1alpha1.WorkloadDeployment{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "WorkloadDeployment",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "wd-no-targets", Namespace: "test-ns"},
		Spec: v1alpha1.WorkloadDeploymentSpec{
			WorkloadRef: v1alpha1.ResourceReference{Name: "my-app"},
		},
	}
	wdU, _ := wd.ToUnstructured()

	h, _ := setupReconcileEnv(t, mwU, wdU)

	h.reconcileDeployment(context.Background(), wd)

	assert.Equal(t, "Failed", wd.Status.Phase)
	assert.NotNil(t, wd.Status.CompletedAt)
	assert.Len(t, wd.Status.History, 1)
	assert.Equal(t, "Failed", wd.Status.History[0].Phase)
	assert.Contains(t, wd.Status.History[0].Message, "No target clusters")
}

func TestReconcileDeployment_WorkloadNotFound(t *testing.T) {
	wd := &v1alpha1.WorkloadDeployment{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "WorkloadDeployment",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "wd-bad-ref", Namespace: "test-ns"},
		Spec: v1alpha1.WorkloadDeploymentSpec{
			WorkloadRef:    v1alpha1.ResourceReference{Name: "nonexistent-workload"},
			TargetClusters: []string{"cluster-a"},
		},
	}
	wdU, _ := wd.ToUnstructured()

	h, _ := setupReconcileEnv(t, wdU)

	h.reconcileDeployment(context.Background(), wd)

	assert.Equal(t, "Failed", wd.Status.Phase)
	assert.NotNil(t, wd.Status.CompletedAt)
	assert.Len(t, wd.Status.History, 1)
	assert.Contains(t, wd.Status.History[0].Message, "ManagedWorkload")
}

func TestReconcileDeployment_DeployFailsAllClusters(t *testing.T) {
	// When the source cluster is unreachable, DeployWorkload fails and all
	// target clusters should be marked Failed.
	mw := &v1alpha1.ManagedWorkload{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "ManagedWorkload",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "my-app", Namespace: "test-ns"},
		Spec: v1alpha1.ManagedWorkloadSpec{
			SourceCluster:   "nonexistent-source",
			SourceNamespace: "default",
			WorkloadRef: v1alpha1.WorkloadReference{
				Kind: "Deployment",
				Name: "nginx",
			},
		},
	}
	mwU, _ := mw.ToUnstructured()

	wd := &v1alpha1.WorkloadDeployment{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "WorkloadDeployment",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "wd-fail", Namespace: "test-ns"},
		Spec: v1alpha1.WorkloadDeploymentSpec{
			WorkloadRef:    v1alpha1.ResourceReference{Name: "my-app"},
			TargetClusters: []string{"target-a", "target-b"},
		},
		Status: v1alpha1.WorkloadDeploymentStatus{
			Phase: "Pending",
		},
	}
	wdU, _ := wd.ToUnstructured()

	h, _ := setupReconcileEnv(t, mwU, wdU)

	h.reconcileDeployment(context.Background(), wd)

	assert.Equal(t, "Failed", wd.Status.Phase)
	assert.NotNil(t, wd.Status.CompletedAt)
	// Should have per-cluster statuses
	assert.Len(t, wd.Status.ClusterStatuses, 2)
	for _, cs := range wd.Status.ClusterStatuses {
		assert.Equal(t, "Failed", cs.Phase)
	}
	assert.Equal(t, "0/2 clusters", wd.Status.Progress)
}

func TestSetTerminalStatus(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	now := metav1.Now()

	wd := &v1alpha1.WorkloadDeployment{
		ObjectMeta: metav1.ObjectMeta{Name: "wd1"},
		Status: v1alpha1.WorkloadDeploymentStatus{
			Phase:     "InProgress",
			StartedAt: &now,
		},
	}

	updateCalled := false
	updateFn := func(_ *v1alpha1.WorkloadDeployment) {
		updateCalled = true
	}

	h.setTerminalStatus(wd, "Succeeded", "All done", updateFn)

	assert.True(t, updateCalled)
	assert.Equal(t, "Succeeded", wd.Status.Phase)
	assert.NotNil(t, wd.Status.CompletedAt)
	assert.Len(t, wd.Status.History, 1)
	assert.Equal(t, 1, wd.Status.History[0].Revision)
	assert.Equal(t, "All done", wd.Status.History[0].Message)

	// Add another history entry — revision should increment
	h.setTerminalStatus(wd, "Failed", "Retry failed", updateFn)
	assert.Len(t, wd.Status.History, 2)
	assert.Equal(t, 2, wd.Status.History[1].Revision)
}
