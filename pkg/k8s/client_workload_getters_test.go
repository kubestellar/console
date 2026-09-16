package k8s

import (
	"context"
	"testing"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestGetNodes(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "node1",
			Labels: map[string]string{
				"node-role.kubernetes.io/control-plane": "",
				"topology.kubernetes.io/region":         "us-east-1",
			},
		},
		Status: corev1.NodeStatus{
			NodeInfo: corev1.NodeSystemInfo{
				KubeletVersion: "v1.28.0",
				Architecture:   "amd64",
			},
			Addresses: []corev1.NodeAddress{
				{Type: corev1.NodeInternalIP, Address: "10.0.0.1"},
			},
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU:              resource.MustParse("4"),
				corev1.ResourceEphemeralStorage: resource.MustParse("1007Gi"),
			},
			Allocatable: corev1.ResourceList{
				corev1.ResourceEphemeralStorage: resource.MustParse("80Gi"),
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(node)
	m.clients["c1"] = fakeCS

	nodes, err := m.GetNodes(context.Background(), "c1")
	if err != nil {
		t.Fatalf("GetNodes failed: %v", err)
	}

	if len(nodes) != 1 {
		t.Fatalf("Expected 1 node, got %d", len(nodes))
	}

	if nodes[0].Name != "node1" {
		t.Errorf("Expected node1, got %s", nodes[0].Name)
	}
	if nodes[0].InternalIP != "10.0.0.1" {
		t.Errorf("Expected 10.0.0.1, got %s", nodes[0].InternalIP)
	}
	if len(nodes[0].Roles) != 1 || nodes[0].Roles[0] != "control-plane" {
		t.Errorf("Expected control-plane role, got %v", nodes[0].Roles)
	}
	if nodes[0].StorageCapacity != "80Gi" {
		t.Errorf("Expected allocatable storage 80Gi, got %s", nodes[0].StorageCapacity)
	}
}

func TestGetPods(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "pod1",
			Namespace: "default",
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{Name: "c1", Image: "nginx"},
			},
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{Name: "c1", Ready: true, RestartCount: 2},
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(pod)
	m.clients["c1"] = fakeCS

	pods, err := m.GetPods(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetPods failed: %v", err)
	}

	if len(pods) != 1 {
		t.Fatalf("Expected 1 pod, got %d", len(pods))
	}
	if pods[0].Name != "pod1" {
		t.Errorf("Expected pod1, got %s", pods[0].Name)
	}
	if pods[0].Restarts != 2 {
		t.Errorf("Expected 2 restarts, got %d", pods[0].Restarts)
	}
}

func TestGetDeployments(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	replicas := int32(3)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "dep1",
			Namespace:         "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-10 * time.Minute)},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{Image: "nginx"}},
				},
			},
		},
		Status: appsv1.DeploymentStatus{
			ReadyReplicas: 3,
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(dep)
	m.clients["c1"] = fakeCS

	deps, err := m.GetDeployments(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetDeployments failed: %v", err)
	}

	if len(deps) != 1 {
		t.Fatalf("Expected 1 deployment, got %d", len(deps))
	}
	if deps[0].Name != "dep1" {
		t.Errorf("Expected dep1, got %s", deps[0].Name)
	}
	if deps[0].Status != "running" {
		t.Errorf("Expected running status, got %s", deps[0].Status)
	}
}

// TestGetDeploymentsNilReplicas verifies that GetDeployments handles
// Spec.Replicas == nil (the Kubernetes default of 1 replica).

func TestGetDeploymentsNilReplicas(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "nil-replicas-dep",
			Namespace:         "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-10 * time.Minute)},
		},
		Spec: appsv1.DeploymentSpec{
			// Replicas intentionally nil — Kubernetes defaults to 1
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{Image: "nginx"}},
				},
			},
		},
		Status: appsv1.DeploymentStatus{
			ReadyReplicas: 1,
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(dep)
	m.clients["c1"] = fakeCS

	deps, err := m.GetDeployments(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetDeployments failed: %v", err)
	}

	if len(deps) != 1 {
		t.Fatalf("Expected 1 deployment, got %d", len(deps))
	}
	if deps[0].Replicas != 1 {
		t.Errorf("Expected 1 replica (default), got %d", deps[0].Replicas)
	}
	if deps[0].Status != "running" {
		t.Errorf("Expected running status with nil replicas, got %s", deps[0].Status)
	}
	expectedProgress := 100 // 1 ready / 1 desired = 100%
	if deps[0].Progress != expectedProgress {
		t.Errorf("Expected progress %d%%, got %d%%", expectedProgress, deps[0].Progress)
	}
}

// TestGetDeploymentsAvailableFalseNotFailed verifies that a deployment with
// Available=False but without Progressing=False is reported as "deploying",
// not "failed" (#4470). Available=False alone is a transient state during
// normal rolling updates and should not be treated as a hard failure.

