// Package residency provides data residency enforcement for multi-cluster
// environments. It defines rules that map data classifications (e.g.
// "eu-personal-data", "pci-cardholder") to allowed geographic regions,
// and detects violations when workloads run in non-compliant clusters.
package residency

import "time"

// Region represents a geographic jurisdiction for data residency rules.
type Region string

const (
	RegionEU     Region = "eu"
	RegionUS     Region = "us"
	RegionAPAC   Region = "apac"
	RegionCanada Region = "ca"
	RegionUK     Region = "uk"
	RegionGlobal Region = "global" // no restriction
)

// AllRegions returns all defined regions for UI display.
func AllRegions() []Region {
	return []Region{RegionEU, RegionUS, RegionAPAC, RegionCanada, RegionUK, RegionGlobal}
}

// RegionLabel returns a human-friendly name for a region code.
func RegionLabel(r Region) string {
	labels := map[Region]string{
		RegionEU:     "European Union",
		RegionUS:     "United States",
		RegionAPAC:   "Asia-Pacific",
		RegionCanada: "Canada",
		RegionUK:     "United Kingdom",
		RegionGlobal: "Global (No Restriction)",
	}
	if l, ok := labels[r]; ok {
		return l
	}
	return string(r)
}

// DataClassification defines a type of sensitive data with residency constraints.
type DataClassification string

const (
	ClassEUPersonal   DataClassification = "eu-personal-data"
	ClassPCI          DataClassification = "pci-cardholder"
	ClassHIPAA        DataClassification = "hipaa-phi"
	ClassFederal      DataClassification = "federal-cui"
	ClassConfidential DataClassification = "confidential"
	ClassPublic       DataClassification = "public"
)

// AllClassifications returns all built-in data classifications.
func AllClassifications() []DataClassification {
	return []DataClassification{
		ClassEUPersonal, ClassPCI, ClassHIPAA,
		ClassFederal, ClassConfidential, ClassPublic,
	}
}

// Rule maps a data classification to its allowed regions.
type Rule struct {
	ID             string             `json:"id"`
	Classification DataClassification `json:"classification"`
	AllowedRegions []Region           `json:"allowed_regions"`
	Description    string             `json:"description"`
	Enforcement    EnforcementMode    `json:"enforcement"`
	CreatedAt      time.Time          `json:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at"`
}

// EnforcementMode controls how violations are handled.
type EnforcementMode string

const (
	EnforcementAudit  EnforcementMode = "audit"  // log only
	EnforcementWarn   EnforcementMode = "warn"   // show warnings
	EnforcementDeny   EnforcementMode = "deny"   // block scheduling
)

// ClusterRegion associates a cluster with a geographic region.
type ClusterRegion struct {
	ClusterName string `json:"cluster"`
	Region      Region `json:"region"`
	Jurisdiction string `json:"jurisdiction,omitempty"` // e.g. "GDPR", "CCPA"
}

// Violation represents a workload running in a non-compliant region.
type Violation struct {
	ID             string             `json:"id"`
	ClusterName    string             `json:"cluster"`
	ClusterRegion  Region             `json:"cluster_region"`
	Namespace      string             `json:"namespace"`
	WorkloadName   string             `json:"workload_name"`
	WorkloadKind   string             `json:"workload_kind"` // Deployment, StatefulSet, etc.
	Classification DataClassification `json:"classification"`
	RuleID         string             `json:"rule_id"`
	AllowedRegions []Region           `json:"allowed_regions"`
	Severity       ViolationSeverity  `json:"severity"`
	DetectedAt     time.Time          `json:"detected_at"`
	Message        string             `json:"message"`
}

// ViolationSeverity indicates the urgency of a residency violation.
type ViolationSeverity string

const (
	SeverityCritical ViolationSeverity = "critical"
	SeverityHigh     ViolationSeverity = "high"
	SeverityMedium   ViolationSeverity = "medium"
	SeverityLow      ViolationSeverity = "low"
)

// ResidencySummary provides an overview of data residency posture.
type ResidencySummary struct {
	TotalRules      int               `json:"total_rules"`
	TotalClusters   int               `json:"total_clusters"`
	TotalViolations int               `json:"total_violations"`
	BySeverity      map[string]int    `json:"by_severity"`
	ByRegion        map[string]int    `json:"by_region"`    // clusters per region
	Compliant       int               `json:"compliant"`    // clusters with no violations
	NonCompliant    int               `json:"non_compliant"`
}
