package v1alpha1

import (
	"encoding/json"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestConsoleGroupVersion(t *testing.T) {
	if Group != "console.kubestellar.io" {
		t.Errorf("Group = %q, want %q", Group, "console.kubestellar.io")
	}
	if Version != "v1alpha1" {
		t.Errorf("Version = %q, want %q", Version, "v1alpha1")
	}

	gv := GroupVersion
	if gv.Group != Group {
		t.Errorf("GroupVersion.Group = %q, want %q", gv.Group, Group)
	}
	if gv.Version != Version {
		t.Errorf("GroupVersion.Version = %q, want %q", gv.Version, Version)
	}
}

func TestConsoleGVRs(t *testing.T) {
	tests := []struct {
		name     string
		gvr      schema.GroupVersionResource
		expGroup string
		expVer   string
		expRes   string
	}{
		{
			name:     "ManagedWorkloadGVR",
			gvr:      ManagedWorkloadGVR,
			expGroup: "console.kubestellar.io",
			expVer:   "v1alpha1",
			expRes:   "managedworkloads",
		},
		{
			name:     "ClusterGroupGVR",
			gvr:      ClusterGroupGVR,
			expGroup: "console.kubestellar.io",
			expVer:   "v1alpha1",
			expRes:   "clustergroups",
		},
		{
			name:     "WorkloadDeploymentGVR",
			gvr:      WorkloadDeploymentGVR,
			expGroup: "console.kubestellar.io",
			expVer:   "v1alpha1",
			expRes:   "workloaddeployments",
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

func TestManagedWorkloadToUnstructured(t *testing.T) {
	mw := &ManagedWorkload{
		TypeMeta: metav1.TypeMeta{
			Kind:       "ManagedWorkload",
			APIVersion: "console.kubestellar.io/v1alpha1",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-workload",
			Namespace: "default",
		},
		Spec: ManagedWorkloadSpec{
			SourceCluster:   "source-cluster",
			SourceNamespace: "default",
			WorkloadRef: WorkloadReference{
				APIVersion: "apps/v1",
				Kind:       "Deployment",
				Name:       "nginx",
			},
			TargetClusters: []string{"cluster-1", "cluster-2"},
			Replicas:       ptrInt32(3),
		},
	}

	u, err := mw.ToUnstructured()
	if err != nil {
		t.Fatalf("ToUnstructured failed: %v", err)
	}

	if u.GetAPIVersion() != GroupVersion.String() {
		t.Errorf("APIVersion = %q, want %q", u.GetAPIVersion(), GroupVersion.String())
	}
	if u.GetKind() != "ManagedWorkload" {
		t.Errorf("Kind = %q, want %q", u.GetKind(), "ManagedWorkload")
	}
	if u.GetName() != "test-workload" {
		t.Errorf("Name = %q, want %q", u.GetName(), "test-workload")
	}
	if u.GetNamespace() != "default" {
		t.Errorf("Namespace = %q, want %q", u.GetNamespace(), "default")
	}
}

func TestManagedWorkloadFromUnstructured(t *testing.T) {
	mw := &ManagedWorkload{
		TypeMeta: metav1.TypeMeta{
			Kind:       "ManagedWorkload",
			APIVersion: "console.kubestellar.io/v1alpha1",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-workload",
			Namespace: "default",
		},
		Spec: ManagedWorkloadSpec{
			SourceCluster:   "source-cluster",
			SourceNamespace: "default",
			WorkloadRef: WorkloadReference{
				APIVersion: "apps/v1",
				Kind:       "Deployment",
				Name:       "nginx",
			},
		},
	}

	u, err := mw.ToUnstructured()
	if err != nil {
		t.Fatalf("ToUnstructured failed: %v", err)
	}

	decoded, err := ManagedWorkloadFromUnstructured(u)
	if err != nil {
		t.Fatalf("FromUnstructured failed: %v", err)
	}

	if decoded.Name != mw.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, mw.Name)
	}
	if decoded.Spec.SourceCluster != mw.Spec.SourceCluster {
		t.Errorf("Spec.SourceCluster = %q, want %q", decoded.Spec.SourceCluster, mw.Spec.SourceCluster)
	}
	if decoded.Spec.WorkloadRef.Kind != mw.Spec.WorkloadRef.Kind {
		t.Errorf("Spec.WorkloadRef.Kind = %q, want %q", decoded.Spec.WorkloadRef.Kind, mw.Spec.WorkloadRef.Kind)
	}
}

func TestClusterGroupToUnstructured(t *testing.T) {
	cg := &ClusterGroup{
		TypeMeta: metav1.TypeMeta{
			Kind:       "ClusterGroup",
			APIVersion: "console.kubestellar.io/v1alpha1",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "prod-clusters",
			Namespace: "default",
		},
		Spec: ClusterGroupSpec{
			Description:   "Production clusters",
			Color:         "#22c55e",
			Icon:          "server",
			StaticMembers: []string{"cluster-1", "cluster-2"},
			Priority:      10,
		},
	}

	u, err := cg.ToUnstructured()
	if err != nil {
		t.Fatalf("ToUnstructured failed: %v", err)
	}

	if u.GetAPIVersion() != GroupVersion.String() {
		t.Errorf("APIVersion = %q, want %q", u.GetAPIVersion(), GroupVersion.String())
	}
	if u.GetKind() != "ClusterGroup" {
		t.Errorf("Kind = %q, want %q", u.GetKind(), "ClusterGroup")
	}
	if u.GetName() != "prod-clusters" {
		t.Errorf("Name = %q, want %q", u.GetName(), "prod-clusters")
	}
}

func TestClusterGroupFromUnstructured(t *testing.T) {
	cg := &ClusterGroup{
		TypeMeta: metav1.TypeMeta{
			Kind:       "ClusterGroup",
			APIVersion: "console.kubestellar.io/v1alpha1",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-group",
		},
		Spec: ClusterGroupSpec{
			Description: "Test group",
			Priority:    5,
		},
	}

	u, err := cg.ToUnstructured()
	if err != nil {
		t.Fatalf("ToUnstructured failed: %v", err)
	}

	decoded, err := ClusterGroupFromUnstructured(u)
	if err != nil {
		t.Fatalf("FromUnstructured failed: %v", err)
	}

	if decoded.Name != cg.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, cg.Name)
	}
	if decoded.Spec.Description != cg.Spec.Description {
		t.Errorf("Spec.Description = %q, want %q", decoded.Spec.Description, cg.Spec.Description)
	}
}

