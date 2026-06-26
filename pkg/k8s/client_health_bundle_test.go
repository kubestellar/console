package k8s

import (
	"context"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	clienttesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/clientcmd/api"
)

// ----------------------------------------------------------------------------
// #9334 — parallel health probing
// ----------------------------------------------------------------------------

// probeConcurrency is the number of clusters we simulate concurrently. It
// needs to be large enough that serialized probing is trivially distinguishable
// from parallel probing (by a factor of ~10x on wall clock) but small enough
// to keep the test fast in CI.
const probeConcurrency = 8

// probeArtificialLatency is the per-cluster synthetic List() latency we
// inject. It is long enough to dominate all other costs in the test but short
// enough for the whole test to finish in well under a second when the probes
// run in parallel.
const probeArtificialLatency = 150 * time.Millisecond

// TestGetAllClusterHealth_RunsInParallel verifies the #9334 fix: cluster
// health probes must fan out. Before the fix, `GetClient` held a global write
// lock across the slow `clientcmd…ClientConfig()` path, serializing all
// probes. We can't easily reproduce the client-construction delay here (the
// fake clients are pre-injected), but we CAN reproduce the wall-clock shape:
// if probes run in parallel, total time ≈ max(per-cluster latency); if they
// run serially, total time ≈ sum(per-cluster latency).
func TestGetAllClusterHealth_RunsInParallel(t *testing.T) {
	m := &MultiClusterClient{
		clients:     make(map[string]kubernetes.Interface),
		healthCache: make(map[string]*ClusterHealth),
		cacheTime:   make(map[string]time.Time),
		rawConfig:   &api.Config{Contexts: map[string]*api.Context{}},
	}

	var inflight int32
	var peakInflight int32
	for i := 0; i < probeConcurrency; i++ {
		name := clusterName(i)
		m.rawConfig.Contexts[name] = &api.Context{Cluster: name}
		fc := k8sfake.NewSimpleClientset(&corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "n"}})
		fc.PrependReactor("list", "nodes", func(action clienttesting.Action) (bool, k8sruntime.Object, error) {
			cur := atomic.AddInt32(&inflight, 1)
			// Track the high-water mark of concurrent in-flight probes.
			for {
				peak := atomic.LoadInt32(&peakInflight)
				if cur <= peak || atomic.CompareAndSwapInt32(&peakInflight, peak, cur) {
					break
				}
			}
			time.Sleep(probeArtificialLatency)
			atomic.AddInt32(&inflight, -1)
			return true, &corev1.NodeList{Items: []corev1.Node{{ObjectMeta: metav1.ObjectMeta{Name: "n"}}}}, nil
		})
		m.clients[name] = fc
	}

	start := time.Now()
	results, err := m.GetAllClusterHealth(context.Background())
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("GetAllClusterHealth: %v", err)
	}
	if len(results) != probeConcurrency {
		t.Fatalf("expected %d results, got %d", probeConcurrency, len(results))
	}
	// With true parallelism, peak in-flight should equal probeConcurrency.
	// Serial execution would cap peak at 1. Allow a small dip to >=2 as a
	// hedge against scheduling quirks — anything under that means probes are
	// serialized.
	if atomic.LoadInt32(&peakInflight) < 2 {
		t.Errorf("probes did not run concurrently (peak in-flight = %d); expected fan-out", peakInflight)
	}
	// And the wall-clock guard: serial would take at least
	// probeConcurrency*probeArtificialLatency. We pick 0.5× as a generous
	// upper bound.
	serialWallClock := time.Duration(probeConcurrency) * probeArtificialLatency
	if elapsed > serialWallClock/2 {
		t.Errorf("wall clock %v is close to serialized budget %v; probes not parallel",
			elapsed, serialWallClock)
	}
}

