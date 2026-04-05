package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// InsightEnrichmentCacheTTL is how long enrichments are cached before re-requesting
const InsightEnrichmentCacheTTL = 5 * time.Minute

// InsightEnrichmentTimeout is the max time for an enrichment request to the AI provider
const InsightEnrichmentTimeout = 30 * time.Second

// InsightEnrichmentRequest is the payload from the frontend
type InsightEnrichmentRequest struct {
	Insights []InsightSummary `json:"insights"`
}

// InsightSummary is a lightweight view of a heuristic insight sent for enrichment
type InsightSummary struct {
	ID               string             `json:"id"`
	Category         string             `json:"category"`
	Title            string             `json:"title"`
	Description      string             `json:"description"`
	Severity         string             `json:"severity"`
	AffectedClusters []string           `json:"affectedClusters"`
	Chain            json.RawMessage    `json:"chain,omitempty"`
	Deltas           json.RawMessage    `json:"deltas,omitempty"`
	Metrics          map[string]float64 `json:"metrics,omitempty"`
}

// AIInsightEnrichment is the AI-generated enrichment for a single insight
type AIInsightEnrichment struct {
	InsightID   string `json:"insightId"`
	Description string `json:"description"`
	RootCause   string `json:"rootCause,omitempty"`
	Remediation string `json:"remediation"`
	Confidence  int    `json:"confidence"`
	Provider    string `json:"provider"`
	Severity    string `json:"severity,omitempty"`
}

// InsightEnrichmentResponse is the response to the frontend
type InsightEnrichmentResponse struct {
	Enrichments []AIInsightEnrichment `json:"enrichments"`
	Timestamp   string                `json:"timestamp"`
}

// InsightWorker manages AI enrichment of heuristic insights
type InsightWorker struct {
	mu          sync.RWMutex
	cache       map[string]AIInsightEnrichment
	cacheTime   time.Time
	registry    *Registry
	broadcast   func(msgType string, payload interface{})
	isEnriching bool
}

// NewInsightWorker creates a new InsightWorker
func NewInsightWorker(registry *Registry, broadcast func(msgType string, payload interface{})) *InsightWorker {
	return &InsightWorker{
		cache:     make(map[string]AIInsightEnrichment),
		registry:  registry,
		broadcast: broadcast,
	}
}

// GetEnrichments returns all cached enrichments
func (w *InsightWorker) GetEnrichments() InsightEnrichmentResponse {
	w.mu.RLock()
	defer w.mu.RUnlock()

	enrichments := make([]AIInsightEnrichment, 0, len(w.cache))
	for _, e := range w.cache {
		enrichments = append(enrichments, e)
	}

	return InsightEnrichmentResponse{
		Enrichments: enrichments,
		Timestamp:   w.cacheTime.Format(time.RFC3339),
	}
}

// IsCacheValid checks if the enrichment cache is still fresh
func (w *InsightWorker) IsCacheValid() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return time.Since(w.cacheTime) < InsightEnrichmentCacheTTL && len(w.cache) > 0
}

// Enrich processes insight summaries and returns AI enrichments.
// It first checks the cache, then falls back to AI provider.
func (w *InsightWorker) Enrich(req InsightEnrichmentRequest) (*InsightEnrichmentResponse, error) {
	w.mu.Lock()
	if w.isEnriching {
		w.mu.Unlock()
		// Return cached results while another enrichment is in progress
		resp := w.GetEnrichments()
		return &resp, nil
	}
	w.isEnriching = true
	w.mu.Unlock()

	defer func() {
		w.mu.Lock()
		w.isEnriching = false
		w.mu.Unlock()
	}()

	// Check which insights need enrichment (not already cached)
	w.mu.RLock()
	needsEnrichment := make([]InsightSummary, 0)
	for _, insight := range req.Insights {
		if _, exists := w.cache[insight.ID]; !exists {
			needsEnrichment = append(needsEnrichment, insight)
		}
	}
	w.mu.RUnlock()

	if len(needsEnrichment) == 0 {
		// All insights already enriched
		resp := w.GetEnrichments()
		return &resp, nil
	}

	// Try to get AI enrichments from a connected provider
	enrichments, provider, err := w.callAIProvider(needsEnrichment)
	if err != nil {
		slog.Error("[InsightWorker] AI enrichment failed", "error", err)
		// Fall back to rule-based enrichments
		enrichments = w.generateRuleBasedEnrichments(needsEnrichment)
		provider = "rules"
	}

	// Set provider on all enrichments
	for i := range enrichments {
		if enrichments[i].Provider == "" {
			enrichments[i].Provider = provider
		}
	}

	// Update cache
	w.mu.Lock()
	for _, e := range enrichments {
		w.cache[e.InsightID] = e
	}
	w.cacheTime = time.Now()
	w.mu.Unlock()

	// Broadcast to WebSocket clients
	resp := w.GetEnrichments()
	w.broadcastEnrichments(resp)

	return &resp, nil
}

