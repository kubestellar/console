package agent

import (
	"context"

	"github.com/kubestellar/console/pkg/gpu"
	"k8s.io/client-go/rest"
)

// Backward compatibility: re-export pkg/gpu types so existing code importing
// pkg/agent continues to work. New code should import pkg/gpu directly.
type DCGMNamespaceMetrics = gpu.DCGMNamespaceMetrics
type DCGMScrapeConfig = gpu.DCGMScrapeConfig

// ScrapeDCGMByNamespace delegates to pkg/gpu.ScrapeDCGMByNamespace for
// backward compatibility. New code should import pkg/gpu directly.
func ScrapeDCGMByNamespace(ctx context.Context, config *rest.Config, scrape DCGMScrapeConfig) (map[string]*DCGMNamespaceMetrics, error) {
	return gpu.ScrapeDCGMByNamespace(ctx, config, scrape)
}
