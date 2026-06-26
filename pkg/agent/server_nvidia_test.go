package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestServer_HandleNvidiaOperatorsHTTP(t *testing.T) {
	// 1. Setup fake kubernetes client with NVIDIA resources
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: "gpu-operator",
		},
	}
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "nvidia-gpu-operator",
			Namespace: "gpu-operator",
		},
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{Image: "nvidia/gpu-operator:v23.9.1"},
					},
				},
			},
		},
		Status: appsv1.DeploymentStatus{
			Replicas:      1,
			ReadyReplicas: 1,
		},
	}
	ds := &appsv1.DaemonSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "nvidia-device-plugin-daemonset",
			Namespace: "gpu-operator",
		},
		Spec: appsv1.DaemonSetSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Env: []corev1.EnvVar{
								{Name: "DRIVER_VERSION", Value: "535.104.05"},
							},
						},
					},
				},
			},
		},
		Status: appsv1.DaemonSetStatus{
			DesiredNumberScheduled: 1,
			NumberReady:            1,
		},
	}

	fakeClientset := fake.NewSimpleClientset(ns, dep, ds)

	// 2. Setup server with mock k8s client
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetClient("cluster1", fakeClientset)

	s := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	// 3. Test request for all clusters
	req := httptest.NewRequest("GET", "/nvidia-operators?cluster=cluster1", nil)
	w := httptest.NewRecorder()

	s.handleNvidiaOperatorsHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp struct {
		Operators []nvidiaOperatorStatus `json:"operators"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(resp.Operators) != 1 {
		t.Errorf("Expected 1 operator status, got %d", len(resp.Operators))
	}

	status := resp.Operators[0]
	if status.Cluster != "cluster1" {
		t.Errorf("Expected cluster1, got %s", status.Cluster)
	}

	if status.GPUOperator == nil || !status.GPUOperator.Installed {
		t.Error("GPU Operator should be reported as installed")
	}

	if status.GPUOperator.Version != "v23.9.1" {
		t.Errorf("Expected version v23.9.1, got %s", status.GPUOperator.Version)
	}

	if status.GPUOperator.DriverVersion != "535.104.05" {
		t.Errorf("Expected driver version 535.104.05, got %s", status.GPUOperator.DriverVersion)
	}
}

func TestExtractImageTag(t *testing.T) {
	tests := []struct {
		image string
		want  string
	}{
		{"nvcr.io/nvidia/gpu-operator:v23.9.1", "v23.9.1"},
		{"gpu-operator:latest", ""},
		{"gpu-operator", ""},
		{"nvidia/gpu-operator@sha256:123", ""},
	}

	for _, tt := range tests {
		got := extractImageTag(tt.image)
		if got != tt.want {
			t.Errorf("extractImageTag(%q) = %q, want %q", tt.image, got, tt.want)
		}
	}
}
