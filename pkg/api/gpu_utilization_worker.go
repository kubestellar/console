package api

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/agent"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/store"
)

const (
	// defaultUtilPollIntervalMs is the default polling interval for GPU utilization (20 minutes)
	defaultUtilPollIntervalMs = 1_200_000
	// snapshotRetentionDays is how long to keep utilization snapshots before cleanup
	snapshotRetentionDays = 90
	// fullUtilizationPct is the utilization percentage used when GPUs are active but no metrics API exists
	fullUtilizationPct = 100.0
	// defaultOverThreshold is the default threshold for over-utilization alerts
	defaultOverThreshold = 90.0
	// defaultUnderThreshold is the default threshold for under-utilization alerts
	defaultUnderThreshold = 20.0
	// defaultDCGMNamespace is the Kubernetes namespace where the NVIDIA GPU
	// Operator ships the dcgm-exporter Service by default.
	defaultDCGMNamespace = "gpu-operator"
	// defaultDCGMService is the Service name of the DCGM exporter shipped
	// by the NVIDIA GPU Operator.
	defaultDCGMService = "dcgm-exporter"
)

const (
	// perReservationTimeoutDivisor divides the poll interval to derive a
	// per-reservation collection timeout so that a single slow cluster
	// cannot starve subsequent reservations (#6967).
	perReservationTimeoutDivisor = 2
)

const (
	// maxConcurrentReservationCollectors caps the number of goroutines
	// that collectAllReservations spawns in parallel. Without a limit,
	// N active reservations spawn N goroutines each making K8s API calls,
	// risking OOM under heavy reservation load (#11827).
	maxConcurrentReservationCollectors = 10
)

// GPUUtilizationWorker periodically collects GPU utilization data for active reservations
type GPUUtilizationWorker struct {
	store              store.Store
	k8sClient          *k8s.MultiClusterClient
	interval           time.Duration
	stopCh             chan struct{}
	stopOnce           sync.Once // protects stopCh from double-close panic
	baseCtx            context.Context
	baseCancel         context.CancelFunc
	gpuMetricsEnabled  bool
	notificationService *notifications.Service
	overThreshold      float64
	underThreshold     float64
	// dcgmEnabled toggles NVIDIA DCGM exporter scraping for real GPU memory
	// metrics (Issue 9135). Defaults to false — clusters without the GPU
	// Operator / DCGM stack should silently fall back to the legacy zero
	// value instead of logging errors every poll.
	dcgmEnabled   bool
	dcgmNamespace string
	dcgmService   string
}

// NewGPUUtilizationWorker creates a new GPU utilization worker
func NewGPUUtilizationWorker(s store.Store, k8sClient *k8s.MultiClusterClient, notificationService *notifications.Service) *GPUUtilizationWorker {
	intervalMs := defaultUtilPollIntervalMs
	if envVal := os.Getenv("GPU_UTIL_POLL_INTERVAL_MS"); envVal != "" {
		if parsed, err := strconv.Atoi(envVal); err == nil && parsed > 0 {
			intervalMs = parsed
		}
	}

	gpuMetricsEnabled := os.Getenv("GPU_METRICS_ENABLED") == "true"

	overThreshold := defaultOverThreshold
	if envVal := os.Getenv("GPU_UTIL_OVER_THRESHOLD"); envVal != "" {
		if parsed, err := strconv.ParseFloat(envVal, 64); err == nil && parsed > 0 && parsed <= 100 {
			overThreshold = parsed
		}
	}

	underThreshold := defaultUnderThreshold
	if envVal := os.Getenv("GPU_UTIL_UNDER_THRESHOLD"); envVal != "" {
		if parsed, err := strconv.ParseFloat(envVal, 64); err == nil && parsed >= 0 && parsed <= 100 {
			underThreshold = parsed
		}
	}

	dcgmEnabled := os.Getenv("GPU_METRICS_DCGM_ENABLED") == "true"
	dcgmNamespace := os.Getenv("GPU_METRICS_DCGM_NAMESPACE")
	if dcgmNamespace == "" {
		dcgmNamespace = defaultDCGMNamespace
	}
	dcgmService := os.Getenv("GPU_METRICS_DCGM_SERVICE")
	if dcgmService == "" {
		dcgmService = defaultDCGMService
	}

	ctx, cancel := context.WithCancel(context.Background())
	return &GPUUtilizationWorker{
		store:               s,
		k8sClient:           k8sClient,
		interval:            time.Duration(intervalMs) * time.Millisecond,
		stopCh:              make(chan struct{}),
		baseCtx:             ctx,
		baseCancel:          cancel,
		gpuMetricsEnabled:   gpuMetricsEnabled,
		notificationService: notificationService,
		overThreshold:       overThreshold,
		underThreshold:      underThreshold,
		dcgmEnabled:         dcgmEnabled,
		dcgmNamespace:       dcgmNamespace,
		dcgmService:         dcgmService,
	}
}

