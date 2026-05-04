package kagenti_provider

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"os"
	"strings"
	"time"
)

// drainAndClose fully drains and closes an HTTP response body.
// Draining before close allows the underlying TCP connection to be reused.
func drainAndClose(body io.ReadCloser) {
	if body != nil {
		io.Copy(io.Discard, body)
		body.Close()
	}
}

const (
	defaultClientTimeout        = 30 * time.Second
	defaultDetectTimeout        = 3 * time.Second
	defaultKagentiNamespace     = "kagenti-system"
	defaultKagentiServiceName   = "kagenti-backend"
	defaultKagentiServicePort   = "8000"
	legacyKagentiServiceName    = "kagenti-controller"
	legacyKagentiServicePort    = "8083"
	defaultKagentiServiceScheme = "http"
	defaultDirectAgentName      = "kagenti-agent"
	defaultDirectAgentNamespace = "default"
	maxKAgentResponseBytes      = 10 * 1024 * 1024 // 10 MiB
)

var (
	kagentiHealthPaths = []string{"/health", "/healthz", "/api/health"}

	// Keep both legacy and newer list paths for cross-version compatibility.
	kagentiListAgentPaths = []string{"/api/v1/agents", "/api/agents"}

	kagentiDirectCardPaths = []string{"/.well-known/agent-card.json", "/.well-known/agent.json"}

	kagentiDirectStreamPaths = []string{"/api/chat/stream", "/chat/stream", "/stream"}

	// Keep both legacy and newer controller chat paths.
	kagentiControllerStreamPathPatterns = []string{
		"/api/v1/chat/%s/%s/stream",
		"/api/chat/%s/%s/stream",
	}
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
	baseURL              string
	directAgentURL       string
	directAgentName      string
	directAgentNamespace string
	httpClient           *http.Client
}

// NewKagentiClient creates a new KagentiClient with the given base URL.
func NewKagentiClient(baseURL string) *KagentiClient {
	return &KagentiClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: defaultClientTimeout,
		},
	}
}

// NewKagentiClientFromEnv creates a KagentiClient from the KAGENTI_CONTROLLER_URL
// environment variable, falling back to in-cluster auto-detection. Returns nil
// if kagenti is not available.
func NewKagentiClientFromEnv() *KagentiClient {
	if direct := strings.TrimRight(os.Getenv("KAGENTI_AGENT_URL"), "/"); direct != "" {
		return &KagentiClient{
			directAgentURL:       direct,
			directAgentName:      os.Getenv("KAGENTI_AGENT_NAME"),
			directAgentNamespace: os.Getenv("KAGENTI_AGENT_NAMESPACE"),
			httpClient: &http.Client{
				Timeout: defaultClientTimeout,
			},
		}
	}

	url := os.Getenv("KAGENTI_CONTROLLER_URL")
	if url == "" {
		// Try auto-detection with a short timeout client
		c := &KagentiClient{httpClient: &http.Client{Timeout: defaultDetectTimeout}}
		url = c.Detect()
	}
	if url == "" {
		return nil // kagenti not available
	}
	return NewKagentiClient(url)
}

// BaseURL returns the configured controller base URL.
func (c *KagentiClient) BaseURL() string {
	return c.baseURL
}

// DirectAgentURL returns the configured direct agent URL.
func (c *KagentiClient) DirectAgentURL() string {
	return c.directAgentURL
}

// DirectAgentName returns the configured direct agent name (if any).
func (c *KagentiClient) DirectAgentName() string {
	return c.directAgentName
}

// DirectAgentNamespace returns the configured direct agent namespace (if any).
func (c *KagentiClient) DirectAgentNamespace() string {
	return c.directAgentNamespace
}

// Status checks whether the kagenti controller is reachable.
func (c *KagentiClient) Status() (bool, error) {
	return c.StatusWithContext(context.Background())
}

// StatusWithContext checks whether the kagenti controller/agent is reachable.
func (c *KagentiClient) StatusWithContext(ctx context.Context) (bool, error) {
	if c.directAgentURL != "" {
		for _, p := range append(append([]string{}, kagentiDirectCardPaths...), kagentiHealthPaths...) {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.directAgentURL+p, nil)
			if err != nil {
				continue
			}
			resp, err := c.httpClient.Do(req)
			if err != nil {
				continue
			}
			drainAndClose(resp.Body)
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return true, nil
			}
		}
		return false, fmt.Errorf("kagenti direct agent health check failed at %s", c.directAgentURL)
	}

	for _, healthPath := range kagentiHealthPaths {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+healthPath, nil)
		if err != nil {
			continue
		}
		resp, err := c.httpClient.Do(req)
		if err != nil {
			continue
		}
		drainAndClose(resp.Body)
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return true, nil
		}
	}

	return false, fmt.Errorf("kagenti health check failed for all known endpoints at %s", c.baseURL)
}

