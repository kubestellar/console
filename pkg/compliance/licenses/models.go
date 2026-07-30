// Package licenses implements open-source license compliance scanning.
// Detects deny-listed licenses (GPL, AGPL, SSPL) and warn-listed licenses
// (LGPL, MPL) within container image SBOMs and dependency manifests.
//
// TODO (#9648): Full implementation — integrate with:
//   - License detection from Syft-generated SBOMs
//   - SPDX license identifier normalization
//   - Configurable allow/warn/deny lists via ConfigMap
//   - OCI annotation-based license metadata retrieval
package licenses

import "time"

// Risk classifies a license's compliance risk.
type Risk string

const (
	RiskAllowed Risk = "allowed"
	RiskWarn    Risk = "warn"
	RiskDenied  Risk = "denied"
)

// Package represents an individual dependency and its license.
type Package struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	License   string `json:"license"`
	Risk      Risk   `json:"risk"`
	Workload  string `json:"workload"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	SPDXID    string `json:"spdx_id"`
}

// Category groups licenses by risk tier.
type Category struct {
	Name     string   `json:"name"`
	Count    int      `json:"count"`
	Risk     Risk     `json:"risk"`
	Examples []string `json:"examples"`
}

// Summary aggregates license compliance metrics fleet-wide.
type Summary struct {
	TotalPackages   int       `json:"total_packages"`
	AllowedPackages int       `json:"allowed_packages"`
	WarnedPackages  int       `json:"warned_packages"`
	DeniedPackages  int       `json:"denied_packages"`
	UniqueLicenses  int       `json:"unique_licenses"`
	WorkloadsScanned int      `json:"workloads_scanned"`
	EvaluatedAt     time.Time `json:"evaluated_at"`
}
