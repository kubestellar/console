package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
)

const (
	predictionInitialDelay = 30 * time.Second
	predictionTimeout      = 60 * time.Second

	// perClusterDataTimeout bounds each goroutine's data-gathering work
	// (pod issues + GPU nodes + offline nodes) for a single cluster.
	perClusterDataTimeout = 15 * time.Second
)

// PredictionSettings holds configuration from the frontend
type PredictionSettings struct {
	AIEnabled      bool `json:"aiEnabled"`
	Interval       int  `json:"interval"`       // minutes
	MinConfidence  int  `json:"minConfidence"`  // 0-100
	MaxPredictions int  `json:"maxPredictions"` // max predictions per analysis
	ConsensusMode  bool `json:"consensusMode"`  // use multiple providers
}

// DefaultPredictionSettings returns sensible defaults
func DefaultPredictionSettings() PredictionSettings {
	return PredictionSettings{
		AIEnabled:      true,
		Interval:       10,
		MinConfidence:  60,
		MaxPredictions: 10,
		ConsensusMode:  false,
	}
}

// AIPrediction represents an AI-generated prediction
type AIPrediction struct {
	ID             string `json:"id"`
	Category       string `json:"category"`            // pod-crash, resource-trend, capacity-risk, anomaly
	Severity       string `json:"severity"`            // warning, critical
	Name           string `json:"name"`                // affected resource name
	Cluster        string `json:"cluster"`             // cluster name
	Namespace      string `json:"namespace,omitempty"` // namespace if applicable
	Reason         string `json:"reason"`              // brief summary
	ReasonDetailed string `json:"reasonDetailed"`      // full explanation
	Confidence     int    `json:"confidence"`          // 0-100
	GeneratedAt    string `json:"generatedAt"`         // ISO timestamp
	Provider       string `json:"provider"`            // AI provider name
	Trend          string `json:"trend,omitempty"`     // worsening, improving, stable
}

// AIPredictionsResponse is the HTTP response format
type AIPredictionsResponse struct {
	Predictions  []AIPrediction `json:"predictions"`
	LastAnalyzed string         `json:"lastAnalyzed"`
	Providers    []string       `json:"providers"`
	Stale        bool           `json:"stale"`
}

// AIAnalysisRequest is the request to trigger manual analysis
type AIAnalysisRequest struct {
	Providers []string `json:"providers,omitempty"` // optional: specific providers
}

// PredictionWorker runs AI analysis in the background
type PredictionWorker struct {
	k8sClient   *k8s.MultiClusterClient
	registry    *Registry
	settings    PredictionSettings
	predictions []AIPrediction
	providers   []string
	lastRun     time.Time
	running     atomic.Bool
	mu          sync.RWMutex
	stopCh      chan struct{}
	// stopOnce guards Stop() so that concurrent / repeated calls do not
	// panic on "close of closed channel" — same idempotency pattern as
	// #6478, #6586, #6623 (#6650).
	stopOnce sync.Once
	// ctx is the worker's lifecycle context; cancelled when Stop() is called.
	// All in-flight analysis goroutines derive their context from this so
	// they are cancelled promptly during graceful shutdown (#4720).
	ctx       context.Context
	ctxCancel context.CancelFunc

	// WebSocket broadcast function
	broadcast func(msgType string, payload interface{})

	// Token tracking callback
	trackTokens func(usage *ProviderTokenUsage)
	// loggedClusterError suppresses repeated "no kubeconfig" errors. This is
	// read/written from runAnalysis, which can be invoked concurrently from
	// the ticker goroutine and from on-demand Trigger() callers, so it must
	// be accessed atomically to avoid a data race.
	loggedClusterError atomic.Bool
}

// NewPredictionWorker creates a new prediction worker
func NewPredictionWorker(k8sClient *k8s.MultiClusterClient, registry *Registry, broadcast func(string, interface{}), trackTokens func(*ProviderTokenUsage)) *PredictionWorker {
	ctx, cancel := context.WithCancel(context.Background())
	return &PredictionWorker{
		k8sClient:   k8sClient,
		registry:    registry,
		settings:    DefaultPredictionSettings(),
		predictions: []AIPrediction{},
		providers:   []string{},
		stopCh:      make(chan struct{}),
		ctx:         ctx,
		ctxCancel:   cancel,
		broadcast:   broadcast,
		trackTokens: trackTokens,
	}
}

