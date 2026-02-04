package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/k8s"
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
	Category       string `json:"category"`       // pod-crash, resource-trend, capacity-risk, anomaly
	Severity       string `json:"severity"`       // warning, critical
	Name           string `json:"name"`           // affected resource name
	Cluster        string `json:"cluster"`        // cluster name
	Reason         string `json:"reason"`         // brief summary
	ReasonDetailed string `json:"reasonDetailed"` // full explanation
	Confidence     int    `json:"confidence"`     // 0-100
	GeneratedAt    string `json:"generatedAt"`    // ISO timestamp
	Provider       string `json:"provider"`       // AI provider name
	Trend          string `json:"trend,omitempty"` // worsening, improving, stable
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
	running     bool
	mu          sync.RWMutex
	stopCh      chan struct{}

	// WebSocket broadcast function
	broadcast func(msgType string, payload interface{})

	// Token tracking callback
	trackTokens func(usage *ProviderTokenUsage)
}

// NewPredictionWorker creates a new prediction worker
func NewPredictionWorker(k8sClient *k8s.MultiClusterClient, registry *Registry, broadcast func(string, interface{}), trackTokens func(*ProviderTokenUsage)) *PredictionWorker {
	return &PredictionWorker{
		k8sClient:   k8sClient,
		registry:    registry,
		settings:    DefaultPredictionSettings(),
		predictions: []AIPrediction{},
		providers:   []string{},
		stopCh:      make(chan struct{}),
		broadcast:   broadcast,
		trackTokens: trackTokens,
	}
}

// Start begins the background analysis loop
func (w *PredictionWorker) Start() {
	go w.runLoop()
}

// Stop gracefully shuts down the worker
func (w *PredictionWorker) Stop() {
	close(w.stopCh)
}

// UpdateSettings updates the worker settings
func (w *PredictionWorker) UpdateSettings(settings PredictionSettings) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.settings = settings
	log.Printf("[PredictionWorker] Settings updated: interval=%dm, minConfidence=%d%%, aiEnabled=%v",
		settings.Interval, settings.MinConfidence, settings.AIEnabled)
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

// TriggerAnalysis manually triggers an analysis
func (w *PredictionWorker) TriggerAnalysis(providers []string) error {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		return fmt.Errorf("analysis already in progress")
	}
	w.running = true
	w.mu.Unlock()

	go func() {
		defer func() {
			w.mu.Lock()
			w.running = false
			w.mu.Unlock()
		}()
		w.runAnalysis(providers)
	}()

	return nil
}

// IsAnalyzing returns whether analysis is currently running
func (w *PredictionWorker) IsAnalyzing() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.running
}

// runLoop is the main background loop
func (w *PredictionWorker) runLoop() {
	// Initial analysis after short delay
	time.Sleep(30 * time.Second)

	for {
		w.mu.RLock()
		settings := w.settings
		w.mu.RUnlock()

		if settings.AIEnabled {
			w.mu.Lock()
			if !w.running {
				w.running = true
				w.mu.Unlock()
				w.runAnalysis(nil)
				w.mu.Lock()
				w.running = false
			}
			w.mu.Unlock()
		}

		// Wait for next interval or stop signal
		interval := time.Duration(settings.Interval) * time.Minute
		select {
		case <-time.After(interval):
			continue
		case <-w.stopCh:
			log.Println("[PredictionWorker] Stopping")
			return
		}
	}
}

