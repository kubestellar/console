// Package gpu provides a client for scraping NVIDIA DCGM exporter metrics
// via the Kubernetes API server service proxy. It is extracted from pkg/agent
// to break the pkg/api → pkg/agent import dependency (#17131, #17640).
package gpu

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sync"

	dto "github.com/prometheus/client_model/go"
	"github.com/prometheus/common/expfmt"
	"github.com/prometheus/common/model"
	"k8s.io/client-go/rest"
)

// DCGM metric names we consume. Names come from the NVIDIA DCGM exporter
// and match the upstream DCGM Field Identifier (FI) naming scheme:
// https://docs.nvidia.com/datacenter/dcgm/latest/user-guide/dcgm-fields.html
const (
	metricFBUsed = "DCGM_FI_DEV_FB_USED" // framebuffer memory currently allocated (MiB)
	metricFBFree = "DCGM_FI_DEV_FB_FREE" // framebuffer memory available for allocation (MiB)
)

// Default DCGM exporter coordinates used when Scrape callers omit overrides.
const (
	DefaultPort = "9400"
	DefaultPath = "/metrics"
)

// NamespaceMetrics is the aggregated framebuffer memory usage for all
// GPU containers observed in one Kubernetes namespace on a single cluster.
// Units match the DCGM exporter's native unit (MiB); callers compute the
// utilization percentage from Used / (Used + Free).
type NamespaceMetrics struct {
	FBUsedMiB float64
	FBFreeMiB float64
	// SampleCount is the number of GPU-device samples aggregated into this
	// bucket. Zero means DCGM returned no FB_USED samples for the namespace.
	SampleCount int
}

// UtilizationPct returns the framebuffer utilization percentage (0-100)
// for the aggregated namespace, or 0 when no samples were observed.
func (m *NamespaceMetrics) UtilizationPct() float64 {
	if m == nil {
		return 0
	}
	total := m.FBUsedMiB + m.FBFreeMiB
	if total <= 0 {
		return 0
	}
	return (m.FBUsedMiB / total) * 100.0
}

// ScrapeConfig selects the in-cluster DCGM exporter Service to scrape.
// Namespace and Service are validated against Kubernetes DNS-1123 label rules
// to prevent path traversal when the values are interpolated into the API
// server proxy URL.
type ScrapeConfig struct {
	Namespace string // Kubernetes namespace hosting the DCGM exporter Service
	Service   string // Service name of the DCGM exporter
	Port      string // Service port serving /metrics (default "9400")
	Path      string // URL path for the metrics endpoint (default "/metrics")
}

// promClientCache caches HTTP clients keyed by API server host to avoid
// per-scrape TLS handshakes and connection churn.
var promClientCache = struct {
	sync.RWMutex
	clients map[string]*http.Client
}{clients: make(map[string]*http.Client)}

// getOrCreateClient returns a cached *http.Client for the given REST config.
func getOrCreateClient(config *rest.Config) (*http.Client, error) {
	key := config.Host

	promClientCache.RLock()
	if c, ok := promClientCache.clients[key]; ok {
		promClientCache.RUnlock()
		return c, nil
	}
	promClientCache.RUnlock()

	promClientCache.Lock()
	defer promClientCache.Unlock()

	if c, ok := promClientCache.clients[key]; ok {
		return c, nil
	}

	transport, err := rest.TransportFor(config)
	if err != nil {
		return nil, err
	}
	c := &http.Client{Transport: transport}
	promClientCache.clients[key] = c
	return c, nil
}

// ScrapeByNamespace fetches the DCGM exporter's Prometheus text-format
// metrics endpoint via the Kubernetes API server proxy and returns the
// framebuffer usage aggregated by pod namespace.
//
// The returned map is keyed by the `namespace` label that NVIDIA's GPU
// Operator attaches to DCGM samples via the pod-names sidecar. DCGM
// installations without pod-name resolution emit no namespace label; those
// samples are aggregated into a single "" (empty) key.
//
// A 404 response is treated as "DCGM not installed" and returns an empty
// map with no error, so the caller can silently fall back.
func ScrapeByNamespace(ctx context.Context, config *rest.Config, scrape ScrapeConfig) (map[string]*NamespaceMetrics, error) {
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
		port = DefaultPort
	}
	path := scrape.Path
	if path == "" {
		path = DefaultPath
	}

	client, err := getOrCreateClient(config)
	if err != nil {
		return nil, fmt.Errorf("dcgm: get http client: %w", err)
	}

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

	if resp.StatusCode == http.StatusNotFound {
		return map[string]*NamespaceMetrics{}, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("dcgm: scrape returned status %d", resp.StatusCode)
	}

	return ParseResponse(resp.Body)
}

// ParseResponse decodes a Prometheus text-format metrics payload and
// aggregates FB_USED / FB_FREE gauges by the `namespace` label.
func ParseResponse(body io.Reader) (map[string]*NamespaceMetrics, error) {
	parser := expfmt.NewTextParser(model.LegacyValidation)
	families, err := parser.TextToMetricFamilies(body)
	if err != nil {
		return nil, fmt.Errorf("dcgm: parse text format: %w", err)
	}

	out := make(map[string]*NamespaceMetrics)

	if family, ok := families[metricFBUsed]; ok {
		for _, m := range family.Metric {
			ns := labelValue(m, "namespace")
			entry := getOrCreateEntry(out, ns)
			entry.FBUsedMiB += sampleValue(m)
			entry.SampleCount++
		}
	}

	if family, ok := families[metricFBFree]; ok {
		for _, m := range family.Metric {
			ns := labelValue(m, "namespace")
			entry := getOrCreateEntry(out, ns)
			entry.FBFreeMiB += sampleValue(m)
		}
	}

	return out, nil
}

func getOrCreateEntry(m map[string]*NamespaceMetrics, key string) *NamespaceMetrics {
	if entry, ok := m[key]; ok {
		return entry
	}
	entry := &NamespaceMetrics{}
	m[key] = entry
	return entry
}

func labelValue(m *dto.Metric, name string) string {
	for _, pair := range m.Label {
		if pair.GetName() == name {
			return pair.GetValue()
		}
	}
	return ""
}

func sampleValue(m *dto.Metric) float64 {
	if g := m.Gauge; g != nil {
		return g.GetValue()
	}
	if c := m.Counter; c != nil {
		return c.GetValue()
	}
	return 0
}

// dns1123LabelRegex matches valid Kubernetes DNS-1123 label names.
var dns1123LabelRegex = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

func validateDNS1123Label(field, value string) error {
	if value == "" {
		return fmt.Errorf("%s must not be empty", field)
	}
	if !dns1123LabelRegex.MatchString(value) {
		return fmt.Errorf("%s %q is not a valid DNS-1123 label (must match %s)", field, value, dns1123LabelRegex.String())
	}
	return nil
}
