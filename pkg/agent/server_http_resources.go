package agent

import (
	"time"
)

const (
	clusterResourceRetryBaseDelay = 30 * time.Second
	clusterResourceRetryMaxDelay  = 5 * time.Minute
	clusterResourceRetryFactor    = 2
)

type clusterResourceRetryState struct {
	failures  int
	nextRetry time.Time
}

func (s *Server) clusterResourceRetryKey(resourceName, clusterName string) string {
	return resourceName + ":" + clusterName
}

func (s *Server) shouldSkipClusterResource(resourceName, clusterName string) bool {
	s.resourceRetryMu.Lock()
	defer s.resourceRetryMu.Unlock()
	if s.resourceRetryState == nil {
		s.resourceRetryState = make(map[string]clusterResourceRetryState)
	}
	state, ok := s.resourceRetryState[s.clusterResourceRetryKey(resourceName, clusterName)]
	return ok && time.Now().Before(state.nextRetry)
}

func (s *Server) recordClusterResourceFailure(resourceName, clusterName string) time.Duration {
	s.resourceRetryMu.Lock()
	defer s.resourceRetryMu.Unlock()
	if s.resourceRetryState == nil {
		s.resourceRetryState = make(map[string]clusterResourceRetryState)
	}
	key := s.clusterResourceRetryKey(resourceName, clusterName)
	state := s.resourceRetryState[key]
	state.failures++
	delay := clusterResourceRetryBaseDelay
	for attempt := 1; attempt < state.failures; attempt++ {
		delay *= clusterResourceRetryFactor
		if delay >= clusterResourceRetryMaxDelay {
			delay = clusterResourceRetryMaxDelay
			break
		}
	}
	state.nextRetry = time.Now().Add(delay)
	s.resourceRetryState[key] = state
	return delay
}

func (s *Server) recordClusterResourceSuccess(resourceName, clusterName string) {
	s.resourceRetryMu.Lock()
	defer s.resourceRetryMu.Unlock()
	if s.resourceRetryState == nil {
		return
	}
	delete(s.resourceRetryState, s.clusterResourceRetryKey(resourceName, clusterName))
}