// Start begins the background polling loop
func (w *GPUUtilizationWorker) Start() {
	go func() {
		// Cleanup old snapshots on startup
		w.cleanupOldSnapshots()

		// Run an initial collection immediately
		w.collectUtilization()

		ticker := time.NewTicker(w.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				w.collectUtilization()
			case <-w.stopCh:
				return
			}
		}
	}()
	slog.Info("GPU utilization worker started", "interval", w.interval)
}

// Stop signals the worker to stop. It is safe to call multiple times;
// only the first call actually closes the stop channel.
func (w *GPUUtilizationWorker) Stop() {
	w.stopOnce.Do(func() {
		w.baseCancel() // cancel all in-flight Kubernetes API calls (#6966)
		close(w.stopCh)
	})
}

// collectUtilization queries active reservations and records utilization snapshots
func (w *GPUUtilizationWorker) collectUtilization() {
	if w.k8sClient == nil {
		return
	}

	reservations, err := w.store.ListActiveGPUReservations(w.baseCtx)
	if err != nil {
		slog.Error("GPU utilization worker: failed to list active reservations", "error", err)
		return
	}

	if len(reservations) == 0 {
		return
	}

	// Per-reservation timeout so a slow cluster cannot starve others (#6967).
	// Derived from w.baseCtx so Stop() cancels in-flight calls immediately (#6966).
	perReservationTimeout := w.interval / time.Duration(perReservationTimeoutDivisor)

	// Scrape DCGM once per unique cluster and share the result across all
	// reservations on that cluster (Issue 9135). Scraping per reservation
	// would hit the exporter N times for N namespaces in the same cluster
	// and blow past rate limits on shared infrastructure.
	dcgmByCluster := w.scrapeDCGMPerCluster(reservations, perReservationTimeout)

	var wg sync.WaitGroup
	sem := make(chan struct{}, maxConcurrentReservationCollectors)
	for i := range reservations {
		wg.Add(1)
		sem <- struct{}{} // acquire
		go func(r *models.GPUReservation) {
			defer wg.Done()
			defer func() { <-sem }() // release
			ctx, cancel := context.WithTimeout(w.baseCtx, perReservationTimeout)
			defer cancel()
			w.collectForReservation(ctx, r, dcgmByCluster[r.Cluster])
		}(&reservations[i])
	}
	wg.Wait()
}

// scrapeDCGMPerCluster fetches DCGM exporter metrics once per unique
// cluster and returns a map keyed by cluster name. Callers look up
// per-namespace framebuffer utilization from the nested map. Returns
// nil when DCGM is disabled via env flag — callers handle nil as
// "no DCGM data, use legacy zero fallback".
func (w *GPUUtilizationWorker) scrapeDCGMPerCluster(
	reservations []models.GPUReservation,
	timeout time.Duration,
) map[string]map[string]*agent.DCGMNamespaceMetrics {
	if !w.dcgmEnabled {
		return nil
	}

	// Collect unique cluster names.
	clusters := make(map[string]struct{})
	for i := range reservations {
		clusters[reservations[i].Cluster] = struct{}{}
	}

	out := make(map[string]map[string]*agent.DCGMNamespaceMetrics, len(clusters))
	scrapeConfig := agent.DCGMScrapeConfig{
		Namespace: w.dcgmNamespace,
		Service:   w.dcgmService,
	}
	for cluster := range clusters {
		restConfig, err := w.k8sClient.GetRestConfig(cluster)
		if err != nil {
			// Cluster unreachable → silent zero fallback for this cluster.
			slog.Debug("GPU utilization worker: DCGM scrape skipped (no rest config)", "cluster", cluster, "error", err)
			continue
		}
		ctx, cancel := context.WithTimeout(w.baseCtx, timeout)
		metrics, err := agent.ScrapeDCGMByNamespace(ctx, restConfig, scrapeConfig)
		cancel()
		if err != nil {
			// Log at debug — the feature is opt-in and a 503 / missing Service
			// on an unconfigured cluster is a legitimate operational state,
			// not an error worth pager-duty attention.
			slog.Debug("GPU utilization worker: DCGM scrape failed", "cluster", cluster, "error", err)
			continue
		}
		out[cluster] = metrics
	}
	return out
}