// Start begins the background analysis loop
func (w *PredictionWorker) Start() {
	safego.GoWith("prediction/run-loop", func() { w.runLoop() })
}

// Stop gracefully shuts down the worker and cancels all in-flight analyses.
// Safe to call multiple times — only the first call closes stopCh and
// cancels the lifecycle context (#6650).
func (w *PredictionWorker) Stop() {
	w.stopOnce.Do(func() {
		w.ctxCancel()
		close(w.stopCh)
	})
}

// UpdateSettings updates the worker settings
func (w *PredictionWorker) UpdateSettings(settings PredictionSettings) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.settings = settings
	slog.Info("[PredictionWorker] settings updated", "interval", settings.Interval, "minConfidence", settings.MinConfidence, "aiEnabled", settings.AIEnabled)
}

// GetSettings returns current settings
func (w *PredictionWorker) GetSettings() PredictionSettings {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.settings
}

// GetPredictions returns current predictions
func (w *PredictionWorker) GetPredictions() AIPredictionsResponse {
	w.mu.RLock()
	defer w.mu.RUnlock()

	// Check if stale (more than 2x interval since last run)
	stale := false
	if !w.lastRun.IsZero() {
		maxAge := time.Duration(w.settings.Interval*2) * time.Minute
		stale = time.Since(w.lastRun) > maxAge
	} else {
		stale = true // Never run
	}

	lastAnalyzed := ""
	if !w.lastRun.IsZero() {
		lastAnalyzed = w.lastRun.Format(time.RFC3339)
	}

	return AIPredictionsResponse{
		Predictions:  w.predictions,
		LastAnalyzed: lastAnalyzed,
		Providers:    w.providers,
		Stale:        stale,
	}
}

// TriggerAnalysis manually triggers an analysis.
//
// #6673 — Panic safety. Previously if runAnalysis panicked (parser bug,
// nil map access in a provider implementation, etc.), the `w.running = false`
// reset would not execute and IsAnalyzing() would return true forever,
// blocking all subsequent TriggerAnalysis calls until process restart.
// Callers polling TriggerAnalysis as a lightweight RPC-style surface hung
// indefinitely. Now we:
//  1. recover the panic so the process survives,
//  2. reset w.running in a defer that is guaranteed to run,
//  3. log the panic with its stack for postmortem.
//
// This is the pragmatic subset of the watchdog pattern called out in the
// issue — a full crash-detection channel for every in-flight worker RPC
// requires a larger refactor. See the doc comment on Stop() for the full
// story around graceful shutdown and ctx propagation.
func (w *PredictionWorker) TriggerAnalysis(providers []string) error {
	// Use atomic compare-and-swap to prevent concurrent runAnalysis
	// executions without an unlocked window (#7002).
	if !w.running.CompareAndSwap(false, true) {
		return fmt.Errorf("analysis already in progress")
	}

	safego.GoWith("prediction-analysis", func() {
		defer w.running.Store(false)
		w.runAnalysis(providers)
	})

	return nil
}

// IsAnalyzing returns whether analysis is currently running
func (w *PredictionWorker) IsAnalyzing() bool {
	return w.running.Load()
}

