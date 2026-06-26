package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	fakek8s "k8s.io/client-go/kubernetes/fake"
)

func TestServer_HandleGPUHealthCronJob(t *testing.T) {
	// Setup dependencies
	k8sClient, _ := k8s.NewMultiClusterClient("")
	server := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
		agentToken:     "test-token",
	}

	cluster := "test-cluster"
	fakeCS := fakek8s.NewSimpleClientset()
	k8sClient.SetClient(cluster, fakeCS)

	// 1. POST (Install)
	installBody := map[string]interface{}{
		"cluster":   cluster,
		"namespace": "gpu-ns",
		"schedule":  "*/10 * * * *",
		"tier":      2,
	}
	body, _ := json.Marshal(installBody)
	req := httptest.NewRequest("POST", "/gpu-health-cronjob", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	server.handleGPUHealthCronJob(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	// Verify CronJob was created
	cj, err := fakeCS.BatchV1().CronJobs("gpu-ns").Get(context.Background(), "gpu-health-check", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("CronJob not created: %v", err)
	}
	if cj == nil {
		t.Fatalf("CronJob is nil")
	}
	if cj.Spec.Schedule != "*/10 * * * *" {
		t.Errorf("Expected schedule */10 * * * *, got %s", cj.Spec.Schedule)
	}

	// 2. DELETE (Uninstall)
	uninstallBody := map[string]interface{}{
		"cluster":   cluster,
		"namespace": "gpu-ns",
	}
	body, _ = json.Marshal(uninstallBody)
	req = httptest.NewRequest("DELETE", "/gpu-health-cronjob", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()

	server.handleGPUHealthCronJob(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// Verify CronJob was deleted
	// Note: fake clientset Delete marks for deletion but doesn't necessarily remove from list immediately in some versions,
	// but Get should return NotFound.
	_, err = fakeCS.BatchV1().CronJobs("gpu-ns").Get(context.Background(), "gpu-health-check", metav1.GetOptions{})
	if err == nil {
		t.Errorf("CronJob should have been deleted")
	}

	// 3. Validation failure (invalid tier)
	installBody["tier"] = 10
	body, _ = json.Marshal(installBody)
	req = httptest.NewRequest("POST", "/gpu-health-cronjob", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleGPUHealthCronJob(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for invalid tier, got %d", w.Code)
	}
}

func TestIsValidCronScheduleAgent(t *testing.T) {
	tests := []struct {
		schedule string
		want     bool
	}{
		{"*/15 * * * *", true},
		{"0 0 * * *", true},
		{"* * * * *", true},
		{"* * * *", false},     // too few fields
		{"* * * * * *", false}, // too many fields
		{"invalid", false},
		{"", false},
	}

	for _, tt := range tests {
		if got := isValidCronScheduleAgent(tt.schedule); got != tt.want {
			t.Errorf("isValidCronScheduleAgent(%q) = %v, want %v", tt.schedule, got, tt.want)
		}
	}
}
