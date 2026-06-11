package agent

import (
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestMetricsHistory(t *testing.T) {
	// 1. Setup mock k8s client
	m, _ := k8s.NewMultiClusterClient("")
	m.SetRawConfig(&api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
		Clusters: map[string]*api.Cluster{"cl1": {Server: "s1"}},
	})
	m.InjectClient("c1", fakek8s.NewSimpleClientset())

	// 2. Setup MetricsHistory with per-test temp dir.
	// Previously this used a hardcoded "/tmp/metrics-test" which collided with
	// concurrent CI runs and leftover state from prior jobs, producing
	// intermittent `invalid character 'o' in literal null` parse errors when
	// loadFromDisk read a partially-written or foreign JSON file. t.TempDir()
	// is unique per test and auto-cleaned. Fixes #7898 / #7899.
	tmpDir := t.TempDir()

	mh := NewMetricsHistory(m, tmpDir)

	// 3. Test CaptureNow
	err := mh.CaptureNow()
	if err != nil {
		t.Fatalf("CaptureNow failed: %v", err)
	}

	resp := mh.GetSnapshots()
	if len(resp.Snapshots) != 1 {
		t.Errorf("Expected 1 snapshot, got %d", len(resp.Snapshots))
	}

	// 4. Test GetRecentSnapshots
	recent := mh.GetRecentSnapshots(1)
	if len(recent) != 1 {
		t.Error("Recent snapshots failed")
	}

	// 5. Test Persistence (save/load)
	mh.saveToDisk()
	time.Sleep(100 * time.Millisecond) // Wait for any async saves from CaptureNow to finish

	mh2 := NewMetricsHistory(m, tmpDir)

	resp2 := mh2.GetSnapshots()
	if len(resp2.Snapshots) != 1 {
		t.Errorf("Expected 1 snapshot loaded from disk, got %d", len(resp2.Snapshots))
	}

	// 6. Test GetTrendContext
	contextStr := mh.GetTrendContext()
	if contextStr == "" || contextStr == "No historical metrics available yet." {
		t.Error("Trend context failed")
	}
}
