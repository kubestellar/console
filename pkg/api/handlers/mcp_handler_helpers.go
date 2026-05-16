package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/k8s"
)

// withDemoFallback handles the common MCP handler boilerplate:
// - return demo payload in demo mode
// - require an initialized k8s client in non-demo mode
// - execute the real handler logic with the ready client
func (h *MCPHandlers) withDemoFallback(
	c *fiber.Ctx,
	demoKey string,
	demoData any,
	handler func(client *k8s.MultiClusterClient) error,
) error {
	if isDemoMode(c) {
		return demoResponse(c, demoKey, demoData)
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}
	return handler(h.k8sClient)
}