// providerPriority lists provider names in preference order for insight enrichment
var providerPriority = []string{"claude-code", "bob", "claude", "openai", "gemini", "ollama"}

// callAIProvider sends insights to the AI provider for enrichment
func (w *InsightWorker) callAIProvider(insights []InsightSummary) ([]AIInsightEnrichment, string, error) {
	if w.registry == nil {
		return nil, "", fmt.Errorf("no provider registry available")
	}

	// Build prompt
	prompt := buildInsightEnrichmentPrompt(insights)

	// Try providers in priority order
	ctx, cancel := context.WithTimeout(context.Background(), InsightEnrichmentTimeout)
	defer cancel()

	for _, name := range providerPriority {
		provider, err := w.registry.Get(name)
		if err != nil || !provider.IsAvailable() {
			continue
		}

		req := &ChatRequest{
			SessionID: fmt.Sprintf("insight-enrich-%d", time.Now().Unix()),
			Prompt:    prompt,
		}

		resp, err := provider.Chat(ctx, req)
		if err != nil {
			slog.Error("[InsightWorker] provider failed", "provider", name, "error", err)
			continue
		}
		if resp == nil {
			continue
		}

		enrichments, err := parseEnrichmentResponse(resp.Content, insights)
		if err != nil {
			slog.Error("[InsightWorker] failed to parse response", "provider", name, "error", err)
			continue
		}

		return enrichments, name, nil
	}

	return nil, "", fmt.Errorf("no available AI providers")
}

// buildInsightEnrichmentPrompt creates a structured prompt for the AI
func buildInsightEnrichmentPrompt(insights []InsightSummary) string {
	var b strings.Builder
	b.WriteString("You are a Kubernetes operations expert. Analyze these cross-cluster insights and provide enriched analysis.\n\n")
	b.WriteString("For each insight, provide:\n")
	b.WriteString("1. A clear, actionable description (replace the heuristic description)\n")
	b.WriteString("2. Root cause hypothesis\n")
	b.WriteString("3. Specific remediation steps\n")
	b.WriteString("4. Confidence level (0-100)\n")
	b.WriteString("5. Severity assessment (critical/warning/info)\n\n")
	b.WriteString("Respond in JSON format: {\"enrichments\": [{\"insightId\": \"...\", \"description\": \"...\", \"rootCause\": \"...\", \"remediation\": \"...\", \"confidence\": 85, \"severity\": \"warning\"}]}\n\n")
	b.WriteString("Insights to analyze:\n\n")

	for i, insight := range insights {
		b.WriteString(fmt.Sprintf("--- Insight %d ---\n", i+1))
		b.WriteString(fmt.Sprintf("ID: %s\n", insight.ID))
		b.WriteString(fmt.Sprintf("Category: %s\n", insight.Category))
		b.WriteString(fmt.Sprintf("Title: %s\n", insight.Title))
		b.WriteString(fmt.Sprintf("Description: %s\n", insight.Description))
		b.WriteString(fmt.Sprintf("Severity: %s\n", insight.Severity))
		b.WriteString(fmt.Sprintf("Affected Clusters: %s\n", strings.Join(insight.AffectedClusters, ", ")))
		if len(insight.Metrics) > 0 {
			metricsJSON, err := json.Marshal(insight.Metrics)
			if err != nil {
				slog.Warn("[InsightWorker] failed to marshal metrics, omitting from prompt", "insightID", insight.ID, "error", err)
			} else {
				b.WriteString(fmt.Sprintf("Metrics: %s\n", string(metricsJSON)))
			}
		}
		b.WriteString("\n")
	}

	return b.String()
}

