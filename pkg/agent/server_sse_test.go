package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	batchv1 "k8s.io/api/batch/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

// newTestServerForSSE creates a Server with the given kubeconfig contexts and
// fake k8s clients wired up. agentToken is left empty so validateToken passes.
func newTestServerForSSE(t *testing.T, contexts map[string]*api.Context) (*Server, *k8s.MultiClusterClient) {
	t.Helper()

	k8sMock, _ := k8s.NewMultiClusterClient("")

	cfg := &api.Config{
		Contexts:  contexts,
		Clusters:  map[string]*api.Cluster{},
		AuthInfos: map[string]*api.AuthInfo{},
	}
	for name := range contexts {
		cfg.Clusters[name] = &api.Cluster{Server: "https://" + name + ":6443"}
		cfg.AuthInfos[name] = &api.AuthInfo{}
	}

	proxy := &KubectlProxy{
		kubeconfig: "/dev/null",
		config:     cfg,
	}

	srv := &Server{
		k8sClient:      k8sMock,
		kubectl:        proxy,
		allowedOrigins: []string{"*"},
		agentToken:     "",
	}
	return srv, k8sMock
}

func TestHandleJobsStreamSSE_Headers(t *testing.T) {
	contexts := map[string]*api.Context{
		"cluster-a": {Cluster: "cluster-a", AuthInfo: "cluster-a"},
	}
	srv, k8sMock := newTestServerForSSE(t, contexts)
	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("cluster-a", fakeCS)

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	// Verify SSE headers
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("Content-Type = %q, want %q", ct, "text/event-stream")
	}
	if cc := resp.Header.Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("Cache-Control = %q, want %q", cc, "no-cache")
	}
	if conn := resp.Header.Get("Connection"); conn != "keep-alive" {
		t.Errorf("Connection = %q, want %q", conn, "keep-alive")
	}
}

func TestHandleJobsStreamSSE_StreamsEvents(t *testing.T) {
	contexts := map[string]*api.Context{
		"cluster-a": {Cluster: "cluster-a", AuthInfo: "cluster-a"},
	}
	srv, k8sMock := newTestServerForSSE(t, contexts)

	completions := int32(1)
	fakeCS := fakek8s.NewSimpleClientset(
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "job-1", Namespace: "default"},
			Spec:       batchv1.JobSpec{Completions: &completions},
			Status: batchv1.JobStatus{
				Succeeded: 1,
				StartTime: &metav1.Time{Time: time.Now().Add(-time.Minute)},
			},
		},
	)
	k8sMock.SetClient("cluster-a", fakeCS)

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream?cluster=cluster-a", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	body := w.Body.String()

	// Parse SSE events
	events := parseSSEEvents(t, body)

	// Expect at least a cluster_data event and a done event
	var foundClusterData, foundDone bool
	for _, ev := range events {
		switch ev.event {
		case "cluster_data":
			foundClusterData = true
			var payload map[string]interface{}
			if err := json.Unmarshal([]byte(ev.data), &payload); err != nil {
				t.Fatalf("Failed to unmarshal cluster_data: %v", err)
			}
			if payload["cluster"] != "cluster-a" {
				t.Errorf("cluster_data cluster = %v, want %q", payload["cluster"], "cluster-a")
			}
			jobs, ok := payload["jobs"].([]interface{})
			if !ok {
				t.Fatal("cluster_data missing jobs array")
			}
			if len(jobs) != 1 {
				t.Errorf("Expected 1 job, got %d", len(jobs))
			}
		case "done":
			foundDone = true
			var payload map[string]interface{}
			if err := json.Unmarshal([]byte(ev.data), &payload); err != nil {
				t.Fatalf("Failed to unmarshal done event: %v", err)
			}
			if total, ok := payload["total"].(float64); !ok || int(total) != 1 {
				t.Errorf("done total = %v, want 1", payload["total"])
			}
			if clusters, ok := payload["clusters"].(float64); !ok || int(clusters) != 1 {
				t.Errorf("done clusters = %v, want 1", payload["clusters"])
			}
		}
	}
	if !foundClusterData {
		t.Error("Missing cluster_data SSE event")
	}
	if !foundDone {
		t.Error("Missing done SSE event")
	}
}

