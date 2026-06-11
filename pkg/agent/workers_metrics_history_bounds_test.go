package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	// boundsTestOverflow is how many extra snapshots beyond maxSnapshots to add,
	// verifying that the oldest entries are evicted.
	boundsTestOverflow = 10

	// boundsTestSingleSnapshot is used when testing the single-snapshot edge case.
	boundsTestSingleSnapshot = 1

	// boundsTestRoundTripCount is the number of snapshots to use in save/load round-trip tests.
	boundsTestRoundTripCount = 5

	// boundsTestClusterCPU is a representative CPU percentage for test cluster snapshots.
	boundsTestClusterCPU = 45.5

	// boundsTestClusterMem is a representative memory percentage for test cluster snapshots.
	boundsTestClusterMem = 62.3

	// boundsTestNodeCount is the number of nodes for test cluster snapshots.
	boundsTestNodeCount = 3

	// boundsTestHealthyNodes is the number of healthy nodes for test cluster snapshots.
	boundsTestHealthyNodes = 3

	// boundsTestRestarts is the number of pod restarts for test pod issue snapshots.
	boundsTestRestarts = 5

	// boundsTestGPUAllocated is the number of allocated GPUs for test GPU node snapshots.
	boundsTestGPUAllocated = 2

	// boundsTestGPUTotal is the total number of GPUs for test GPU node snapshots.
	boundsTestGPUTotal = 4
)

// newBoundsTestK8sClient creates a minimal k8s.MultiClusterClient for bounds tests.
func newBoundsTestK8sClient(t *testing.T) *k8s.MultiClusterClient {
	t.Helper()
	m, _ := k8s.NewMultiClusterClient("")
	m.SetRawConfig(&api.Config{
		Contexts: map[string]*api.Context{"bounds-ctx": {Cluster: "bounds-cluster"}},
		Clusters: map[string]*api.Cluster{"bounds-cluster": {Server: "https://fake:6443"}},
	})
	m.InjectClient("bounds-ctx", fakek8s.NewSimpleClientset())
	return m
}

// makeTestSnapshot creates a MetricsSnapshot with the given timestamp and
// populated with representative cluster, pod issue, and GPU data.
func makeTestSnapshot(ts time.Time) MetricsSnapshot {
	return MetricsSnapshot{
		Timestamp: ts.Format(time.RFC3339),
		Clusters: []ClusterMetricSnapshot{
			{
				Name:          "test-cluster",
				CPUPercent:    boundsTestClusterCPU,
				MemoryPercent: boundsTestClusterMem,
				NodeCount:     boundsTestNodeCount,
				HealthyNodes:  boundsTestHealthyNodes,
			},
		},
		PodIssues: []PodIssueSnapshot{
			{
				Name:     "crashing-pod",
				Cluster:  "test-cluster",
				Restarts: boundsTestRestarts,
				Status:   "CrashLoopBackOff",
			},
		},
		GPUNodes: []GPUNodeMetricSnapshot{
			{
				Name:         "gpu-node-1",
				Cluster:      "test-cluster",
				GPUType:      "NVIDIA A100",
				GPUAllocated: boundsTestGPUAllocated,
				GPUTotal:     boundsTestGPUTotal,
			},
		},
	}
}

