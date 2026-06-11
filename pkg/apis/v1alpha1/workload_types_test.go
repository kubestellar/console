package v1alpha1

import (
	"encoding/json"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestWorkloadGVR(t *testing.T) {
	tests := []struct {
		name     string
		gvr      schema.GroupVersionResource
		expGroup string
		expVer   string
		expRes   string
	}{
		{
			name:     "WorkloadGVR",
			gvr:      WorkloadGVR,
			expGroup: "kubestellar.io",
			expVer:   "v1alpha1",
			expRes:   "workloads",
		},
		{
			name:     "BindingPolicyGVR",
			gvr:      BindingPolicyGVR,
			expGroup: "control.kubestellar.io",
			expVer:   "v1alpha1",
			expRes:   "bindingpolicies",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.gvr.Group != tc.expGroup {
				t.Errorf("Group = %q, want %q", tc.gvr.Group, tc.expGroup)
			}
			if tc.gvr.Version != tc.expVer {
				t.Errorf("Version = %q, want %q", tc.gvr.Version, tc.expVer)
			}
			if tc.gvr.Resource != tc.expRes {
				t.Errorf("Resource = %q, want %q", tc.gvr.Resource, tc.expRes)
			}
		})
	}
}

func TestWorkloadStatusConstants(t *testing.T) {
	tests := []struct {
		name   string
		status WorkloadStatus
		want   string
	}{
		{"Pending", WorkloadStatusPending, "Pending"},
		{"Deploying", WorkloadStatusDeploying, "Deploying"},
		{"Running", WorkloadStatusRunning, "Running"},
		{"Degraded", WorkloadStatusDegraded, "Degraded"},
		{"Failed", WorkloadStatusFailed, "Failed"},
		{"Unknown", WorkloadStatusUnknown, "Unknown"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if string(tc.status) != tc.want {
				t.Errorf("status = %q, want %q", tc.status, tc.want)
			}
		})
	}
}

func TestWorkloadTypeConstants(t *testing.T) {
	tests := []struct {
		name string
		typ  WorkloadType
		want string
	}{
		{"Deployment", WorkloadTypeDeployment, "Deployment"},
		{"StatefulSet", WorkloadTypeStatefulSet, "StatefulSet"},
		{"DaemonSet", WorkloadTypeDaemonSet, "DaemonSet"},
		{"Job", WorkloadTypeJob, "Job"},
		{"CronJob", WorkloadTypeCronJob, "CronJob"},
		{"Custom", WorkloadTypeCustom, "Custom"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if string(tc.typ) != tc.want {
				t.Errorf("type = %q, want %q", tc.typ, tc.want)
			}
		})
	}
}

