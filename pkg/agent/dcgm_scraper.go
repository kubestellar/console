package agent

import (
	"context"

	"github.com/kubestellar/console/pkg/gpu"
	"k8s.io/client-go/rest"
)

// Re-export GPU types from pkg/gpu for backward compatibility.
// New code should import github.com/kubestellar/console/pkg/gpu directly.

type DCGMNamespaceMetrics = gpu.DCGMNamespaceMetrics
type DCGMScrapeConfig = gpu.DCGMScrapeConfig

// ScrapeDCGMByNamespace wraps gpu.ScrapeDCGMByNamespace with the agent's
// cached Prometheus client. Kept in pkg/agent for backward compatibility.
func ScrapeDCGMByNamespace(ctx context.Context, config *rest.Config, scrape DCGMScrapeConfig) (map[string]*DCGMNamespaceMetrics, error) {
	return gpu.ScrapeDCGMByNamespace(ctx, config, gpu.DCGMScrapeConfig(scrape), getOrCreatePromClient)
}