// runLoop is the main background loop.
//
// #6682 — The initial delay was a plain time.Sleep, which is uninterruptible.
// A Stop() call arriving during the first 30 seconds of process startup used
// to block graceful shutdown for the full predictionInitialDelay. Now we wait
// on a time.After channel vs. ctx.Done so Stop() cancels promptly.
//
// #6685 — The interval wait previously used `time.After(interval)` inside
// the for-loop. time.After allocates a fresh timer on every iteration and
// leaks the underlying goroutine + channel if the select returns via a
// different case before the timer fires — benign for small intervals, but
// with PredictionSettings.Interval defaulting to 10 minutes this adds up
// under rapid stop/start or settings-change churn. We now allocate a single
// *time.Timer up front and Reset() it each iteration.
func (w *PredictionWorker) runLoop() {
	// Initial analysis after short delay. The previous implementation used
	// a bare time.Sleep(predictionInitialDelay), which blocked shutdown for
	// up to predictionInitialDelay if Stop() was called during startup —
	// the shutdown signal was invisible until the sleep returned (#6652/#6682).
	// Use a *time.Timer (not time.After) so it can be drained on early return,
	// and select on stopCh + ctx.Done so shutdown is responsive during the
	// startup delay window.
	initialTimer := time.NewTimer(predictionInitialDelay)
	select {
	case <-initialTimer.C:
	case <-w.stopCh:
		initialTimer.Stop()
		slog.Info("[PredictionWorker] Stopping before initial delay")
		return
	case <-w.ctx.Done():
		initialTimer.Stop()
		slog.Info("[PredictionWorker] Context cancelled before initial delay")
		return
	}

	// Single reusable timer for the interval wait (#6685).
	intervalTimer := time.NewTimer(0)
	if !intervalTimer.Stop() {
		<-intervalTimer.C // drain the zero-duration firing before Reset
	}
	defer intervalTimer.Stop()

	for {
		w.mu.RLock()
		settings := w.settings
		w.mu.RUnlock()

		if settings.AIEnabled {
			// Use atomic CAS to prevent concurrent runAnalysis (#7002).
			if w.running.CompareAndSwap(false, true) {
				// #6673 — recover from panics in runAnalysis so the
				// periodic loop survives a single bad run. Without this,
				// a panic in any provider parser would permanently kill
				// the worker goroutine but leave the struct pointer
				// alive, silently stopping all predictions.
				func() {
					defer func() {
						if r := recover(); r != nil {
							slog.Error("[PredictionWorker] panic in runLoop runAnalysis; recovered",
								"panic", r)
						}
					}()
					w.runAnalysis(nil)
				}()
				w.running.Store(false)
			}
		}

		// Wait for next interval or stop signal using the reused timer.
		// Guard against zero/negative interval to prevent busy-loop DoS (#9620).
		intervalMinutes := settings.Interval
		if intervalMinutes < 1 {
			intervalMinutes = 10
		}
		interval := time.Duration(intervalMinutes) * time.Minute
		intervalTimer.Reset(interval)
		select {
		case <-intervalTimer.C:
			continue
		case <-w.stopCh:
			if !intervalTimer.Stop() {
				// Drain the channel if the timer already fired to keep
				// the next potential Reset() race-free.
				select {
				case <-intervalTimer.C:
				default:
				}
			}
			slog.Info("[PredictionWorker] Stopping")
			return
		case <-w.ctx.Done():
			// Handle context cancellation during interval wait, mirroring
			// the initial-delay select (#6998).
			if !intervalTimer.Stop() {
				select {
				case <-intervalTimer.C:
				default:
				}
			}
			slog.Info("[PredictionWorker] Context cancelled during interval wait")
			return
		}
	}
}

