package k8s

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	authorizationv1 "k8s.io/api/authorization/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	clientgotesting "k8s.io/client-go/testing"
)

func TestUninstallGPUHealthCronJob(t *testing.T) {
	ctx := context.Background()
	ns := "nvidia-gpu-operator"

	t.Run("removes all resources", func(t *testing.T) {
		m := &MultiClusterClient{}

		// Pre-create all resources that Install would create
		sa := &corev1.ServiceAccount{
			ObjectMeta: metav1.ObjectMeta{Name: gpuHealthServiceAccount, Namespace: ns},
		}
		cj := &batchv1.CronJob{
			ObjectMeta: metav1.ObjectMeta{Name: gpuHealthCronJobName, Namespace: ns},
		}
		cm := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: gpuHealthConfigMapName, Namespace: ns},
		}

		fakeClient := fake.NewSimpleClientset(sa, cj, cm)
		m.InjectClient("test-cluster", fakeClient)

		err := m.UninstallGPUHealthCronJob(ctx, "test-cluster", ns)
		require.NoError(t, err)

		// Verify CronJob is deleted
		_, err = fakeClient.BatchV1().CronJobs(ns).Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
		assert.Error(t, err, "CronJob should be deleted")

		// Verify ConfigMap is deleted
		_, err = fakeClient.CoreV1().ConfigMaps(ns).Get(ctx, gpuHealthConfigMapName, metav1.GetOptions{})
		assert.Error(t, err, "ConfigMap should be deleted")

		// Verify ServiceAccount is deleted
		_, err = fakeClient.CoreV1().ServiceAccounts(ns).Get(ctx, gpuHealthServiceAccount, metav1.GetOptions{})
		assert.Error(t, err, "ServiceAccount should be deleted")
	})

	t.Run("uses default namespace when empty", func(t *testing.T) {
		m := &MultiClusterClient{}
		cj := &batchv1.CronJob{
			ObjectMeta: metav1.ObjectMeta{Name: gpuHealthCronJobName, Namespace: gpuHealthDefaultNS},
		}
		fakeClient := fake.NewSimpleClientset(cj)
		m.InjectClient("test-cluster", fakeClient)

		err := m.UninstallGPUHealthCronJob(ctx, "test-cluster", "")
		require.NoError(t, err)

		_, err = fakeClient.BatchV1().CronJobs(gpuHealthDefaultNS).Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
		assert.Error(t, err, "CronJob should be deleted from default namespace")
	})

	t.Run("succeeds when resources already absent", func(t *testing.T) {
		m := &MultiClusterClient{}
		fakeClient := fake.NewSimpleClientset()
		m.InjectClient("test-cluster", fakeClient)

		err := m.UninstallGPUHealthCronJob(ctx, "test-cluster", ns)
		assert.NoError(t, err, "should not error when resources don't exist")
	})

	t.Run("returns error for unknown cluster", func(t *testing.T) {
		m := &MultiClusterClient{}
		err := m.UninstallGPUHealthCronJob(ctx, "no-such-cluster", ns)
		assert.Error(t, err)
	})
}

func TestCanManageCronJobs(t *testing.T) {
	ctx := context.Background()

	t.Run("returns true when allowed", func(t *testing.T) {
		m := &MultiClusterClient{}
		fakeClient := fake.NewSimpleClientset()
		fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action clientgotesting.Action) (bool, k8sruntime.Object, error) {
			return true, &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{Allowed: true},
			}, nil
		})
		m.InjectClient("test-cluster", fakeClient)

		client, _ := m.GetClient("test-cluster")
		result := m.canManageCronJobs(ctx, client, "default")
		assert.True(t, result)
	})

	t.Run("returns false when denied", func(t *testing.T) {
		m := &MultiClusterClient{}
		fakeClient := fake.NewSimpleClientset()
		fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action clientgotesting.Action) (bool, k8sruntime.Object, error) {
			return true, &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{Allowed: false, Reason: "RBAC: access denied"},
			}, nil
		})
		m.InjectClient("test-cluster", fakeClient)

		client, _ := m.GetClient("test-cluster")
		result := m.canManageCronJobs(ctx, client, "default")
		assert.False(t, result)
	})

	t.Run("returns false on API error", func(t *testing.T) {
		m := &MultiClusterClient{}
		fakeClient := fake.NewSimpleClientset()
		fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action clientgotesting.Action) (bool, k8sruntime.Object, error) {
			return true, nil, assert.AnError
		})
		m.InjectClient("test-cluster", fakeClient)

		client, _ := m.GetClient("test-cluster")
		result := m.canManageCronJobs(ctx, client, "default")
		assert.False(t, result)
	})
}

