package gpu

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/rest"
)

func TestUtilizationPct(t *testing.T) {
	tests := []struct {
		name     string
		metrics  *DCGMNamespaceMetrics
		expected float64
	}{
		{
			name:     "nil receiver returns zero",
			metrics:  nil,
			expected: 0,
		},
		{
			name:     "zero total returns zero",
			metrics:  &DCGMNamespaceMetrics{FBUsedMiB: 0, FBFreeMiB: 0},
			expected: 0,
		},
		{
			name:     "all used returns 100",
			metrics:  &DCGMNamespaceMetrics{FBUsedMiB: 1024, FBFreeMiB: 0},
			expected: 100.0,
		},
		{
			name:     "all free returns 0",
			metrics:  &DCGMNamespaceMetrics{FBUsedMiB: 0, FBFreeMiB: 1024},
			expected: 0,
		},
		{
			name:     "50 percent utilization",
			metrics:  &DCGMNamespaceMetrics{FBUsedMiB: 512, FBFreeMiB: 512},
			expected: 50.0,
		},
		{
			name:     "75 percent utilization",
			metrics:  &DCGMNamespaceMetrics{FBUsedMiB: 768, FBFreeMiB: 256},
			expected: 75.0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.metrics.UtilizationPct()
			assert.InDelta(t, tc.expected, got, 0.001)
		})
	}
}

