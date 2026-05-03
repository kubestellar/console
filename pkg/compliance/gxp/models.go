// Package gxp implements GxP Validation Mode for FDA 21 CFR Part 11 compliance.
// It provides an append-only audit trail with hash chain integrity and
// electronic signature support.
package gxp

import "time"

// AuditRecord is an append-only record in the GxP audit chain.
type AuditRecord struct {
	ID            string `json:"id"`
	Timestamp     string `json:"timestamp"`
	UserID        string `json:"user_id"`
	Action        string `json:"action"`
	Resource      string `json:"resource"`
	Detail        string `json:"detail"`
	PreviousHash  string `json:"previous_hash"`
	RecordHash    string `json:"record_hash"`
}

// Signature represents an electronic signature per 21 CFR Part 11.
type Signature struct {
	ID         string `json:"id"`
	RecordID   string `json:"record_id"`
	UserID     string `json:"user_id"`
	Meaning    string `json:"meaning"` // approved, reviewed, verified, rejected
	AuthMethod string `json:"auth_method"` // password, mfa, certificate
	Timestamp  string `json:"timestamp"`
}

// ChainStatus describes the integrity status of the hash chain.
type ChainStatus struct {
	Valid          bool   `json:"valid"`
	TotalRecords   int    `json:"total_records"`
	VerifiedRecords int   `json:"verified_records"`
	BrokenAtIndex  int    `json:"broken_at_index"` // -1 if chain is intact
	VerifiedAt     string `json:"verified_at"`
	Message        string `json:"message"`
}

// Config holds GxP mode configuration.
type Config struct {
	Enabled        bool   `json:"enabled"`
	EnabledAt      string `json:"enabled_at"`
	EnabledBy      string `json:"enabled_by"`
	AppendOnly     bool   `json:"append_only"`
	RequireSignature bool `json:"require_signature"`
	HashAlgorithm  string `json:"hash_algorithm"`
}

// Summary is the overall GxP compliance summary.
type Summary struct {
	Config         Config `json:"config"`
	TotalRecords   int    `json:"total_records"`
	TotalSignatures int   `json:"total_signatures"`
	ChainIntegrity bool   `json:"chain_integrity"`
	LastVerified   string `json:"last_verified"`
	PendingSignatures int `json:"pending_signatures"`
	EvaluatedAt    string `json:"evaluated_at"`
}

// SigningMeaning constants for electronic signatures.
var SigningMeanings = []string{"approved", "reviewed", "verified", "rejected"}

// Now returns current UTC time formatted as RFC3339 (testable seam).
var Now = func() time.Time { return time.Now().UTC() }