// ListAgents queries the kagenti controller for registered agents.
func (c *KagentiClient) ListAgents() ([]AgentInfo, error) {
	return c.ListAgentsWithContext(context.Background())
}

// ListAgentsWithContext queries the kagenti controller for registered agents.
func (c *KagentiClient) ListAgentsWithContext(ctx context.Context) ([]AgentInfo, error) {
	if c.directAgentURL != "" {
		name := c.directAgentName
		namespace := c.directAgentNamespace
		if namespace == "" {
			namespace = defaultDirectAgentNamespace
		}

		for _, p := range kagentiDirectCardPaths {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.directAgentURL+p, nil)
			if err != nil {
				continue
			}
			resp, err := c.httpClient.Do(req)
			if err != nil {
				continue
			}
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				var card AgentCard
				if err := json.NewDecoder(resp.Body).Decode(&card); err == nil && card.Name != "" {
					name = card.Name
				}
			}
			drainAndClose(resp.Body)
			if name != "" {
				break
			}
		}

		if name == "" {
			name = defaultDirectAgentName
		}

		return []AgentInfo{{
			Name:        name,
			Namespace:   namespace,
			Description: fmt.Sprintf("Direct Kagenti agent (%s)", c.directAgentURL),
			Framework:   "kagenti",
		}}, nil
	}

	var lastErr error
	for _, path := range kagentiListAgentPaths {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
		if err != nil {
			lastErr = err
			continue
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, maxKAgentResponseBytes))
			drainAndClose(resp.Body)
			lastErr = fmt.Errorf("list agents at %s returned %d: %s", path, resp.StatusCode, string(body))
			continue
		}

		agents, err := decodeAgentList(resp.Body)
		drainAndClose(resp.Body)
		if err != nil {
			lastErr = fmt.Errorf("failed to decode agent list at %s: %w", path, err)
			continue
		}

		return agents, nil
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("failed to list kagenti agents: no reachable list endpoint")
	}

	return nil, lastErr
}

func decodeAgentList(body io.Reader) ([]AgentInfo, error) {
	raw, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}

	var wrapped struct {
		Items []AgentInfo `json:"items"`
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil && wrapped.Items != nil {
		return wrapped.Items, nil
	}

	var direct []AgentInfo
	if err := json.Unmarshal(raw, &direct); err == nil {
		return direct, nil
	}

	return nil, fmt.Errorf("unsupported list response shape")
}

// Discover fetches the A2A agent card for the given agent.
func (c *KagentiClient) Discover(namespace, agentName string) (*AgentCard, error) {
	url := fmt.Sprintf("%s/api/a2a/%s/%s/.well-known/agent.json",
		c.baseURL, neturl.PathEscape(namespace), neturl.PathEscape(agentName))
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to discover agent %s/%s: %w", namespace, agentName, err)
	}
	defer drainAndClose(resp.Body)

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, maxKAgentResponseBytes))
		return nil, fmt.Errorf("discover agent %s/%s returned %d: %s", namespace, agentName, resp.StatusCode, string(body))
	}

	var card AgentCard
	if err := json.NewDecoder(resp.Body).Decode(&card); err != nil {
		return nil, fmt.Errorf("failed to decode agent card: %w", err)
	}
	return &card, nil
}

// HistoryMessage represents a single message in conversation history passed to Invoke.
type HistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Invoke sends a message to an agent via the A2A protocol and returns the raw
// response body for streaming consumption. The history parameter provides
// conversation context so the agent can process follow-up messages correctly.
func (c *KagentiClient) Invoke(ctx context.Context, namespace, agentName, message string, contextID string, history []HistoryMessage) (io.ReadCloser, error) {
	if c.directAgentURL != "" {
		payload := map[string]any{"message": message}
		if contextID != "" {
			payload["session_id"] = contextID
		}
		if len(history) > 0 {
			payload["history"] = history
		}

		body, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal direct invoke payload: %w", err)
		}

		urls := c.directStreamURLs()

		var lastErr error
		for _, u := range urls {
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(string(body)))
			if err != nil {
				lastErr = err
				continue
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "text/event-stream")

			resp, err := c.httpClient.Do(req)
			if err != nil {
				lastErr = err
				continue
			}

			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return resp.Body, nil
			}

			errBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxKAgentResponseBytes))
			drainAndClose(resp.Body)
			lastErr = fmt.Errorf("direct invoke returned %d: %s", resp.StatusCode, string(errBody))
		}

		if lastErr == nil {
			lastErr = fmt.Errorf("direct invoke failed: no reachable streaming endpoint")
		}
		return nil, lastErr
	}

	// Kagenti backend uses REST+SSE; keep both known controller paths.
	type restPayload struct {
		Message   string           `json:"message"`
		SessionID string           `json:"session_id,omitempty"`
		History   []HistoryMessage `json:"history,omitempty"`
	}
	rp := restPayload{Message: message, SessionID: contextID, History: history}
	payload, err := json.Marshal(rp)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal kagenti request: %w", err)
	}

	urls := c.controllerStreamURLs(namespace, agentName)

	var lastErr error
	for _, url := range urls {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(payload)))
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")

		// Reuse configured client settings (transport/TLS/proxy) and disable timeout
		// so long-running streams are controlled by ctx cancellation.
		httpClient := c.httpClient
		if httpClient == nil {
			httpClient = &http.Client{Timeout: 10 * time.Second}
		} else {
			clone := *httpClient
			clone.Timeout = 0
			httpClient = &clone
		}

		resp, err := httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("kagenti invoke failed at %s: %w", url, err)
			continue
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return resp.Body, nil
		}

		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxKAgentResponseBytes))
		drainAndClose(resp.Body)
		lastErr = fmt.Errorf("kagenti invoke at %s returned %d: %s", url, resp.StatusCode, string(errBody))
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("kagenti invoke failed: no reachable stream endpoint")
	}

	return nil, lastErr
}

