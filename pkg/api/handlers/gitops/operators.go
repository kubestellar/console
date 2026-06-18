package gitops

import "github.com/gofiber/fiber/v2"

// ListOperators delegates to the focused operator query module.
func (h *GitOpsHandlers) ListOperators(c *fiber.Ctx) error {
	return h.listOperators(c)
}

// StreamOperators delegates to the focused GitOps SSE module.
func (h *GitOpsHandlers) StreamOperators(c *fiber.Ctx) error {
	return h.streamOperators(c)
}

// ListOperatorSubscriptions delegates to the focused operator query module.
func (h *GitOpsHandlers) ListOperatorSubscriptions(c *fiber.Ctx) error {
	return h.listOperatorSubscriptions(c)
}

// StreamOperatorSubscriptions delegates to the focused GitOps SSE module.
func (h *GitOpsHandlers) StreamOperatorSubscriptions(c *fiber.Ctx) error {
	return h.streamOperatorSubscriptions(c)
}

// StreamHelmReleases delegates to the focused GitOps SSE module.
func (h *GitOpsHandlers) StreamHelmReleases(c *fiber.Ctx) error {
	return h.streamHelmReleases(c)
}