// TestCaptureSnapshot_RespectsMaxSnapshots verifies that after adding more than
// maxSnapshots entries, the internal slice is trimmed to at most maxSnapshots.
func TestCaptureSnapshot_RespectsMaxSnapshots(t *testing.T) {
	tmpDir := t.TempDir()
	client := newBoundsTestK8sClient(t)

	mh := NewMetricsHistory(client, tmpDir)

	// Directly inject maxSnapshots + overflow entries into the snapshots slice.
	// All timestamps are recent (within retention window) so only the count bound applies.
	totalSnapshots := maxSnapshots + boundsTestOverflow
	now := time.Now()

	mh.mu.Lock()
	mh.snapshots = make([]MetricsSnapshot, 0, totalSnapshots)
	for i := 0; i < totalSnapshots; i++ {
		// Space entries 1 minute apart, all within the 7-day retention window
		ts := now.Add(-time.Duration(totalSnapshots-i) * time.Minute)
		mh.snapshots = append(mh.snapshots, makeTestSnapshot(ts))
	}
	mh.mu.Unlock()

	// Trigger captureSnapshot — this will add one more entry and then trim
	if err := mh.captureSnapshot(); err != nil {
		t.Fatalf("captureSnapshot() failed: %v", err)
	}

	// Allow async saveToDisk to finish
	time.Sleep(leakTestDrainDelay)

	resp := mh.GetSnapshots()
	if len(resp.Snapshots) > maxSnapshots {
		t.Errorf("expected at most %d snapshots after trimming, got %d",
			maxSnapshots, len(resp.Snapshots))
	}

	// The most recent snapshot should be the one we just captured (has a recent timestamp)
	lastSnapshot := resp.Snapshots[len(resp.Snapshots)-1]
	lastTS, err := time.Parse(time.RFC3339, lastSnapshot.Timestamp)
	if err != nil {
		t.Fatalf("failed to parse last snapshot timestamp: %v", err)
	}

	// The newest snapshot should be within the last minute
	const maxTimeDrift = 1 * time.Minute
	if time.Since(lastTS) > maxTimeDrift {
		t.Errorf("newest snapshot timestamp %v is too old (expected within last %v)", lastTS, maxTimeDrift)
	}
}

// TestCaptureSnapshot_EvictsOldest verifies that when the snapshot count exceeds
// maxSnapshots, the oldest entries are the ones removed (FIFO eviction).
func TestCaptureSnapshot_EvictsOldest(t *testing.T) {
	tmpDir := t.TempDir()
	client := newBoundsTestK8sClient(t)

	mh := NewMetricsHistory(client, tmpDir)

	// Inject exactly maxSnapshots entries with known ordered timestamps
	now := time.Now()
	mh.mu.Lock()
	mh.snapshots = make([]MetricsSnapshot, 0, maxSnapshots)
	for i := 0; i < maxSnapshots; i++ {
		ts := now.Add(-time.Duration(maxSnapshots-i) * time.Minute)
		mh.snapshots = append(mh.snapshots, makeTestSnapshot(ts))
	}
	// Record the timestamp of what is currently the oldest entry
	oldestTS := mh.snapshots[0].Timestamp
	mh.mu.Unlock()

	// Capture one more — this should evict the oldest
	if err := mh.captureSnapshot(); err != nil {
		t.Fatalf("captureSnapshot() failed: %v", err)
	}

	time.Sleep(leakTestDrainDelay)

	resp := mh.GetSnapshots()
	if len(resp.Snapshots) > maxSnapshots {
		t.Errorf("expected at most %d snapshots, got %d", maxSnapshots, len(resp.Snapshots))
	}

	// The oldest entry should have been evicted
	for _, s := range resp.Snapshots {
		if s.Timestamp == oldestTS {
			t.Errorf("oldest snapshot (ts=%s) should have been evicted but is still present", oldestTS)
			break
		}
	}
}

