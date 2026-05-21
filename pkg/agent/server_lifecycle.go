package agent

import (
	"log/slog"
	"strconv"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/safego"
)

// clusterOpsShutdownTimeout is the maximum time GracefulShutdown waits for
// in-flight cluster create/delete/lifecycle goroutines to complete.
const clusterOpsShutdownTimeout = 30 * time.Second

// stateDigestInterval is how often the agent broadcasts its current state
// snapshot (resource versions) to clients. Clients use this to detect
// missed updates and trigger silent resyncs. (#12000)
const stateDigestInterval = 15 * time.Second

// GracefulShutdown waits for all in-flight cluster operation goroutines to
// finish (up to clusterOpsShutdownTimeout). Call this before process exit to
// avoid orphaning background cluster create/delete operations.
func (s *Server) GracefulShutdown() {
	s.stopOnce.Do(func() {
		if s.stopCh != nil {
			close(s.stopCh)
		}
	})
	done := make(chan struct{})
	safego.GoWith("server/graceful-shutdown", func() {
		s.clusterOpsWG.Wait()
		close(done)
	})
	select {
	case <-done:
		slog.Info("[Server] all cluster operations completed")
	case <-time.After(clusterOpsShutdownTimeout):
		slog.Warn("[Server] timed out waiting for cluster operations", "timeout", clusterOpsShutdownTimeout)
	}
}

// startStateDigestWorker broadcasts state integrity digests periodically.
// Clients use these to detect missed events and trigger resyncs. (#12000)
func (s *Server) startStateDigestWorker() {
	ticker := time.NewTicker(stateDigestInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.sendStateDigest()
		}
	}
}

func (s *Server) sendStateDigest() {
	// In a real implementation, this would pull from the k8sClient's
	// internal cache. For this mentorship POC, we pull current cluster
	// count and health status as the "state".
	clusters, _ := s.kubectl.ListContexts()
	versions := make(map[string]string)
	versions["clusters"] = strconv.Itoa(len(clusters))

	// If k8sClient is available, we can add more granular versions
	if s.k8sClient != nil {
		// Mock versions for this POC. In production, these would be real
		// Kubernetes ResourceVersions. We omit the synthetic timestamp
		// version to prevent spurious client-side refreshes (#12000).
		// versions["pods"] = "1"
	}

	payload := protocol.StateDigestPayload{
		Sequence:  s.digestSequence.Add(1),
		Timestamp: time.Now().Unix(),
		Versions:  versions,
	}

	s.BroadcastToClients(string(protocol.TypeStateDigest), payload)
}
