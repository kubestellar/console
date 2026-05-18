package agent

import (
	"net/http"

	"github.com/kubestellar/console/pkg/agent/protocol"
)

func (s *Server) handleClustersHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token for data endpoints
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Throttled reload: the frontend polls this endpoint and a full disk read
	// per request was wasteful. ReloadIfStale skips the load when the in-memory
	// snapshot is younger than kubectlReloadMinInterval. (#8075)
	s.kubectl.ReloadIfStale(kubectlReloadMinInterval)
	clusters, current := s.kubectl.ListContexts()
	writeJSON(w, protocol.ClustersPayload{Clusters: clusters, Current: current})
}