// parseEnrichmentResponse parses the AI provider's JSON response
func parseEnrichmentResponse(response string, insights []InsightSummary) ([]AIInsightEnrichment, error) {
	// Try to extract JSON from the response
	jsonStart := strings.Index(response, "{")
	jsonEnd := strings.LastIndex(response, "}")
	if jsonStart < 0 || jsonEnd < 0 || jsonEnd <= jsonStart {
		return nil, fmt.Errorf("no JSON found in response")
	}

	jsonStr := response[jsonStart : jsonEnd+1]

	var parsed struct {
		Enrichments []AIInsightEnrichment `json:"enrichments"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return nil, fmt.Errorf("JSON parse error: %w", err)
	}

	return parsed.Enrichments, nil
}

// generateRuleBasedEnrichments creates basic enrichments using rules when AI is unavailable
func (w *InsightWorker) generateRuleBasedEnrichments(insights []InsightSummary) []AIInsightEnrichment {
	enrichments := make([]AIInsightEnrichment, 0, len(insights))
	for _, insight := range insights {
		e := AIInsightEnrichment{
			InsightID:  insight.ID,
			Confidence: 60,
			Provider:   "rules",
			Severity:   insight.Severity,
		}

		switch insight.Category {
		case "event-correlation":
			e.Description = fmt.Sprintf("Correlated warning events detected across %d clusters: %s. Events in %s are occurring simultaneously, suggesting a shared underlying cause.",
				len(insight.AffectedClusters), strings.Join(insight.AffectedClusters, ", "), insight.Title)
			e.Remediation = "Investigate shared dependencies (DNS, storage, network) across the affected clusters. Check if a recent change was deployed to all clusters simultaneously."
		case "cascade-impact":
			e.Description = fmt.Sprintf("Cascading failure pattern detected: %s. Issues in one cluster are propagating to others, potentially through shared services or configuration.",
				insight.Title)
			e.Remediation = "Identify the origin cluster and stabilize it first. Check circuit breakers and retry policies in cross-cluster communication."
		case "config-drift":
			e.Description = fmt.Sprintf("Configuration drift detected: %s. Workloads across clusters have diverged from their expected configuration, which can lead to inconsistent behavior.",
				insight.Title)
			e.Remediation = "Use GitOps tools (ArgoCD, Flux) to reconcile configurations. Compare current configs against the source of truth and plan a synchronized rollout."
		case "resource-imbalance":
			e.Description = fmt.Sprintf("Resource utilization imbalance detected across clusters. %s shows significant variation that may indicate scheduling or capacity issues.",
				insight.Title)
			e.Remediation = "Review cluster autoscaler settings and workload placement policies. Consider rebalancing workloads or adjusting resource quotas."
		case "restart-correlation":
			e.Description = fmt.Sprintf("Pod restart pattern detected: %s. The correlation suggests either an application-level bug or an infrastructure issue rather than isolated incidents.",
				insight.Title)
			e.Remediation = "Check pod logs for crash reasons. If the same workload restarts across clusters, investigate application bugs. If different workloads restart in one cluster, investigate node health."
		case "cluster-delta":
			e.Description = fmt.Sprintf("Significant differences detected between clusters: %s. These deltas may indicate inconsistent deployments or configuration drift.",
				insight.Title)
			e.Remediation = "Review deployment pipelines to ensure all clusters receive the same updates. Check for manual changes that bypassed the standard deployment process."
		case "rollout-tracker":
			e.Description = fmt.Sprintf("Deployment rollout in progress: %s. Tracking progress across clusters to detect stuck or failed rollouts.",
				insight.Title)
			e.Remediation = "Monitor rollout progress. If any cluster is stuck, check pod events and resource availability. Consider pausing the rollout if failures are detected."
		default:
			e.Description = insight.Description
			e.Remediation = "Review the affected resources and clusters for potential issues."
		}

		enrichments = append(enrichments, e)
	}
	return enrichments
}

// broadcastEnrichments sends enrichments to all WebSocket clients
func (w *InsightWorker) broadcastEnrichments(resp InsightEnrichmentResponse) {
	if w.broadcast == nil {
		return
	}

	w.broadcast("insights_enriched", resp)
}