// TestSaveToDisk_LoadFromDisk_RoundTrip verifies that snapshots survive a
// save-to-disk / load-from-disk cycle with full data integrity.
func TestSaveToDisk_LoadFromDisk_RoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	client := newBoundsTestK8sClient(t)

	mh := NewMetricsHistory(client, tmpDir)

	// Inject known test snapshots
	now := time.Now()
	mh.mu.Lock()
	mh.snapshots = make([]MetricsSnapshot, 0, boundsTestRoundTripCount)
	for i := 0; i < boundsTestRoundTripCount; i++ {
		ts := now.Add(-time.Duration(boundsTestRoundTripCount-i) * time.Minute)
		mh.snapshots = append(mh.snapshots, makeTestSnapshot(ts))
	}
	mh.mu.Unlock()

	// Save to disk
	mh.saveToDisk()

	// Verify the file was written
	filePath := filepath.Join(tmpDir, metricsHistoryFile)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		t.Fatal("metrics history file was not created on disk")
	}

	// Create a new MetricsHistory that loads from the same directory
	mh2 := NewMetricsHistory(client, tmpDir)

	resp := mh2.GetSnapshots()
	if len(resp.Snapshots) != boundsTestRoundTripCount {
		t.Fatalf("expected %d snapshots loaded from disk, got %d",
			boundsTestRoundTripCount, len(resp.Snapshots))
	}

	// Verify data integrity of each snapshot
	for i, s := range resp.Snapshots {
		// Check cluster data
		if len(s.Clusters) != 1 {
			t.Errorf("snapshot %d: expected 1 cluster, got %d", i, len(s.Clusters))
			continue
		}
		c := s.Clusters[0]
		if c.Name != "test-cluster" {
			t.Errorf("snapshot %d: expected cluster name 'test-cluster', got %q", i, c.Name)
		}
		if c.CPUPercent != boundsTestClusterCPU {
			t.Errorf("snapshot %d: expected CPU %.1f%%, got %.1f%%", i, boundsTestClusterCPU, c.CPUPercent)
		}
		if c.MemoryPercent != boundsTestClusterMem {
			t.Errorf("snapshot %d: expected memory %.1f%%, got %.1f%%", i, boundsTestClusterMem, c.MemoryPercent)
		}
		if c.NodeCount != boundsTestNodeCount {
			t.Errorf("snapshot %d: expected %d nodes, got %d", i, boundsTestNodeCount, c.NodeCount)
		}

		// Check pod issues
		if len(s.PodIssues) != 1 {
			t.Errorf("snapshot %d: expected 1 pod issue, got %d", i, len(s.PodIssues))
			continue
		}
		p := s.PodIssues[0]
		if p.Restarts != boundsTestRestarts {
			t.Errorf("snapshot %d: expected %d restarts, got %d", i, boundsTestRestarts, p.Restarts)
		}

		// Check GPU nodes
		if len(s.GPUNodes) != 1 {
			t.Errorf("snapshot %d: expected 1 GPU node, got %d", i, len(s.GPUNodes))
			continue
		}
		g := s.GPUNodes[0]
		if g.GPUType != "NVIDIA A100" {
			t.Errorf("snapshot %d: expected GPU type 'NVIDIA A100', got %q", i, g.GPUType)
		}
		if g.GPUAllocated != boundsTestGPUAllocated {
			t.Errorf("snapshot %d: expected %d GPUs allocated, got %d", i, boundsTestGPUAllocated, g.GPUAllocated)
		}
		if g.GPUTotal != boundsTestGPUTotal {
			t.Errorf("snapshot %d: expected %d total GPUs, got %d", i, boundsTestGPUTotal, g.GPUTotal)
		}
	}
}

// TestSaveToDisk_LoadFromDisk_EmptyHistory verifies that an empty history
// can be saved and loaded without error.
func TestSaveToDisk_LoadFromDisk_EmptyHistory(t *testing.T) {
	tmpDir := t.TempDir()
	client := newBoundsTestK8sClient(t)

	mh := NewMetricsHistory(client, tmpDir)
	// Snapshots slice is empty by default from NewMetricsHistory

	mh.saveToDisk()

	// Load in a new instance
	mh2 := NewMetricsHistory(client, tmpDir)
	resp := mh2.GetSnapshots()

	if len(resp.Snapshots) != 0 {
		t.Errorf("expected 0 snapshots for empty history, got %d", len(resp.Snapshots))
	}
}

// TestSaveToDisk_LoadFromDisk_SingleSnapshot verifies the edge case of exactly
// one snapshot surviving a round-trip.
func TestSaveToDisk_LoadFromDisk_SingleSnapshot(t *testing.T) {
	tmpDir := t.TempDir()
	client := newBoundsTestK8sClient(t)

	mh := NewMetricsHistory(client, tmpDir)

	mh.mu.Lock()
	mh.snapshots = []MetricsSnapshot{makeTestSnapshot(time.Now())}
	mh.mu.Unlock()

	mh.saveToDisk()

	mh2 := NewMetricsHistory(client, tmpDir)
	resp := mh2.GetSnapshots()

	if len(resp.Snapshots) != boundsTestSingleSnapshot {
		t.Errorf("expected %d snapshot, got %d", boundsTestSingleSnapshot, len(resp.Snapshots))
	}
}

