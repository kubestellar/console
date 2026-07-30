package k8s

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestGetConfigMaps(t *testing.T) {
	now := time.Now()
	cm1 := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "app-config",
			Namespace:         "default",
			CreationTimestamp: metav1.NewTime(now.Add(-2 * time.Hour)),
			Labels:            map[string]string{"app": "test"},
		},
		Data:       map[string]string{"key1": "val1", "key2": "val2"},
		BinaryData: map[string][]byte{"bin1": []byte("data")},
	}
	cm2 := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "empty-config",
			Namespace:         "default",
			CreationTimestamp: metav1.NewTime(now.Add(-1 * time.Hour)),
		},
	}

	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["test-cluster"] = k8sfake.NewSimpleClientset(cm1, cm2)

	results, err := m.GetConfigMaps(context.Background(), "test-cluster", "default")
	if err != nil {
		t.Fatalf("GetConfigMaps failed: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("Expected 2 ConfigMaps, got %d", len(results))
	}

	// Find the app-config entry
	var appCfg *ConfigMap
	for i := range results {
		if results[i].Name == "app-config" {
			appCfg = &results[i]
			break
		}
	}
	if appCfg == nil {
		t.Fatal("Expected to find app-config in results")
	}
	if appCfg.Namespace != "default" {
		t.Errorf("Expected namespace 'default', got %q", appCfg.Namespace)
	}
	if appCfg.Cluster != "test-cluster" {
		t.Errorf("Expected cluster 'test-cluster', got %q", appCfg.Cluster)
	}
	// Data(2) + BinaryData(1) = 3
	if appCfg.DataCount != 3 {
		t.Errorf("Expected DataCount 3, got %d", appCfg.DataCount)
	}
	if appCfg.Labels["app"] != "test" {
		t.Errorf("Expected label app=test, got %v", appCfg.Labels)
	}
}

func TestGetConfigMaps_InvalidContext(t *testing.T) {
	m := &MultiClusterClient{
		noClusterMode: true,
		clients:       make(map[string]kubernetes.Interface),
	}

	_, err := m.GetConfigMaps(context.Background(), "nonexistent", "default")
	if err == nil {
		t.Fatal("Expected error for nonexistent context, got nil")
	}
}

func TestGetSecrets(t *testing.T) {
	now := time.Now()
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "db-creds",
			Namespace:         "production",
			CreationTimestamp: metav1.NewTime(now.Add(-24 * time.Hour)),
			Labels:            map[string]string{"env": "prod"},
			Annotations:       map[string]string{"managed-by": "vault"},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"username": []byte("admin"),
			"password": []byte("secret"),
		},
	}

	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["prod"] = k8sfake.NewSimpleClientset(secret)

	results, err := m.GetSecrets(context.Background(), "prod", "production")
	if err != nil {
		t.Fatalf("GetSecrets failed: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("Expected 1 Secret, got %d", len(results))
	}

	s := results[0]
	if s.Name != "db-creds" {
		t.Errorf("Expected name 'db-creds', got %q", s.Name)
	}
	if s.Type != "Opaque" {
		t.Errorf("Expected type 'Opaque', got %q", s.Type)
	}
	if s.DataCount != 2 {
		t.Errorf("Expected DataCount 2, got %d", s.DataCount)
	}
	if s.Cluster != "prod" {
		t.Errorf("Expected cluster 'prod', got %q", s.Cluster)
	}
	if s.Annotations["managed-by"] != "vault" {
		t.Errorf("Expected annotation managed-by=vault, got %v", s.Annotations)
	}
}

func TestGetSecrets_AllNamespaces(t *testing.T) {
	s1 := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "s1", Namespace: "ns1", CreationTimestamp: metav1.Now()},
		Type:       corev1.SecretTypeOpaque,
	}
	s2 := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "s2", Namespace: "ns2", CreationTimestamp: metav1.Now()},
		Type:       corev1.SecretTypeTLS,
	}

	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["cluster"] = k8sfake.NewSimpleClientset(s1, s2)

	// Empty namespace means all namespaces
	results, err := m.GetSecrets(context.Background(), "cluster", "")
	if err != nil {
		t.Fatalf("GetSecrets failed: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("Expected 2 Secrets across namespaces, got %d", len(results))
	}
}

