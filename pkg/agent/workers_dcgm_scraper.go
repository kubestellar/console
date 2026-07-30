// Package agent — DCGM scraper shim.
// The implementation has moved to pkg/gpu. These type aliases and wrapper
// functions maintain backward compatibility for callers within this package.
package agent

import (
	"context"

	"github.com/kubestellar/console/pkg/gpu"
	"k8s.io/client-go/rest"
)

// DCGMNamespaceMetrics is an alias for gpu.NamespaceMetrics.
type DCGMNamespaceMetrics = gpu.NamespaceMetrics

// DCGMScrapeConfig is an alias for gpu.ScrapeConfig.
type DCGMScrapeConfig = gpu.ScrapeConfig

// ScrapeDCGMByNamespace delegates to gpu.ScrapeByNamespace.
func ScrapeDCGMByNamespace(ctx context.Context, config *rest.Config, scrape DCGMScrapeConfig) (map[string]*DCGMNamespaceMetrics, error) {
	return gpu.ScrapeByNamespace(ctx, config, scrape)
}
