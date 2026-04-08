package kagent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"os"
	"bytes"
	"strings"
	"time"
)

// AgentInfo describes a kagent agent discovered via the platform.
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

// KagentClient proxies requests to the kagent A2A protocol endpoint.
type KagentClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewKagentClient creates a new KagentClient with the given base URL.
func NewKagentClient(baseURL string) *KagentClient {
	return &KagentClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// NewKagentClientFromEnv creates a KagentClient from the KAGENT_CONTROLLER_URL
// environment variable, falling back to in-cluster auto-detection. Returns nil
// if kagent is not available.
func NewKagentClientFromEnv() *KagentClient {
	url := os.Getenv("KAGENT_CONTROLLER_URL")
	if url == "" {
		// Try auto-detection with a short timeout client
		c := &KagentClient{httpClient: &http.Client{Timeout: 3 * time.Second}}
		url = c.Detect()
	}
	if url == "" {
		return nil // kagent not available
	}
	return NewKagentClient(url)
}

// Status checks whether the kagent controller is reachable.
func (c *KagentClient) Status() (bool, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/health")
	if err != nil {
		return false, fmt.Errorf("kagent health check failed: %w", err)
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300, nil
}

// ListAgents queries the kagent controller for registered agents.
func (c *KagentClient) ListAgents() ([]AgentInfo, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/api/agents")
	if err != nil {
		return nil, fmt.Errorf("failed to list kagent agents: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("list agents returned %d: %s", resp.StatusCode, string(body))
	}

	var agents []AgentInfo
	if err := json.NewDecoder(resp.Body).Decode(&agents); err != nil {
		return nil, fmt.Errorf("failed to decode agent list: %w", err)
	}
	return agents, nil
}

// Discover fetches the A2A agent card for the given agent.
func (c *KagentClient) Discover(namespace, agentName string) (*AgentCard, error) {
	url := fmt.Sprintf("%s/api/a2a/%s/%s/.well-known/agent.json",
		c.baseURL, neturl.PathEscape(namespace), neturl.PathEscape(agentName))
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
func (c *KagentClient) Invoke(ctx context.Context, namespace, agentName, message string, contextID string) (io.ReadCloser, error) {
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

	url := fmt.Sprintf("%s/api/a2a/%s/%s",
		c.baseURL, neturl.PathEscape(namespace), neturl.PathEscape(agentName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
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

// buildDetectCandidates constructs the list of candidate URLs for auto-detection.
// The namespace, service name, port, and protocol are configurable via environment
// variables so non-standard deployments can be discovered automatically.
func buildDetectCandidates() []string {
	namespace := os.Getenv("KAGENT_NAMESPACE")
	if namespace == "" {
		namespace = "kagent"
	}
	serviceName := os.Getenv("KAGENT_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "kagent-controller"
	}
	port := os.Getenv("KAGENT_SERVICE_PORT")
	if port == "" {
		port = "8083"
	}
	protocol := os.Getenv("KAGENT_SERVICE_PROTOCOL")
	if protocol == "" {
		protocol = "http"
	}
	return []string{
		fmt.Sprintf("%s://%s.%s.svc:%s", protocol, serviceName, namespace, port),
		fmt.Sprintf("%s://%s.%s.svc.cluster.local:%s", protocol, serviceName, namespace, port),
	}
}

// Detect tries common in-cluster kagent service URLs and returns the first
// reachable one. Returns an empty string if none are reachable.
// Uses a background context; prefer DetectWithContext for cancellation support.
func (c *KagentClient) Detect() string {
	return c.DetectWithContext(context.Background())
}

// DetectWithContext tries common in-cluster kagent service URLs with context
// support for cancellation and timeouts (#5566).
func (c *KagentClient) DetectWithContext(ctx context.Context) string {
	candidates := buildDetectCandidates()
	for _, url := range candidates {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url+"/health", nil)
		if err != nil {
			continue
		}
		resp, err := c.httpClient.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 400 {
				return url
			}
		}
	}
	return ""
}