// runAnalysis performs the AI analysis
func (w *PredictionWorker) runAnalysis(specificProviders []string) {
	slog.Info("[PredictionWorker] Starting AI prediction analysis")

	// Gather cluster data — derive from the worker's lifecycle context so that
	// in-flight analysis is cancelled promptly during graceful shutdown (#4720).
	ctx, cancel := context.WithTimeout(w.ctx, predictionTimeout)
	defer cancel()

	clusterData, err := w.gatherClusterData(ctx)
	if err != nil {
		// CompareAndSwap returns true exactly once (first false->true flip),
		// so the slog.Info fires at most once across concurrent callers.
		if w.loggedClusterError.CompareAndSwap(false, true) {
			slog.Info("[PredictionWorker] cluster data unavailable (will retry silently)", "error", err)
		}
		return
	}

	// Build prompt
	prompt := w.buildAnalysisPrompt(clusterData)

	// Get providers to use
	providers := specificProviders
	if len(providers) == 0 {
		providers = w.getAvailableProviders()
	}

	if len(providers) == 0 {
		slog.Info("[PredictionWorker] No AI providers available")
		return
	}

	// Run analysis on each provider
	allPredictions := make(map[string][]AIPrediction)
	usedProviders := []string{}

	w.mu.RLock()
	consensusMode := w.settings.ConsensusMode
	minConfidence := w.settings.MinConfidence
	maxPredictions := w.settings.MaxPredictions
	w.mu.RUnlock()

	for _, providerName := range providers {
		provider, err := w.registry.Get(providerName)
		if err != nil || !provider.IsAvailable() {
			continue
		}

		predictions, err := w.analyzeWithProvider(ctx, provider, prompt)
		if err != nil {
			slog.Error("[PredictionWorker] provider error", "provider", providerName, "error", err)
			continue
		}

		allPredictions[providerName] = predictions
		usedProviders = append(usedProviders, providerName)

		// If not in consensus mode, use first successful provider
		if !consensusMode {
			break
		}
	}

	// Merge predictions
	merged := w.mergePredictions(allPredictions, consensusMode)

	// Filter by confidence and limit
	filtered := []AIPrediction{}
	for _, p := range merged {
		if p.Confidence >= minConfidence {
			filtered = append(filtered, p)
		}
		if len(filtered) >= maxPredictions {
			break
		}
	}

	// Update state
	w.mu.Lock()
	w.predictions = filtered
	w.providers = usedProviders
	w.lastRun = time.Now()
	w.mu.Unlock()

	slog.Info("[PredictionWorker] analysis complete", "predictions", len(filtered), "providers", usedProviders)

	// Broadcast to WebSocket clients
	if w.broadcast != nil {
		w.broadcast("ai_predictions_updated", map[string]interface{}{
			"predictions": filtered,
			"timestamp":   time.Now().Format(time.RFC3339),
			"providers":   usedProviders,
		})
	}
}

// ClusterAnalysisData holds data for AI analysis
type ClusterAnalysisData struct {
	Clusters     []ClusterSummary  `json:"clusters"`
	PodIssues    []PodIssueSummary `json:"podIssues"`
	GPUNodes     []GPUNodeSummary  `json:"gpuNodes"`
	OfflineNodes []NodeSummary     `json:"offlineNodes"`
	Timestamp    string            `json:"timestamp"`
}

// ClusterSummary is a simplified cluster view for AI
type ClusterSummary struct {
	Name       string  `json:"name"`
	CPUPercent float64 `json:"cpuPercent"`
	MemPercent float64 `json:"memPercent"`
	NodeCount  int     `json:"nodeCount"`
	Healthy    bool    `json:"healthy"`
}

// PodIssueSummary is a simplified pod issue for AI
type PodIssueSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Restarts  int    `json:"restarts"`
	Status    string `json:"status"`
	Age       string `json:"age"`
}

// GPUNodeSummary is a simplified GPU node for AI
type GPUNodeSummary struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	Allocated int    `json:"allocated"`
	Total     int    `json:"total"`
}

// NodeSummary is a simplified node for AI
type NodeSummary struct {
	Name    string `json:"name"`
	Cluster string `json:"cluster"`
	Status  string `json:"status"`
}

