package providers

import (
	"context"
	"testing"

	certificatesv1 "k8s.io/api/certificates/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	kubernetesfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	clienttesting "k8s.io/client-go/testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestCAPIExecuteScaleMachineDeployment_Int64IdempotencyAndConflict(t *testing.T) {
	t.Run("idempotent when current replicas are int64", func(t *testing.T) {
		dc := newFakeDynamicClient(t, newActionObject(
			schema.GroupVersionKind{Group: "cluster.x-k8s.io", Version: "v1beta1", Kind: "MachineDeployment"},
			"default",
			"md-workers",
			map[string]interface{}{"spec": map[string]interface{}{"replicas": int64(3)}},
		))
		stubDynamicClientFactory(t, dc)

		result, err := (&capiProvider{}).Execute(context.Background(), &rest.Config{}, federation.ActionRequest{
			ActionID: capiActionScaleMachineDeployment,
			Payload: map[string]interface{}{
				"name":      "md-workers",
				"namespace": "default",
				"replicas":  float64(3),
			},
		})
		require.NoError(t, err)
		assert.True(t, result.OK)
		assert.True(t, result.Already)
	})

	t.Run("conflict returns already true", func(t *testing.T) {
		dc := newFakeDynamicClient(t, newActionObject(
			schema.GroupVersionKind{Group: "cluster.x-k8s.io", Version: "v1beta1", Kind: "MachineDeployment"},
			"default",
			"md-workers",
			map[string]interface{}{"spec": map[string]interface{}{"replicas": int64(2)}},
		))
		dc.PrependReactor("patch", "machinedeployments", func(clienttesting.Action) (bool, runtime.Object, error) {
			return true, nil, errFromString("the object has been modified")
		})
		stubDynamicClientFactory(t, dc)

		result, err := (&capiProvider{}).Execute(context.Background(), &rest.Config{}, federation.ActionRequest{
			ActionID: capiActionScaleMachineDeployment,
			Payload: map[string]interface{}{
				"name":      "md-workers",
				"namespace": "default",
				"replicas":  float64(5),
			},
		})
		require.NoError(t, err)
		assert.True(t, result.OK)
		assert.True(t, result.Already)
	})
}

func TestClusternetExecuteActions_WithFakeDynamicClient(t *testing.T) {
	dc := newFakeDynamicClient(t, newActionObject(
		schema.GroupVersionKind{Group: "clusters.clusternet.io", Version: "v1beta1", Kind: "ManagedCluster"},
		"",
		"edge-1",
		map[string]interface{}{"spec": map[string]interface{}{"approved": false}},
	))
	stubDynamicClientFactory(t, dc)

	result, err := (&clusternetProvider{}).Execute(context.Background(), &rest.Config{}, federation.ActionRequest{
		ActionID:    clusternetActionApproveCluster,
		ClusterName: "edge-1",
	})
	require.NoError(t, err)
	assert.True(t, result.OK)
	assert.False(t, result.Already)

	updated, err := dc.Resource(clusternetManagedClusterGVR).Get(context.Background(), "edge-1", metav1.GetOptions{})
	require.NoError(t, err)
	approved, _, err := unstructured.NestedBool(updated.Object, "spec", "approved")
	require.NoError(t, err)
	assert.True(t, approved)
}

func TestKarmadaExecuteJoinCluster_ConflictRecovery(t *testing.T) {
	dc := newFakeDynamicClient(t)
	dc.PrependReactor("create", "clusters", func(clienttesting.Action) (bool, runtime.Object, error) {
		return true, nil, errFromString("the object has been modified")
	})
	stubDynamicClientFactory(t, dc)

	result, err := (&karmadaProvider{}).Execute(context.Background(), &rest.Config{}, federation.ActionRequest{
		ActionID:    karmadaActionJoinCluster,
		ClusterName: "member-1",
		Payload: map[string]interface{}{
			"apiEndpoint": "https://member-1:6443",
		},
	})
	require.NoError(t, err)
	assert.True(t, result.OK)
	assert.True(t, result.Already)
}

func TestOCMExecuteActions_WithFakeClients(t *testing.T) {
	t.Run("approve csr success", func(t *testing.T) {
		cs := kubernetesfake.NewSimpleClientset(&certificatesv1.CertificateSigningRequest{
			ObjectMeta: metav1.ObjectMeta{Name: "csr-1"},
			Status: certificatesv1.CertificateSigningRequestStatus{
				Conditions: []certificatesv1.CertificateSigningRequestCondition{},
			},
		})
		stubKubernetesClientFactory(t, cs)

		result, err := (&ocmProvider{}).Execute(context.Background(), &rest.Config{}, federation.ActionRequest{
			ActionID: ocmActionApproveCSR,
			Payload: map[string]interface{}{
				"csrName": "csr-1",
			},
		})
		require.NoError(t, err)
		assert.True(t, result.OK)
		assert.False(t, result.Already)

		updated, err := cs.CertificatesV1().CertificateSigningRequests().Get(context.Background(), "csr-1", metav1.GetOptions{})
		require.NoError(t, err)
		require.Len(t, updated.Status.Conditions, 1)
		assert.Equal(t, certificatesv1.CertificateApproved, updated.Status.Conditions[0].Type)
		assert.Equal(t, corev1.ConditionTrue, updated.Status.Conditions[0].Status)
	})

	t.Run("accept cluster conflict returns already", func(t *testing.T) {
		dc := newFakeDynamicClient(t, newActionObject(
			schema.GroupVersionKind{Group: "cluster.open-cluster-management.io", Version: "v1", Kind: "ManagedCluster"},
			"",
			"spoke-1",
			map[string]interface{}{"spec": map[string]interface{}{"hubAcceptsClient": false}},
		))
		dc.PrependReactor("patch", "managedclusters", func(clienttesting.Action) (bool, runtime.Object, error) {
			return true, nil, errFromString("the object has been modified")
		})
		stubDynamicClientFactory(t, dc)

		result, err := (&ocmProvider{}).Execute(context.Background(), &rest.Config{}, federation.ActionRequest{
			ActionID:    ocmActionAcceptCluster,
			ClusterName: "spoke-1",
		})
		require.NoError(t, err)
		assert.True(t, result.OK)
		assert.True(t, result.Already)
	})
}

func TestKubeAdmiralAndLiqoExecute_NotFoundHandling(t *testing.T) {
	t.Run("kubeadmiral unfederate already removed", func(t *testing.T) {
		dc := newFakeDynamicClient(t)
		stubDynamicClientFactory(t, dc)

		result, err := (&kubeAdmiralProvider{}).Execute(context.Background(), &rest.Config{}, federation.ActionRequest{
			ActionID:    kubeAdmiralActionUnfederateCluster,
			ClusterName: "member-1",
		})
		require.NoError(t, err)
		assert.True(t, result.OK)
		assert.True(t, result.Already)
	})

	t.Run("liqo unpeer already removed", func(t *testing.T) {
		dc := newFakeDynamicClient(t)
		stubDynamicClientFactory(t, dc)

		result, err := (&liqoProvider{}).Execute(context.Background(), &rest.Config{}, federation.ActionRequest{
			ActionID:    liqoActionUnpeerWith,
			ClusterName: "member-1",
		})
		require.NoError(t, err)
		assert.True(t, result.OK)
		assert.True(t, result.Already)
	})
}

func newFakeDynamicClient(t *testing.T, objects ...runtime.Object) *dynamicfake.FakeDynamicClient {
	t.Helper()
	return dynamicfake.NewSimpleDynamicClient(runtime.NewScheme(), objects...)
}

func newActionObject(gvk schema.GroupVersionKind, namespace, name string, fields map[string]interface{}) *unstructured.Unstructured {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": gvk.GroupVersion().String(),
			"kind":       gvk.Kind,
			"metadata": map[string]interface{}{
				"name": name,
			},
		},
	}
	if namespace != "" {
		obj.Object["metadata"].(map[string]interface{})["namespace"] = namespace
	}
	for k, v := range fields {
		obj.Object[k] = v
	}
	obj.SetGroupVersionKind(gvk)
	return obj
}

func stubDynamicClientFactory(t *testing.T, dc dynamic.Interface) {
	t.Helper()
	previous := newDynamicClientForConfig
	newDynamicClientForConfig = func(*rest.Config) (dynamic.Interface, error) {
		return dc, nil
	}
	t.Cleanup(func() {
		newDynamicClientForConfig = previous
	})
}

func stubKubernetesClientFactory(t *testing.T, cs kubernetes.Interface) {
	t.Helper()
	previous := newKubernetesClientForConfig
	newKubernetesClientForConfig = func(*rest.Config) (kubernetes.Interface, error) {
		return cs, nil
	}
	t.Cleanup(func() {
		newKubernetesClientForConfig = previous
	})
}
