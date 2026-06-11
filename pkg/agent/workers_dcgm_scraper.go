// Package agent — DCGM scraper shim.
// The implementation has moved to pkg/dcgm. These type aliases and wrapper
// functions maintain backward compatibility for callers within this package.
package agent

import (
	"context"

	"github.com/kubestellar/console/pkg/dcgm"
	"k8s.io/client-go/rest"
)

// DCGMNamespaceMetrics is an alias for dcgm.NamespaceMetrics.
type DCGMNamespaceMetrics = dcgm.NamespaceMetrics

// DCGMScrapeConfig is an alias for dcgm.ScrapeConfig.
type DCGMScrapeConfig = dcgm.ScrapeConfig

// ScrapeDCGMByNamespace delegates to dcgm.ScrapeByNamespace.
func ScrapeDCGMByNamespace(ctx context.Context, config *rest.Config, scrape DCGMScrapeConfig) (map[string]*DCGMNamespaceMetrics, error) {
	return dcgm.ScrapeByNamespace(ctx, config, scrape)
}
