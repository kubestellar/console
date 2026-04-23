package hipaa

import "time"

// Engine evaluates HIPAA Security Rule compliance.
type Engine struct {
	safeguards   []Safeguard
	phiNamespaces []PHINamespace
	dataFlows    []DataFlow
}

// NewEngine creates a HIPAA compliance engine with demo data.
func NewEngine() *Engine {
	e := &Engine{}
	e.safeguards = e.buildSafeguards()
	e.phiNamespaces = e.buildPHINamespaces()
	e.dataFlows = e.buildDataFlows()
	return e
}

// Safeguards returns all HIPAA technical safeguards with check results.
func (e *Engine) Safeguards() []Safeguard {
	return e.safeguards
}

// PHINamespaces returns namespaces handling Protected Health Information.
func (e *Engine) PHINamespaces() []PHINamespace {
	return e.phiNamespaces
}

// DataFlows returns PHI data flows between components.
func (e *Engine) DataFlows() []DataFlow {
	return e.dataFlows
}

// Summary returns the overall HIPAA compliance summary.
func (e *Engine) Summary() Summary {
	passed, failed, partial := 0, 0, 0
	for _, s := range e.safeguards {
		switch s.Status {
		case "pass":
			passed++
		case "fail":
			failed++
		case "partial":
			partial++
		}
	}
	total := len(e.safeguards)
	score := 0
	if total > 0 {
		score = ((passed * 100) + (partial * 50)) / total
	}

	compliantNS := 0
	for _, ns := range e.phiNamespaces {
		if ns.Compliant {
			compliantNS++
		}
	}

	encryptedFlows := 0
	for _, f := range e.dataFlows {
		if f.Encrypted {
			encryptedFlows++
		}
	}

	return Summary{
		OverallScore:      score,
		SafeguardsPassed:  passed,
		SafeguardsFailed:  failed,
		SafeguardsPartial: partial,
		TotalSafeguards:   total,
		PHINamespaces:     len(e.phiNamespaces),
		CompliantNS:       compliantNS,
		DataFlows:         len(e.dataFlows),
		EncryptedFlows:    encryptedFlows,
		EvaluatedAt:       time.Now().UTC().Format(time.RFC3339),
	}
}