func (w *PredictionWorker) gatherClusterData(ctx context.Context) (*ClusterAnalysisData, error) {
	if w.k8sClient == nil {
		return nil, fmt.Errorf("k8s client not initialized")
	}

	data := &ClusterAnalysisData{
		Timestamp: time.Now().Format(time.RFC3339),
	}

	// Get all cluster health
	healthList, err := w.k8sClient.GetAllClusterHealth(ctx)
	if err != nil {
		// Already logged by runAnalysis caller
		return nil, err
	} else {
		for _, h := range healthList {
			cpuPercent := 0.0
			if h.CpuCores > 0 && h.CpuRequestsCores > 0 {
				cpuPercent = (h.CpuRequestsCores / float64(h.CpuCores)) * 100
			}
			memPercent := 0.0
			if h.MemoryGB > 0 && h.MemoryRequestsGB > 0 {
				memPercent = (h.MemoryRequestsGB / h.MemoryGB) * 100
			}
			data.Clusters = append(data.Clusters, ClusterSummary{
				Name:       h.Cluster,
				CPUPercent: cpuPercent,
				MemPercent: memPercent,
				NodeCount:  h.NodeCount,
				Healthy:    h.Healthy,
			})
		}
	}

	// Build set of healthy clusters to skip offline ones (avoids timeouts)
	healthyClusterSet := make(map[string]bool)
	for _, c := range data.Clusters {
		if c.Healthy {
			healthyClusterSet[c.Name] = true
		}
	}

	// Gather pod issues, GPU nodes, and offline nodes in parallel across
	// healthy clusters. Uses DeduplicatedClusters to avoid querying the same
	// physical cluster twice when multiple kubeconfig contexts exist.
	clusters, err := w.k8sClient.DeduplicatedClusters(ctx)
	if err != nil {
		slog.Error("[PredictionWorker] error listing clusters", "error", err)
	} else {
		podIssues := make([]PodIssueSummary, 0)
		gpuNodes := make([]GPUNodeSummary, 0)
		offlineNodes := make([]NodeSummary, 0)

		var wg sync.WaitGroup
		var mu sync.Mutex

		for _, cluster := range clusters {
			if !healthyClusterSet[cluster.Name] {
				slog.Info("[PredictionWorker] skipping offline cluster", "cluster", cluster.Name)
				continue
			}
			cl := cluster
			wg.Add(1)
			safego.GoWith("prediction-worker/"+cl.Name, func() {
				defer wg.Done()

				// Check parent context before starting work
				select {
				case <-ctx.Done():
					return
				default:
				}

				clusterCtx, cancel := context.WithTimeout(ctx, perClusterDataTimeout)
				defer cancel()

				// --- Pod issues ---
				pods, podErr := w.k8sClient.FindPodIssues(clusterCtx, cl.Context, "")
				if podErr != nil {
					slog.Error("[PredictionWorker] error getting pod issues", "cluster", cl.Name, "error", podErr)
				} else {
					localPods := make([]PodIssueSummary, 0, len(pods))
					for _, p := range pods {
						localPods = append(localPods, PodIssueSummary{
							Name:      p.Name,
							Namespace: p.Namespace,
							Cluster:   cl.Name,
							Restarts:  p.Restarts,
							Status:    p.Status,
						})
					}
					mu.Lock()
					podIssues = append(podIssues, localPods...)
					mu.Unlock()
				}

				// --- GPU nodes ---
				gpus, gpuErr := w.k8sClient.GetGPUNodes(clusterCtx, cl.Context)
				if gpuErr != nil {
					slog.Error("[PredictionWorker] error getting GPU nodes", "cluster", cl.Name, "error", gpuErr)
				} else {
					localGPU := make([]GPUNodeSummary, 0, len(gpus))
					for _, g := range gpus {
						localGPU = append(localGPU, GPUNodeSummary{
							Name:      g.Name,
							Cluster:   g.Cluster,
							Allocated: g.GPUAllocated,
							Total:     g.GPUCount,
						})
					}
					mu.Lock()
					gpuNodes = append(gpuNodes, localGPU...)
					mu.Unlock()
				}

				// --- Offline / unhealthy nodes ---
				nodes, nodeErr := w.k8sClient.GetNodes(clusterCtx, cl.Context)
				if nodeErr != nil {
					slog.Error("[PredictionWorker] error getting nodes", "cluster", cl.Name, "error", nodeErr)
				} else {
					localOffline := make([]NodeSummary, 0)
					for _, n := range nodes {
						if n.Status != "Ready" || n.Unschedulable {
							status := n.Status
							if n.Unschedulable {
								status = "Cordoned"
							}
							localOffline = append(localOffline, NodeSummary{
								Name:    n.Name,
								Cluster: cl.Name,
								Status:  status,
							})
						}
					}
					if len(localOffline) > 0 {
						mu.Lock()
						offlineNodes = append(offlineNodes, localOffline...)
						mu.Unlock()
					}
				}
			})
		}
		wg.Wait()

		data.PodIssues = podIssues
		data.GPUNodes = gpuNodes
		data.OfflineNodes = offlineNodes
	}

	return data, nil
}

