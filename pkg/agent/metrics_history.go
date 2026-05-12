package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
)

const (
	maxSnapshots          = 1008 // 7 days at 10-min intervals (6 per hour * 24 hours * 7 days)
	metricsHistoryFile    = "metrics_history.json"
	snapshotRetentionHrs  = 168 // 7 days of retention
	metricsHistoryTimeout = 30 * time.Second
	metricsFileMode       = 0600
	metricsDirMode        = 0700
)

// MetricsSnapshot holds a point-in-time metrics capture
type MetricsSnapshot struct {
	Timestamp string                  `json:"timestamp"`
	Clusters  []ClusterMetricSnapshot `json:"clusters"`
	PodIssues []PodIssueSnapshot      `json:"podIssues"`
	GPUNodes  []GPUNodeMetricSnapshot `json:"gpuNodes"`
}

// ClusterMetricSnapshot holds cluster metrics at a point in time
type ClusterMetricSnapshot struct {
	Name          string  `json:"name"`
	CPUPercent    float64 `json:"cpuPercent"`
	MemoryPercent float64 `json:"memoryPercent"`
	NodeCount     int     `json:"nodeCount"`
	HealthyNodes  int     `json:"healthyNodes"`
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
	GPUType      string `json:"gpuType"` // Accelerator display name (e.g. "NVIDIA A100"); empty in legacy snapshots
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
	diskMu             sync.Mutex // serializes saveToDisk calls (#7017)
	stopCh             chan struct{}
	stopOnce           sync.Once // prevents double-close panic on stopCh (#7244)
	dataDir            string
	loggedClusterError atomic.Bool // suppress repeated "no kubeconfig" errors (#7015)
	lastPersistError   error       // last saveToDisk error, nil on success (#5553)
}

// setLastPersistError safely stores the last saveToDisk result under mu.
func (mh *MetricsHistory) setLastPersistError(err error) {
	mh.mu.Lock()
	defer mh.mu.Unlock()
	mh.lastPersistError = err
}

