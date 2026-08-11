package gpu

import (
	"context"
	"strings"
	"testing"

	dto "github.com/prometheus/client_model/go"
	"k8s.io/client-go/rest"
)

// dcgmFixtureCounter exercises the Counter branch of sampleValue by using
// a Prometheus counter metric family for FB_USED. DCGM normally emits
// gauges, but the parser should still aggregate counter samples.
const dcgmFixtureCounter = `# HELP DCGM_FI_DEV_FB_USED Framebuffer memory used (in MiB).
# TYPE DCGM_FI_DEV_FB_USED counter
DCGM_FI_DEV_FB_USED{namespace="team-a"} 1024
DCGM_FI_DEV_FB_USED{namespace="team-a"} 2048
# HELP DCGM_FI_DEV_FB_FREE Framebuffer memory free (in MiB).
# TYPE DCGM_FI_DEV_FB_FREE counter
DCGM_FI_DEV_FB_FREE{namespace="team-a"} 8192
`

func TestSampleValue_GaugeCounterAndDefault(t *testing.T) {
	gaugeVal := 42.0
	counterVal := 17.0

	tests := []struct {
		name   string
		metric *dto.Metric
		want   float64
	}{
		{
			name:   "gauge_metric_returns_gauge_value",
			metric: &dto.Metric{Gauge: &dto.Gauge{Value: &gaugeVal}},
			want:   gaugeVal,
		},
		{
			name:   "counter_metric_returns_counter_value",
			metric: &dto.Metric{Counter: &dto.Counter{Value: &counterVal}},
			want:   counterVal,
		},
		{
			name:   "metric_without_gauge_or_counter_returns_zero",
			metric: &dto.Metric{},
			want:   0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := sampleValue(tc.metric)
			if got != tc.want {
				t.Errorf("sampleValue: got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestParseResponse_CounterFamily(t *testing.T) {
	got, err := ParseResponse(strings.NewReader(dcgmFixtureCounter))
	if err != nil {
		t.Fatalf("ParseResponse counter fixture: %v", err)
	}
	entry, ok := got["team-a"]
	if !ok {
		t.Fatalf("expected team-a bucket, got keys: %v", keys(got))
	}
	// Two counter samples for FB_USED: 1024 + 2048 = 3072
	const wantUsed = 3072.0
	if entry.FBUsedMiB != wantUsed {
		t.Errorf("team-a FBUsedMiB: got %v, want %v", entry.FBUsedMiB, wantUsed)
	}
	const wantFree = 8192.0
	if entry.FBFreeMiB != wantFree {
		t.Errorf("team-a FBFreeMiB: got %v, want %v", entry.FBFreeMiB, wantFree)
	}
}

func TestValidateDNS1123Label_EmptyValue(t *testing.T) {
	err := validateDNS1123Label("dcgm namespace", "")
	if err == nil {
		t.Fatal("expected error for empty label, got nil")
	}
	if !strings.Contains(err.Error(), "must not be empty") {
		t.Errorf("expected 'must not be empty' in error, got %v", err)
	}
}

func TestScrapeByNamespace_InvalidService(t *testing.T) {
	cfg := &rest.Config{Host: "http://unused"}
	_, err := ScrapeByNamespace(context.Background(), cfg, ScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "../invalid",
	})
	if err == nil {
		t.Fatal("expected validation error on invalid service label, got nil")
	}
	if !strings.Contains(err.Error(), "dcgm service") {
		t.Errorf("expected 'dcgm service' in error, got %v", err)
	}
}

func TestScrapeByNamespace_ClientDoFailure(t *testing.T) {
	// Point the client at an unroutable loopback port so client.Do fails.
	// Port 1 is privileged and typically refuses connection immediately.
	cfg := &rest.Config{Host: "http://127.0.0.1:1"}
	_, err := ScrapeByNamespace(context.Background(), cfg, ScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	if err == nil {
		t.Fatal("expected transport error connecting to 127.0.0.1:1, got nil")
	}
	if !strings.Contains(err.Error(), "dcgm: scrape") {
		t.Errorf("expected 'dcgm: scrape' prefix in error, got %v", err)
	}
}

func TestScrapeByNamespace_DefaultsPortAndPath(t *testing.T) {
	// When Port and Path are empty, ScrapeByNamespace should apply
	// DefaultPort and DefaultPath. We can't reach the default network
	// target, but we can confirm that the empty-string branches don't
	// short-circuit validation and that the request build path is taken
	// (surfacing the eventual Do() error rather than a validation error).
	cfg := &rest.Config{Host: "http://127.0.0.1:1"}
	_, err := ScrapeByNamespace(context.Background(), cfg, ScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
		// Port and Path intentionally left empty
	})
	if err == nil {
		t.Fatal("expected transport error, got nil")
	}
	// The error must come from the transport, not validation.
	if strings.Contains(err.Error(), "must not be empty") ||
		strings.Contains(err.Error(), "is not a valid DNS-1123 label") {
		t.Errorf("expected transport error when defaults apply, got validation error: %v", err)
	}
}

func TestGetOrCreateClient_TransportError(t *testing.T) {
	// A rest.Config with a CAFile pointing to a nonexistent path forces
	// rest.TransportFor to fail, exercising the error branch.
	cfg := &rest.Config{
		Host: "https://unique-transport-error-host.invalid",
		TLSClientConfig: rest.TLSClientConfig{
			CAFile: "/nonexistent/path/to/ca.crt",
		},
	}
	_, err := getOrCreateClient(cfg)
	if err == nil {
		t.Fatal("expected TransportFor error for bad CAFile, got nil")
	}
}
