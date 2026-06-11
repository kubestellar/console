package dcgm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"k8s.io/client-go/rest"
)

// dcgmFixtureMultiNamespace is a DCGM exporter text-format payload with
// samples in two namespaces plus one unlabeled sample.
const dcgmFixtureMultiNamespace = `# HELP DCGM_FI_DEV_FB_USED Framebuffer memory used (in MiB).
# TYPE DCGM_FI_DEV_FB_USED gauge
DCGM_FI_DEV_FB_USED{gpu="0",UUID="GPU-abc",Hostname="node-1",namespace="ml-team",pod="trainer-0",container="worker"} 40960
DCGM_FI_DEV_FB_USED{gpu="1",UUID="GPU-def",Hostname="node-1",namespace="ml-team",pod="trainer-1",container="worker"} 20480
DCGM_FI_DEV_FB_USED{gpu="0",UUID="GPU-ghi",Hostname="node-2",namespace="inference",pod="server-0",container="serve"} 10240
DCGM_FI_DEV_FB_USED{gpu="0",UUID="GPU-jkl",Hostname="node-3"} 8192
# HELP DCGM_FI_DEV_FB_FREE Framebuffer memory free (in MiB).
# TYPE DCGM_FI_DEV_FB_FREE gauge
DCGM_FI_DEV_FB_FREE{gpu="0",UUID="GPU-abc",Hostname="node-1",namespace="ml-team",pod="trainer-0",container="worker"} 40960
DCGM_FI_DEV_FB_FREE{gpu="1",UUID="GPU-def",Hostname="node-1",namespace="ml-team",pod="trainer-1",container="worker"} 61440
DCGM_FI_DEV_FB_FREE{gpu="0",UUID="GPU-ghi",Hostname="node-2",namespace="inference",pod="server-0",container="serve"} 71680
DCGM_FI_DEV_FB_FREE{gpu="0",UUID="GPU-jkl",Hostname="node-3"} 73728
# HELP DCGM_FI_DEV_GPU_UTIL GPU utilization percent.
# TYPE DCGM_FI_DEV_GPU_UTIL gauge
DCGM_FI_DEV_GPU_UTIL{gpu="0",UUID="GPU-abc",namespace="ml-team"} 95
`

const dcgmFixtureEmpty = `# HELP DCGM_FI_DEV_FB_USED Framebuffer memory used (in MiB).
# TYPE DCGM_FI_DEV_FB_USED gauge
`

func TestParseResponse_MultiNamespace(t *testing.T) {
	got, err := ParseResponse(strings.NewReader(dcgmFixtureMultiNamespace))
	if err != nil {
		t.Fatalf("ParseResponse: %v", err)
	}

	// ml-team: 40960 + 20480 used, 40960 + 61440 free = 61440 / (61440 + 102400) = 37.5%
	ml, ok := got["ml-team"]
	if !ok {
		t.Fatalf("expected ml-team in result, got keys: %v", keys(got))
	}
	if ml.FBUsedMiB != 61440 {
		t.Errorf("ml-team FBUsedMiB: got %v, want 61440", ml.FBUsedMiB)
	}
	if ml.FBFreeMiB != 102400 {
		t.Errorf("ml-team FBFreeMiB: got %v, want 102400", ml.FBFreeMiB)
	}
	if got, want := ml.UtilizationPct(), 37.5; got != want {
		t.Errorf("ml-team UtilizationPct: got %v, want %v", got, want)
	}
	if ml.SampleCount != 2 {
		t.Errorf("ml-team SampleCount: got %d, want 2", ml.SampleCount)
	}

	// inference: 10240 / (10240 + 71680) = 12.5%
	inf, ok := got["inference"]
	if !ok {
		t.Fatalf("expected inference in result")
	}
	if got, want := inf.UtilizationPct(), 12.5; got != want {
		t.Errorf("inference UtilizationPct: got %v, want %v", got, want)
	}

	// "" bucket (unlabeled sample): 8192 / (8192 + 73728) = 10%
	unlabeled, ok := got[""]
	if !ok {
		t.Fatalf(`expected "" (unlabeled) bucket in result`)
	}
	if got, want := unlabeled.UtilizationPct(), 10.0; got != want {
		t.Errorf("unlabeled UtilizationPct: got %v, want %v", got, want)
	}
}

func TestParseResponse_EmptyPayload(t *testing.T) {
	got, err := ParseResponse(strings.NewReader(dcgmFixtureEmpty))
	if err != nil {
		t.Fatalf("ParseResponse empty: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty map on empty payload, got %d entries", len(got))
	}
}

func TestParseResponse_MalformedPayload(t *testing.T) {
	_, err := ParseResponse(strings.NewReader("not valid prometheus text $$$\n"))
	if err == nil {
		t.Fatal("expected error for malformed payload, got nil")
	}
}

func TestNamespaceMetrics_UtilizationPct_ZeroCapacity(t *testing.T) {
	m := &NamespaceMetrics{FBUsedMiB: 0, FBFreeMiB: 0}
	if pct := m.UtilizationPct(); pct != 0 {
		t.Errorf("zero-capacity UtilizationPct: got %v, want 0", pct)
	}

	var nilMetrics *NamespaceMetrics
	if pct := nilMetrics.UtilizationPct(); pct != 0 {
		t.Errorf("nil UtilizationPct: got %v, want 0", pct)
	}
}

func TestScrapeByNamespace_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		_, _ = w.Write([]byte(dcgmFixtureMultiNamespace))
	}))
	defer srv.Close()

	cfg := &rest.Config{Host: srv.URL}
	got, err := ScrapeByNamespace(context.Background(), cfg, ScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	if err != nil {
		t.Fatalf("ScrapeByNamespace: %v", err)
	}
	if _, ok := got["ml-team"]; !ok {
		t.Errorf("expected ml-team namespace in scraped result, got keys: %v", keys(got))
	}
}

func TestScrapeByNamespace_NotInstalled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer srv.Close()

	cfg := &rest.Config{Host: srv.URL}
	got, err := ScrapeByNamespace(context.Background(), cfg, ScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	if err != nil {
		t.Fatalf("ScrapeByNamespace on 404: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty map on 404 (DCGM absent), got %d entries", len(got))
	}
}

func TestScrapeByNamespace_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal", http.StatusInternalServerError)
	}))
	defer srv.Close()

	cfg := &rest.Config{Host: srv.URL}
	_, err := ScrapeByNamespace(context.Background(), cfg, ScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	if err == nil {
		t.Fatal("expected error on 500, got nil")
	}
}

func TestScrapeByNamespace_InvalidNamespace(t *testing.T) {
	cfg := &rest.Config{Host: "http://unused"}
	_, err := ScrapeByNamespace(context.Background(), cfg, ScrapeConfig{
		Namespace: "../etc/passwd",
		Service:   "dcgm-exporter",
	})
	if err == nil {
		t.Fatal("expected validation error on path-traversal namespace, got nil")
	}
}

func TestScrapeByNamespace_NilConfig(t *testing.T) {
	_, err := ScrapeByNamespace(context.Background(), nil, ScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	if err == nil {
		t.Fatal("expected error on nil rest.Config, got nil")
	}
}

func keys(m map[string]*NamespaceMetrics) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
