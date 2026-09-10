package gxp

import (
	"strings"
	"testing"
	"time"
)

// TestVerifyChain_BrokenAtMiddleRecord tampers with a record's RecordHash
// so VerifyChain's mismatch branch (engine.go lines 40-47) is exercised:
// Valid=false, VerifiedRecords=<tamper-index>, BrokenAtIndex=<tamper-index>,
// and Message names the tampered record ID. The default seed chain is
// intact, so this uncovered arm can only be reached by mutating the
// unexported `records` slice from within the same package.
func TestVerifyChain_BrokenAtMiddleRecord(t *testing.T) {
	e := NewEngine()
	original := e.records[3].RecordHash
	e.records[3].RecordHash = "deadbeefdeadbeefdeadbeefdeadbeef"
	defer func() { e.records[3].RecordHash = original }()

	status := e.VerifyChain()
	if status.Valid {
		t.Fatalf("expected Valid=false after tampering record 3, got true: %+v", status)
	}
	if status.BrokenAtIndex != 3 {
		t.Errorf("BrokenAtIndex: want 3, got %d", status.BrokenAtIndex)
	}
	if status.VerifiedRecords != 3 {
		t.Errorf("VerifiedRecords: want 3, got %d", status.VerifiedRecords)
	}
	if status.TotalRecords != len(e.records) {
		t.Errorf("TotalRecords: want %d, got %d", len(e.records), status.TotalRecords)
	}
	tamperedID := e.records[3].ID
	if !strings.Contains(status.Message, tamperedID) {
		t.Errorf("Message should name tampered record %q, got %q", tamperedID, status.Message)
	}
	if !strings.Contains(status.Message, "Chain broken at record 3") {
		t.Errorf("Message should describe broken index 3, got %q", status.Message)
	}
	if _, err := time.Parse(time.RFC3339, status.VerifiedAt); err != nil {
		t.Errorf("VerifiedAt should be RFC3339, got %q: %v", status.VerifiedAt, err)
	}
}

// TestVerifyChain_BrokenAtFirstRecord covers the i==0 tamper path — the
// hasPrevious=false arm of computeHash, plus the mismatch branch. This
// guarantees that a corrupted genesis record is caught at index 0 with
// zero VerifiedRecords, so the "chain broken from the start" case cannot
// silently regress to reporting a partially-valid prefix.
func TestVerifyChain_BrokenAtFirstRecord(t *testing.T) {
	e := NewEngine()
	original := e.records[0].RecordHash
	e.records[0].RecordHash = "0000000000000000000000000000000"
	defer func() { e.records[0].RecordHash = original }()

	status := e.VerifyChain()
	if status.Valid {
		t.Fatalf("expected Valid=false after tampering record 0, got true: %+v", status)
	}
	if status.BrokenAtIndex != 0 {
		t.Errorf("BrokenAtIndex: want 0, got %d", status.BrokenAtIndex)
	}
	if status.VerifiedRecords != 0 {
		t.Errorf("VerifiedRecords: want 0, got %d", status.VerifiedRecords)
	}
	if !strings.Contains(status.Message, e.records[0].ID) {
		t.Errorf("Message should name tampered record %q, got %q", e.records[0].ID, status.Message)
	}
}

// TestSummary_ChainIntegrityFalseWhenBroken pins the Summary→VerifyChain
// linkage. If a maintainer accidentally decouples Summary from the chain
// check (e.g. caches the last-good result), a broken chain would still
// report ChainIntegrity=true. Tampering a record and re-calling Summary
// must flip ChainIntegrity to false in the same call.
func TestSummary_ChainIntegrityFalseWhenBroken(t *testing.T) {
	e := NewEngine()

	if s := e.Summary(); !s.ChainIntegrity {
		t.Fatalf("expected intact chain on fresh engine, got ChainIntegrity=false")
	}

	original := e.records[2].RecordHash
	e.records[2].RecordHash = "ffffffffffffffffffffffffffffffff"
	defer func() { e.records[2].RecordHash = original }()

	s := e.Summary()
	if s.ChainIntegrity {
		t.Errorf("Summary.ChainIntegrity should be false after tampering, got true")
	}
	if s.TotalRecords != len(e.records) {
		t.Errorf("Summary.TotalRecords: want %d, got %d", len(e.records), s.TotalRecords)
	}
}
