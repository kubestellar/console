package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"
)

// InsightEnrichmentCacheTTL is how long individual enrichments are cached
// before being considered stale and re-requested (#7270).
const InsightEnrichmentCacheTTL = 5 * time.Minute

// InsightEnrichmentTimeout is the max time for an enrichment request to the AI provider
const InsightEnrichmentTimeout = 30 * time.Second

// insightCacheMaxEntries caps the insight cache to prevent unbounded memory
// growth from churning insight IDs (e.g. rolling pod names) (#7269).
const insightCacheMaxEntries = 500

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

// insightCacheEntry wraps an enrichment with a per-entry timestamp
// so stale entries can be individually refreshed (#7270).
type insightCacheEntry struct {
	enrichment AIInsightEnrichment
	cachedAt   time.Time
}

// InsightWorker manages AI enrichment of heuristic insights
type InsightWorker struct {
	mu          sync.RWMutex
	cache       map[string]insightCacheEntry
	cacheTime   time.Time
	registry    *Registry
	broadcast   func(msgType string, payload interface{})
	isEnriching bool

	// shutdownCtx is the worker's lifecycle context, cancelled by Stop()
	// (#6680). All AI provider calls derive their per-request deadline
	// from this ctx rather than context.Background() so in-flight
	// enrichments are cancelled during graceful shutdown.
	shutdownCtx    context.Context
	shutdownCancel context.CancelFunc
}

// NewInsightWorker creates a new InsightWorker
func NewInsightWorker(registry *Registry, broadcast func(msgType string, payload interface{})) *InsightWorker {
	ctx, cancel := context.WithCancel(context.Background())
	return &InsightWorker{
		cache:          make(map[string]insightCacheEntry),
		registry:       registry,
		broadcast:      broadcast,
		shutdownCtx:    ctx,
		shutdownCancel: cancel,
	}
}

// Stop cancels the worker's shutdown context so in-flight AI provider
// calls from callAIProvider return promptly (#6680). Safe to call
// multiple times because context.CancelFunc is idempotent.
func (w *InsightWorker) Stop() {
	if w.shutdownCancel != nil {
		w.shutdownCancel()
	}
}

