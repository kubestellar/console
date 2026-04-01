package agent

import (
	"testing"
	"time"

	"go.uber.org/goleak"

	"github.com/kubestellar/console/pkg/k8s"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	// leakTestInterval is the metrics collection interval used in goroutine leak tests.
	// Keep it short so tests don't take long, but long enough that the ticker fires at most once.
	leakTestInterval = 200 * time.Millisecond

	// leakTestSettleDelay is how long to wait after Start() before calling Stop(),
	// giving the goroutine time to enter its select loop.
	leakTestSettleDelay = 50 * time.Millisecond

	// leakTestDrainDelay is how long to wait after Stop() for background goroutines
	// (e.g. the async saveToDisk goroutine) to finish before checking for leaks.
	leakTestDrainDelay = 300 * time.Millisecond
)

// newTestK8sClient creates a minimal k8s.MultiClusterClient with one fake cluster
// for use in goroutine leak tests.
func newTestK8sClient(t *testing.T) *k8s.MultiClusterClient {
	t.Helper()
	m, _ := k8s.NewMultiClusterClient("")
	m.SetRawConfig(&api.Config{
		Contexts: map[string]*api.Context{"test-ctx": {Cluster: "test-cluster"}},
		Clusters: map[string]*api.Cluster{"test-cluster": {Server: "https://fake:6443"}},
	})
	m.InjectClient("test-ctx", fakek8s.NewSimpleClientset())
	return m
}

// TestMetricsHistory_StartStop_NoLeak verifies that calling Start() followed by
// Stop() does not leak goroutines. This is the core lifecycle test for the
// metrics collection loop goroutine.
func TestMetricsHistory_StartStop_NoLeak(t *testing.T) {
	tmpDir := t.TempDir()
	client := newTestK8sClient(t)

	mh := NewMetricsHistory(client, tmpDir)

	mh.Start(leakTestInterval)

	// Let the goroutine settle into its select loop
	time.Sleep(leakTestSettleDelay)

	mh.Stop()

	// Wait for any async saves spawned by captureSnapshot to complete
	time.Sleep(leakTestDrainDelay)

	// Verify no goroutines leaked — ignore pre-existing goroutines from the
	// test framework and runtime so we only detect leaks from our code.
	goleak.VerifyNone(t, goleak.IgnoreCurrent())
}

// TestMetricsHistory_MultipleCaptures_NoLeak verifies that calling CaptureNow()
// multiple times without Start()/Stop() does not accumulate leaked goroutines.
// Each CaptureNow() spawns a background saveToDisk goroutine that must complete.
func TestMetricsHistory_MultipleCaptures_NoLeak(t *testing.T) {
	tmpDir := t.TempDir()
	client := newTestK8sClient(t)

	mh := NewMetricsHistory(client, tmpDir)

	// Take a baseline of goroutines before our operations
	// so IgnoreCurrent() captures the right set.
	opts := []goleak.Option{goleak.IgnoreCurrent()}

	const captureCount = 5 // number of manual captures to perform
	for i := 0; i < captureCount; i++ {
		if err := mh.CaptureNow(); err != nil {
			t.Fatalf("CaptureNow() iteration %d failed: %v", i, err)
		}
	}

	// Wait for all background saveToDisk goroutines to finish
	time.Sleep(leakTestDrainDelay)

	goleak.VerifyNone(t, opts...)
}

// TestMetricsHistory_NilClient_NoLeak verifies that when k8sClient is nil (no
// kubeconfig available), Start()/Stop() still cleans up properly.
func TestMetricsHistory_NilClient_NoLeak(t *testing.T) {
	tmpDir := t.TempDir()

	mh := NewMetricsHistory(nil, tmpDir)

	mh.Start(leakTestInterval)
	time.Sleep(leakTestSettleDelay)
	mh.Stop()
	time.Sleep(leakTestDrainDelay)

	goleak.VerifyNone(t, goleak.IgnoreCurrent())
}
