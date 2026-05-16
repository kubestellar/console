package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/safego"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
)

const (
	sseHeartbeatInterval = 30 * time.Second // interval between SSE keepalive comments
	sseWatchTimeout      = 10 * time.Minute // server-side watch timeout before re-establishing

	// Event forwarding concurrency limits
	maxConcurrentForwards    = 32              // max parallel event forwards to Stellar backend
	forwardTimeout           = 10 * time.Second // HTTP request timeout for event forwarding
	semaphoreAcquireTimeout  = 1 * time.Second  // max wait time to acquire semaphore before dropping event
)

// sseEvent is the JSON envelope sent over the SSE stream for each Kubernetes event.
type sseEvent struct {
	Type   string      `json:"type"`
	Object interface{} `json:"object"`
}

// handleEventsStreamSSE streams Kubernetes events as server-sent events.
// The frontend subscribes to this endpoint for real-time cluster event updates.
func (s *Server) handleEventsStreamSSE(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		http.Error(w, "k8s client not initialized", http.StatusServiceUnavailable)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")

	if cluster == "" {
		http.Error(w, "cluster parameter required", http.StatusBadRequest)
		return
	}

	// SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// Override the server-level WriteTimeout for this long-lived SSE stream.
	rc := http.NewResponseController(w)
	rc.SetWriteDeadline(time.Now().Add(sseWatchTimeout + time.Minute))

	client, err := s.k8sClient.GetClient(cluster)
	if err != nil {
		slog.Error("failed to get event stream client", "cluster", cluster, "error", err)
		sseWriteError(w, flusher, sanitizeAgentError("get cluster client", err))
		return
	}

	ctx := r.Context()

	watcher, err := client.CoreV1().Events(namespace).Watch(ctx, metav1.ListOptions{
		TimeoutSeconds: ptrInt64(int64(sseWatchTimeout.Seconds())),
	})
	if err != nil {
		slog.Warn("failed to start event watch", "cluster", cluster, "error", err)
		sseWriteError(w, flusher, sanitizeAgentError("watch events", err))
		return
	}
	defer watcher.Stop()

	heartbeat := time.NewTicker(sseHeartbeatInterval)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			// Client disconnected
			return

		case <-heartbeat.C:
			// Keepalive comment — ignored by SSE clients but prevents
			// proxies/load-balancers from closing idle connections.
			rc.SetWriteDeadline(time.Now().Add(sseWatchTimeout + time.Minute))
			fmt.Fprintf(w, ":heartbeat\n\n")
			flusher.Flush()

		case evt, ok := <-watcher.ResultChan():
			if !ok {
				// Watch channel closed; send an informational event and return.
				sseWriteError(w, flusher, "watch closed by server")
				return
			}

			if evt.Type == watch.Error {
				slog.Warn("watch error event", "cluster", cluster, "object", evt.Object)
				sseWriteError(w, flusher, "watch error")
				return
			}

			obj := summarizeEvent(evt, cluster)
			payload := sseEvent{
				Type:   string(evt.Type),
				Object: obj,
			}
			data, err := json.Marshal(payload)
			if err != nil {
				slog.Error("failed to marshal SSE event", "error", err)
				continue
			}

			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()

			// Forward Warning events to Stellar backend (non-blocking)
			if obj.Type == "Warning" {
				safego.GoWith("forward-event-to-stellar", func() { s.forwardEventToStellar(obj) })
			}
		}
	}
}

// sseEventSummary is a compact representation of a Kubernetes event for SSE.
type sseEventSummary struct {
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Object    string `json:"object"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	LastSeen  string `json:"lastSeen,omitempty"`
}

// summarizeEvent extracts the fields the frontend needs from a raw watch event.
func summarizeEvent(evt watch.Event, cluster string) sseEventSummary {
	summary := sseEventSummary{Cluster: cluster}
	ev, ok := evt.Object.(*corev1.Event)
	if !ok {
		return summary
	}
	summary.Type = ev.Type
	summary.Reason = ev.Reason
	summary.Message = ev.Message
	summary.Object = fmt.Sprintf("%s/%s", ev.InvolvedObject.Kind, ev.InvolvedObject.Name)
	summary.Namespace = ev.Namespace
	if !ev.LastTimestamp.IsZero() {
		summary.LastSeen = ev.LastTimestamp.Time.Format(time.RFC3339)
	}
	return summary
}

// sseWriteError writes an SSE event with type "error" and flushes.
func sseWriteError(w http.ResponseWriter, flusher http.Flusher, msg string) {
	data, _ := json.Marshal(map[string]string{"error": msg})
	fmt.Fprintf(w, "event: error\ndata: %s\n\n", data)
	flusher.Flush()
}

// ptrInt64 returns a pointer to the given int64 value.
func ptrInt64(v int64) *int64 {
	return &v
}

// extractResourceKind extracts the kind from "Kind/Name" format
func extractResourceKind(object string) string {
	if idx := strings.Index(object, "/"); idx >= 0 {
		return object[:idx]
	}
	return ""
}

// extractResourceName extracts the name from "Kind/Name" format
func extractResourceName(object string) string {
	if idx := strings.Index(object, "/"); idx >= 0 {
		return object[idx+1:]
	}
	return object
}

// forwardEventToStellar sends a k8s event to the backend's Stellar ingestion endpoint.
// This bridges the agent process to the backend's notification system.
func (s *Server) forwardEventToStellar(event sseEventSummary) {
	// Try to acquire semaphore with timeout to prevent unbounded goroutine growth
	ctx, cancel := context.WithTimeout(context.Background(), semaphoreAcquireTimeout)
	defer cancel()

	select {
	case s.stellarForwardSem <- struct{}{}:
		// Acquired semaphore, proceed with forwarding
		defer func() { <-s.stellarForwardSem }() // Release semaphore when done
	case <-ctx.Done():
		// Timeout waiting for semaphore — drop event to prevent backlog
		slog.Warn("stellar: dropped event (semaphore timeout)", 
			"cluster", event.Cluster, 
			"namespace", event.Namespace, 
			"reason", event.Reason)
		return
	}

	backendURL := os.Getenv("BACKEND_URL")
	if backendURL == "" {
		backendURL = "http://localhost:8080"
	}

	payload := map[string]interface{}{
		"cluster":   event.Cluster,
		"namespace": event.Namespace,
		"name":      extractResourceName(event.Object),
		"kind":      extractResourceKind(event.Object),
		"reason":    event.Reason,
		"message":   event.Message,
		"type":      event.Type,
		"count":     1,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("stellar: failed to marshal event", "error", err)
		return
	}

	// Create request with deadline to prevent goroutine pile-up
	reqCtx, reqCancel := context.WithTimeout(context.Background(), forwardTimeout)
	defer reqCancel()

	req, err := http.NewRequestWithContext(reqCtx, "POST", backendURL+"/api/stellar/events/ingest", bytes.NewReader(body))
	if err != nil {
		slog.Warn("stellar: failed to create request", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.stellarClient.Do(req)
	if err != nil {
		slog.Debug("stellar: failed to forward event to backend", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		slog.Warn("stellar: backend rejected event", "status", resp.StatusCode)
	}
}
