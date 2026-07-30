package gxp

import (
	"testing"
)

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("NewEngine returned nil")
	}
}

func TestConfig(t *testing.T) {
	e := NewEngine()
	cfg := e.GetConfig()
	if !cfg.Enabled {
		t.Error("expected GxP mode enabled")
	}
	if !cfg.AppendOnly {
		t.Error("expected append-only mode")
	}
	if cfg.HashAlgorithm != "SHA-256" {
		t.Errorf("expected SHA-256, got %s", cfg.HashAlgorithm)
	}
}

func TestAuditRecords(t *testing.T) {
	e := NewEngine()
	records := e.AuditRecords()
	if len(records) != 8 {
		t.Fatalf("expected 8 audit records, got %d", len(records))
	}
	// First record should have empty previous hash
	if records[0].PreviousHash != "" {
		t.Error("first record should have empty previous hash")
	}
	// Subsequent records should have non-empty previous hash
	for i := 1; i < len(records); i++ {
		if records[i].PreviousHash == "" {
			t.Errorf("record %d should have non-empty previous hash", i)
		}
		if records[i].PreviousHash != records[i-1].RecordHash {
			t.Errorf("record %d previous hash should match record %d hash", i, i-1)
		}
	}
}

func TestHashChainIntegrity(t *testing.T) {
	e := NewEngine()
	status := e.VerifyChain()
	if !status.Valid {
		t.Errorf("expected valid chain, got broken at index %d: %s", status.BrokenAtIndex, status.Message)
	}
	if status.TotalRecords != 8 {
		t.Errorf("expected 8 total records, got %d", status.TotalRecords)
	}
	if status.VerifiedRecords != 8 {
		t.Errorf("expected 8 verified records, got %d", status.VerifiedRecords)
	}
	if status.BrokenAtIndex != -1 {
		t.Errorf("expected broken_at_index -1, got %d", status.BrokenAtIndex)
	}
}

func TestSignatures(t *testing.T) {
	e := NewEngine()
	sigs := e.Signatures()
	if len(sigs) != 7 {
		t.Fatalf("expected 7 signatures, got %d", len(sigs))
	}
	for _, s := range sigs {
		if s.Meaning == "" {
			t.Errorf("signature %s has empty meaning", s.ID)
		}
		if s.AuthMethod == "" {
			t.Errorf("signature %s has empty auth method", s.ID)
		}
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.TotalRecords != 8 {
		t.Errorf("expected 8 records, got %d", s.TotalRecords)
	}
	if s.TotalSignatures != 7 {
		t.Errorf("expected 7 signatures, got %d", s.TotalSignatures)
	}
	if !s.ChainIntegrity {
		t.Error("expected chain integrity to be true")
	}
	if !s.Config.Enabled {
		t.Error("expected config enabled")
	}
	// gxp-008 (deploy) has no signature → 1 pending
	if s.PendingSignatures != 1 {
		t.Errorf("expected 1 pending signature, got %d", s.PendingSignatures)
	}
}

func TestRecordHashesUnique(t *testing.T) {
	e := NewEngine()
	seen := map[string]bool{}
	for _, r := range e.AuditRecords() {
		if seen[r.RecordHash] {
			t.Errorf("duplicate record hash: %s", r.RecordHash)
		}
		seen[r.RecordHash] = true
	}
}