// TestCaptureSnapshot_ExactlyAtBound verifies that when the snapshot count is
// exactly at maxSnapshots, no eviction happens until a new entry pushes it over.
func TestCaptureSnapshot_ExactlyAtBound(t *testing.T) {
	tmpDir := t.TempDir()
	client := newBoundsTestK8sClient(t)

	mh := NewMetricsHistory(client, tmpDir)

	// Inject exactly maxSnapshots - 1 entries (room for one more)
	now := time.Now()
	initialCount := maxSnapshots - 1
	mh.mu.Lock()
	mh.snapshots = make([]MetricsSnapshot, 0, maxSnapshots)
	for i := 0; i < initialCount; i++ {
		ts := now.Add(-time.Duration(initialCount-i) * time.Minute)
		mh.snapshots = append(mh.snapshots, makeTestSnapshot(ts))
	}
	firstTS := mh.snapshots[0].Timestamp
	mh.mu.Unlock()

	// Capture one more — should land exactly at maxSnapshots (no eviction needed)
	if err := mh.captureSnapshot(); err != nil {
		t.Fatalf("captureSnapshot() failed: %v", err)
	}

	time.Sleep(leakTestDrainDelay)

	resp := mh.GetSnapshots()
	if len(resp.Snapshots) != maxSnapshots {
		t.Errorf("expected exactly %d snapshots, got %d", maxSnapshots, len(resp.Snapshots))
	}

	// The original first entry should still be present (no eviction)
	found := false
	for _, s := range resp.Snapshots {
		if s.Timestamp == firstTS {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("first snapshot (ts=%s) should still be present when exactly at bound", firstTS)
	}
}

// TestLoadFromDisk_CorruptedFile verifies that a corrupted JSON file on disk
// does not crash loadFromDisk — it should gracefully handle the error and start
// with an empty snapshot list.
func TestLoadFromDisk_CorruptedFile(t *testing.T) {
	tmpDir := t.TempDir()

	// Write garbage to the metrics history file
	filePath := filepath.Join(tmpDir, metricsHistoryFile)
	if err := os.WriteFile(filePath, []byte("invalid json{{{"), metricsFileMode); err != nil {
		t.Fatalf("failed to write corrupted file: %v", err)
	}

	client := newBoundsTestK8sClient(t)
	mh := NewMetricsHistory(client, tmpDir)

	resp := mh.GetSnapshots()
	if len(resp.Snapshots) != 0 {
		t.Errorf("expected 0 snapshots after loading corrupted file, got %d", len(resp.Snapshots))
	}
}

// TestLoadFromDisk_MissingFile verifies that a missing history file is handled
// gracefully (fresh start with empty snapshots).
func TestLoadFromDisk_MissingFile(t *testing.T) {
	tmpDir := t.TempDir()
	// Don't create any file — directory is empty

	client := newBoundsTestK8sClient(t)
	mh := NewMetricsHistory(client, tmpDir)

	resp := mh.GetSnapshots()
	if len(resp.Snapshots) != 0 {
		t.Errorf("expected 0 snapshots when no file exists, got %d", len(resp.Snapshots))
	}
}

// TestSaveToDisk_FileContentsMatch verifies that the on-disk JSON exactly matches
// the in-memory snapshots (byte-level integrity check via re-marshal).
func TestSaveToDisk_FileContentsMatch(t *testing.T) {
	tmpDir := t.TempDir()
	client := newBoundsTestK8sClient(t)

	mh := NewMetricsHistory(client, tmpDir)

	now := time.Now()
	mh.mu.Lock()
	mh.snapshots = []MetricsSnapshot{
		makeTestSnapshot(now.Add(-2 * time.Minute)),
		makeTestSnapshot(now.Add(-1 * time.Minute)),
	}
	expected := make([]MetricsSnapshot, len(mh.snapshots))
	copy(expected, mh.snapshots)
	mh.mu.Unlock()

	mh.saveToDisk()

	filePath := filepath.Join(tmpDir, metricsHistoryFile)
	data, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("failed to read saved file: %v", err)
	}

	var loaded []MetricsSnapshot
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("failed to unmarshal saved file: %v", err)
	}

	if len(loaded) != len(expected) {
		t.Fatalf("expected %d snapshots on disk, got %d", len(expected), len(loaded))
	}

	for i, s := range loaded {
		if s.Timestamp != expected[i].Timestamp {
			t.Errorf("snapshot %d: timestamp mismatch: got %q, want %q",
				i, s.Timestamp, expected[i].Timestamp)
		}
		if len(s.Clusters) != len(expected[i].Clusters) {
			t.Errorf("snapshot %d: cluster count mismatch: got %d, want %d",
				i, len(s.Clusters), len(expected[i].Clusters))
		}
	}
}