func TestHandleJobsStreamSSE_SSEFormat(t *testing.T) {
	contexts := map[string]*api.Context{
		"c1": {Cluster: "c1", AuthInfo: "c1"},
	}
	srv, k8sMock := newTestServerForSSE(t, contexts)
	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("c1", fakeCS)

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream?cluster=c1", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	body := w.Body.String()

	// Each SSE event must be "event: <type>\ndata: <json>\n\n"
	events := parseSSEEvents(t, body)
	for _, ev := range events {
		if ev.event == "" {
			t.Error("SSE event missing event type")
		}
		if ev.data == "" {
			t.Error("SSE event missing data field")
		}
		// Verify data is valid JSON
		if !json.Valid([]byte(ev.data)) {
			t.Errorf("SSE data is not valid JSON: %s", ev.data)
		}
	}
}

func TestHandleJobsStreamSSE_EmptyClusters(t *testing.T) {
	// No contexts configured — no clusters to stream from
	contexts := map[string]*api.Context{}
	srv, _ := newTestServerForSSE(t, contexts)

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	// Should still return SSE headers and a done event
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("Content-Type = %q, want %q", ct, "text/event-stream")
	}

	events := parseSSEEvents(t, w.Body.String())

	// Should have exactly one done event with 0 totals
	var foundDone bool
	for _, ev := range events {
		if ev.event == "done" {
			foundDone = true
			var payload map[string]interface{}
			if err := json.Unmarshal([]byte(ev.data), &payload); err != nil {
				t.Fatalf("Failed to unmarshal done: %v", err)
			}
			if total, ok := payload["total"].(float64); !ok || int(total) != 0 {
				t.Errorf("done total = %v, want 0", payload["total"])
			}
			if clusters, ok := payload["clusters"].(float64); !ok || int(clusters) != 0 {
				t.Errorf("done clusters = %v, want 0", payload["clusters"])
			}
		}
		if ev.event == "cluster_data" {
			t.Error("Unexpected cluster_data event when there are no clusters")
		}
	}
	if !foundDone {
		t.Error("Missing done SSE event for empty cluster list")
	}
}

func TestHandleJobsStreamSSE_MultipleClusters(t *testing.T) {
	contexts := map[string]*api.Context{
		"alpha": {Cluster: "alpha", AuthInfo: "alpha"},
		"beta":  {Cluster: "beta", AuthInfo: "beta"},
	}
	srv, k8sMock := newTestServerForSSE(t, contexts)

	completions := int32(1)
	fakeAlpha := fakek8s.NewSimpleClientset(
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "job-alpha", Namespace: "default"},
			Spec:       batchv1.JobSpec{Completions: &completions},
			Status:     batchv1.JobStatus{Succeeded: 1},
		},
	)
	fakeBeta := fakek8s.NewSimpleClientset(
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "job-beta-1", Namespace: "ns1"},
			Spec:       batchv1.JobSpec{Completions: &completions},
			Status:     batchv1.JobStatus{Succeeded: 1},
		},
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "job-beta-2", Namespace: "ns1"},
			Spec:       batchv1.JobSpec{Completions: &completions},
			Status:     batchv1.JobStatus{Failed: 1},
		},
	)
	k8sMock.SetClient("alpha", fakeAlpha)
	k8sMock.SetClient("beta", fakeBeta)

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	events := parseSSEEvents(t, w.Body.String())

	clusterDataCount := 0
	totalJobsSeen := 0
	for _, ev := range events {
		if ev.event == "cluster_data" {
			clusterDataCount++
			var payload map[string]interface{}
			if err := json.Unmarshal([]byte(ev.data), &payload); err != nil {
				t.Fatalf("Failed to unmarshal: %v", err)
			}
			jobs := payload["jobs"].([]interface{})
			totalJobsSeen += len(jobs)
		}
		if ev.event == "done" {
			var payload map[string]interface{}
			if err := json.Unmarshal([]byte(ev.data), &payload); err != nil {
				t.Fatalf("Failed to unmarshal done: %v", err)
			}
			if total := int(payload["total"].(float64)); total != 3 {
				t.Errorf("done total = %d, want 3", total)
			}
		}
	}
	if clusterDataCount != 2 {
		t.Errorf("Expected 2 cluster_data events, got %d", clusterDataCount)
	}
	if totalJobsSeen != 3 {
		t.Errorf("Expected 3 total jobs across events, got %d", totalJobsSeen)
	}
}