func TestGetResourceQuotas(t *testing.T) {
	quota := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "compute-quota",
			Namespace:         "team-a",
			CreationTimestamp: metav1.Now(),
			Labels:            map[string]string{"team": "alpha"},
		},
		Status: corev1.ResourceQuotaStatus{
			Hard: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("4"),
				corev1.ResourceMemory: resource.MustParse("8Gi"),
			},
			Used: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("2"),
				corev1.ResourceMemory: resource.MustParse("4Gi"),
			},
		},
	}

	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["cluster1"] = k8sfake.NewSimpleClientset(quota)

	results, err := m.GetResourceQuotas(context.Background(), "cluster1", "team-a")
	if err != nil {
		t.Fatalf("GetResourceQuotas failed: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("Expected 1 ResourceQuota, got %d", len(results))
	}

	rq := results[0]
	if rq.Name != "compute-quota" {
		t.Errorf("Expected name 'compute-quota', got %q", rq.Name)
	}
	if rq.Hard["cpu"] != "4" {
		t.Errorf("Expected hard cpu=4, got %q", rq.Hard["cpu"])
	}
	if rq.Hard["memory"] != "8Gi" {
		t.Errorf("Expected hard memory=8Gi, got %q", rq.Hard["memory"])
	}
	if rq.Used["cpu"] != "2" {
		t.Errorf("Expected used cpu=2, got %q", rq.Used["cpu"])
	}
	if rq.Used["memory"] != "4Gi" {
		t.Errorf("Expected used memory=4Gi, got %q", rq.Used["memory"])
	}
	if rq.Labels["team"] != "alpha" {
		t.Errorf("Expected label team=alpha, got %v", rq.Labels)
	}
}

func TestGetLimitRanges(t *testing.T) {
	lr := &corev1.LimitRange{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "container-limits",
			Namespace:         "default",
			CreationTimestamp: metav1.Now(),
		},
		Spec: corev1.LimitRangeSpec{
			Limits: []corev1.LimitRangeItem{
				{
					Type: corev1.LimitTypeContainer,
					Default: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("500m"),
						corev1.ResourceMemory: resource.MustParse("256Mi"),
					},
					DefaultRequest: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("100m"),
						corev1.ResourceMemory: resource.MustParse("128Mi"),
					},
					Max: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("2"),
						corev1.ResourceMemory: resource.MustParse("1Gi"),
					},
					Min: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("50m"),
						corev1.ResourceMemory: resource.MustParse("64Mi"),
					},
				},
			},
		},
	}

	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["dev"] = k8sfake.NewSimpleClientset(lr)

	results, err := m.GetLimitRanges(context.Background(), "dev", "default")
	if err != nil {
		t.Fatalf("GetLimitRanges failed: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("Expected 1 LimitRange, got %d", len(results))
	}

	lrResult := results[0]
	if lrResult.Name != "container-limits" {
		t.Errorf("Expected name 'container-limits', got %q", lrResult.Name)
	}
	if len(lrResult.Limits) != 1 {
		t.Fatalf("Expected 1 limit item, got %d", len(lrResult.Limits))
	}

	item := lrResult.Limits[0]
	if item.Type != "Container" {
		t.Errorf("Expected type 'Container', got %q", item.Type)
	}
	if item.Default["cpu"] != "500m" {
		t.Errorf("Expected default cpu=500m, got %q", item.Default["cpu"])
	}
	if item.DefaultRequest["memory"] != "128Mi" {
		t.Errorf("Expected defaultRequest memory=128Mi, got %q", item.DefaultRequest["memory"])
	}
	if item.Max["cpu"] != "2" {
		t.Errorf("Expected max cpu=2, got %q", item.Max["cpu"])
	}
	if item.Min["memory"] != "64Mi" {
		t.Errorf("Expected min memory=64Mi, got %q", item.Min["memory"])
	}
}

func TestCreateOrUpdateResourceQuota_Create(t *testing.T) {
	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["cluster"] = k8sfake.NewSimpleClientset()

	spec := ResourceQuotaSpec{
		Name:      "new-quota",
		Namespace: "default",
		Hard: map[string]string{
			"cpu":    "8",
			"memory": "16Gi",
		},
		Labels:      map[string]string{"env": "test"},
		Annotations: map[string]string{"owner": "team-b"},
	}

	result, err := m.CreateOrUpdateResourceQuota(context.Background(), "cluster", spec)
	if err != nil {
		t.Fatalf("CreateOrUpdateResourceQuota (create) failed: %v", err)
	}

	if result.Name != "new-quota" {
		t.Errorf("Expected name 'new-quota', got %q", result.Name)
	}
	if result.Namespace != "default" {
		t.Errorf("Expected namespace 'default', got %q", result.Namespace)
	}
	if result.Hard["cpu"] != "8" {
		t.Errorf("Expected hard cpu=8, got %q", result.Hard["cpu"])
	}
	if result.Hard["memory"] != "16Gi" {
		t.Errorf("Expected hard memory=16Gi, got %q", result.Hard["memory"])
	}
	if result.Labels["env"] != "test" {
		t.Errorf("Expected label env=test, got %v", result.Labels)
	}
}

