package api

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const (
	// defaultUtilPollIntervalMs is the default polling interval for GPU utilization (20 minutes)
	defaultUtilPollIntervalMs = 1_200_000
	// snapshotRetentionDays is how long to keep utilization snapshots before cleanup
	snapshotRetentionDays = 90
	// fullUtilizationPct is the utilization percentage used when GPUs are active but no metrics API exists
	fullUtilizationPct = 100.0
)

const (
	// perReservationTimeoutDivisor divides the poll interval to derive a
	// per-reservation collection timeout so that a single slow cluster
	// cannot starve subsequent reservations (#6967).
	perReservationTimeoutDivisor = 2
)

// GPUUtilizationWorker periodically collects GPU utilization data for active reservations
type GPUUtilizationWorker struct {
	store      store.Store
	k8sClient  *k8s.MultiClusterClient
	interval   time.Duration
	stopCh     chan struct{}
	stopOnce   sync.Once // protects stopCh from double-close panic
	baseCtx    context.Context
	baseCancel context.CancelFunc
}

// NewGPUUtilizationWorker creates a new GPU utilization worker
func NewGPUUtilizationWorker(s store.Store, k8sClient *k8s.MultiClusterClient) *GPUUtilizationWorker {
	intervalMs := defaultUtilPollIntervalMs
	if envVal := os.Getenv("GPU_UTIL_POLL_INTERVAL_MS"); envVal != "" {
		if parsed, err := strconv.Atoi(envVal); err == nil && parsed > 0 {
			intervalMs = parsed
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	return &GPUUtilizationWorker{
		store:      s,
		k8sClient:  k8sClient,
		interval:   time.Duration(intervalMs) * time.Millisecond,
		stopCh:     make(chan struct{}),
		baseCtx:    ctx,
		baseCancel: cancel,
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

	reservations, err := w.store.ListActiveGPUReservations()
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

	var wg sync.WaitGroup
	for i := range reservations {
		wg.Add(1)
		go func(r *models.GPUReservation) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(w.baseCtx, perReservationTimeout)
			defer cancel()
			w.collectForReservation(ctx, r)
		}(&reservations[i])
	}
	wg.Wait()
}

// collectForReservation collects utilization for a single reservation
func (w *GPUUtilizationWorker) collectForReservation(ctx context.Context, reservation *models.GPUReservation) {
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

	// Count pods on GPU nodes and GPU resource requests
	var activeGPUCount int
	for _, pod := range pods {
		if pod.Status != "Running" {
			continue
		}
		// Check if pod requests GPUs or is on a GPU node
		podGPUs := 0
		for _, c := range pod.Containers {
			podGPUs += c.GPURequested
		}
		if podGPUs > 0 {
			activeGPUCount += podGPUs
		} else if gpuNodeNames[pod.Node] {
			// Pod on a GPU node but no explicit GPU request — count as 1 GPU in use
			activeGPUCount++
		}
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

	snapshot := &models.GPUUtilizationSnapshot{
		ID:                   uuid.New().String(),
		ReservationID:        reservation.ID.String(),
		Timestamp:            time.Now(),
		GPUUtilizationPct:    gpuUtilPct,
		MemoryUtilizationPct: gpuUtilPct, // Use same value when no memory metrics available
		ActiveGPUCount:       activeGPUCount,
		TotalGPUCount:        totalGPUs,
	}

	if err := w.store.InsertUtilizationSnapshot(snapshot); err != nil {
		slog.Error("GPU utilization worker: failed to insert snapshot", "reservation", reservation.ID, "error", err)
	}
}

// cleanupOldSnapshots removes snapshots older than the retention period
func (w *GPUUtilizationWorker) cleanupOldSnapshots() {
	cutoff := time.Now().AddDate(0, 0, -snapshotRetentionDays)
	deleted, err := w.store.DeleteOldUtilizationSnapshots(cutoff)
	if err != nil {
		slog.Error("GPU utilization worker: failed to cleanup old snapshots", "error", err)
		return
	}
	if deleted > 0 {
		slog.Info("GPU utilization worker: cleaned up old snapshots", "deleted", deleted)
	}
}
