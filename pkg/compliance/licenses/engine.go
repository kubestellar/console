package licenses

import "time"

// Engine scans container images and SBOMs for license compliance.
//
// TODO (#9648): Replace stub with live Syft SBOM + SPDX license scanning.
type Engine struct{}

// NewEngine creates a license compliance engine. Currently returns demo data.
func NewEngine() *Engine { return &Engine{} }

// Summary returns fleet-wide license compliance metrics.
func (e *Engine) Summary() Summary {
	return Summary{
		TotalPackages:    3847,
		AllowedPackages:  3814,
		WarnedPackages:   24,
		DeniedPackages:   9,
		UniqueLicenses:   47,
		WorkloadsScanned: 37,
		EvaluatedAt:      time.Now(),
	}
}

// Packages returns all scanned packages with their license risk classification.
func (e *Engine) Packages() []Package {
	// TODO (#9648): Parse Syft SBOM output, normalize SPDX identifiers,
	// classify against allow/warn/deny lists loaded from ConfigMap.
	return []Package{}
}

// Categories returns license risk categories with aggregate counts.
func (e *Engine) Categories() []Category {
	// TODO (#9648): Aggregate Packages() results by SPDX license family.
	return []Category{}
}