func TestReadGPUHealthResults(t *testing.T) {
	ctx := context.Background()
	ns := "nvidia-gpu-operator"

	t.Run("parses valid results", func(t *testing.T) {
		results := map[string]interface{}{
			"nodes": []map[string]interface{}{
				{
					"nodeName": "gpu-node-1",
					"status":   "healthy",
					"checks": []map[string]interface{}{
						{"name": "node_ready", "passed": true, "message": "Node is Ready"},
					},
				},
				{
					"nodeName": "gpu-node-2",
					"status":   "degraded",
					"checks": []map[string]interface{}{
						{"name": "node_ready", "passed": false, "message": "Node is NotReady"},
					},
				},
			},
		}
		resultsJSON, _ := json.Marshal(results)
		cm := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: gpuHealthConfigMapName, Namespace: ns},
			Data:       map[string]string{"results": string(resultsJSON)},
		}
		fakeClient := fake.NewSimpleClientset(cm)

		got := readGPUHealthResults(ctx, fakeClient, ns)
		require.Len(t, got, 2)
		assert.Equal(t, "gpu-node-1", got[0].NodeName)
		assert.Equal(t, "gpu-node-2", got[1].NodeName)
	})

	t.Run("returns nil when ConfigMap missing", func(t *testing.T) {
		fakeClient := fake.NewSimpleClientset()
		got := readGPUHealthResults(ctx, fakeClient, ns)
		assert.Nil(t, got)
	})

	t.Run("returns nil when results key missing", func(t *testing.T) {
		cm := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: gpuHealthConfigMapName, Namespace: ns},
			Data:       map[string]string{"other-key": "value"},
		}
		fakeClient := fake.NewSimpleClientset(cm)
		got := readGPUHealthResults(ctx, fakeClient, ns)
		assert.Nil(t, got)
	})

	t.Run("returns nil for malformed JSON", func(t *testing.T) {
		cm := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: gpuHealthConfigMapName, Namespace: ns},
			Data:       map[string]string{"results": "not valid json {{{"},
		}
		fakeClient := fake.NewSimpleClientset(cm)
		got := readGPUHealthResults(ctx, fakeClient, ns)
		assert.Nil(t, got)
	})

	t.Run("returns empty slice for empty nodes array", func(t *testing.T) {
		cm := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: gpuHealthConfigMapName, Namespace: ns},
			Data:       map[string]string{"results": `{"nodes":[]}`},
		}
		fakeClient := fake.NewSimpleClientset(cm)
		got := readGPUHealthResults(ctx, fakeClient, ns)
		assert.Empty(t, got)
	})
}

func TestBuildGPUHealthCheckScript(t *testing.T) {
	t.Run("contains namespace reference", func(t *testing.T) {
		script := buildGPUHealthCheckScript("my-namespace")
		assert.Contains(t, script, "my-namespace")
	})

	t.Run("is a valid shell script", func(t *testing.T) {
		script := buildGPUHealthCheckScript("test-ns")
		assert.Contains(t, script, "#!/bin/sh")
		assert.Contains(t, script, "set -e")
	})

	t.Run("writes results to ConfigMap", func(t *testing.T) {
		script := buildGPUHealthCheckScript("gpu-ns")
		assert.Contains(t, script, "gpu-health-results")
		assert.Contains(t, script, "kubectl")
	})

	t.Run("handles special characters in namespace", func(t *testing.T) {
		// Namespace with dashes and numbers (valid k8s namespace)
		script := buildGPUHealthCheckScript("gpu-operator-123")
		assert.Contains(t, script, "gpu-operator-123")
	})

	t.Run("includes tiered check structure", func(t *testing.T) {
		script := buildGPUHealthCheckScript("test-ns")
		assert.Contains(t, script, "TIER")
		assert.Contains(t, script, "CHECK_TIER")
		// Tier 1 checks
		assert.Contains(t, script, "Node Ready")
		// Tier 2 checks
		assert.Contains(t, script, "TIER 2")
		// Tier 3 checks
		assert.Contains(t, script, "TIER 3")
		// Tier 4 checks
		assert.Contains(t, script, "TIER 4")
	})
}

