package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/ai"
	"github.com/kubestellar/console/pkg/safego"
)

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

		// Semaphore to cap concurrent cluster queries
		sem := make(chan struct{}, maxPredictionConcurrency)

		for _, cluster := range clusters {
			if !healthyClusterSet[cluster.Name] {
				slog.Info("[PredictionWorker] skipping offline cluster", "cluster", cluster.Name)
				continue
			}
			cl := cluster
			wg.Add(1)
			safego.GoWith("prediction-worker/"+cl.Name, func() {
				defer wg.Done()

				// Acquire semaphore slot
				sem <- struct{}{}
				defer func() { <-sem }()

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

func (w *PredictionWorker) analyzeWithProvider(ctx context.Context, provider ai.Provider, prompt string) ([]AIPrediction, error) {
	// Use the provider's chat interface
	req := &ai.ChatRequest{
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


