package agent

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"

	dto "github.com/prometheus/client_model/go"
	"github.com/prometheus/common/expfmt"
	"github.com/prometheus/common/model"
	"k8s.io/client-go/rest"
)

// prometheus/common v0.66+ gave TextParser its own `scheme` field that
// defaults to UnsetValidation and panics on the first parse. DCGM exporter
// emits legacy (non-UTF8) metric names, so construct the parser with
// LegacyValidation explicitly every call. The package-level
// model.NameValidationScheme global is ignored by TextParser — only the
// NewTextParser argument matters.

// DCGM metric names we consume. Names come from the NVIDIA DCGM exporter
// and match the upstream DCGM Field Identifier (FI) naming scheme:
// https://docs.nvidia.com/datacenter/dcgm/latest/user-guide/dcgm-fields.html
const (
	dcgmMetricFBUsed = "DCGM_FI_DEV_FB_USED" // framebuffer memory currently allocated (MiB)
	dcgmMetricFBFree = "DCGM_FI_DEV_FB_FREE" // framebuffer memory available for allocation (MiB)
)

// Default DCGM exporter coordinates used when Scrape callers omit overrides.
const (
	defaultDCGMPort = "9400"
	defaultDCGMPath = "/metrics"
)

// DCGMNamespaceMetrics is the aggregated framebuffer memory usage for all
// GPU containers observed in one Kubernetes namespace on a single cluster.
// Units match the DCGM exporter's native unit (MiB); callers compute the
// utilization percentage from Used / (Used + Free).
type DCGMNamespaceMetrics struct {
	FBUsedMiB float64
	FBFreeMiB float64
	// SampleCount is the number of GPU-device samples aggregated into this
	// bucket. Zero means DCGM returned no FB_USED samples for the namespace.
	SampleCount int
}

// UtilizationPct returns the framebuffer utilization percentage (0-100)
// for the aggregated namespace, or 0 when no samples were observed.
func (m *DCGMNamespaceMetrics) UtilizationPct() float64 {
	if m == nil {
		return 0
	}
	total := m.FBUsedMiB + m.FBFreeMiB
	if total <= 0 {
		return 0
	}
	return (m.FBUsedMiB / total) * 100.0
}

// DCGMScrapeConfig selects the in-cluster DCGM exporter Service to scrape.
// Namespace and Service are validated against Kubernetes DNS-1123 label rules
// to prevent path traversal when the values are interpolated into the API
// server proxy URL.
type DCGMScrapeConfig struct {
	Namespace string // Kubernetes namespace hosting the DCGM exporter Service
	Service   string // Service name of the DCGM exporter
	Port      string // Service port serving /metrics (default "9400")
	Path      string // URL path for the metrics endpoint (default "/metrics")
}

