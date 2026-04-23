package fedramp

import (
	"sync"
	"time"
)

// Engine evaluates FedRAMP readiness against cluster state.
type Engine struct {
	mu       sync.RWMutex
	controls []ControlBaseline
	poams    []POAMItem
}

// NewEngine returns a pre-populated FedRAMP engine with demo data.
func NewEngine() *Engine {
	e := &Engine{}
	e.controls = e.buildDemoControls()
	e.poams = e.buildDemoPOAMs()
	return e
}

// Controls returns all FedRAMP control baselines.
func (e *Engine) Controls() []ControlBaseline {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]ControlBaseline, len(e.controls))
	copy(out, e.controls)
	return out
}

// POAMs returns all Plan of Action & Milestones items.
func (e *Engine) POAMs() []POAMItem {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]POAMItem, len(e.poams))
	copy(out, e.poams)
	return out
}

// Score returns the overall FedRAMP readiness score.
func (e *Engine) Score() ReadinessScore {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var satisfied, partial, planned int
	for _, c := range e.controls {
		switch c.Status {
		case "satisfied":
			satisfied++
		case "partially_satisfied":
			partial++
		case "planned":
			planned++
		}
	}
	total := len(e.controls)
	score := 0
	if total > 0 {
		score = ((satisfied * 100) + (partial * 50)) / total
	}

	openPOAM, closedPOAM := 0, 0
	for _, p := range e.poams {
		switch p.MilestonStatus {
		case "open", "delayed":
			openPOAM++
		case "closed":
			closedPOAM++
		}
	}

	return ReadinessScore{
		OverallScore:        score,
		ImpactLevel:         "moderate",
		TotalControls:       total,
		SatisfiedControls:   satisfied,
		PartialControls:     partial,
		PlannedControls:     planned,
		OpenPOAMs:           openPOAM,
		ClosedPOAMs:         closedPOAM,
		AuthorizationStatus: "in_progress",
		EvaluatedAt:         time.Now().UTC().Format(time.RFC3339),
	}
}

func (e *Engine) buildDemoControls() []ControlBaseline {
	return []ControlBaseline{
		{ID: "AC-1", Family: "AC", Name: "Access Control Policy and Procedures", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "Access control policy documented and approved by ISSM"},
		{ID: "AC-2", Family: "AC", Name: "Account Management", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "Kubernetes RBAC with OIDC SSO enforces account lifecycle"},
		{ID: "AC-3", Family: "AC", Name: "Access Enforcement", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "RBAC + NetworkPolicy enforced on all namespaces"},
		{ID: "AC-6", Family: "AC", Name: "Least Privilege", ImpactLevel: "moderate", Status: "partially_satisfied", POAMEntry: true, Evidence: "80% of service accounts scoped; 3 legacy accounts pending"},
		{ID: "AU-2", Family: "AU", Name: "Audit Events", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "API server audit policy active with full event coverage"},
		{ID: "AU-6", Family: "AU", Name: "Audit Review", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "SIEM integration with automated alerting for audit events"},
		{ID: "CA-7", Family: "CA", Name: "Continuous Monitoring", ImpactLevel: "moderate", Status: "satisfied", POAMEntry: false, Evidence: "Prometheus + Grafana with 24/7 alerting via PagerDuty"},
		{ID: "CM-2", Family: "CM", Name: "Baseline Configuration", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "GitOps via Flux enforces immutable baseline"},
		{ID: "CM-6", Family: "CM", Name: "Configuration Settings", ImpactLevel: "low", Status: "partially_satisfied", POAMEntry: true, Evidence: "OPA Gatekeeper enforces 85% of config policies"},
		{ID: "IA-2", Family: "IA", Name: "Identification and Authentication", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "OIDC with MFA enforced for all human users"},
		{ID: "IR-4", Family: "IR", Name: "Incident Handling", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "PagerDuty with automated runbooks"},
		{ID: "RA-5", Family: "RA", Name: "Vulnerability Scanning", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "Trivy scans in CI/CD pipeline + weekly cluster scans"},
		{ID: "SC-7", Family: "SC", Name: "Boundary Protection", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "Ingress/egress NetworkPolicy + WAF at edge"},
		{ID: "SC-8", Family: "SC", Name: "Transmission Confidentiality", ImpactLevel: "moderate", Status: "satisfied", POAMEntry: false, Evidence: "mTLS via service mesh on all inter-pod traffic"},
		{ID: "SC-28", Family: "SC", Name: "Protection of Information at Rest", ImpactLevel: "moderate", Status: "satisfied", POAMEntry: false, Evidence: "etcd encryption with AES-256-GCM"},
		{ID: "SI-2", Family: "SI", Name: "Flaw Remediation", ImpactLevel: "low", Status: "partially_satisfied", POAMEntry: true, Evidence: "CVE patching SLA: Critical 48h, High 7d — current: 90% compliance"},
		{ID: "SI-4", Family: "SI", Name: "Information System Monitoring", ImpactLevel: "low", Status: "satisfied", POAMEntry: false, Evidence: "Falco runtime security + network flow logging"},
	}
}

func (e *Engine) buildDemoPOAMs() []POAMItem {
	return []POAMItem{
		{ID: "POAM-001", ControlID: "AC-6", Weakness: "3 legacy service accounts with overly broad permissions", Severity: "moderate", ScheduledDate: "2026-06-30", MilestonStatus: "open", ResponsibleRole: "Platform Engineering"},
		{ID: "POAM-002", ControlID: "CM-6", Weakness: "15% of OPA policies not yet enforced in staging", Severity: "low", ScheduledDate: "2026-07-15", MilestonStatus: "open", ResponsibleRole: "Security Engineering"},
		{ID: "POAM-003", ControlID: "SI-2", Weakness: "CVE patching SLA not met for 10% of high-severity findings", Severity: "moderate", ScheduledDate: "2026-05-31", MilestonStatus: "delayed", ResponsibleRole: "DevOps"},
		{ID: "POAM-004", ControlID: "AU-12", Weakness: "Node-level audit logging incomplete on 2 legacy nodes", Severity: "low", ScheduledDate: "2026-04-15", MilestonStatus: "closed", ResponsibleRole: "Platform Engineering"},
	}
}