func (e *Engine) buildSafeguards() []Safeguard {
	return []Safeguard{
		{
			ID: "164.312(a)", Section: "§164.312(a)(1)", Name: "Access Control",
			Description: "Implement technical policies to allow access only to authorized persons.",
			Status: "pass",
			Checks: []Check{
				{ID: "ac-1", Name: "RBAC enforced on PHI namespaces", Description: "Verify Role-Based Access Control restricts PHI namespace access", Status: "pass", Evidence: "All 4 PHI namespaces have RBAC policies", Remediation: ""},
				{ID: "ac-2", Name: "Unique user identification", Description: "Each user has a unique identifier", Status: "pass", Evidence: "OIDC provider enforces unique subject claims", Remediation: ""},
				{ID: "ac-3", Name: "Emergency access procedure", Description: "Break-glass procedure documented and tested", Status: "pass", Evidence: "Break-glass ServiceAccount with audit trail configured", Remediation: ""},
			},
		},
		{
			ID: "164.312(b)", Section: "§164.312(b)", Name: "Audit Controls",
			Description: "Implement mechanisms to record and examine activity in systems containing PHI.",
			Status: "partial",
			Checks: []Check{
				{ID: "au-1", Name: "Kubernetes audit logging", Description: "API server audit policy captures PHI access", Status: "pass", Evidence: "Audit policy with RequestResponse level for PHI namespaces", Remediation: ""},
				{ID: "au-2", Name: "Log retention 6+ years", Description: "Audit logs retained per HIPAA requirement", Status: "fail", Evidence: "Current retention: 90 days", Remediation: "Extend log retention to minimum 6 years via S3 lifecycle policy"},
				{ID: "au-3", Name: "Tamper-proof log storage", Description: "Logs stored in immutable storage", Status: "pass", Evidence: "S3 Object Lock enabled on audit bucket", Remediation: ""},
			},
		},
		{
			ID: "164.312(c)", Section: "§164.312(c)(1)", Name: "Integrity Controls",
			Description: "Implement policies to protect PHI from improper alteration or destruction.",
			Status: "pass",
			Checks: []Check{
				{ID: "ic-1", Name: "Image signature verification", Description: "Container images signed and verified before deployment", Status: "pass", Evidence: "Cosign verification policy enforced via admission controller", Remediation: ""},
				{ID: "ic-2", Name: "Immutable container filesystem", Description: "Containers run with read-only root filesystem", Status: "pass", Evidence: "SecurityContext readOnlyRootFilesystem=true on all PHI pods", Remediation: ""},
			},
		},
		{
			ID: "164.312(d)", Section: "§164.312(d)", Name: "Person or Entity Authentication",
			Description: "Verify identity of persons seeking access to PHI.",
			Status: "partial",
			Checks: []Check{
				{ID: "pa-1", Name: "Multi-factor authentication", Description: "MFA required for PHI system access", Status: "pass", Evidence: "OIDC provider enforces MFA for all users", Remediation: ""},
				{ID: "pa-2", Name: "Service account rotation", Description: "Service account tokens rotated regularly", Status: "partial", Evidence: "3 of 5 service accounts use projected tokens (auto-rotate)", Remediation: "Migrate remaining 2 service accounts to projected volume tokens"},
			},
		},
		{
			ID: "164.312(e)", Section: "§164.312(e)(1)", Name: "Transmission Security",
			Description: "Implement measures to guard against unauthorized access to PHI during transmission.",
			Status: "fail",
			Checks: []Check{
				{ID: "ts-1", Name: "TLS 1.2+ on all endpoints", Description: "All services use TLS 1.2 or higher", Status: "pass", Evidence: "Ingress controller configured with minimum TLS 1.2", Remediation: ""},
				{ID: "ts-2", Name: "Mutual TLS between services", Description: "Service mesh enforces mTLS for PHI data flows", Status: "fail", Evidence: "2 of 6 PHI data flows lack mTLS", Remediation: "Enable Istio strict mTLS policy for PHI namespaces"},
				{ID: "ts-3", Name: "Encryption of PHI at rest", Description: "etcd and PV encryption enabled", Status: "pass", Evidence: "etcd encryption provider configured, StorageClass encrypted", Remediation: ""},
			},
		},
	}
}

func (e *Engine) buildPHINamespaces() []PHINamespace {
	return []PHINamespace{
		{Name: "ehr-api", Cluster: "prod-east", Labels: []string{"hipaa-phi=true", "data-class=restricted"}, Encrypted: true, AuditEnabled: true, RBACRestricted: true, Compliant: true},
		{Name: "patient-records", Cluster: "prod-east", Labels: []string{"hipaa-phi=true", "data-class=restricted"}, Encrypted: true, AuditEnabled: true, RBACRestricted: true, Compliant: true},
		{Name: "lab-results", Cluster: "prod-west", Labels: []string{"hipaa-phi=true", "data-class=sensitive"}, Encrypted: true, AuditEnabled: true, RBACRestricted: false, Compliant: false},
		{Name: "billing-phi", Cluster: "prod-west", Labels: []string{"hipaa-phi=true", "data-class=restricted"}, Encrypted: true, AuditEnabled: false, RBACRestricted: true, Compliant: false},
	}
}

func (e *Engine) buildDataFlows() []DataFlow {
	return []DataFlow{
		{Source: "ehr-api", Destination: "patient-records", Protocol: "gRPC", Encrypted: true, MutualTLS: true},
		{Source: "ehr-api", Destination: "lab-results", Protocol: "REST/HTTPS", Encrypted: true, MutualTLS: true},
		{Source: "patient-records", Destination: "billing-phi", Protocol: "REST/HTTPS", Encrypted: true, MutualTLS: false},
		{Source: "lab-results", Destination: "billing-phi", Protocol: "REST/HTTPS", Encrypted: true, MutualTLS: false},
		{Source: "ehr-api", Destination: "analytics-deid", Protocol: "Kafka/TLS", Encrypted: true, MutualTLS: true},
		{Source: "billing-phi", Destination: "claims-export", Protocol: "SFTP", Encrypted: false, MutualTLS: false},
	}
}