// collectForReservation collects utilization for a single reservation.
// dcgmClusterMetrics is the per-namespace DCGM framebuffer map for the
// reservation's cluster (or nil when DCGM is disabled / unreachable);
// callers pass nil for the legacy zero-memory fallback.
func (w *GPUUtilizationWorker) collectForReservation(
	ctx context.Context,
	reservation *models.GPUReservation,
	dcgmClusterMetrics map[string]*agent.DCGMNamespaceMetrics,
) {
	cluster := reservation.Cluster
	namespace := reservation.Namespace

	// Get pods in this namespace/cluster
	pods, err := w.k8sClient.GetPods(ctx, cluster, namespace)
	if err != nil {
		slog.Error("GPU utilization worker: failed to get pods", "cluster", cluster, "namespace", namespace, "error", err)
		return
	}

	// Get GPU nodes for this cluster to know which nodes have GPUs
	gpuNodes, err := w.k8sClient.GetGPUNodes(ctx, cluster)
	if err != nil {
		slog.Error("GPU utilization worker: failed to get GPU nodes", "cluster", cluster, "error", err)
		return
	}

	gpuNodeNames := make(map[string]bool)
	for _, node := range gpuNodes {
		gpuNodeNames[node.Name] = true
	}

	// Count pods with explicit GPU resource requests (#7020).
	// Only pods that explicitly request GPU resources are counted.
	// Non-GPU system pods (node-exporter, kube-proxy, etc.) on GPU nodes
	// are excluded to prevent inflating utilization metrics.
	var activeGPUCount int
	for _, pod := range pods {
		if pod.Status != "Running" {
			continue
		}
		podGPUs := 0
		for _, c := range pod.Containers {
			podGPUs += c.GPURequested
		}
		if podGPUs > 0 {
			activeGPUCount += podGPUs
		}
		// Removed: counting non-GPU pods on GPU nodes as 1 GPU each (#7020)
	}

	// Cap active count to reservation total
	totalGPUs := reservation.GPUCount
	if activeGPUCount > totalGPUs {
		activeGPUCount = totalGPUs
	}

	// Compute utilization percentage (binary: active vs reserved)
	// Without metrics-server, we use pod presence as a proxy for utilization
	var gpuUtilPct float64
	if totalGPUs > 0 {
		gpuUtilPct = (float64(activeGPUCount) / float64(totalGPUs)) * fullUtilizationPct
	}

	// Check if utilization exceeds thresholds and send alert
	if w.notificationService != nil {
		if gpuUtilPct > w.overThreshold {
			alert := notifications.Alert{
				RuleName: "GPU Utilization Over Threshold",
				Severity: notifications.SeverityWarning,
				Message:  fmt.Sprintf("GPU utilization %.1f%% exceeds threshold %.1f%%", gpuUtilPct, w.overThreshold),
				Cluster:  cluster,
				Namespace: namespace,
				Details: map[string]interface{}{
					"reservation_id": reservation.ID.String(),
					"utilization_pct": gpuUtilPct,
					"threshold_pct": w.overThreshold,
					"active_gpus": activeGPUCount,
					"total_gpus": totalGPUs,
				},
				FiredAt: time.Now(),
			}
			if err := w.notificationService.SendAlert(alert); err != nil {
				slog.Error("GPU utilization worker: failed to send over-threshold alert", "error", err)
			}
		} else if gpuUtilPct < w.underThreshold {
			alert := notifications.Alert{
				RuleName: "GPU Utilization Under Threshold",
				Severity: notifications.SeverityInfo,
				Message:  fmt.Sprintf("GPU utilization %.1f%% below threshold %.1f%%", gpuUtilPct, w.underThreshold),
				Cluster:  cluster,
				Namespace: namespace,
				Details: map[string]interface{}{
					"reservation_id": reservation.ID.String(),
					"utilization_pct": gpuUtilPct,
					"threshold_pct": w.underThreshold,
					"active_gpus": activeGPUCount,
					"total_gpus": totalGPUs,
				},
				FiredAt: time.Now(),
			}
			if err := w.notificationService.SendAlert(alert); err != nil {
				slog.Error("GPU utilization worker: failed to send under-threshold alert", "error", err)
			}
		}
	}

	// Populate MemoryUtilizationPct from the DCGM exporter when available
	// (Issue 9135). Silent zero fallback when DCGM is disabled, unreachable,
	// or emits no samples for this reservation's namespace.
	memoryUtilPct := 0.0
	if nsMetrics, ok := dcgmClusterMetrics[namespace]; ok && nsMetrics != nil && nsMetrics.SampleCount > 0 {
		memoryUtilPct = nsMetrics.UtilizationPct()
	}

	snapshot := &models.GPUUtilizationSnapshot{
		ID:                   uuid.New().String(),
		ReservationID:        reservation.ID.String(),
		Timestamp:            time.Now(),
		GPUUtilizationPct:    gpuUtilPct,
		MemoryUtilizationPct: memoryUtilPct,
		ActiveGPUCount:       activeGPUCount,
		TotalGPUCount:        totalGPUs,
	}

	if err := w.store.InsertUtilizationSnapshot(ctx, snapshot); err != nil {
		slog.Error("GPU utilization worker: failed to insert snapshot", "reservation", reservation.ID, "error", err)
	}
}

// cleanupOldSnapshots removes snapshots older than the retention period
func (w *GPUUtilizationWorker) cleanupOldSnapshots() {
	cutoff := time.Now().AddDate(0, 0, -snapshotRetentionDays)
	deleted, err := w.store.DeleteOldUtilizationSnapshots(w.baseCtx, cutoff)
	if err != nil {
		slog.Error("GPU utilization worker: failed to cleanup old snapshots", "error", err)
		return
	}
	if deleted > 0 {
		slog.Info("GPU utilization worker: cleaned up old snapshots", "deleted", deleted)
	}
}
