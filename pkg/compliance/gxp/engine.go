package gxp

import (
	"crypto/sha256"
	"fmt"
	"time"
)

// Engine evaluates GxP / 21 CFR Part 11 compliance.
type Engine struct {
	config     Config
	records    []AuditRecord
	signatures []Signature
}

// NewEngine creates a GxP engine with demo data.
func NewEngine() *Engine {
	e := &Engine{}
	e.config = e.buildConfig()
	e.records = e.buildAuditRecords()
	e.signatures = e.buildSignatures()
	return e
}

// GetConfig returns the current GxP configuration.
func (e *Engine) GetConfig() Config { return e.config }

// AuditRecords returns the append-only audit chain.
func (e *Engine) AuditRecords() []AuditRecord { return e.records }

// Signatures returns electronic signatures.
func (e *Engine) Signatures() []Signature { return e.signatures }

// VerifyChain validates the hash chain integrity.
func (e *Engine) VerifyChain() ChainStatus {
	total := len(e.records)
	for i, r := range e.records {
		expected := computeHash(r, i > 0, e.records)
		if r.RecordHash != expected {
			return ChainStatus{
				Valid:           false,
				TotalRecords:   total,
				VerifiedRecords: i,
				BrokenAtIndex:  i,
				VerifiedAt:     Now().Format(time.RFC3339),
				Message:        fmt.Sprintf("Chain broken at record %d (%s)", i, r.ID),
			}
		}
	}
	return ChainStatus{
		Valid:           true,
		TotalRecords:   total,
		VerifiedRecords: total,
		BrokenAtIndex:  -1,
		VerifiedAt:     Now().Format(time.RFC3339),
		Message:        "Hash chain intact — all records verified",
	}
}

// Summary returns the overall GxP compliance summary.
func (e *Engine) Summary() Summary {
	chain := e.VerifyChain()
	pending := 0
	signedRecords := map[string]bool{}
	for _, s := range e.signatures {
		signedRecords[s.RecordID] = true
	}
	for _, r := range e.records {
		if r.Action == "deploy" || r.Action == "config_change" {
			if !signedRecords[r.ID] {
				pending++
			}
		}
	}
	return Summary{
		Config:            e.config,
		TotalRecords:      len(e.records),
		TotalSignatures:   len(e.signatures),
		ChainIntegrity:    chain.Valid,
		LastVerified:      chain.VerifiedAt,
		PendingSignatures: pending,
		EvaluatedAt:       Now().Format(time.RFC3339),
	}
}

func computeHash(r AuditRecord, hasPrevious bool, records []AuditRecord) string {
	data := fmt.Sprintf("%s|%s|%s|%s|%s|%s", r.ID, r.Timestamp, r.UserID, r.Action, r.Resource, r.Detail)
	if hasPrevious {
		idx := -1
		for i, rec := range records {
			if rec.ID == r.ID {
				idx = i
				break
			}
		}
		if idx > 0 {
			data += "|" + records[idx-1].RecordHash
		}
	}
	h := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", h[:16])
}

func (e *Engine) buildConfig() Config {
	return Config{
		Enabled:          true,
		EnabledAt:        "2026-04-20T08:00:00Z",
		EnabledBy:        "admin@pharma.example.com",
		AppendOnly:       true,
		RequireSignature: true,
		HashAlgorithm:    "SHA-256",
	}
}

func (e *Engine) buildAuditRecords() []AuditRecord {
	base := []struct {
		id, ts, user, action, resource, detail string
	}{
		{"gxp-001", "2026-04-20T08:01:00Z", "admin@pharma.example.com", "config_change", "gxp-mode", "GxP validation mode enabled"},
		{"gxp-002", "2026-04-20T09:15:00Z", "eng1@pharma.example.com", "deploy", "ehr-api/v2.3.1", "Deployment to prod-east namespace ehr-api"},
		{"gxp-003", "2026-04-20T09:16:00Z", "qa-lead@pharma.example.com", "review", "ehr-api/v2.3.1", "QA review passed — IQ/OQ/PQ complete"},
		{"gxp-004", "2026-04-21T11:30:00Z", "eng2@pharma.example.com", "deploy", "lab-results/v1.8.0", "Deployment to prod-west namespace lab-results"},
		{"gxp-005", "2026-04-21T14:00:00Z", "admin@pharma.example.com", "config_change", "rbac", "Added ServiceAccount lab-etl-sa with read-only access"},
		{"gxp-006", "2026-04-22T08:45:00Z", "eng1@pharma.example.com", "deploy", "patient-records/v3.1.2", "Hotfix deployment — security patch CVE-2026-1234"},
		{"gxp-007", "2026-04-22T10:00:00Z", "qa-lead@pharma.example.com", "review", "patient-records/v3.1.2", "Emergency change review — approved with conditions"},
		{"gxp-008", "2026-04-23T07:00:00Z", "eng2@pharma.example.com", "deploy", "billing-phi/v2.0.0", "Major version deployment with schema migration"},
	}

	records := make([]AuditRecord, len(base))
	prevHash := ""
	for i, b := range base {
		data := fmt.Sprintf("%s|%s|%s|%s|%s|%s", b.id, b.ts, b.user, b.action, b.resource, b.detail)
		if prevHash != "" {
			data += "|" + prevHash
		}
		h := sha256.Sum256([]byte(data))
		hash := fmt.Sprintf("%x", h[:16])
		records[i] = AuditRecord{
			ID: b.id, Timestamp: b.ts, UserID: b.user, Action: b.action,
			Resource: b.resource, Detail: b.detail, PreviousHash: prevHash, RecordHash: hash,
		}
		prevHash = hash
	}
	return records
}

func (e *Engine) buildSignatures() []Signature {
	return []Signature{
		{ID: "sig-001", RecordID: "gxp-001", UserID: "admin@pharma.example.com", Meaning: "approved", AuthMethod: "mfa", Timestamp: "2026-04-20T08:02:00Z"},
		{ID: "sig-002", RecordID: "gxp-002", UserID: "qa-lead@pharma.example.com", Meaning: "approved", AuthMethod: "mfa", Timestamp: "2026-04-20T09:20:00Z"},
		{ID: "sig-003", RecordID: "gxp-003", UserID: "qa-lead@pharma.example.com", Meaning: "reviewed", AuthMethod: "password", Timestamp: "2026-04-20T09:17:00Z"},
		{ID: "sig-004", RecordID: "gxp-004", UserID: "qa-lead@pharma.example.com", Meaning: "approved", AuthMethod: "mfa", Timestamp: "2026-04-21T12:00:00Z"},
		{ID: "sig-005", RecordID: "gxp-005", UserID: "admin@pharma.example.com", Meaning: "approved", AuthMethod: "mfa", Timestamp: "2026-04-21T14:05:00Z"},
		{ID: "sig-006", RecordID: "gxp-006", UserID: "qa-lead@pharma.example.com", Meaning: "verified", AuthMethod: "mfa", Timestamp: "2026-04-22T09:00:00Z"},
		{ID: "sig-007", RecordID: "gxp-007", UserID: "admin@pharma.example.com", Meaning: "approved", AuthMethod: "certificate", Timestamp: "2026-04-22T10:05:00Z"},
	}
}
