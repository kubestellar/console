package k8s

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestEnsureNamespaceExists_AlreadyExists(t *testing.T) {
	existing := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: "kube-system"},
	}
	clientset := k8sfake.NewSimpleClientset(existing)

	m, _ := NewMultiClusterClient("")
	m.SetClient("test-cluster", clientset)

	err := m.EnsureNamespaceExists(context.Background(), "test-cluster", "kube-system")
	require.NoError(t, err)

	// Verify namespace still exists unchanged
	ns, getErr := clientset.CoreV1().Namespaces().Get(context.Background(), "kube-system", metav1.GetOptions{})
	require.NoError(t, getErr)
	assert.Equal(t, "kube-system", ns.Name)
}

func TestEnsureNamespaceExists_CreatesNew(t *testing.T) {
	clientset := k8sfake.NewSimpleClientset()

	m, _ := NewMultiClusterClient("")
	m.SetClient("test-cluster", clientset)

	err := m.EnsureNamespaceExists(context.Background(), "test-cluster", "my-namespace")
	require.NoError(t, err)

	// Verify namespace was created with correct labels
	ns, getErr := clientset.CoreV1().Namespaces().Get(context.Background(), "my-namespace", metav1.GetOptions{})
	require.NoError(t, getErr)
	assert.Equal(t, "my-namespace", ns.Name)
	assert.Equal(t, "kubestellar-console", ns.Labels["kubestellar.io/managed-by"])
}

func TestEnsureNamespaceExists_UnknownCluster(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	err := m.EnsureNamespaceExists(context.Background(), "nonexistent-cluster", "test-ns")
	require.Error(t, err)
}

func TestEnsureNamespaceExists_RaceCondition_AlreadyExistsOnCreate(t *testing.T) {
	// Simulate the race condition: namespace doesn't exist on Get,
	// but another process creates it before our Create call.
	// The fake clientset doesn't naturally simulate this, but we can
	// test the path by pre-creating the namespace and verifying
	// the AlreadyExists handling works correctly.
	existing := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: "race-ns"},
	}
	clientset := k8sfake.NewSimpleClientset(existing)

	m, _ := NewMultiClusterClient("")
	m.SetClient("test-cluster", clientset)

	// This exercises the "already exists" return-nil path on Get
	err := m.EnsureNamespaceExists(context.Background(), "test-cluster", "race-ns")
	require.NoError(t, err)
}

func TestEnsureNamespaceExists_MultipleNamespaces(t *testing.T) {
	clientset := k8sfake.NewSimpleClientset()

	m, _ := NewMultiClusterClient("")
	m.SetClient("test-cluster", clientset)

	namespaces := []string{"ns-alpha", "ns-beta", "ns-gamma"}
	for _, ns := range namespaces {
		err := m.EnsureNamespaceExists(context.Background(), "test-cluster", ns)
		require.NoError(t, err, "failed to create namespace %s", ns)
	}

	// Verify all created
	for _, ns := range namespaces {
		got, err := clientset.CoreV1().Namespaces().Get(context.Background(), ns, metav1.GetOptions{})
		require.NoError(t, err)
		assert.Equal(t, ns, got.Name)
		assert.Equal(t, "kubestellar-console", got.Labels["kubestellar.io/managed-by"])
	}
}

func TestEnsureNamespaceExists_Idempotent(t *testing.T) {
	clientset := k8sfake.NewSimpleClientset()

	m, _ := NewMultiClusterClient("")
	m.SetClient("test-cluster", clientset)

	// Create twice - second call should succeed without error
	err := m.EnsureNamespaceExists(context.Background(), "test-cluster", "idempotent-ns")
	require.NoError(t, err)

	err = m.EnsureNamespaceExists(context.Background(), "test-cluster", "idempotent-ns")
	require.NoError(t, err)
}