func TestWorkloadDeploymentToUnstructured(t *testing.T) {
	wd := &WorkloadDeployment{
		TypeMeta: metav1.TypeMeta{
			Kind:       "WorkloadDeployment",
			APIVersion: "console.kubestellar.io/v1alpha1",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-deployment",
			Namespace: "default",
		},
		Spec: WorkloadDeploymentSpec{
			WorkloadRef: ResourceReference{
				Name:      "nginx-workload",
				Namespace: "default",
			},
			TargetClusters: []string{"cluster-1"},
			Strategy:       "RollingUpdate",
			DryRun:         false,
		},
	}

	u, err := wd.ToUnstructured()
	if err != nil {
		t.Fatalf("ToUnstructured failed: %v", err)
	}

	if u.GetAPIVersion() != GroupVersion.String() {
		t.Errorf("APIVersion = %q, want %q", u.GetAPIVersion(), GroupVersion.String())
	}
	if u.GetKind() != "WorkloadDeployment" {
		t.Errorf("Kind = %q, want %q", u.GetKind(), "WorkloadDeployment")
	}
	if u.GetName() != "test-deployment" {
		t.Errorf("Name = %q, want %q", u.GetName(), "test-deployment")
	}
}

func TestWorkloadDeploymentFromUnstructured(t *testing.T) {
	wd := &WorkloadDeployment{
		TypeMeta: metav1.TypeMeta{
			Kind:       "WorkloadDeployment",
			APIVersion: "console.kubestellar.io/v1alpha1",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-deployment",
		},
		Spec: WorkloadDeploymentSpec{
			Strategy: "Canary",
		},
	}

	u, err := wd.ToUnstructured()
	if err != nil {
		t.Fatalf("ToUnstructured failed: %v", err)
	}

	decoded, err := WorkloadDeploymentFromUnstructured(u)
	if err != nil {
		t.Fatalf("FromUnstructured failed: %v", err)
	}

	if decoded.Name != wd.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, wd.Name)
	}
	if decoded.Spec.Strategy != wd.Spec.Strategy {
		t.Errorf("Spec.Strategy = %q, want %q", decoded.Spec.Strategy, wd.Spec.Strategy)
	}
}

func TestManagedWorkloadJSONRoundTrip(t *testing.T) {
	original := ManagedWorkload{
		TypeMeta: metav1.TypeMeta{
			Kind:       "ManagedWorkload",
			APIVersion: "console.kubestellar.io/v1alpha1",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test",
			Namespace: "default",
		},
		Spec: ManagedWorkloadSpec{
			SourceCluster: "source",
			WorkloadRef: WorkloadReference{
				Kind: "Deployment",
				Name: "app",
			},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ManagedWorkload
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.Spec.SourceCluster != original.Spec.SourceCluster {
		t.Errorf("Spec.SourceCluster = %q, want %q", decoded.Spec.SourceCluster, original.Spec.SourceCluster)
	}
}

func TestClusterGroupJSONRoundTrip(t *testing.T) {
	original := ClusterGroup{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-group",
		},
		Spec: ClusterGroupSpec{
			Description:   "Test",
			Color:         "#ffffff",
			StaticMembers: []string{"c1", "c2"},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ClusterGroup
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.Spec.Color != original.Spec.Color {
		t.Errorf("Spec.Color = %q, want %q", decoded.Spec.Color, original.Spec.Color)
	}
}

func TestWorkloadDeploymentJSONRoundTrip(t *testing.T) {
	original := WorkloadDeployment{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-deploy",
		},
		Spec: WorkloadDeploymentSpec{
			Strategy: "RollingUpdate",
			DryRun:   true,
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded WorkloadDeployment
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.Spec.DryRun != original.Spec.DryRun {
		t.Errorf("Spec.DryRun = %v, want %v", decoded.Spec.DryRun, original.Spec.DryRun)
	}
}

func ptrInt32(i int32) *int32 {
	return &i
}