func (w *PredictionWorker) buildAnalysisPrompt(data *ClusterAnalysisData) string {
	// Filter to only include healthy clusters
	filteredData := &ClusterAnalysisData{Timestamp: data.Timestamp}
	for _, c := range data.Clusters {
		if c.Healthy {
			filteredData.Clusters = append(filteredData.Clusters, c)
		}
	}
	filteredData.PodIssues = data.PodIssues
	filteredData.GPUNodes = data.GPUNodes
	filteredData.OfflineNodes = data.OfflineNodes

	dataJSON, err := json.MarshalIndent(filteredData, "", "  ")
	if err != nil {
		slog.Error("[PredictionWorker] failed to marshal filtered data", "error", err)
		return ""
	}

	return fmt.Sprintf(`You are a Kubernetes cluster health analyzer. Analyze the provided metrics for HEALTHY clusters and predict potential failures BEFORE they occur.

IMPORTANT: Only analyze healthy clusters. Do NOT report on offline clusters - that's already known.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "predictions": [
    {
      "category": "pod-crash" | "resource-trend" | "capacity-risk" | "anomaly",
      "severity": "warning" | "critical",
      "name": "affected-resource-name",
      "cluster": "cluster-name",
      "namespace": "namespace-name-if-applicable",
      "reason": "Brief 1-line summary (max 80 chars)",
      "reasonDetailed": "Full explanation with context, metrics observed, and recommended actions",
      "confidence": 60-100
    }
  ]
}

Focus on predicting FUTURE problems in healthy clusters:
1. Pods with restart patterns suggesting imminent crash (3+ restarts)
2. Resource utilization trending toward dangerous levels (>80%% CPU or >85%% memory)
3. GPU nodes nearing full allocation (no headroom for failover)
4. Pods in warning states (Evicted, OOMKilled, CrashLoopBackOff)
5. Nodes with conditions suggesting impending failure

If there are no concerning patterns, return {"predictions": []} - don't invent issues.
Only include predictions with confidence >= 60.

Current healthy cluster data:
%s`, string(dataJSON))
}

func (w *PredictionWorker) getAvailableProviders() []string {
	providers := []string{}
	// Include local CLI providers (claude-code, bob) and API providers
	for _, name := range []string{"claude-code", "bob", "claude", "openai", "gemini", "ollama"} {
		if provider, err := w.registry.Get(name); err == nil && provider.IsAvailable() {
			providers = append(providers, name)
		}
	}
	return providers
}

func (w *PredictionWorker) analyzeWithProvider(ctx context.Context, provider AIProvider, prompt string) ([]AIPrediction, error) {
	// Use the provider's chat interface
	req := &ChatRequest{
		SessionID: fmt.Sprintf("prediction-%d", time.Now().Unix()),
		Prompt:    prompt,
	}

	resp, err := provider.Chat(ctx, req)
	if err != nil {
		return nil, err
	}
	if resp == nil {
		return nil, fmt.Errorf("provider %s returned nil response", provider.Name())
	}

	// Track token usage for navbar counter
	if w.trackTokens != nil && resp.TokenUsage != nil {
		w.trackTokens(resp.TokenUsage)
	}

	// Parse response
	return w.parseAIPredictions(resp.Content, provider.Name())
}

func (w *PredictionWorker) parseAIPredictions(response string, providerName string) ([]AIPrediction, error) {
	// Find the start of the JSON object, skipping any markdown fences or preamble.
	jsonStart := strings.Index(response, "{")
	if jsonStart == -1 {
		return nil, fmt.Errorf("failed to parse AI response: no JSON object found")
	}

	var result struct {
		Predictions []struct {
			Category       string `json:"category"`
			Severity       string `json:"severity"`
			Name           string `json:"name"`
			Cluster        string `json:"cluster"`
			Namespace      string `json:"namespace"`
			Reason         string `json:"reason"`
			ReasonDetailed string `json:"reasonDetailed"`
			Confidence     int    `json:"confidence"`
		} `json:"predictions"`
	}

	// Use json.Decoder which naturally ignores trailing non-JSON text.
	dec := json.NewDecoder(strings.NewReader(response[jsonStart:]))
	if err := dec.Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %w", err)
	}

	predictions := make([]AIPrediction, 0, len(result.Predictions))
	for _, p := range result.Predictions {
		predictions = append(predictions, AIPrediction{
			ID:             uuid.New().String(),
			Category:       p.Category,
			Severity:       p.Severity,
			Name:           p.Name,
			Cluster:        p.Cluster,
			Namespace:      p.Namespace,
			Reason:         p.Reason,
			ReasonDetailed: p.ReasonDetailed,
			Confidence:     p.Confidence,
			GeneratedAt:    time.Now().Format(time.RFC3339),
			Provider:       providerName,
		})
	}

	return predictions, nil
}