// GetEnrichments returns all cached enrichments
func (w *InsightWorker) GetEnrichments() InsightEnrichmentResponse {
	w.mu.RLock()
	defer w.mu.RUnlock()

	enrichments := make([]AIInsightEnrichment, 0, len(w.cache))
	for _, entry := range w.cache {
		enrichments = append(enrichments, entry.enrichment)
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

	// Check which insights need enrichment (not already cached or stale per-entry TTL #7270)
	now := time.Now()
	w.mu.RLock()
	needsEnrichment := make([]InsightSummary, 0)
	for _, insight := range req.Insights {
		entry, exists := w.cache[insight.ID]
		if !exists || now.Sub(entry.cachedAt) >= InsightEnrichmentCacheTTL {
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

	// Update cache with per-entry timestamps (#7270).
	// Evict oldest entries if the cache exceeds the size cap (#7269).
	cacheNow := time.Now()
	w.mu.Lock()
	for _, e := range enrichments {
		w.cache[e.InsightID] = insightCacheEntry{enrichment: e, cachedAt: cacheNow}
	}
	// Evict entries beyond the size cap — collect all keys, sort by
	// cachedAt ascending, and delete the oldest entries in one pass.
	// This is O(N log N) instead of the previous O(N^2) approach (#9443).
	if len(w.cache) > insightCacheMaxEntries {
		type cacheRef struct {
			key      string
			cachedAt time.Time
		}
		entries := make([]cacheRef, 0, len(w.cache))
		for k, v := range w.cache {
			entries = append(entries, cacheRef{key: k, cachedAt: v.cachedAt})
		}
		sort.Slice(entries, func(i, j int) bool {
			return entries[i].cachedAt.Before(entries[j].cachedAt)
		})
		evictCount := len(w.cache) - insightCacheMaxEntries
		for i := 0; i < evictCount; i++ {
			delete(w.cache, entries[i].key)
		}
	}
	w.cacheTime = cacheNow
	w.mu.Unlock()

	// Broadcast to WebSocket clients
	resp := w.GetEnrichments()
	w.broadcastEnrichments(resp)

	return &resp, nil
}

// defaultProviderPriority is the fallback ordering when no primary agent has
// been selected by the user.  Used by callAIProvider (#9484).
var defaultProviderPriority = []string{"claude-code", "bob", "claude", "openai", "gemini", "ollama"}

// callAIProvider sends insights to the AI provider for enrichment.
// If the user has selected a primary agent (via the registry default), that
// agent is tried first.  If it fails or is unavailable the remaining providers
// in defaultProviderPriority are tried in order (#9484).
func (w *InsightWorker) callAIProvider(insights []InsightSummary) ([]AIInsightEnrichment, string, error) {
	if w.registry == nil {
		return nil, "", fmt.Errorf("no provider registry available")
	}

	// Build prompt
	prompt := buildInsightEnrichmentPrompt(insights)

	// Try providers in priority order. Derive from the worker's shutdown
	// context so graceful shutdown cancels in-flight enrichments (#6680).
	parent := w.shutdownCtx
	if parent == nil {
		// Defensive: older zero-valued InsightWorker (e.g. test fakes)
		// may not have called NewInsightWorker; fall back to Background
		// so we never panic with a nil parent context.
		parent = context.Background()
	}
	ctx, cancel := context.WithTimeout(parent, InsightEnrichmentTimeout)
	defer cancel()

	// Build the effective priority list: if the user selected a primary
	// agent, try it first, then fall back to the default list (skipping
	// duplicates so the primary isn't attempted twice).
	primaryAgent := w.registry.GetDefaultName()
	order := buildProviderOrder(primaryAgent, defaultProviderPriority)

	for _, name := range order {
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

// buildProviderOrder returns a provider ordering that places primaryAgent
// first (if non-empty) followed by the remaining entries from fallback,
// skipping duplicates.
func buildProviderOrder(primaryAgent string, fallback []string) []string {
	if primaryAgent == "" {
		return fallback
	}
	// Pre-size: primary + full fallback list (at most one duplicate removed).
	order := make([]string, 0, len(fallback)+1)
	order = append(order, primaryAgent)
	for _, name := range fallback {
		if name != primaryAgent {
			order = append(order, name)
		}
	}
	return order
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

// parseEnrichmentResponse parses the AI provider's JSON response.
// Uses json.Decoder which tolerates leading/trailing prose text around the
// JSON object, avoiding the fragile outer-brace slicing approach (#7272).
func parseEnrichmentResponse(response string, insights []InsightSummary) ([]AIInsightEnrichment, error) {
	// First try: look for ```json fenced code block
	if start := strings.Index(response, "```json"); start >= 0 {
		after := response[start+len("```json"):]
		if end := strings.Index(after, "```"); end >= 0 {
			response = strings.TrimSpace(after[:end])
		}
	}

	// Find the first '{' and use json.Decoder which stops at the end of
	// the first complete JSON value (ignoring trailing text).
	jsonStart := strings.Index(response, "{")
	if jsonStart < 0 {
		return nil, fmt.Errorf("no JSON found in response")
	}

	var parsed struct {
		Enrichments []AIInsightEnrichment `json:"enrichments"`
	}
	dec := json.NewDecoder(strings.NewReader(response[jsonStart:]))
	if err := dec.Decode(&parsed); err != nil {
		return nil, fmt.Errorf("JSON parse error: %w", err)
	}

	// If the JSON parsed but the expected "enrichments" key was absent, treat
	// it as an error so the caller can fall back to rule-based enrichments (#7208).
	if parsed.Enrichments == nil {
		const previewLen = 200
		preview := response[jsonStart:]
		if len(preview) > previewLen {
			preview = preview[:previewLen] + "..."
		}
		return nil, fmt.Errorf("response JSON lacks 'enrichments' key (preview: %s)", preview)
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
			e.RootCause = "Multiple clusters reporting similar warning events simultaneously — likely shared infrastructure (DNS, storage, network), a synchronized change, or a common upstream dependency."
			e.Remediation = "Investigate shared dependencies (DNS, storage, network) across the affected clusters. Check if a recent change was deployed to all clusters simultaneously."
		case "cascade-impact":
			e.Description = fmt.Sprintf("Cascading failure pattern detected: %s. Issues in one cluster are propagating to others, potentially through shared services or configuration.",
				insight.Title)
			e.RootCause = "Failure originating in one cluster is propagating via shared services or cross-cluster dependencies."
			e.Remediation = "Identify the origin cluster and stabilize it first. Check circuit breakers and retry policies in cross-cluster communication."
		case "config-drift":
			e.Description = fmt.Sprintf("Configuration drift detected: %s. Workloads across clusters have diverged from their expected configuration, which can lead to inconsistent behavior.",
				insight.Title)
			e.RootCause = "Workloads have diverged from the intended configuration — manual changes, partial rollouts, or missing GitOps reconciliation."
			e.Remediation = "Use GitOps tools (ArgoCD, Flux) to reconcile configurations. Compare current configs against the source of truth and plan a synchronized rollout."
		case "resource-imbalance":
			e.Description = fmt.Sprintf("Resource utilization imbalance detected across clusters. %s shows significant variation that may indicate scheduling or capacity issues.",
				insight.Title)
			e.RootCause = "Uneven scheduling or capacity across clusters — likely caused by autoscaler thresholds, node taints, or workload placement constraints."
			e.Remediation = "Review cluster autoscaler settings and workload placement policies. Consider rebalancing workloads or adjusting resource quotas."
		case "restart-correlation":
			e.Description = fmt.Sprintf("Pod restart pattern detected: %s. The correlation suggests either an application-level bug or an infrastructure issue rather than isolated incidents.",
				insight.Title)
			e.RootCause = "Repeated restarts correlated in time — either an application bug triggered by shared input, or a node-level infrastructure issue."
			e.Remediation = "Check pod logs for crash reasons. If the same workload restarts across clusters, investigate application bugs. If different workloads restart in one cluster, investigate node health."
		case "cluster-delta":
			e.Description = fmt.Sprintf("Significant differences detected between clusters: %s. These deltas may indicate inconsistent deployments or configuration drift.",
				insight.Title)
			e.RootCause = "Clusters are out of sync — deployment pipelines or manual operations have introduced divergence."
			e.Remediation = "Review deployment pipelines to ensure all clusters receive the same updates. Check for manual changes that bypassed the standard deployment process."
		case "rollout-tracker":
			e.Description = fmt.Sprintf("Deployment rollout in progress: %s. Tracking progress across clusters to detect stuck or failed rollouts.",
				insight.Title)
			e.RootCause = "A deployment rollout is in progress and has not yet reached steady state across all clusters."
			e.Remediation = "Monitor rollout progress. If any cluster is stuck, check pod events and resource availability. Consider pausing the rollout if failures are detected."
		default:
			e.Description = insight.Description
			e.RootCause = "Rule-based pattern match — AI analysis unavailable, so the specific cause could not be determined."
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
