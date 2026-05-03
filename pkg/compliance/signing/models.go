// Package signing implements Sigstore/Cosign image signature verification
// for the fleet. Checks keyless signatures against the Rekor transparency log
// and evaluates cluster-scoped signing policies.
//
// TODO (#9646): Full implementation — integrate with:
//   - Cosign verify-attestation for SBOM and SLSA predicates
//   - Policy Controller (formerly Cosign Policy Controller) for enforcement
//   - Rekor log entry lookup for transparency verification
//   - Sigstore TUF root rotation monitoring
package signing

import "time"

// Image represents signature verification status for a container image.
type Image struct {
	Image           string     `json:"image"`
	Digest          string     `json:"digest"`
	Workload        string     `json:"workload"`
	Namespace       string     `json:"namespace"`
	Cluster         string     `json:"cluster"`
	Signed          bool       `json:"signed"`
	Verified        bool       `json:"verified"`
	Signer          string     `json:"signer"`
	Keyless         bool       `json:"keyless"`
	TransparencyLog bool       `json:"transparency_log"`
	SignedAt        *time.Time `json:"signed_at"`
	FailureReason   *string    `json:"failure_reason"`
}

// Policy is a cluster-scoped image signing policy.
type Policy struct {
	Name       string `json:"name"`
	Cluster    string `json:"cluster"`
	Mode       string `json:"mode"` // enforce, warn, audit
	Scope      string `json:"scope"`
	Rules      int    `json:"rules"`
	Violations int    `json:"violations"`
}

// Summary aggregates fleet-wide signing coverage.
type Summary struct {
	TotalImages      int       `json:"total_images"`
	SignedImages     int       `json:"signed_images"`
	VerifiedImages   int       `json:"verified_images"`
	UnsignedImages   int       `json:"unsigned_images"`
	PolicyViolations int       `json:"policy_violations"`
	ClustersCovered  int       `json:"clusters_covered"`
	EvaluatedAt      time.Time `json:"evaluated_at"`
}