// NewMetricsHistory creates a new metrics history manager
func NewMetricsHistory(k8sClient *k8s.MultiClusterClient, dataDir string) *MetricsHistory {
	if dataDir == "" {
		// Store in ~/.kc/
		homeDir, _ := os.UserHomeDir()
		dataDir = filepath.Join(homeDir, ".kc")
	}

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

// SetDataDir sets the directory for metrics history storage (for testing)
func (mh *MetricsHistory) SetDataDir(dir string) {
	mh.mu.Lock()
	defer mh.mu.Unlock()
	mh.dataDir = dir
}

// Start begins the metrics collection loop
func (mh *MetricsHistory) Start(interval time.Duration) {
	safego.GoWith("metrics-history/run-loop", func() { mh.runLoop(interval) })
}

// Stop gracefully shuts down the history manager. It is safe to call
// multiple times — the channel is only closed once (#7244).
func (mh *MetricsHistory) Stop() {
	mh.stopOnce.Do(func() {
		close(mh.stopCh)
	})
}

// GetSnapshots returns all snapshots
func (mh *MetricsHistory) GetSnapshots() MetricsHistoryResponse {
	mh.mu.RLock()
	defer mh.mu.RUnlock()

	return MetricsHistoryResponse{
		Snapshots: mh.snapshots,
		Retention: "7d",
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
		slog.Error("[MetricsHistory] error capturing initial snapshot", "error", err)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := mh.captureSnapshot(); err != nil {
				slog.Error("[MetricsHistory] error capturing snapshot", "error", err)
			}
		case <-mh.stopCh:
			slog.Info("[MetricsHistory] Stopping")
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
		if !mh.loggedClusterError.Load() {
			mh.loggedClusterError.Store(true)
			slog.Info("[MetricsHistory] cluster data unavailable (will retry silently)", "error", err)
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

	// Get pod issues and GPU nodes from all clusters.
	// If ListClusters fails, skip GPU metrics entirely instead of saving
	// a zeroed snapshot that masks the error (#7016).
	// Per-cluster fan-out in parallel so the snapshot ctx's
	// metricsHistoryTimeout isn't exhausted by sequential round-trips at
	// 50+ clusters (#8853).
	clusters, err := mh.k8sClient.ListClusters(ctx)
	if err != nil {
		slog.Error("[MetricsHistory] ListClusters failed, skipping pod/GPU metrics for this snapshot", "error", err)
	} else {
		var snapMu sync.Mutex
		var wg sync.WaitGroup
		for _, cluster := range clusters {
			cl := cluster
			wg.Add(1)
			safego.GoWith("metrics-history/pods/"+cl.Name, func() {
				defer wg.Done()
				pods, podErr := mh.k8sClient.FindPodIssues(ctx, cl.Context, "")
				if podErr != nil {
					return
				}
				if len(pods) == 0 {
					return
				}
				entries := make([]PodIssueSnapshot, 0, len(pods))
				for _, p := range pods {
					entries = append(entries, PodIssueSnapshot{
						Name:     p.Name,
						Cluster:  cl.Name,
						Restarts: p.Restarts,
						Status:   p.Status,
					})
				}
				snapMu.Lock()
				snapshot.PodIssues = append(snapshot.PodIssues, entries...)
				snapMu.Unlock()
			})
		}
		for _, cluster := range clusters {
			cl := cluster
			wg.Add(1)
			safego.GoWith("metrics-history/gpu/"+cl.Name, func() {
				defer wg.Done()
				gpuNodes, err := mh.k8sClient.GetGPUNodes(ctx, cl.Context)
				if err != nil {
					return
				}
				if len(gpuNodes) == 0 {
					return
				}
				entries := make([]GPUNodeMetricSnapshot, 0, len(gpuNodes))
				for _, g := range gpuNodes {
					entries = append(entries, GPUNodeMetricSnapshot{
						Name:         g.Name,
						Cluster:      g.Cluster,
						GPUType:      g.GPUType,
						GPUAllocated: g.GPUAllocated,
						GPUTotal:     g.GPUCount,
					})
				}
				snapMu.Lock()
				snapshot.GPUNodes = append(snapshot.GPUNodes, entries...)
				snapMu.Unlock()
			})
		}
		wg.Wait()
	}

	// Add to history
	mh.mu.Lock()
	mh.snapshots = append(mh.snapshots, snapshot)

	// Trim old snapshots (keep last 7 days).
	// Snapshots with unparseable timestamps are kept and logged (#7018)
	// rather than silently dropped, so historical data is not destroyed.
	cutoff := time.Now().Add(-time.Duration(snapshotRetentionHrs) * time.Hour)
	trimmed := make([]MetricsSnapshot, 0, len(mh.snapshots))
	for _, s := range mh.snapshots {
		ts, parseErr := time.Parse(time.RFC3339, s.Timestamp)
		if parseErr != nil {
			slog.Warn("[MetricsHistory] snapshot has unparseable timestamp, keeping data",
				"timestamp", s.Timestamp, "error", parseErr)
			trimmed = append(trimmed, s)
			continue
		}
		if ts.After(cutoff) {
			trimmed = append(trimmed, s)
		}
	}

	// Also enforce max count
	if len(trimmed) > maxSnapshots {
		trimmed = trimmed[len(trimmed)-maxSnapshots:]
	}

	mh.snapshots = trimmed
	mh.mu.Unlock()

	// Persist to disk synchronously — concurrent goroutines caused JSON
	// corruption via interleaved writes (#7017). The diskMu serializes
	// saves without holding mh.mu during the actual file I/O.
	mh.saveToDisk()

	slog.Info("[MetricsHistory] captured snapshot", "clusters", len(snapshot.Clusters), "podIssues", len(snapshot.PodIssues), "gpuNodes", len(snapshot.GPUNodes))

	return nil
}

// saveToDisk persists history to disk and tracks the last error for health checks (#5553).
// Writes are serialized by diskMu and use atomic file swap (write-to-temp then
// os.Rename) to prevent corruption from incomplete writes (#7017).
func (mh *MetricsHistory) saveToDisk() {
	mh.diskMu.Lock()
	defer mh.diskMu.Unlock()

	mh.mu.RLock()
	data, err := json.Marshal(mh.snapshots)
	mh.mu.RUnlock()

	if err != nil {
		slog.Error("[MetricsHistory] error marshaling history", "error", err)
		mh.setLastPersistError(err)
		return
	}

	// Ensure directory exists
	if err := os.MkdirAll(mh.dataDir, metricsDirMode); err != nil {
		slog.Error("[MetricsHistory] error creating data dir", "error", err)
		mh.setLastPersistError(err)
		return
	}

	filePath := filepath.Join(mh.dataDir, metricsHistoryFile)

	// Atomic write: write to a temp file, then rename to avoid partial writes.
	tmpFile, err := os.CreateTemp(mh.dataDir, "metrics_history_*.tmp")
	if err != nil {
		slog.Error("[MetricsHistory] error creating temp file", "error", err)
		mh.setLastPersistError(err)
		return
	}
	tmpPath := tmpFile.Name()

	if _, err := tmpFile.Write(data); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		slog.Error("[MetricsHistory] error writing temp file", "error", err)
		mh.setLastPersistError(err)
		return
	}
	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		slog.Error("[MetricsHistory] error closing temp file", "error", err)
		mh.setLastPersistError(err)
		return
	}

	if err := os.Rename(tmpPath, filePath); err != nil {
		os.Remove(tmpPath)
		slog.Error("[MetricsHistory] error renaming temp file to history file", "error", err)
		mh.setLastPersistError(err)
		return
	}

	mh.setLastPersistError(nil)
}

// LastPersistError returns the last saveToDisk error, or nil if persistence is healthy.
func (mh *MetricsHistory) LastPersistError() error {
	mh.mu.RLock()
	defer mh.mu.RUnlock()
	return mh.lastPersistError
}

// loadFromDisk loads history from disk
func (mh *MetricsHistory) loadFromDisk() {
	filePath := filepath.Join(mh.dataDir, metricsHistoryFile)

	data, err := os.ReadFile(filePath)
	if err != nil {
		if !os.IsNotExist(err) {
			slog.Error("[MetricsHistory] error reading history file", "error", err)
		}
		return
	}

	var snapshots []MetricsSnapshot
	if err := json.Unmarshal(data, &snapshots); err != nil {
		slog.Error("[MetricsHistory] error parsing history file", "error", err)
		return
	}

	// Filter out old snapshots; keep snapshots with unparseable timestamps
	// and log a warning so operators can investigate (#7018).
	cutoff := time.Now().Add(-time.Duration(snapshotRetentionHrs) * time.Hour)
	filtered := make([]MetricsSnapshot, 0)
	for _, s := range snapshots {
		ts, parseErr := time.Parse(time.RFC3339, s.Timestamp)
		if parseErr != nil {
			slog.Warn("[MetricsHistory] loaded snapshot has unparseable timestamp, keeping data",
				"timestamp", s.Timestamp, "error", parseErr)
			filtered = append(filtered, s)
			continue
		}
		if ts.After(cutoff) {
			filtered = append(filtered, s)
		}
	}

	mh.mu.Lock()
	mh.snapshots = filtered
	mh.mu.Unlock()

	slog.Info("[MetricsHistory] loaded snapshots from disk", "count", len(filtered))
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

	result := "Historical metrics (last " + strconv.Itoa(len(recent)) + " snapshots):\n\n"

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
	return strconv.Itoa(int(v)) + "%"
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
