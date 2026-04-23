package signing

import "time"

// Engine performs Sigstore/Cosign image signature verification.
//
// TODO (#9646): Replace stub with live cosign verify integration.
type Engine struct{}

// NewEngine creates a signing engine. Currently returns demo data.
func NewEngine() *Engine { return &Engine{} }

// Summary returns fleet-wide signature coverage metrics.
func (e *Engine) Summary() Summary {
	return Summary{
		TotalImages:      37,
		SignedImages:     33,
		VerifiedImages:   30,
		UnsignedImages:   4,
		PolicyViolations: 2,
		ClustersCovered:  5,
		EvaluatedAt:      time.Now(),
	}
}

// Images returns per-image signature verification results.
func (e *Engine) Images() []Image {
	// TODO (#9646): Walk running pods via Kubernetes API, resolve image digests,
	// run `cosign verify` against each, record Rekor transparency log entries.
	return []Image{}
}

// Policies returns cluster-scoped signing policies.
func (e *Engine) Policies() []Policy {
	// TODO (#9646): List Policy Controller ClusterImagePolicy resources.
	return []Policy{}
}