// TestGetClient_ConcurrentDistinctContexts is a targeted regression for the
// specific #9334 root cause: holding the write lock across the slow
// client-config path. We inject fakes before calling so the construction path
// is trivial, but we do verify that many parallel GetClient calls for
// DIFFERENT contexts all succeed without deadlock.
func TestGetClient_ConcurrentDistinctContexts(t *testing.T) {
	m := &MultiClusterClient{
		clients:     make(map[string]kubernetes.Interface),
		healthCache: make(map[string]*ClusterHealth),
		cacheTime:   make(map[string]time.Time),
	}
	for i := 0; i < probeConcurrency; i++ {
		m.clients[clusterName(i)] = k8sfake.NewSimpleClientset()
	}

	var wg sync.WaitGroup
	errs := make(chan error, probeConcurrency)
	for i := 0; i < probeConcurrency; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if _, err := m.GetClient(clusterName(i)); err != nil {
				errs <- err
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("GetClient: %v", err)
	}
}

func clusterName(i int) string {
	return "cluster-" + string(rune('a'+i))
}

// ----------------------------------------------------------------------------
// #9337 — inherited SecurityContext root-user detection
// ----------------------------------------------------------------------------

// TestCheckSecurityIssues_InheritedRunAsUser verifies that a pod-level
// RunAsUser=0 is detected even when the container has a non-nil
// SecurityContext that sets only unrelated fields. Before the #9337 fix, the
// container-level `Privileged: false` caused the pod-level RunAsUser=0 to be
// silently ignored, because the code only fell back to PodSecurityContext
// when the container SecurityContext itself was nil.
func TestCheckSecurityIssues_InheritedRunAsUser(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	falseVal := false
	rootUID := int64(0)
	nonRootUID := int64(1000)

	fakeCS := k8sfake.NewSimpleClientset(
		// Inherited root: container SC non-nil (Privileged=false only),
		// pod SC has RunAsUser=0. Previously missed.
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "inherited-root", Namespace: "default"},
			Spec: corev1.PodSpec{
				SecurityContext: &corev1.PodSecurityContext{RunAsUser: &rootUID},
				Containers: []corev1.Container{{
					Name:            "c1",
					SecurityContext: &corev1.SecurityContext{Privileged: &falseVal},
				}},
			},
		},
		// Container-level override: pod SC RunAsUser=0 but container explicitly
		// overrides to non-root. Must NOT be flagged (container wins).
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "container-override", Namespace: "default"},
			Spec: corev1.PodSpec{
				SecurityContext: &corev1.PodSecurityContext{RunAsUser: &rootUID},
				Containers: []corev1.Container{{
					Name:            "c1",
					SecurityContext: &corev1.SecurityContext{RunAsUser: &nonRootUID},
				}},
			},
		},
		// Both non-root: should not be flagged.
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "safe", Namespace: "default"},
			Spec: corev1.PodSpec{
				SecurityContext: &corev1.PodSecurityContext{RunAsUser: &nonRootUID},
				Containers: []corev1.Container{{
					Name:            "c1",
					SecurityContext: &corev1.SecurityContext{Privileged: &falseVal},
				}},
			},
		},
	)
	m.clients["c1"] = fakeCS

	issues, err := m.CheckSecurityIssues(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("CheckSecurityIssues: %v", err)
	}

	var inheritedRootFlagged, overrideFlagged, safeFlagged bool
	for _, iss := range issues {
		if iss.Issue != "Running as root" {
			continue
		}
		switch iss.Name {
		case "inherited-root":
			inheritedRootFlagged = true
		case "container-override":
			overrideFlagged = true
		case "safe":
			safeFlagged = true
		}
	}
	if !inheritedRootFlagged {
		t.Error("#9337 regression: inherited pod-level RunAsUser=0 was not flagged when container had a non-nil SecurityContext")
	}
	if overrideFlagged {
		t.Error("container-level RunAsUser=1000 should override pod-level RunAsUser=0 — should not be flagged")
	}
	if safeFlagged {
		t.Error("safe pod (both non-root) was incorrectly flagged")
	}
}

// ----------------------------------------------------------------------------
// #9338 — probeAPIServer IPv6 handling
// ----------------------------------------------------------------------------

