package baa

import "testing"

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("NewEngine returned nil")
	}
}

func TestAgreements(t *testing.T) {
	e := NewEngine()
	agreements := e.Agreements()
	if len(agreements) != 6 {
		t.Fatalf("expected 6 agreements, got %d", len(agreements))
	}
}

func TestAgreementStatuses(t *testing.T) {
	e := NewEngine()
	counts := map[string]int{}
	for _, a := range e.Agreements() {
		counts[a.Status]++
	}
	if counts["active"] != 3 {
		t.Errorf("expected 3 active, got %d", counts["active"])
	}
	if counts["expiring_soon"] != 1 {
		t.Errorf("expected 1 expiring_soon, got %d", counts["expiring_soon"])
	}
	if counts["expired"] != 1 {
		t.Errorf("expected 1 expired, got %d", counts["expired"])
	}
	if counts["pending"] != 1 {
		t.Errorf("expected 1 pending, got %d", counts["pending"])
	}
}

func TestAlerts(t *testing.T) {
	e := NewEngine()
	alerts := e.Alerts()
	if len(alerts) != 2 {
		t.Fatalf("expected 2 alerts, got %d", len(alerts))
	}
	for _, a := range alerts {
		if a.Severity != "critical" {
			t.Errorf("expected critical severity, got %s", a.Severity)
		}
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.TotalAgreements != 6 {
		t.Errorf("expected 6 total, got %d", s.TotalAgreements)
	}
	if s.ActiveAgreements != 3 {
		t.Errorf("expected 3 active, got %d", s.ActiveAgreements)
	}
	if s.ExpiringSoon != 1 {
		t.Errorf("expected 1 expiring, got %d", s.ExpiringSoon)
	}
	if s.Expired != 1 {
		t.Errorf("expected 1 expired, got %d", s.Expired)
	}
	if s.CoveredClusters != 5 {
		t.Errorf("expected 5 covered clusters, got %d", s.CoveredClusters)
	}
	if s.UncoveredClusters != 1 {
		t.Errorf("expected 1 uncovered cluster, got %d", s.UncoveredClusters)
	}
	if s.ActiveAlerts != 2 {
		t.Errorf("expected 2 alerts, got %d", s.ActiveAlerts)
	}
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt")
	}
}

func TestAgreementFields(t *testing.T) {
	e := NewEngine()
	for _, a := range e.Agreements() {
		if a.ID == "" || a.Provider == "" || a.ProviderType == "" {
			t.Errorf("agreement missing required fields: %+v", a)
		}
		if a.ContactEmail == "" {
			t.Errorf("agreement %s missing contact email", a.ID)
		}
	}
}
