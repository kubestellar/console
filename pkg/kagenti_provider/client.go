package kagenti_provider

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// AgentInfo describes a kagenti agent discovered via the platform.
type AgentInfo struct {
	Name        string   `json:"name"`
	Namespace   string   `json:"namespace"`
	Description string   `json:"description,omitempty"`
	Framework   string   `json:"framework,omitempty"`
	Tools       []string `json:"tools,omitempty"`
}

// AgentCard is the A2A agent card returned by the /.well-known/agent.json endpoint.
type AgentCard struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	URL          string   `json:"url"`
	Capabilities []string `json:"capabilities,omitempty"`
}

// KagentiClient proxies requests to the kagenti A2A protocol endpoint.
type KagentiClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewKagentiClient creates a new KagentiClient with the given base URL.
func NewKagentiClient(baseURL string) *KagentiClient {
	return &KagentiClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// NewKagentiClientFromEnv creates a KagentiClient from the KAGENTI_CONTROLLER_URL
// environment variable, falling back to in-cluster auto-detection. Returns nil
// if kagenti is not available.
func NewKagentiClientFromEnv() *KagentiClient {
	url := os.Getenv("KAGENTI_CONTROLLER_URL")
	if url == "" {
		// Try auto-detection with a short timeout client
		c := &KagentiClient{httpClient: &http.Client{Timeout: 3 * time.Second}}
		url = c.Detect()
	}
	if url == "" {
		return nil // kagenti not available
	}
	return NewKagentiClient(url)
}

// Status checks whether the kagenti controller is reachable.
func (c *KagentiClient) Status() (bool, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/health")
	if err != nil {
		return false, fmt.Errorf("kagenti health check failed: %w", err)
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300, nil
}

// ListAgents returns known agents. This is a placeholder that returns an empty
// list; full implementation requires Kubernetes API access.
func (c *KagentiClient) ListAgents() ([]AgentInfo, error) {
	// TODO: Implement via Kubernetes API (list Agent CRs in cluster)
	return []AgentInfo{}, nil
}

// Discover fetches the A2A agent card for the given agent.
func (c *KagentiClient) Discover(namespace, agentName string) (*AgentCard, error) {
	url := fmt.Sprintf("%s/api/a2a/%s/%s/.well-known/agent.json", c.baseURL, namespace, agentName)
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to discover agent %s/%s: %w", namespace, agentName, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("discover agent %s/%s returned %d: %s", namespace, agentName, resp.StatusCode, string(body))
	}

	var card AgentCard
	if err := json.NewDecoder(resp.Body).Decode(&card); err != nil {
		return nil, fmt.Errorf("failed to decode agent card: %w", err)
	}
	return &card, nil
}

// a2aRequest is the JSON-RPC 2.0 envelope sent to the A2A endpoint.
type a2aRequest struct {
	JSONRPC string         `json:"jsonrpc"`
	Method  string         `json:"method"`
	Params  map[string]any `json:"params"`
}

// Invoke sends a message to an agent via the A2A protocol and returns the raw
// response body for streaming consumption.
func (c *KagentiClient) Invoke(ctx context.Context, namespace, agentName, message string, contextID string) (io.ReadCloser, error) {
	params := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{"kind": "text", "text": message},
			},
		},
		"configuration": map[string]any{
			"acceptedOutputModes": []string{"text"},
		},
	}
	if contextID != "" {
		params["contextId"] = contextID
	}

	body := a2aRequest{
		JSONRPC: "2.0",
		Method:  "message/send",
		Params:  params,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal A2A request: %w", err)
	}

	url := fmt.Sprintf("%s/api/a2a/%s/%s", c.baseURL, namespace, agentName)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(payload)))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("A2A invoke failed: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		errBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("A2A invoke returned %d: %s", resp.StatusCode, string(errBody))
	}

	return resp.Body, nil
}

// Detect tries common in-cluster kagenti service URLs and returns the first
// reachable one. Returns an empty string if none are reachable.
func (c *KagentiClient) Detect() string {
	candidates := []string{
		"http://kagenti-controller.kagenti-system.svc:8083",
		"http://kagenti-controller.kagenti-system.svc.cluster.local:8083",
	}
	for _, url := range candidates {
		resp, err := c.httpClient.Get(url + "/health")
		if err == nil {
			resp.Body.Close()
			return url
		}
	}
	return ""
}
