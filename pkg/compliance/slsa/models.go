// Package slsa implements SLSA (Supply-chain Levels for Software Artifacts)
// provenance tracking. Evaluates attestations against SLSA requirements and
// assigns level badges (L0–L4) to workloads across the fleet.
//
// TODO (#9647): Full implementation — integrate with:
//   - slsa-verifier for attestation verification
//   - Rekor transparency log for provenance lookup
//   - Kubernetes workload annotation for build metadata
//   - OPA/Gatekeeper policy for SLSA level enforcement
package slsa

import "time"

// Level represents a SLSA provenance level (0-4).
type Level int

const (
	Level0 Level = 0
	Level1 Level = 1
	Level2 Level = 2
	Level3 Level = 3
	Level4 Level = 4
)

// Requirement is a single SLSA requirement check.
type Requirement struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	Met         bool   `json:"met"`
	Evidence    string `json:"evidence"`
}

// Workload represents SLSA provenance status for a running workload.
type Workload struct {
	Workload             string        `json:"workload"`
	Namespace            string        `json:"namespace"`
	Cluster              string        `json:"cluster"`
	Image                string        `json:"image"`
	SLSALevel            Level         `json:"slsa_level"`
	BuildSystem          string        `json:"build_system"`
	BuilderID            string        `json:"builder_id"`
	SourceURI            string        `json:"source_uri"`
	AttestationPresent   bool          `json:"attestation_present"`
	AttestationVerified  bool          `json:"attestation_verified"`
	Requirements         []Requirement `json:"requirements"`
	EvaluatedAt          time.Time     `json:"evaluated_at"`
}

// Summary aggregates SLSA posture across the fleet.
type Summary struct {
	TotalWorkloads    int            `json:"total_workloads"`
	LevelDistribution map[string]int `json:"level_distribution"`
	AttestedWorkloads int            `json:"attested_workloads"`
	VerifiedWorkloads int            `json:"verified_workloads"`
	FleetPosture      Level          `json:"fleet_posture"` // lowest level in fleet
	EvaluatedAt       time.Time      `json:"evaluated_at"`
}