func TestValidateDNS1123Label(t *testing.T) {
	tests := []struct {
		name    string
		field   string
		value   string
		wantErr bool
	}{
		{
			name:    "valid simple label",
			field:   "namespace",
			value:   "gpu-operator",
			wantErr: false,
		},
		{
			name:    "valid single char",
			field:   "namespace",
			value:   "a",
			wantErr: false,
		},
		{
			name:    "valid numeric",
			field:   "service",
			value:   "dcgm9400",
			wantErr: false,
		},
		{
			name:    "empty string rejected",
			field:   "namespace",
			value:   "",
			wantErr: true,
		},
		{
			name:    "uppercase rejected",
			field:   "namespace",
			value:   "GPU-Operator",
			wantErr: true,
		},
		{
			name:    "starts with hyphen rejected",
			field:   "service",
			value:   "-dcgm",
			wantErr: true,
		},
		{
			name:    "ends with hyphen rejected",
			field:   "service",
			value:   "dcgm-",
			wantErr: true,
		},
		{
			name:    "path traversal rejected",
			field:   "namespace",
			value:   "../etc",
			wantErr: true,
		},
		{
			name:    "too long (64 chars) rejected",
			field:   "namespace",
			value:   "a123456789012345678901234567890123456789012345678901234567890123",
			wantErr: true,
		},
		{
			name:    "max valid length (63 chars)",
			field:   "namespace",
			value:   "a12345678901234567890123456789012345678901234567890123456789012",
			wantErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateDNS1123Label(tc.field, tc.value)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestParseDCGMResponse(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantErr    bool
		wantKeys   []string
		checkEntry func(t *testing.T, result map[string]*DCGMNamespaceMetrics)
	}{
		{
			name:     "empty body returns empty map",
			body:     "",
			wantErr:  false,
			wantKeys: nil,
		},
		{
			name: "single namespace with both metrics",
			body: `# HELP DCGM_FI_DEV_FB_USED Framebuffer memory used (in MiB).
# TYPE DCGM_FI_DEV_FB_USED gauge
DCGM_FI_DEV_FB_USED{gpu="0",namespace="ml-training"} 4096
DCGM_FI_DEV_FB_USED{gpu="1",namespace="ml-training"} 2048
# HELP DCGM_FI_DEV_FB_FREE Framebuffer memory free (in MiB).
# TYPE DCGM_FI_DEV_FB_FREE gauge
DCGM_FI_DEV_FB_FREE{gpu="0",namespace="ml-training"} 4096
DCGM_FI_DEV_FB_FREE{gpu="1",namespace="ml-training"} 6144
`,
			wantErr:  false,
			wantKeys: []string{"ml-training"},
			checkEntry: func(t *testing.T, result map[string]*DCGMNamespaceMetrics) {
				t.Helper()
				entry := result["ml-training"]
				require.NotNil(t, entry)
				assert.InDelta(t, 6144.0, entry.FBUsedMiB, 0.001)
				assert.InDelta(t, 10240.0, entry.FBFreeMiB, 0.001)
				assert.Equal(t, 2, entry.SampleCount)
			},
		},
		{
			name: "multiple namespaces",
			body: `# TYPE DCGM_FI_DEV_FB_USED gauge
DCGM_FI_DEV_FB_USED{gpu="0",namespace="default"} 1024
DCGM_FI_DEV_FB_USED{gpu="0",namespace="inference"} 8192
# TYPE DCGM_FI_DEV_FB_FREE gauge
DCGM_FI_DEV_FB_FREE{gpu="0",namespace="default"} 7168
DCGM_FI_DEV_FB_FREE{gpu="0",namespace="inference"} 0
`,
			wantErr:  false,
			wantKeys: []string{"default", "inference"},
			checkEntry: func(t *testing.T, result map[string]*DCGMNamespaceMetrics) {
				t.Helper()
				def := result["default"]
				require.NotNil(t, def)
				assert.InDelta(t, 1024.0, def.FBUsedMiB, 0.001)
				assert.InDelta(t, 7168.0, def.FBFreeMiB, 0.001)
				assert.Equal(t, 1, def.SampleCount)

				inf := result["inference"]
				require.NotNil(t, inf)
				assert.InDelta(t, 8192.0, inf.FBUsedMiB, 0.001)
				assert.InDelta(t, 0.0, inf.FBFreeMiB, 0.001)
			},
		},
		{
			name: "no namespace label aggregates to empty key",
			body: `# TYPE DCGM_FI_DEV_FB_USED gauge
DCGM_FI_DEV_FB_USED{gpu="0"} 2048
# TYPE DCGM_FI_DEV_FB_FREE gauge
DCGM_FI_DEV_FB_FREE{gpu="0"} 6144
`,
			wantErr:  false,
			wantKeys: []string{""},
			checkEntry: func(t *testing.T, result map[string]*DCGMNamespaceMetrics) {
				t.Helper()
				entry := result[""]
				require.NotNil(t, entry)
				assert.InDelta(t, 2048.0, entry.FBUsedMiB, 0.001)
				assert.InDelta(t, 6144.0, entry.FBFreeMiB, 0.001)
			},
		},
		{
			name: "unrelated metrics are ignored",
			body: `# TYPE DCGM_FI_DEV_GPU_TEMP gauge
DCGM_FI_DEV_GPU_TEMP{gpu="0",namespace="default"} 72
# TYPE DCGM_FI_DEV_FB_USED gauge
DCGM_FI_DEV_FB_USED{gpu="0",namespace="default"} 512
`,
			wantErr:  false,
			wantKeys: []string{"default"},
			checkEntry: func(t *testing.T, result map[string]*DCGMNamespaceMetrics) {
				t.Helper()
				entry := result["default"]
				require.NotNil(t, entry)
				assert.InDelta(t, 512.0, entry.FBUsedMiB, 0.001)
				assert.InDelta(t, 0.0, entry.FBFreeMiB, 0.001)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result, err := parseDCGMResponse(strings.NewReader(tc.body))
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			if tc.wantKeys == nil {
				assert.Empty(t, result)
			} else {
				for _, key := range tc.wantKeys {
					assert.Contains(t, result, key)
				}
			}
			if tc.checkEntry != nil {
				tc.checkEntry(t, result)
			}
		})
	}
}

func TestScrapeDCGMByNamespace_NilConfig(t *testing.T) {
	_, err := ScrapeDCGMByNamespace(context.Background(), nil, DCGMScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "rest config is nil")
}

func TestScrapeDCGMByNamespace_InvalidNamespace(t *testing.T) {
	cfg := &rest.Config{Host: "https://localhost:6443"}
	_, err := ScrapeDCGMByNamespace(context.Background(), cfg, DCGMScrapeConfig{
		Namespace: "../traversal",
		Service:   "dcgm-exporter",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not a valid DNS-1123 label")
}

func TestScrapeDCGMByNamespace_InvalidService(t *testing.T) {
	cfg := &rest.Config{Host: "https://localhost:6443"}
	_, err := ScrapeDCGMByNamespace(context.Background(), cfg, DCGMScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "BAD_SERVICE",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not a valid DNS-1123 label")
}

func TestScrapeDCGMByNamespace_EmptyNamespace(t *testing.T) {
	cfg := &rest.Config{Host: "https://localhost:6443"}
	_, err := ScrapeDCGMByNamespace(context.Background(), cfg, DCGMScrapeConfig{
		Namespace: "",
		Service:   "dcgm-exporter",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "must not be empty")
}

func TestScrapeDCGMByNamespace_404ReturnsEmptyMap(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := &rest.Config{Host: srv.URL}
	result, err := ScrapeDCGMByNamespace(context.Background(), cfg, DCGMScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	require.NoError(t, err)
	assert.Empty(t, result)
}

func TestScrapeDCGMByNamespace_500ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	cfg := &rest.Config{Host: srv.URL}
	_, err := ScrapeDCGMByNamespace(context.Background(), cfg, DCGMScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "status 500")
}

func TestScrapeDCGMByNamespace_Success(t *testing.T) {
	metricsPayload := `# TYPE DCGM_FI_DEV_FB_USED gauge
DCGM_FI_DEV_FB_USED{gpu="0",namespace="training"} 4096
# TYPE DCGM_FI_DEV_FB_FREE gauge
DCGM_FI_DEV_FB_FREE{gpu="0",namespace="training"} 4096
`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(metricsPayload))
	}))
	defer srv.Close()

	cfg := &rest.Config{Host: srv.URL}
	result, err := ScrapeDCGMByNamespace(context.Background(), cfg, DCGMScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	require.NoError(t, err)
	require.Contains(t, result, "training")
	assert.InDelta(t, 4096.0, result["training"].FBUsedMiB, 0.001)
	assert.InDelta(t, 4096.0, result["training"].FBFreeMiB, 0.001)
	assert.InDelta(t, 50.0, result["training"].UtilizationPct(), 0.001)
}

func TestScrapeDCGMByNamespace_DefaultPortAndPath(t *testing.T) {
	var capturedPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := &rest.Config{Host: srv.URL}
	_, _ = ScrapeDCGMByNamespace(context.Background(), cfg, DCGMScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
		// Port and Path left empty — should default
	})
	assert.Contains(t, capturedPath, "9400")
	assert.Contains(t, capturedPath, "/metrics")
}

func TestPromCacheKey_DifferentCredsProduceDifferentKeys(t *testing.T) {
	cfg1 := &rest.Config{
		Host:        "https://api.cluster1.example.com",
		BearerToken: "token-a",
	}
	cfg2 := &rest.Config{
		Host:        "https://api.cluster1.example.com",
		BearerToken: "token-b",
	}
	key1 := promCacheKey(cfg1)
	key2 := promCacheKey(cfg2)
	assert.NotEqual(t, key1, key2)
}

func TestPromCacheKey_SameConfigProducesSameKey(t *testing.T) {
	cfg := &rest.Config{
		Host:        "https://api.cluster1.example.com",
		BearerToken: "token-a",
	}
	key1 := promCacheKey(cfg)
	key2 := promCacheKey(cfg)
	assert.Equal(t, key1, key2)
}
