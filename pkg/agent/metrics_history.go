package agent

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
)

const (
	maxSnapshots          = 144 // 24 hours at 10-min intervals
	metricsHistoryFile    = "metrics_history.json"
	snapshotRetentionHrs  = 24
	metricsHistoryTimeout = 30 * time.Second
	metricsFileMode       = 0600
	metricsDirMode        = 0700
)

// MetricsSnapshot holds a point-in-time metrics capture
type MetricsSnapshot struct {
	Timestamp string                   `json:"timestamp"`
	Clusters  []ClusterMetricSnapshot  `json:"clusters"`
	PodIssues []PodIssueSnapshot       `json:"podIssues"`
	GPUNodes  []GPUNodeMetricSnapshot  `json:"gpuNodes"`
}

// ClusterMetricSnapshot holds cluster metrics at a point in time
type ClusterMetricSnapshot struct {
	Name         string  `json:"name"`
	CPUPercent   float64 `json:"cpuPercent"`
	MemoryPercent float64 `json:"memoryPercent"`
	NodeCount    int     `json:"nodeCount"`
	HealthyNodes int     `json:"healthyNodes"`
}

// PodIssueSnapshot holds pod issue data at a point in time
type PodIssueSnapshot struct {
	Name     string `json:"name"`
	Cluster  string `json:"cluster"`
	Restarts int    `json:"restarts"`
	Status   string `json:"status"`
}

// GPUNodeMetricSnapshot holds GPU node data at a point in time
type GPUNodeMetricSnapshot struct {
	Name         string `json:"name"`
	Cluster      string `json:"cluster"`
	GPUAllocated int    `json:"gpuAllocated"`
	GPUTotal     int    `json:"gpuTotal"`
}

// MetricsHistoryResponse is the HTTP response format
type MetricsHistoryResponse struct {
	Snapshots []MetricsSnapshot `json:"snapshots"`
	Retention string            `json:"retention"`
}

// MetricsHistory manages historical metrics snapshots
type MetricsHistory struct {
	k8sClient          *k8s.MultiClusterClient
	snapshots          []MetricsSnapshot
	mu                 sync.RWMutex
	stopCh             chan struct{}
	dataDir            string
	loggedClusterError bool // suppress repeated "no kubeconfig" errors
}

// NewMetricsHistory creates a new metrics history manager
func NewMetricsHistory(k8sClient *k8s.MultiClusterClient) *MetricsHistory {
	// Store in ~/.kc/
	homeDir, _ := os.UserHomeDir()
	dataDir := filepath.Join(homeDir, ".kc")

	mh := &MetricsHistory{
		k8sClient: k8sClient,
		snapshots: []MetricsSnapshot{},
		stopCh:    make(chan struct{}),
		dataDir:   dataDir,
	}

	// Load existing history
	mh.loadFromDisk()

	return mh
}

// Start begins the metrics collection loop
func (mh *MetricsHistory) Start(interval time.Duration) {
	go mh.runLoop(interval)
}

// Stop gracefully shuts down the history manager
func (mh *MetricsHistory) Stop() {
	close(mh.stopCh)
}

// GetSnapshots returns all snapshots
func (mh *MetricsHistory) GetSnapshots() MetricsHistoryResponse {
	mh.mu.RLock()
	defer mh.mu.RUnlock()

	return MetricsHistoryResponse{
		Snapshots: mh.snapshots,
		Retention: "24h",
	}
}

// GetRecentSnapshots returns the last N snapshots
func (mh *MetricsHistory) GetRecentSnapshots(n int) []MetricsSnapshot {
	mh.mu.RLock()
	defer mh.mu.RUnlock()

	if n <= 0 || n >= len(mh.snapshots) {
		return mh.snapshots
	}

	return mh.snapshots[len(mh.snapshots)-n:]
}

// CaptureNow manually triggers a snapshot capture
func (mh *MetricsHistory) CaptureNow() error {
	return mh.captureSnapshot()
}

// runLoop is the main metrics collection loop
func (mh *MetricsHistory) runLoop(interval time.Duration) {
	// Capture initial snapshot
	if err := mh.captureSnapshot(); err != nil {
		log.Printf("[MetricsHistory] Error capturing initial snapshot: %v", err)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := mh.captureSnapshot(); err != nil {
				log.Printf("[MetricsHistory] Error capturing snapshot: %v", err)
			}
		case <-mh.stopCh:
			log.Println("[MetricsHistory] Stopping")
			return
		}
	}
}