// BuildDetectCandidatesFromEnv constructs the list of candidate URLs for kagenti auto-detection.
// The namespace, service name, port, and protocol are configurable via environment
// variables so non-standard deployments can be discovered automatically.
func BuildDetectCandidatesFromEnv() []string {
	namespace := os.Getenv("KAGENTI_NAMESPACE")
	if namespace == "" {
		namespace = defaultKagentiNamespace
	}
	serviceName := os.Getenv("KAGENTI_SERVICE_NAME")
	if serviceName == "" {
		serviceName = defaultKagentiServiceName
	}
	port := os.Getenv("KAGENTI_SERVICE_PORT")
	if port == "" {
		port = defaultKagentiServicePort
	}
	protocol := os.Getenv("KAGENTI_SERVICE_PROTOCOL")
	if protocol == "" {
		protocol = defaultKagentiServiceScheme
	}

	configured := []string{
		fmt.Sprintf("%s://%s.%s.svc:%s", protocol, serviceName, namespace, port),
		fmt.Sprintf("%s://%s.%s.svc.cluster.local:%s", protocol, serviceName, namespace, port),
	}

	legacy := []string{
		fmt.Sprintf("%s://%s.%s.svc:%s", defaultKagentiServiceScheme, legacyKagentiServiceName, defaultKagentiNamespace, legacyKagentiServicePort),
		fmt.Sprintf("%s://%s.%s.svc.cluster.local:%s", defaultKagentiServiceScheme, legacyKagentiServiceName, defaultKagentiNamespace, legacyKagentiServicePort),
		fmt.Sprintf("%s://%s.%s.svc:%s", defaultKagentiServiceScheme, defaultKagentiServiceName, defaultKagentiNamespace, defaultKagentiServicePort),
		fmt.Sprintf("%s://%s.%s.svc.cluster.local:%s", defaultKagentiServiceScheme, defaultKagentiServiceName, defaultKagentiNamespace, defaultKagentiServicePort),
	}

	seen := make(map[string]struct{}, len(configured)+len(legacy))
	all := make([]string, 0, len(configured)+len(legacy))
	for _, c := range append(configured, legacy...) {
		if _, ok := seen[c]; ok {
			continue
		}
		seen[c] = struct{}{}
		all = append(all, c)
	}

	return all
}

// Detect tries common in-cluster kagenti service URLs and returns the first reachable one.
func (c *KagentiClient) Detect() string {
	return c.DetectWithContext(context.Background())
}

// DetectWithContext tries common in-cluster kagenti service URLs with context support (#5566).
func (c *KagentiClient) DetectWithContext(ctx context.Context) string {
	candidates := BuildDetectCandidatesFromEnv()
	for _, url := range candidates {
		base := strings.TrimRight(url, "/")
		for _, path := range kagentiHealthPaths {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
			if err != nil {
				continue
			}
			resp, err := c.httpClient.Do(req)
			if err != nil {
				continue
			}
			drainAndClose(resp.Body)
			if resp.StatusCode >= 200 && resp.StatusCode < 400 {
				return base
			}
		}
	}
	return ""
}

func (c *KagentiClient) directStreamURLs() []string {
	base := strings.TrimRight(c.directAgentURL, "/")
	urls := make([]string, 0, len(kagentiDirectStreamPaths))
	for _, path := range kagentiDirectStreamPaths {
		urls = append(urls, base+path)
	}
	return urls
}

func (c *KagentiClient) controllerStreamURLs(namespace, agentName string) []string {
	escapedNamespace := neturl.PathEscape(namespace)
	escapedAgentName := neturl.PathEscape(agentName)
	urls := make([]string, 0, len(kagentiControllerStreamPathPatterns))
	for _, pattern := range kagentiControllerStreamPathPatterns {
		urls = append(urls, fmt.Sprintf("%s"+pattern, c.baseURL, escapedNamespace, escapedAgentName))
	}
	return urls
}