func TestWorkloadJSONRoundTrip(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	original := Workload{
		Name:            "test-workload",
		Namespace:       "default",
		Type:            WorkloadTypeDeployment,
		Status:          WorkloadStatusRunning,
		Replicas:        3,
		ReadyReplicas:   3,
		UpdatedReplicas: 3,
		Image:           "nginx:1.19",
		Labels: map[string]string{
			"app": "test",
		},
		TargetClusters: []string{"cluster-1", "cluster-2"},
		Deployments: []ClusterDeployment{
			{
				Cluster:       "cluster-1",
				Status:        WorkloadStatusRunning,
				Replicas:      3,
				ReadyReplicas: 3,
				Message:       "deployment is healthy",
				LastUpdated:   now,
			},
		},
		Reason:    "",
		Message:   "All replicas ready",
		CreatedAt: now,
		UpdatedAt: now,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded Workload
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.Namespace != original.Namespace {
		t.Errorf("Namespace = %q, want %q", decoded.Namespace, original.Namespace)
	}
	if decoded.Type != original.Type {
		t.Errorf("Type = %q, want %q", decoded.Type, original.Type)
	}
	if decoded.Status != original.Status {
		t.Errorf("Status = %q, want %q", decoded.Status, original.Status)
	}
	if decoded.Replicas != original.Replicas {
		t.Errorf("Replicas = %d, want %d", decoded.Replicas, original.Replicas)
	}
	if len(decoded.TargetClusters) != len(original.TargetClusters) {
		t.Errorf("TargetClusters length = %d, want %d", len(decoded.TargetClusters), len(original.TargetClusters))
	}
}

func TestClusterDeploymentJSONRoundTrip(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	original := ClusterDeployment{
		Cluster:       "test-cluster",
		Status:        WorkloadStatusRunning,
		Replicas:      5,
		ReadyReplicas: 5,
		Message:       "healthy",
		LastUpdated:   now,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ClusterDeployment
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Cluster != original.Cluster {
		t.Errorf("Cluster = %q, want %q", decoded.Cluster, original.Cluster)
	}
	if decoded.Status != original.Status {
		t.Errorf("Status = %q, want %q", decoded.Status, original.Status)
	}
	if decoded.Replicas != original.Replicas {
		t.Errorf("Replicas = %d, want %d", decoded.Replicas, original.Replicas)
	}
}

func TestWorkloadClusterErrorJSONRoundTrip(t *testing.T) {
	original := WorkloadClusterError{
		Cluster:   "cluster-1",
		ErrorType: "ApiError",
		Message:   "connection refused",
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded WorkloadClusterError
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Cluster != original.Cluster {
		t.Errorf("Cluster = %q, want %q", decoded.Cluster, original.Cluster)
	}
	if decoded.ErrorType != original.ErrorType {
		t.Errorf("ErrorType = %q, want %q", decoded.ErrorType, original.ErrorType)
	}
	if decoded.Message != original.Message {
		t.Errorf("Message = %q, want %q", decoded.Message, original.Message)
	}
}

func TestWorkloadListJSONRoundTrip(t *testing.T) {
	original := WorkloadList{
		Items: []Workload{
			{Name: "workload-1", Namespace: "default", Type: WorkloadTypeDeployment, Status: WorkloadStatusRunning},
			{Name: "workload-2", Namespace: "kube-system", Type: WorkloadTypeStatefulSet, Status: WorkloadStatusDegraded},
		},
		TotalCount: 2,
		ClusterErrors: []WorkloadClusterError{
			{Cluster: "failed-cluster", ErrorType: "Timeout", Message: "timed out"},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded WorkloadList
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.TotalCount != original.TotalCount {
		t.Errorf("TotalCount = %d, want %d", decoded.TotalCount, original.TotalCount)
	}
	if len(decoded.Items) != len(original.Items) {
		t.Errorf("Items length = %d, want %d", len(decoded.Items), len(original.Items))
	}
	if len(decoded.ClusterErrors) != len(original.ClusterErrors) {
		t.Errorf("ClusterErrors length = %d, want %d", len(decoded.ClusterErrors), len(original.ClusterErrors))
	}
}

func TestBindingPolicyJSONRoundTrip(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	original := BindingPolicy{
		Name:      "test-policy",
		Namespace: "default",
		ClusterSelector: map[string]string{
			"env": "prod",
		},
		WorkloadRef: WorkloadRef{
			Kind:      "Deployment",
			Name:      "nginx",
			Namespace: "default",
		},
		Status:        "Bound",
		BoundClusters: []string{"cluster-1", "cluster-2"},
		CreatedAt:     now,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded BindingPolicy
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.WorkloadRef.Kind != original.WorkloadRef.Kind {
		t.Errorf("WorkloadRef.Kind = %q, want %q", decoded.WorkloadRef.Kind, original.WorkloadRef.Kind)
	}
	if len(decoded.BoundClusters) != len(original.BoundClusters) {
		t.Errorf("BoundClusters length = %d, want %d", len(decoded.BoundClusters), len(original.BoundClusters))
	}
}

func TestDeployRequestJSONRoundTrip(t *testing.T) {
	original := DeployRequest{
		WorkloadName:   "nginx-deployment",
		Namespace:      "default",
		TargetClusters: []string{"cluster-1", "cluster-2"},
		Replicas:       5,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded DeployRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.WorkloadName != original.WorkloadName {
		t.Errorf("WorkloadName = %q, want %q", decoded.WorkloadName, original.WorkloadName)
	}
	if decoded.Replicas != original.Replicas {
		t.Errorf("Replicas = %d, want %d", decoded.Replicas, original.Replicas)
	}
}

func TestDeployResponseJSONRoundTrip(t *testing.T) {
	original := DeployResponse{
		Success:        true,
		Message:        "Deployed successfully",
		DeployedTo:     []string{"cluster-1", "cluster-2"},
		FailedClusters: []string{},
		Dependencies: []DeployedDep{
			{Kind: "ConfigMap", Name: "app-config", Action: "created", Error: ""},
			{Kind: "Secret", Name: "app-secret", Action: "updated", Error: ""},
		},
		Warnings: []string{"deprecated API version"},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded DeployResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Success != original.Success {
		t.Errorf("Success = %v, want %v", decoded.Success, original.Success)
	}
	if len(decoded.Dependencies) != len(original.Dependencies) {
		t.Errorf("Dependencies length = %d, want %d", len(decoded.Dependencies), len(original.Dependencies))
	}
}

func TestClusterCapabilityJSONRoundTrip(t *testing.T) {
	original := ClusterCapability{
		Cluster: "gpu-cluster",
		Labels: map[string]string{
			"tier": "gpu",
		},
		GPUCount:    4,
		GPUType:     "NVIDIA-A100",
		CPUCapacity: "32",
		MemCapacity: "128Gi",
		NodeCount:   3,
		Available:   true,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ClusterCapability
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Cluster != original.Cluster {
		t.Errorf("Cluster = %q, want %q", decoded.Cluster, original.Cluster)
	}
	if decoded.GPUCount != original.GPUCount {
		t.Errorf("GPUCount = %d, want %d", decoded.GPUCount, original.GPUCount)
	}
	if decoded.Available != original.Available {
		t.Errorf("Available = %v, want %v", decoded.Available, original.Available)
	}
}

func TestWorkloadZeroValues(t *testing.T) {
	var w Workload
	if w.Name != "" {
		t.Errorf("zero Workload.Name = %q, want empty string", w.Name)
	}
	if w.Replicas != 0 {
		t.Errorf("zero Workload.Replicas = %d, want 0", w.Replicas)
	}
	if w.Labels != nil {
		t.Errorf("zero Workload.Labels = %v, want nil", w.Labels)
	}
}
