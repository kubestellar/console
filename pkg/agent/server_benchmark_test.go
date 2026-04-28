package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func BenchmarkServerRouting(b *testing.B) {
	// Initialize non-nil dependencies to avoid panics in handlers
	proxy, _ := NewKubectlProxy("")
	reg := GetRegistry()

	s := &Server{
		config:         Config{Port: 8080},
		kubectl:        proxy,
		registry:       reg,
		metricsHistory: NewMetricsHistory(nil, ""),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/clusters", s.handleClustersHTTP)
	mux.HandleFunc("/nodes", s.handleNodesHTTP)
	mux.HandleFunc("/pods", s.handlePodsHTTP)

	reqs := []*http.Request{
		httptest.NewRequest("GET", "/health", nil),
		httptest.NewRequest("GET", "/clusters", nil),
		httptest.NewRequest("GET", "/nodes", nil),
		httptest.NewRequest("GET", "/pods", nil),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := reqs[i%len(reqs)]
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
	}
}