func TestHandleJobsStreamSSE_ClusterFilter(t *testing.T) {
	contexts := map[string]*api.Context{
		"keep":   {Cluster: "keep", AuthInfo: "keep"},
		"ignore": {Cluster: "ignore", AuthInfo: "ignore"},
	}
	srv, k8sMock := newTestServerForSSE(t, contexts)

	completions := int32(1)
	fakeKeep := fakek8s.NewSimpleClientset(
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "kept-job", Namespace: "default"},
			Spec:       batchv1.JobSpec{Completions: &completions},
		},
	)
	fakeIgnore := fakek8s.NewSimpleClientset(
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "ignored-job", Namespace: "default"},
			Spec:       batchv1.JobSpec{Completions: &completions},
		},
	)
	k8sMock.SetClient("keep", fakeKeep)
	k8sMock.SetClient("ignore", fakeIgnore)

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream?cluster=keep", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	events := parseSSEEvents(t, w.Body.String())

	for _, ev := range events {
		if ev.event == "cluster_data" {
			var payload map[string]interface{}
			if err := json.Unmarshal([]byte(ev.data), &payload); err != nil {
				t.Fatalf("Failed to unmarshal: %v", err)
			}
			if payload["cluster"] != "keep" {
				t.Errorf("Expected only cluster %q, got %q", "keep", payload["cluster"])
			}
		}
		if ev.event == "done" {
			var payload map[string]interface{}
			if err := json.Unmarshal([]byte(ev.data), &payload); err != nil {
				t.Fatalf("Failed to unmarshal done: %v", err)
			}
			if clusters := int(payload["clusters"].(float64)); clusters != 1 {
				t.Errorf("done clusters = %d, want 1", clusters)
			}
		}
	}
}

func TestHandleJobsStreamSSE_Unauthorized(t *testing.T) {
	contexts := map[string]*api.Context{
		"c1": {Cluster: "c1", AuthInfo: "c1"},
	}
	srv, _ := newTestServerForSSE(t, contexts)
	srv.agentToken = "secret-token"
	srv.tokenExplicit = true

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream", nil)
	// No Authorization header — should fail
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}
}

func TestHandleJobsStreamSSE_NilK8sClient(t *testing.T) {
	srv := &Server{
		kubectl:        &KubectlProxy{kubeconfig: "/dev/null", config: &api.Config{}},
		k8sClient:      nil,
		allowedOrigins: []string{"*"},
		agentToken:     "",
	}

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status %d, got %d", http.StatusServiceUnavailable, w.Code)
	}
}

func TestHandleJobsStreamSSE_NilKubectl(t *testing.T) {
	k8sMock, _ := k8s.NewMultiClusterClient("")
	srv := &Server{
		kubectl:        nil,
		k8sClient:      k8sMock,
		allowedOrigins: []string{"*"},
		agentToken:     "",
	}

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status %d, got %d", http.StatusServiceUnavailable, w.Code)
	}
}

