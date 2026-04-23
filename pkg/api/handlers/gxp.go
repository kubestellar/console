package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/gxp"
)

// GxPHandler serves GxP / 21 CFR Part 11 compliance endpoints.
type GxPHandler struct {
	engine *gxp.Engine
}

// NewGxPHandler creates a handler backed by a GxP engine.
func NewGxPHandler() *GxPHandler {
	return &GxPHandler{engine: gxp.NewEngine()}
}

// RegisterPublicRoutes mounts read-only endpoints on the given router group.
func (h *GxPHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/compliance/gxp")
	g.Get("/config", h.getConfig)
	g.Get("/records", h.listRecords)
	g.Get("/signatures", h.listSignatures)
	g.Get("/chain/verify", h.verifyChain)
	g.Get("/summary", h.getSummary)
}

func (h *GxPHandler) getConfig(c *fiber.Ctx) error       { return c.JSON(h.engine.GetConfig()) }
func (h *GxPHandler) listRecords(c *fiber.Ctx) error      { return c.JSON(h.engine.AuditRecords()) }
func (h *GxPHandler) listSignatures(c *fiber.Ctx) error   { return c.JSON(h.engine.Signatures()) }
func (h *GxPHandler) verifyChain(c *fiber.Ctx) error      { return c.JSON(h.engine.VerifyChain()) }
func (h *GxPHandler) getSummary(c *fiber.Ctx) error       { return c.JSON(h.engine.Summary()) }