func TestInstallGPUHealthCronJob_EdgeCases(t *testing.T) {
	ctx := context.Background()

	t.Run("invalid tier defaults to default tier", func(t *testing.T) {
		m := &MultiClusterClient{}
		fakeClient := fake.NewSimpleClientset()
		m.InjectClient("test-cluster", fakeClient)

		err := m.InstallGPUHealthCronJob(ctx, "test-cluster", "test-ns", "*/10 * * * *", 0)
		require.NoError(t, err)

		cj, err := fakeClient.BatchV1().CronJobs("test-ns").Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
		require.NoError(t, err)
		assert.Equal(t, "2", cj.Labels["kubestellar-console/tier"])
	})

	t.Run("tier above 4 defaults to default tier", func(t *testing.T) {
		m := &MultiClusterClient{}
		fakeClient := fake.NewSimpleClientset()
		m.InjectClient("test-cluster", fakeClient)

		err := m.InstallGPUHealthCronJob(ctx, "test-cluster", "test-ns", "*/10 * * * *", 5)
		require.NoError(t, err)

		cj, err := fakeClient.BatchV1().CronJobs("test-ns").Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
		require.NoError(t, err)
		assert.Equal(t, "2", cj.Labels["kubestellar-console/tier"])
	})

	t.Run("empty schedule uses default", func(t *testing.T) {
		m := &MultiClusterClient{}
		fakeClient := fake.NewSimpleClientset()
		m.InjectClient("test-cluster", fakeClient)

		err := m.InstallGPUHealthCronJob(ctx, "test-cluster", "test-ns", "", 2)
		require.NoError(t, err)

		cj, err := fakeClient.BatchV1().CronJobs("test-ns").Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
		require.NoError(t, err)
		assert.Equal(t, gpuHealthDefaultSchedule, cj.Spec.Schedule)
	})

	t.Run("empty namespace uses default", func(t *testing.T) {
		m := &MultiClusterClient{}
		fakeClient := fake.NewSimpleClientset()
		m.InjectClient("test-cluster", fakeClient)

		err := m.InstallGPUHealthCronJob(ctx, "test-cluster", "", "*/5 * * * *", 2)
		require.NoError(t, err)

		_, err = fakeClient.BatchV1().CronJobs(gpuHealthDefaultNS).Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
		assert.NoError(t, err)
	})

	t.Run("updates existing CronJob", func(t *testing.T) {
		m := &MultiClusterClient{}
		existingCJ := &batchv1.CronJob{
			ObjectMeta: metav1.ObjectMeta{
				Name:      gpuHealthCronJobName,
				Namespace: "test-ns",
				Labels:    map[string]string{"kubestellar-console/script-version": "1"},
			},
			Spec: batchv1.CronJobSpec{Schedule: "*/5 * * * *"},
		}
		fakeClient := fake.NewSimpleClientset(existingCJ)
		m.InjectClient("test-cluster", fakeClient)

		err := m.InstallGPUHealthCronJob(ctx, "test-cluster", "test-ns", "0 * * * *", 3)
		require.NoError(t, err)

		cj, err := fakeClient.BatchV1().CronJobs("test-ns").Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
		require.NoError(t, err)
		assert.Equal(t, "0 * * * *", cj.Spec.Schedule)
		assert.Equal(t, "3", cj.Labels["kubestellar-console/tier"])
	})

	t.Run("returns error for unknown cluster", func(t *testing.T) {
		m := &MultiClusterClient{}
		err := m.InstallGPUHealthCronJob(ctx, "no-such-cluster", "test-ns", "*/5 * * * *", 2)
		assert.Error(t, err)
	})
}