func (w *PredictionWorker) mergePredictions(byProvider map[string][]AIPrediction, consensusMode bool) []AIPrediction {
	if !consensusMode || len(byProvider) <= 1 {
		// Just use first provider's predictions
		for _, predictions := range byProvider {
			return predictions
		}
		return []AIPrediction{}
	}

	// Merge predictions, boost confidence when multiple providers agree
	merged := make(map[string]AIPrediction)

	for providerName, predictions := range byProvider {
		for _, p := range predictions {
			key := fmt.Sprintf("%s-%s-%s", p.Category, p.Name, p.Cluster)

			if existing, ok := merged[key]; ok {
				// Multiple providers found same issue - boost confidence
				avgConfidence := (existing.Confidence + p.Confidence) / 2
				boosted := avgConfidence + 10 // Consensus bonus
				if boosted > 100 {
					boosted = 100
				}
				existing.Confidence = boosted
				existing.Provider = existing.Provider + "," + providerName
				merged[key] = existing
			} else {
				merged[key] = p
			}
		}
	}

	// Convert to slice and sort by confidence
	result := make([]AIPrediction, 0, len(merged))
	for _, p := range merged {
		result = append(result, p)
	}

	// Sort by severity (critical first), then confidence
	for i := 0; i < len(result)-1; i++ {
		for j := i + 1; j < len(result); j++ {
			swap := false
			if result[i].Severity == "warning" && result[j].Severity == "critical" {
				swap = true
			} else if result[i].Severity == result[j].Severity && result[i].Confidence < result[j].Confidence {
				swap = true
			}
			if swap {
				result[i], result[j] = result[j], result[i]
			}
		}
	}

	return result
}

// BroadcastToClients sends a message to all connected WebSocket clients.
// Uses per-client write mutexes to prevent gorilla/websocket panics from
// concurrent writes without holding a global lock during I/O. A slow or
// dead client no longer blocks broadcasts to other clients.
// Dead connections are removed so they don't leak file descriptors.
func (s *Server) BroadcastToClients(msgType string, payload interface{}) {
	message := map[string]interface{}{
		"type":    msgType,
		"payload": payload,
	}

	data, err := json.Marshal(message)
	if err != nil {
		slog.Error("[Server] error marshaling broadcast message", "error", err)
		return
	}

	// Snapshot current clients under read lock — no I/O while holding this.
	s.clientsMux.RLock()
	type clientEntry struct {
		conn *websocket.Conn
		wsc  *wsClient
	}
	clients := make([]clientEntry, 0, len(s.clients))
	for conn, wsc := range s.clients {
		clients = append(clients, clientEntry{conn: conn, wsc: wsc})
	}
	s.clientsMux.RUnlock()

	// Write to each client using its per-connection mutex + deadline.
	// A slow client only blocks its own write, not other clients.
	var dead []*websocket.Conn
	for _, c := range clients {
		c.wsc.writeMu.Lock()
		deadConn := false
		if err := setWSWriteDeadline(c.conn, "[Server] failed to set WebSocket write deadline during broadcast"); err != nil {
			deadConn = true
		} else {
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				slog.Error("[Server] error broadcasting to client", "client", c.conn.RemoteAddr(), "error", err)
				deadConn = true
			}
			if err := clearWSWriteDeadline(c.conn, "[Server] failed to clear WebSocket write deadline during broadcast"); err != nil {
				deadConn = true
			}
		}
		if deadConn {
			dead = append(dead, c.conn)
		}
		c.wsc.writeMu.Unlock()
	}

	// Remove dead clients so they don't accumulate
	if len(dead) > 0 {
		s.clientsMux.Lock()
		for _, conn := range dead {
			delete(s.clients, conn)
			conn.Close()
		}
		s.clientsMux.Unlock()
		slog.Info("[Server] removed dead clients during broadcast", "count", len(dead))
	}
}
