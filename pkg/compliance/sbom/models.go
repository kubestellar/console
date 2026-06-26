// Package sbom implements SBOM (Software Bill of Materials) management
// for SPDX and CycloneDX formats across the Kubernetes fleet.
//
// TODO (#9644): Full implementation — integrate with:
//   - Syft for SBOM generation from running container images
//   - Grype for vulnerability scanning against generated SBOMs
//   - OCI registry annotations for pre-built SBOM retrieval
//   - Kubernetes admission webhook for SBOM policy enforcement
package sbom

import "time"

// Document represents a single SBOM document for a workload.
type Document struct {
	ID             string      `json:"id"`
	Workload       string      `json:"workload"`
	Namespace      string      `json:"namespace"`
	Cluster        string      `json:"cluster"`
	Format         string      `json:"format"` // "SPDX" or "CycloneDX"
	GeneratedAt    time.Time   `json:"generated_at"`
	ComponentCount int         `json:"component_count"`
	VulnerableCount int        `json:"vulnerable_count"`
	Components     []Component `json:"components"`
}

// Component is an individual software package within an SBOM.
type Component struct {
	Name            string `json:"name"`
	Version         string `json:"version"`
	PURL            string `json:"purl"`
	License         string `json:"license"`
	Vulnerabilities int    `json:"vulnerabilities"`
	Severity        string `json:"severity"` // none, low, medium, high, critical
}

// Summary aggregates SBOM coverage and vulnerability metrics fleet-wide.
type Summary struct {
	TotalWorkloads      int       `json:"total_workloads"`
	SBOMCoverage        int       `json:"sbom_coverage"` // percentage
	TotalComponents     int       `json:"total_components"`
	VulnerableComponents int      `json:"vulnerable_components"`
	CriticalCount       int       `json:"critical_count"`
	HighCount           int       `json:"high_count"`
	GeneratedAt         time.Time `json:"generated_at"`
}