// ScrapeDCGMByNamespace fetches the DCGM exporter's Prometheus text-format
// metrics endpoint via the Kubernetes API server proxy and returns the
// framebuffer usage aggregated by pod namespace.
//
// The returned map is keyed by the `namespace` label that NVIDIA's GPU
// Operator attaches to DCGM samples via the pod-names sidecar. DCGM
// installations without pod-name resolution emit no namespace label; those
// samples are aggregated into a single "" (empty) key. Callers that only
// need per-reservation (cluster, namespace) rollups can look up their
// namespace directly; cluster-wide totals are available under "".
//
// A 404 response is treated as "DCGM not installed" and returns an empty
// map with no error, so the caller can silently fall back to the pre-DCGM
// zero value. Any other transport or parse failure is returned as an error.
func ScrapeDCGMByNamespace(ctx context.Context, config *rest.Config, scrape DCGMScrapeConfig) (map[string]*DCGMNamespaceMetrics, error) {
	if config == nil {
		return nil, fmt.Errorf("dcgm: rest config is nil")
	}

	if err := validateDNS1123Label("dcgm namespace", scrape.Namespace); err != nil {
		return nil, err
	}
	if err := validateDNS1123Label("dcgm service", scrape.Service); err != nil {
		return nil, err
	}

	port := scrape.Port
	if port == "" {
		port = defaultDCGMPort
	}
	path := scrape.Path
	if path == "" {
		path = defaultDCGMPath
	}

	client, err := getOrCreatePromClient(config)
	if err != nil {
		return nil, fmt.Errorf("dcgm: get http client: %w", err)
	}

	// Build the K8s API server service-proxy URL for the DCGM exporter's
	// /metrics endpoint. Same proxy shape used by handlePrometheusQuery.
	proxyPath := fmt.Sprintf("/api/v1/namespaces/%s/services/%s:%s/proxy%s",
		url.PathEscape(scrape.Namespace),
		url.PathEscape(scrape.Service),
		url.PathEscape(port),
		path,
	)
	fullURL := config.Host + proxyPath

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, fmt.Errorf("dcgm: build request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("dcgm: scrape %s: %w", scrape.Service, err)
	}
	defer resp.Body.Close()

	// DCGM exporter absent is a valid operational state — return empty map
	// rather than an error so the caller's fallback path is silent.
	if resp.StatusCode == http.StatusNotFound {
		return map[string]*DCGMNamespaceMetrics{}, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("dcgm: scrape returned status %d", resp.StatusCode)
	}

	return parseDCGMResponse(resp.Body)
}

// parseDCGMResponse decodes a Prometheus text-format metrics payload and
// aggregates FB_USED / FB_FREE gauges by the `namespace` label. Unknown
// metric families are ignored — DCGM emits hundreds of fields; we only
// consume framebuffer memory to populate MemoryUtilizationPct.
func parseDCGMResponse(body io.Reader) (map[string]*DCGMNamespaceMetrics, error) {
	parser := expfmt.NewTextParser(model.LegacyValidation)
	families, err := parser.TextToMetricFamilies(body)
	if err != nil {
		return nil, fmt.Errorf("dcgm: parse text format: %w", err)
	}

	out := make(map[string]*DCGMNamespaceMetrics)

	if family, ok := families[dcgmMetricFBUsed]; ok {
		for _, m := range family.Metric {
			ns := labelValue(m, "namespace")
			entry := getOrCreateEntry(out, ns)
			entry.FBUsedMiB += sampleValue(m)
			entry.SampleCount++
		}
	}

	if family, ok := families[dcgmMetricFBFree]; ok {
		for _, m := range family.Metric {
			ns := labelValue(m, "namespace")
			entry := getOrCreateEntry(out, ns)
			entry.FBFreeMiB += sampleValue(m)
		}
	}

	return out, nil
}

// getOrCreateEntry returns the aggregation bucket for a namespace key,
// creating it on first access so accumulation is safe from any metric.
func getOrCreateEntry(m map[string]*DCGMNamespaceMetrics, key string) *DCGMNamespaceMetrics {
	if entry, ok := m[key]; ok {
		return entry
	}
	entry := &DCGMNamespaceMetrics{}
	m[key] = entry
	return entry
}

// labelValue returns the string value of the named label on a DCGM sample,
// or "" when absent. DCGM exporters without the pod-names sidecar emit no
// `namespace` label; those samples collapse to the "" bucket, which the
// caller treats as cluster-wide totals.
func labelValue(m *dto.Metric, name string) string {
	for _, pair := range m.Label {
		if pair.GetName() == name {
			return pair.GetValue()
		}
	}
	return ""
}

// sampleValue extracts the scalar value from a DCGM sample. DCGM emits
// framebuffer metrics as gauges; counters and histograms are not expected
// here and return 0.
func sampleValue(m *dto.Metric) float64 {
	if g := m.Gauge; g != nil {
		return g.GetValue()
	}
	if c := m.Counter; c != nil {
		return c.GetValue()
	}
	return 0
}
