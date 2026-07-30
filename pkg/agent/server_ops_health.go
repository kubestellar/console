package agent

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

var providerStatusPageAPI = map[string]string{
	"anthropic": "https://status.claude.com/api/v2/status.json",
	"openai":    "https://status.openai.com/api/v2/status.json",
}

var providerPingEndpoints = map[string]string{
	"google": "https://generativelanguage.googleapis.com/v1beta/models?key=healthcheck",
}

type ProviderHealthStatus struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type ProvidersHealthResponse struct {
	Providers []ProviderHealthStatus `json:"providers"`
	CheckedAt string                 `json:"checkedAt"`
}

func (s *Server) handleProvidersHealth(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]ProviderHealthStatus, 0, len(providerStatusPageAPI)+len(providerPingEndpoints))
	client := &http.Client{Timeout: consoleHealthTimeout}

	for id, apiURL := range providerStatusPageAPI {
		id, apiURL := id, apiURL
		wg.Add(1)
		safego.GoWith("provider-health-statuspage", func() {
			defer wg.Done()
			status := checkStatuspageHealth(client, apiURL)
			mu.Lock()
			results = append(results, ProviderHealthStatus{ID: id, Status: status})
			mu.Unlock()
		})
	}
	for id, pingURL := range providerPingEndpoints {
		id, pingURL := id, pingURL
		wg.Add(1)
		safego.GoWith("provider-health-ping", func() {
			defer wg.Done()
			status := checkPingHealth(client, pingURL)
			mu.Lock()
			results = append(results, ProviderHealthStatus{ID: id, Status: status})
			mu.Unlock()
		})
	}

	wg.Wait()
	writeJSON(w, ProvidersHealthResponse{
		Providers: results,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

func checkStatuspageHealth(client *http.Client, apiURL string) string {
	resp, err := client.Get(apiURL)
	if err != nil {
		return "unknown"
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
	}()
	if resp.StatusCode != http.StatusOK {
		return "unknown"
	}

	var data struct {
		Status struct {
			Indicator string `json:"indicator"`
		} `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "unknown"
	}

	switch data.Status.Indicator {
	case "none":
		return "operational"
	case "minor", "major":
		return "degraded"
	case "critical":
		return "down"
	default:
		return "unknown"
	}
}

func checkPingHealth(client *http.Client, pingURL string) string {
	resp, err := client.Get(pingURL)
	if err != nil {
		return "down"
	}
	defer resp.Body.Close()
	return "operational"
}
