package handlers

// Supply Chain & Software Provenance handlers — Epic 6 (#9632)
//
// Implements HTTP endpoints for:
//   - SBOM Manager (#9644): SPDX/CycloneDX document inventory
//   - Image Signing Status (#9646): Sigstore/Cosign verification
//   - SLSA Provenance (#9647): L0–L4 level badges per workload
//   - License Compliance (#9648): deny/warn-list violation detection
//
// All handlers currently serve demo data via the respective engine stubs.
// Full backend integration is tracked in the individual sub-issues.

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/licenses"
	"github.com/kubestellar/console/pkg/compliance/sbom"
	"github.com/kubestellar/console/pkg/compliance/signing"
	"github.com/kubestellar/console/pkg/compliance/slsa"
)

// ─── SBOM Handler (#9644) ────────────────────────────────────────────────────

// SBOMHandler serves Software Bill of Materials endpoints.
type SBOMHandler struct {
	engine *sbom.Engine
}

// NewSBOMHandler creates an SBOM handler backed by a stub engine.
func NewSBOMHandler() *SBOMHandler {
	return &SBOMHandler{engine: sbom.NewEngine()}
}

// RegisterPublicRoutes mounts SBOM endpoints under /api/supply-chain/sbom.
func (h *SBOMHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/supply-chain/sbom")
	g.Get("/summary", h.getSummary)
	g.Get("/documents", h.listDocuments)
}

func (h *SBOMHandler) getSummary(c *fiber.Ctx) error   { return c.JSON(h.engine.Summary()) }
func (h *SBOMHandler) listDocuments(c *fiber.Ctx) error { return c.JSON(h.engine.Documents()) }

// ─── Signing Handler (#9646) ─────────────────────────────────────────────────

// SigningHandler serves Sigstore/Cosign verification endpoints.
type SigningHandler struct {
	engine *signing.Engine
}

// NewSigningHandler creates a signing handler backed by a stub engine.
func NewSigningHandler() *SigningHandler {
	return &SigningHandler{engine: signing.NewEngine()}
}

// RegisterPublicRoutes mounts signing endpoints under /api/supply-chain/signing.
func (h *SigningHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/supply-chain/signing")
	g.Get("/summary", h.getSummary)
	g.Get("/images", h.listImages)
	g.Get("/policies", h.listPolicies)
}

func (h *SigningHandler) getSummary(c *fiber.Ctx) error    { return c.JSON(h.engine.Summary()) }
func (h *SigningHandler) listImages(c *fiber.Ctx) error    { return c.JSON(h.engine.Images()) }
func (h *SigningHandler) listPolicies(c *fiber.Ctx) error  { return c.JSON(h.engine.Policies()) }

// ─── SLSA Handler (#9647) ────────────────────────────────────────────────────

// SLSAHandler serves SLSA provenance tracking endpoints.
type SLSAHandler struct {
	engine *slsa.Engine
}

// NewSLSAHandler creates a SLSA handler backed by a stub engine.
func NewSLSAHandler() *SLSAHandler {
	return &SLSAHandler{engine: slsa.NewEngine()}
}

// RegisterPublicRoutes mounts SLSA endpoints under /api/supply-chain/slsa.
func (h *SLSAHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/supply-chain/slsa")
	g.Get("/summary", h.getSummary)
	g.Get("/workloads", h.listWorkloads)
}

func (h *SLSAHandler) getSummary(c *fiber.Ctx) error    { return c.JSON(h.engine.Summary()) }
func (h *SLSAHandler) listWorkloads(c *fiber.Ctx) error { return c.JSON(h.engine.Workloads()) }

// ─── License Compliance Handler (#9648) ─────────────────────────────────────

// LicenseHandler serves open-source license compliance endpoints.
type LicenseHandler struct {
	engine *licenses.Engine
}

// NewLicenseHandler creates a license compliance handler backed by a stub engine.
func NewLicenseHandler() *LicenseHandler {
	return &LicenseHandler{engine: licenses.NewEngine()}
}

// RegisterPublicRoutes mounts license endpoints under /api/supply-chain/licenses.
func (h *LicenseHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/supply-chain/licenses")
	g.Get("/summary", h.getSummary)
	g.Get("/packages", h.listPackages)
	g.Get("/categories", h.listCategories)
}

func (h *LicenseHandler) getSummary(c *fiber.Ctx) error      { return c.JSON(h.engine.Summary()) }
func (h *LicenseHandler) listPackages(c *fiber.Ctx) error    { return c.JSON(h.engine.Packages()) }
func (h *LicenseHandler) listCategories(c *fiber.Ctx) error  { return c.JSON(h.engine.Categories()) }