// runAnalysis performs the AI analysis
func (w *PredictionWorker) runAnalysis(specificProviders []string) {
	log.Println("[PredictionWorker] Starting AI prediction analysis")

	// Gather cluster data
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	clusterData, err := w.gatherClusterData(ctx)
	if err != nil {
		log.Printf("[PredictionWorker] Error gathering cluster data: %v", err)
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
		log.Println("[PredictionWorker] No AI providers available")
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
			log.Printf("[PredictionWorker] Error with provider %s: %v", providerName, err)
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

	log.Printf("[PredictionWorker] Analysis complete: %d predictions from %v", len(filtered), usedProviders)

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
	Clusters     []ClusterSummary `json:"clusters"`
	PodIssues    []PodIssueSummary `json:"podIssues"`
	GPUNodes     []GPUNodeSummary `json:"gpuNodes"`
	OfflineNodes []NodeSummary    `json:"offlineNodes"`
	Timestamp    string           `json:"timestamp"`
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
	Name     string `json:"name"`
	Cluster  string `json:"cluster"`
	Restarts int    `json:"restarts"`
	Status   string `json:"status"`
	Age      string `json:"age"`
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
		log.Printf("[PredictionWorker] Error getting cluster health: %v", err)
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

	// Get pod issues from all clusters
	clusters, err := w.k8sClient.ListClusters(ctx)
	if err != nil {
		log.Printf("[PredictionWorker] Error listing clusters: %v", err)
	} else {
		for _, cluster := range clusters {
			pods, err := w.k8sClient.FindPodIssues(ctx, cluster.Context, "")
			if err != nil {
				log.Printf("[PredictionWorker] Error getting pod issues for %s: %v", cluster.Name, err)
				continue
			}
			for _, p := range pods {
				data.PodIssues = append(data.PodIssues, PodIssueSummary{
					Name:     p.Name,
					Cluster:  cluster.Name,
					Restarts: p.Restarts,
					Status:   p.Status,
				})
			}
		}
	}

	// Get GPU nodes from all clusters
	if clusters == nil {
		clusters, _ = w.k8sClient.ListClusters(ctx)
	}
	for _, cluster := range clusters {
		gpuNodes, err := w.k8sClient.GetGPUNodes(ctx, cluster.Context)
		if err != nil {
			log.Printf("[PredictionWorker] Error getting GPU nodes for %s: %v", cluster.Name, err)
			continue
		}
		for _, g := range gpuNodes {
			data.GPUNodes = append(data.GPUNodes, GPUNodeSummary{
				Name:      g.Name,
				Cluster:   g.Cluster,
				Allocated: g.GPUAllocated,
				Total:     g.GPUCount,
			})
		}
	}

	// Get offline/unhealthy nodes from all clusters
	for _, cluster := range clusters {
		nodes, err := w.k8sClient.GetNodes(ctx, cluster.Context)
		if err != nil {
			log.Printf("[PredictionWorker] Error getting nodes for %s: %v", cluster.Name, err)
			continue
		}
		for _, n := range nodes {
			if n.Status != "Ready" || n.Unschedulable {
				status := n.Status
				if n.Unschedulable {
					status = "Cordoned"
				}
				data.OfflineNodes = append(data.OfflineNodes, NodeSummary{
					Name:    n.Name,
					Cluster: cluster.Name,
					Status:  status,
				})
			}
		}
	}

	return data, nil
}

func (w *PredictionWorker) buildAnalysisPrompt(data *ClusterAnalysisData) string {
	dataJSON, _ := json.MarshalIndent(data, "", "  ")

	return fmt.Sprintf(`You are a Kubernetes cluster health analyzer. Analyze the provided metrics and identify potential failures BEFORE they occur.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "predictions": [
    {
      "category": "pod-crash" | "resource-trend" | "capacity-risk" | "anomaly",
      "severity": "warning" | "critical",
      "name": "affected-resource-name",
      "cluster": "cluster-name",
      "reason": "Brief 1-line summary (max 80 chars)",
      "reasonDetailed": "Full explanation with context, metrics observed, and recommended actions",
      "confidence": 60-100
    }
  ]
}

Look for:
1. Pods with increasing restart patterns (not just count, but rate)
2. Resources trending toward limits (memory climbing over past hour)
3. Correlated issues (multiple pods from same deployment failing)
4. Unusual patterns (sudden spikes, resources not returning to baseline)
5. Capacity risks (node nearly full, no room for failover)

Only include predictions with confidence >= 60.

Current cluster data:
%s`, string(dataJSON))
}

func (w *PredictionWorker) getAvailableProviders() []string {
	providers := []string{}
	for _, name := range []string{"claude", "openai", "gemini", "ollama"} {
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

	// Track token usage for navbar counter
	if w.trackTokens != nil && resp.TokenUsage != nil {
		w.trackTokens(resp.TokenUsage)
	}

	// Parse response
	return w.parseAIPredictions(resp.Content, provider.Name())
}

func (w *PredictionWorker) parseAIPredictions(response string, providerName string) ([]AIPrediction, error) {
	// Extract JSON from response (might have markdown wrapper)
	jsonStr := response
	if idx := strings.Index(response, "{"); idx != -1 {
		jsonStr = response[idx:]
	}
	if idx := strings.LastIndex(jsonStr, "}"); idx != -1 {
		jsonStr = jsonStr[:idx+1]
	}

	var result struct {
		Predictions []struct {
			Category       string `json:"category"`
			Severity       string `json:"severity"`
			Name           string `json:"name"`
			Cluster        string `json:"cluster"`
			Reason         string `json:"reason"`
			ReasonDetailed string `json:"reasonDetailed"`
			Confidence     int    `json:"confidence"`
		} `json:"predictions"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
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

// BroadcastToClients sends a message to all connected WebSocket clients
func (s *Server) BroadcastToClients(msgType string, payload interface{}) {
	message := map[string]interface{}{
		"type":    msgType,
		"payload": payload,
	}

	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("[Server] Error marshaling broadcast message: %v", err)
		return
	}

	s.clientsMux.RLock()
	defer s.clientsMux.RUnlock()

	for conn := range s.clients {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[Server] Error broadcasting to client: %v", err)
		}
	}
}