// captureSnapshot captures current metrics and adds to history
func (mh *MetricsHistory) captureSnapshot() error {
	if mh.k8sClient == nil {
		return nil // No client available
	}

	ctx, cancel := context.WithTimeout(context.Background(), metricsHistoryTimeout)
	defer cancel()

	snapshot := MetricsSnapshot{
		Timestamp: time.Now().Format(time.RFC3339),
	}

	// Get cluster health
	healthList, err := mh.k8sClient.GetAllClusterHealth(ctx)
	if err != nil {
		if !mh.loggedClusterError {
			mh.loggedClusterError = true
			log.Printf("[MetricsHistory] Cluster data unavailable (will retry silently): %v", err)
		}
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
			snapshot.Clusters = append(snapshot.Clusters, ClusterMetricSnapshot{
				Name:          h.Cluster,
				CPUPercent:    cpuPercent,
				MemoryPercent: memPercent,
				NodeCount:     h.NodeCount,
				HealthyNodes:  h.ReadyNodes,
			})
		}
	}

	// Get pod issues from all clusters
	clusters, err := mh.k8sClient.ListClusters(ctx)
	if err == nil {
		for _, cluster := range clusters {
			pods, err := mh.k8sClient.FindPodIssues(ctx, cluster.Context, "")
			if err != nil {
				continue
			}
			for _, p := range pods {
				snapshot.PodIssues = append(snapshot.PodIssues, PodIssueSnapshot{
					Name:     p.Name,
					Cluster:  cluster.Name,
					Restarts: p.Restarts,
					Status:   p.Status,
				})
			}
		}
	}

	// Get GPU nodes from all clusters
	for _, cluster := range clusters {
		gpuNodes, err := mh.k8sClient.GetGPUNodes(ctx, cluster.Context)
		if err != nil {
			continue
		}
		for _, g := range gpuNodes {
			snapshot.GPUNodes = append(snapshot.GPUNodes, GPUNodeMetricSnapshot{
				Name:         g.Name,
				Cluster:      g.Cluster,
				GPUAllocated: g.GPUAllocated,
				GPUTotal:     g.GPUCount,
			})
		}
	}

	// Add to history
	mh.mu.Lock()
	mh.snapshots = append(mh.snapshots, snapshot)

	// Trim old snapshots (keep last 24 hours)
	cutoff := time.Now().Add(-time.Duration(snapshotRetentionHrs) * time.Hour)
	trimmed := make([]MetricsSnapshot, 0, len(mh.snapshots))
	for _, s := range mh.snapshots {
		ts, err := time.Parse(time.RFC3339, s.Timestamp)
		if err != nil || ts.After(cutoff) {
			trimmed = append(trimmed, s)
		}
	}

	// Also enforce max count
	if len(trimmed) > maxSnapshots {
		trimmed = trimmed[len(trimmed)-maxSnapshots:]
	}

	mh.snapshots = trimmed
	mh.mu.Unlock()

	// Persist to disk
	go mh.saveToDisk()

	log.Printf("[MetricsHistory] Captured snapshot: %d clusters, %d pod issues, %d GPU nodes",
		len(snapshot.Clusters), len(snapshot.PodIssues), len(snapshot.GPUNodes))

	return nil
}

// saveToDisk persists history to disk
func (mh *MetricsHistory) saveToDisk() {
	mh.mu.RLock()
	data, err := json.Marshal(mh.snapshots)
	mh.mu.RUnlock()

	if err != nil {
		log.Printf("[MetricsHistory] Error marshaling history: %v", err)
		return
	}

	// Ensure directory exists
	if err := os.MkdirAll(mh.dataDir, metricsDirMode); err != nil {
		log.Printf("[MetricsHistory] Error creating data dir: %v", err)
		return
	}

	filePath := filepath.Join(mh.dataDir, metricsHistoryFile)
	if err := os.WriteFile(filePath, data, metricsFileMode); err != nil {
		log.Printf("[MetricsHistory] Error writing history file: %v", err)
	}
}

// loadFromDisk loads history from disk
func (mh *MetricsHistory) loadFromDisk() {
	filePath := filepath.Join(mh.dataDir, metricsHistoryFile)

	data, err := os.ReadFile(filePath)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[MetricsHistory] Error reading history file: %v", err)
		}
		return
	}

	var snapshots []MetricsSnapshot
	if err := json.Unmarshal(data, &snapshots); err != nil {
		log.Printf("[MetricsHistory] Error parsing history file: %v", err)
		return
	}

	// Filter out old snapshots
	cutoff := time.Now().Add(-time.Duration(snapshotRetentionHrs) * time.Hour)
	filtered := make([]MetricsSnapshot, 0)
	for _, s := range snapshots {
		ts, err := time.Parse(time.RFC3339, s.Timestamp)
		if err != nil || ts.After(cutoff) {
			filtered = append(filtered, s)
		}
	}

	mh.mu.Lock()
	mh.snapshots = filtered
	mh.mu.Unlock()

	log.Printf("[MetricsHistory] Loaded %d snapshots from disk", len(filtered))
}

// GetTrendContext returns formatted history for AI prompt
func (mh *MetricsHistory) GetTrendContext() string {
	mh.mu.RLock()
	defer mh.mu.RUnlock()

	if len(mh.snapshots) == 0 {
		return "No historical metrics available yet."
	}

	// Use last 6 snapshots (~1 hour at 10-min intervals)
	recent := mh.snapshots
	if len(recent) > 6 {
		recent = recent[len(recent)-6:]
	}

	result := "Historical metrics (last " + string(rune('0'+len(recent))) + " snapshots):\n\n"

	// Get unique clusters
	clusterNames := make(map[string]bool)
	for _, s := range recent {
		for _, c := range s.Clusters {
			clusterNames[c.Name] = true
		}
	}

	// Format cluster trends
	for name := range clusterNames {
		cpuValues := []string{}
		memValues := []string{}

		for _, s := range recent {
			for _, c := range s.Clusters {
				if c.Name == name {
					cpuValues = append(cpuValues, formatPercent(c.CPUPercent))
					memValues = append(memValues, formatPercent(c.MemoryPercent))
					break
				}
			}
		}

		if len(cpuValues) > 0 {
			result += name + ":\n"
			result += "  CPU: " + joinStrings(cpuValues, " → ") + "\n"
			result += "  Memory: " + joinStrings(memValues, " → ") + "\n"
		}
	}

	return result
}

func formatPercent(v float64) string {
	return string([]byte{byte(int(v)/10 + '0'), byte(int(v)%10 + '0'), '%'})
}

func joinStrings(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	result := ss[0]
	for _, s := range ss[1:] {
		result += sep + s
	}
	return result
}