func TestGetDeploymentsAvailableFalseNotFailed(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	replicas := int32(3)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "rolling-dep",
			Namespace:         "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-5 * time.Minute)},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{Containers: []corev1.Container{{Image: "nginx"}}},
			},
		},
		Status: appsv1.DeploymentStatus{
			ReadyReplicas: 2, // still rolling out
			Conditions: []appsv1.DeploymentCondition{
				{Type: appsv1.DeploymentAvailable, Status: corev1.ConditionFalse, Message: "not all replicas available"},
				{Type: appsv1.DeploymentProgressing, Status: corev1.ConditionTrue, Reason: "ReplicaSetUpdated"},
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(dep)
	m.clients["c1"] = fakeCS

	deps, err := m.GetDeployments(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetDeployments failed: %v", err)
	}
	if len(deps) != 1 {
		t.Fatalf("Expected 1 deployment, got %d", len(deps))
	}
	if deps[0].Status != "deploying" {
		t.Errorf("Expected 'deploying' status for Available=False+Progressing=True, got %q", deps[0].Status)
	}
}

// TestGetDeploymentsProgressingFalseFailed verifies that a deployment with
// Progressing=False is reported as "failed" (#4470).

func TestGetDeploymentsProgressingFalseFailed(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	replicas := int32(3)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "stuck-dep",
			Namespace:         "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-30 * time.Minute)},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{Containers: []corev1.Container{{Image: "bad-image"}}},
			},
		},
		Status: appsv1.DeploymentStatus{
			ReadyReplicas: 0,
			Conditions: []appsv1.DeploymentCondition{
				{Type: appsv1.DeploymentProgressing, Status: corev1.ConditionFalse, Reason: "ProgressDeadlineExceeded"},
				{Type: appsv1.DeploymentAvailable, Status: corev1.ConditionFalse, Message: "unavailable"},
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(dep)
	m.clients["c1"] = fakeCS

	deps, err := m.GetDeployments(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetDeployments failed: %v", err)
	}
	if len(deps) != 1 {
		t.Fatalf("Expected 1 deployment, got %d", len(deps))
	}
	if deps[0].Status != "failed" {
		t.Errorf("Expected 'failed' status for Progressing=False, got %q", deps[0].Status)
	}
}

// TestFindDeploymentIssuesProgressDeadlineExceeded verifies that Progressing=False
// takes precedence over Available=False when determining the issue reason (#4470).

func TestFindDeploymentIssuesProgressDeadlineExceeded(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	replicas := int32(3)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "stuck-dep",
			Namespace: "default",
		},
		Spec: appsv1.DeploymentSpec{Replicas: &replicas},
		Status: appsv1.DeploymentStatus{
			ReadyReplicas: 0,
			Conditions: []appsv1.DeploymentCondition{
				// Available=False comes first in the slice (old code would pick this)
				{Type: appsv1.DeploymentAvailable, Status: corev1.ConditionFalse, Message: "unavailable"},
				{Type: appsv1.DeploymentProgressing, Status: corev1.ConditionFalse, Reason: "ProgressDeadlineExceeded", Message: "deadline exceeded"},
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(dep)
	m.clients["c1"] = fakeCS

	issues, err := m.FindDeploymentIssues(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("FindDeploymentIssues failed: %v", err)
	}
	if len(issues) != 1 {
		t.Fatalf("Expected 1 issue, got %d", len(issues))
	}
	if issues[0].Reason != "ProgressDeadlineExceeded" {
		t.Errorf("Expected reason 'ProgressDeadlineExceeded', got %q", issues[0].Reason)
	}
}

func TestGetJobs(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "job1",
			Namespace:         "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-5 * time.Minute)},
		},
		Status: batchv1.JobStatus{
			Succeeded:      1,
			StartTime:      &metav1.Time{Time: time.Now().Add(-5 * time.Minute)},
			CompletionTime: &metav1.Time{Time: time.Now().Add(-4 * time.Minute)},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(job)
	m.clients["c1"] = fakeCS

	jobs, err := m.GetJobs(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetJobs failed: %v", err)
	}

	if len(jobs) != 1 {
		t.Fatalf("Expected 1 job, got %d", len(jobs))
	}
	if jobs[0].Status != "Complete" {
		t.Errorf("Expected Complete status, got %s", jobs[0].Status)
	}
}

func TestGetCronJobs(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	cj := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: "cj1", Namespace: "default"},
	}

	fakeCS := k8sfake.NewSimpleClientset(cj)
	m.clients["c1"] = fakeCS

	cjs, _ := m.GetCronJobs(context.Background(), "c1", "default")
	if len(cjs) != 1 {
		t.Errorf("Expected 1 CronJob, got %d", len(cjs))
	}
}

func TestGetStatefulSetsAndDaemonSets(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	sts := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: "sts1", Namespace: "default"},
	}
	ds := &appsv1.DaemonSet{
		ObjectMeta: metav1.ObjectMeta{Name: "ds1", Namespace: "default"},
	}

	fakeCS := k8sfake.NewSimpleClientset(sts, ds)
	m.clients["c1"] = fakeCS

	stss, _ := m.GetStatefulSets(context.Background(), "c1", "default")
	if len(stss) != 1 {
		t.Errorf("Expected 1 STS, got %d", len(stss))
	}

	dss, _ := m.GetDaemonSets(context.Background(), "c1", "default")
	if len(dss) != 1 {
		t.Errorf("Expected 1 DS, got %d", len(dss))
	}
}

func TestGetReplicaSets(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	rs := &appsv1.ReplicaSet{
		ObjectMeta: metav1.ObjectMeta{Name: "rs1", Namespace: "default"},
	}
	fakeCS := k8sfake.NewSimpleClientset(rs)
	m.clients["c1"] = fakeCS
	rss, _ := m.GetReplicaSets(context.Background(), "c1", "default")
	if len(rss) != 1 {
		t.Errorf("Expected 1 RS, got %d", len(rss))
	}
}

func TestGetHPAs(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	hpa := &autoscalingv2.HorizontalPodAutoscaler{
		ObjectMeta: metav1.ObjectMeta{Name: "hpa1", Namespace: "default"},
		Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
			ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
				Kind: "Deployment",
				Name: "dep1",
			},
			MaxReplicas: 10,
		},
		Status: autoscalingv2.HorizontalPodAutoscalerStatus{
			CurrentReplicas: 5,
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(hpa)
	m.clients["c1"] = fakeCS

	hpas, err := m.GetHPAs(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetHPAs failed: %v", err)
	}

	if len(hpas) != 1 {
		t.Fatalf("Expected 1 HPA, got %d", len(hpas))
	}
}