func TestHandleJobsStreamSSE_CORSPreflight(t *testing.T) {
	contexts := map[string]*api.Context{}
	srv, _ := newTestServerForSSE(t, contexts)

	req := httptest.NewRequest(http.MethodOptions, "/jobs/stream", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("CORS preflight status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestHandleJobsStreamSSE_ClientDisconnect(t *testing.T) {
	contexts := map[string]*api.Context{
		"slow-cluster": {Cluster: "slow-cluster", AuthInfo: "slow-cluster"},
	}
	srv, k8sMock := newTestServerForSSE(t, contexts)

	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("slow-cluster", fakeCS)

	// Create a request with a cancelled context to simulate client disconnect
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately
	req := httptest.NewRequest(http.MethodGet, "/jobs/stream?cluster=slow-cluster", nil)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	goroutinesBefore := runtime.NumGoroutine()

	srv.handleJobsStreamSSE(w, req)

	// Give goroutines a moment to clean up
	time.Sleep(50 * time.Millisecond)

	goroutinesAfter := runtime.NumGoroutine()

	// Allow a small delta for runtime fluctuations, but no major leak
	const maxGoroutineDelta = 5
	if goroutinesAfter-goroutinesBefore > maxGoroutineDelta {
		t.Errorf("Possible goroutine leak: before=%d, after=%d (delta=%d, max allowed=%d)",
			goroutinesBefore, goroutinesAfter, goroutinesAfter-goroutinesBefore, maxGoroutineDelta)
	}
}

func TestHandleJobsStreamSSE_ClusterError(t *testing.T) {
	// When k8sClient has no client for a cluster, GetJobs returns an error.
	// The handler should emit a cluster_error SSE event.
	contexts := map[string]*api.Context{
		"missing": {Cluster: "missing", AuthInfo: "missing"},
	}
	srv, _ := newTestServerForSSE(t, contexts)
	// Don't set a client for "missing" — GetJobs will fail

	req := httptest.NewRequest(http.MethodGet, "/jobs/stream?cluster=missing", nil)
	w := httptest.NewRecorder()

	srv.handleJobsStreamSSE(w, req)

	events := parseSSEEvents(t, w.Body.String())

	var foundError, foundDone bool
	for _, ev := range events {
		if ev.event == "cluster_error" {
			foundError = true
			var payload map[string]string
			if err := json.Unmarshal([]byte(ev.data), &payload); err != nil {
				t.Fatalf("Failed to unmarshal cluster_error: %v", err)
			}
			if payload["cluster"] != "missing" {
				t.Errorf("cluster_error cluster = %q, want %q", payload["cluster"], "missing")
			}
			if payload["error"] == "" {
				t.Error("cluster_error has empty error message")
			}
		}
		if ev.event == "done" {
			foundDone = true
		}
	}
	if !foundError {
		t.Error("Missing cluster_error SSE event for unconfigured cluster")
	}
	if !foundDone {
		t.Error("Missing done SSE event after cluster error")
	}
}

// parsedSSEEvent represents a parsed SSE event.
type parsedSSEEvent struct {
	event string
	data  string
}

// parseSSEEvents parses raw SSE text into structured events.
func parseSSEEvents(t *testing.T, body string) []parsedSSEEvent {
	t.Helper()

	var events []parsedSSEEvent
	scanner := bufio.NewScanner(strings.NewReader(body))

	var currentEvent, currentData string
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.HasPrefix(line, "event: "):
			currentEvent = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			currentData = strings.TrimPrefix(line, "data: ")
		case line == "":
			if currentEvent != "" || currentData != "" {
				events = append(events, parsedSSEEvent{event: currentEvent, data: currentData})
				currentEvent = ""
				currentData = ""
			}
		}
	}
	// Catch trailing event without final blank line
	if currentEvent != "" || currentData != "" {
		events = append(events, parsedSSEEvent{event: currentEvent, data: currentData})
	}

	return events
}