func TestCreateOrUpdateResourceQuota_Update(t *testing.T) {
	existing := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "existing-quota",
			Namespace:         "default",
			CreationTimestamp: metav1.Now(),
			Annotations:       map[string]string{"old-key": "old-val"},
		},
		Spec: corev1.ResourceQuotaSpec{
			Hard: corev1.ResourceList{
				corev1.ResourceCPU: resource.MustParse("4"),
			},
		},
	}

	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["cluster"] = k8sfake.NewSimpleClientset(existing)

	spec := ResourceQuotaSpec{
		Name:        "existing-quota",
		Namespace:   "default",
		Hard:        map[string]string{"cpu": "8", "memory": "32Gi"},
		Annotations: map[string]string{"new-key": "new-val"},
	}

	result, err := m.CreateOrUpdateResourceQuota(context.Background(), "cluster", spec)
	if err != nil {
		t.Fatalf("CreateOrUpdateResourceQuota (update) failed: %v", err)
	}

	if result.Name != "existing-quota" {
		t.Errorf("Expected name 'existing-quota', got %q", result.Name)
	}
	// Annotations should be merged
	if result.Annotations["old-key"] != "old-val" {
		t.Errorf("Expected old annotation preserved, got %v", result.Annotations)
	}
	if result.Annotations["new-key"] != "new-val" {
		t.Errorf("Expected new annotation added, got %v", result.Annotations)
	}
	// Verify the spec was actually updated in the API server.
	// Use Get + Spec.Hard directly because the fake client does not
	// auto-populate Status.Hard (a real controller would).
	client := m.clients["cluster"]
	updated, err := client.CoreV1().ResourceQuotas("default").Get(context.Background(), "existing-quota", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Get ResourceQuota after update failed: %v", err)
	}
	if cpu := updated.Spec.Hard[corev1.ResourceCPU]; cpu.String() != "8" {
		t.Errorf("Expected updated Spec.Hard cpu=8, got %q", cpu.String())
	}
	if mem := updated.Spec.Hard[corev1.ResourceMemory]; mem.String() != "32Gi" {
		t.Errorf("Expected updated Spec.Hard memory=32Gi, got %q", mem.String())
	}
}

func TestCreateOrUpdateResourceQuota_InvalidQuantity(t *testing.T) {
	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["cluster"] = k8sfake.NewSimpleClientset()

	spec := ResourceQuotaSpec{
		Name:      "bad-quota",
		Namespace: "default",
		Hard:      map[string]string{"cpu": "not-a-number"},
	}

	_, err := m.CreateOrUpdateResourceQuota(context.Background(), "cluster", spec)
	if err == nil {
		t.Fatal("Expected error for invalid quantity, got nil")
	}
}

func TestDeleteResourceQuota_Core(t *testing.T) {
	quota := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "to-delete",
			Namespace: "default",
		},
	}

	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["cluster"] = k8sfake.NewSimpleClientset(quota)

	err := m.DeleteResourceQuota(context.Background(), "cluster", "default", "to-delete")
	if err != nil {
		t.Fatalf("DeleteResourceQuota failed: %v", err)
	}

	// Verify it's gone
	quotas, err := m.GetResourceQuotas(context.Background(), "cluster", "default")
	if err != nil {
		t.Fatalf("GetResourceQuotas after delete failed: %v", err)
	}
	if len(quotas) != 0 {
		t.Errorf("Expected 0 quotas after delete, got %d", len(quotas))
	}
}

func TestDeleteResourceQuota_NotFound(t *testing.T) {
	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}
	m.clients["cluster"] = k8sfake.NewSimpleClientset()

	err := m.DeleteResourceQuota(context.Background(), "cluster", "default", "nonexistent")
	if err == nil {
		t.Fatal("Expected error for deleting nonexistent quota, got nil")
	}
}

func TestDeleteResourceQuota_InvalidContext(t *testing.T) {
	m := &MultiClusterClient{
		noClusterMode: true,
		clients:       make(map[string]kubernetes.Interface),
	}

	err := m.DeleteResourceQuota(context.Background(), "bad-context", "default", "quota")
	if err == nil {
		t.Fatal("Expected error for invalid context, got nil")
	}
}
