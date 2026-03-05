package api

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const (
	// defaultUtilPollIntervalMs is the default polling interval for GPU utilization (1 hour)
	defaultUtilPollIntervalMs = 3_600_000
	// snapshotRetentionDays is how long to keep utilization snapshots before cleanup
	snapshotRetentionDays = 90
	// fullUtilizationPct is the utilization percentage used when GPUs are active but no metrics API exists
	fullUtilizationPct = 100.0
)

// GPUUtilizationWorker periodically collects GPU utilization data for active reservations
type GPUUtilizationWorker struct {
	store     store.Store
	k8sClient *k8s.MultiClusterClient
	interval  time.Duration
	stopCh    chan struct{}
}

// NewGPUUtilizationWorker creates a new GPU utilization worker
func NewGPUUtilizationWorker(s store.Store, k8sClient *k8s.MultiClusterClient) *GPUUtilizationWorker {
	intervalMs := defaultUtilPollIntervalMs
	if envVal := os.Getenv("GPU_UTIL_POLL_INTERVAL_MS"); envVal != "" {
		if parsed, err := strconv.Atoi(envVal); err == nil && parsed > 0 {
			intervalMs = parsed
		}
	}

	return &GPUUtilizationWorker{
		store:     s,
		k8sClient: k8sClient,
		interval:  time.Duration(intervalMs) * time.Millisecond,
		stopCh:    make(chan struct{}),
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
	log.Printf("GPU utilization worker started (interval: %v)", w.interval)
}

// Stop signals the worker to stop
func (w *GPUUtilizationWorker) Stop() {
	close(w.stopCh)
}

// collectUtilization queries active reservations and records utilization snapshots
func (w *GPUUtilizationWorker) collectUtilization() {
	if w.k8sClient == nil {
		return
	}

	reservations, err := w.store.ListActiveGPUReservations()
	if err != nil {
		log.Printf("GPU utilization worker: failed to list active reservations: %v", err)
		return
	}

	if len(reservations) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), w.interval/2)
	defer cancel()

	for i := range reservations {
		w.collectForReservation(ctx, &reservations[i])
	}
}

// collectForReservation collects utilization for a single reservation
func (w *GPUUtilizationWorker) collectForReservation(ctx context.Context, reservation *models.GPUReservation) {
	cluster := reservation.Cluster
	namespace := reservation.Namespace

	// Get pods in this namespace/cluster
	pods, err := w.k8sClient.GetPods(ctx, cluster, namespace)
	if err != nil {
		log.Printf("GPU utilization worker: failed to get pods for %s/%s: %v", cluster, namespace, err)
		return
	}

	// Get GPU nodes for this cluster to know which nodes have GPUs
	gpuNodes, err := w.k8sClient.GetGPUNodes(ctx, cluster)
	if err != nil {
		log.Printf("GPU utilization worker: failed to get GPU nodes for %s: %v", cluster, err)
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
		log.Printf("GPU utilization worker: failed to insert snapshot for reservation %s: %v", reservation.ID, err)
	}
}

// cleanupOldSnapshots removes snapshots older than the retention period
func (w *GPUUtilizationWorker) cleanupOldSnapshots() {
	cutoff := time.Now().AddDate(0, 0, -snapshotRetentionDays)
	deleted, err := w.store.DeleteOldUtilizationSnapshots(cutoff)
	if err != nil {
		log.Printf("GPU utilization worker: failed to cleanup old snapshots: %v", err)
		return
	}
	if deleted > 0 {
		log.Printf("GPU utilization worker: cleaned up %d old snapshots", deleted)
	}
}
