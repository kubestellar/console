package agent

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/kubestellar/console/pkg/k8s"
)

func (s *Server) handleEventsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"events": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	objectName := r.URL.Query().Get("object")
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			if l > maxQueryLimit {
				l = maxQueryLimit
			}
			limit = l
		}
	}

	if cluster == "" {
		writeJSON(w, map[string]interface{}{"events": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	// When filtering by object name, use a server-side FieldSelector so the
	// limit is applied after filtering — prevents target events from being
	// pushed out of the result window in noisy namespaces (issue #10167).
	var fieldSelector string
	if objectName != "" {
		fieldSelector = fmt.Sprintf("involvedObject.name=%s", objectName)
	}

	// Get events from the cluster
	events, err := s.k8sClient.GetEvents(ctx, cluster, namespace, limit, fieldSelector)
	if err != nil {
		slog.Warn("error fetching events", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}

	// Filter by object name if specified. e.Object is formatted as
	// "Kind/Name" (see pkg/k8s/client_resources.go); compare the Name
	// segment exactly so a query like "my-app" does not match "my-app-v2".
	if objectName != "" {
		filtered := make([]k8s.Event, 0, len(events))
		for _, e := range events {
			name := e.Object
			if idx := strings.Index(name, "/"); idx >= 0 {
				name = name[idx+1:]
			}
			if name == objectName {
				filtered = append(filtered, e)
			}
		}
		events = filtered
	}

	writeJSON(w, map[string]interface{}{"events": events, "source": "agent"})
}