func TestAPIServerDialAddr(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
		ok   bool
	}{
		// Hostnames and IPv4
		{"bare hostname", "api.example.com", "api.example.com:" + defaultAPIServerPort, true},
		{"hostname with port", "api.example.com:6443", "api.example.com:6443", true},
		{"ipv4 bare", "10.0.0.1", "10.0.0.1:" + defaultAPIServerPort, true},
		{"ipv4 with port", "10.0.0.1:6443", "10.0.0.1:6443", true},
		// Full URLs
		{"https URL", "https://api.example.com", "api.example.com:" + defaultAPIServerPort, true},
		{"https URL with port", "https://api.example.com:6443", "api.example.com:6443", true},
		{"http URL", "http://api.example.com", "api.example.com:80", true},
		// IPv6 — the regression cases for #9338
		{"ipv6 bare", "2001:db8::1", "[2001:db8::1]:" + defaultAPIServerPort, true},
		{"ipv6 bare loopback", "::1", "[::1]:" + defaultAPIServerPort, true},
		{"ipv6 bracketed no port", "[::1]", "[::1]:" + defaultAPIServerPort, true},
		{"ipv6 bracketed with port", "[::1]:8080", "[::1]:8080", true},
		{"ipv6 URL", "https://[2001:db8::1]:6443", "[2001:db8::1]:6443", true},
		{"ipv6 URL no port", "https://[::1]", "[::1]:" + defaultAPIServerPort, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := apiServerDialAddr(tc.in)
			if ok != tc.ok {
				t.Fatalf("ok = %v, want %v (got %q)", ok, tc.ok, got)
			}
			if got != tc.want {
				t.Errorf("apiServerDialAddr(%q) = %q, want %q", tc.in, got, tc.want)
			}
			// Belt-and-suspenders: the returned address must actually be a
			// valid host:port that net.SplitHostPort can round-trip.
			if ok {
				if _, _, err := net.SplitHostPort(got); err != nil {
					t.Errorf("net.SplitHostPort(%q) failed: %v", got, err)
				}
			}
		})
	}
}

func TestIsNumericPort(t *testing.T) {
	cases := map[string]bool{
		"":      false,
		"0":     true,
		"443":   true,
		"65535": true,
		"abc":   false,
		"4a":    false,
		"db8":   false, // IPv6 hex segment, NOT a port
	}
	for in, want := range cases {
		if got := isNumericPort(in); got != want {
			t.Errorf("isNumericPort(%q) = %v, want %v", in, got, want)
		}
	}
}

// ----------------------------------------------------------------------------
// #9339 — GetGPUNodeHealth redundant pod list
// ----------------------------------------------------------------------------

// TestGetGPUNodeHealth_SinglePodList verifies that calling GetGPUNodeHealth
// lists cluster-wide pods exactly once. Before the #9339 fix, it listed twice:
// once inside GetGPUNodes for allocation accounting, and once directly in
// GetGPUNodeHealth for stuck-pod detection. The fix routes the second consumer
// through the pod list the first call already produced.
func TestGetGPUNodeHealth_SinglePodList(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	gpuNode := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "gpu-node"},
		Status: corev1.NodeStatus{
			Conditions:  []corev1.NodeCondition{{Type: corev1.NodeReady, Status: corev1.ConditionTrue}},
			Allocatable: corev1.ResourceList{"nvidia.com/gpu": resource.MustParse("2")},
		},
	}
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "gpu-pod", Namespace: "default"},
		Spec:       corev1.PodSpec{NodeName: "gpu-node", Containers: []corev1.Container{{Name: "c"}}},
		Status:     corev1.PodStatus{Phase: corev1.PodRunning},
	}

	fc := k8sfake.NewSimpleClientset(gpuNode, pod)
	// Count every cluster-wide pod list (Namespace == "").
	var allNSPodListCount int32
	fc.PrependReactor("list", "pods", func(action clienttesting.Action) (bool, k8sruntime.Object, error) {
		if la, ok := action.(clienttesting.ListAction); ok {
			if la.GetNamespace() == "" {
				atomic.AddInt32(&allNSPodListCount, 1)
			}
		}
		return false, nil, nil // fall through to default tracker
	})
	m.clients["c1"] = fc

	results, err := m.GetGPUNodeHealth(context.Background(), "c1")
	if err != nil {
		t.Fatalf("GetGPUNodeHealth: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	got := atomic.LoadInt32(&allNSPodListCount)
	if got != 1 {
		t.Errorf("#9339 regression: cluster-wide Pods(\"\") listed %d times, want 1", got)
	}
}
