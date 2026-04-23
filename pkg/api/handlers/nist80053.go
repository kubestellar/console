package handlers

import (
	"github.com/gofiber/fiber/v2"

	nist "github.com/kubestellar/console/pkg/compliance/nist80053"
)

// NIST80053Handler serves NIST 800-53 control mapping endpoints.
type NIST80053Handler struct {
	engine *nist.Engine
}

// NewNIST80053Handler creates a handler backed by a NIST 800-53 engine.
func NewNIST80053Handler() *NIST80053Handler {
	return &NIST80053Handler{engine: nist.NewEngine()}
}

// RegisterPublicRoutes mounts read-only endpoints on the given router group.
func (h *NIST80053Handler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/compliance/nist")
	g.Get("/families", h.listFamilies)
	g.Get("/mappings", h.listMappings)
	g.Get("/summary", h.getSummary)
}

func (h *NIST80053Handler) listFamilies(c *fiber.Ctx) error { return c.JSON(h.engine.Families()) }
func (h *NIST80053Handler) listMappings(c *fiber.Ctx) error { return c.JSON(h.engine.Mappings()) }
func (h *NIST80053Handler) getSummary(c *fiber.Ctx) error   { return c.JSON(h.engine.Summary()) }
