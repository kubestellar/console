package nist80053

import (
	"sync"
	"time"
)

// Engine evaluates NIST 800-53 controls against cluster state.
type Engine struct {
	mu       sync.RWMutex
	families []ControlFamily
	mappings []ControlMapping
}

// NewEngine returns a pre-populated NIST 800-53 engine with demo data.
func NewEngine() *Engine {
	e := &Engine{}
	e.families = e.buildDemoFamilies()
	e.mappings = e.buildDemoMappings()
	return e
}

// Families returns all control families with their controls.
func (e *Engine) Families() []ControlFamily {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]ControlFamily, len(e.families))
	copy(out, e.families)
	return out
}

// Mappings returns all control-to-resource mappings.
func (e *Engine) Mappings() []ControlMapping {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]ControlMapping, len(e.mappings))
	copy(out, e.mappings)
	return out
}

// Summary returns the overall NIST 800-53 compliance summary.
func (e *Engine) Summary() Summary {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var implemented, partial, planned, na int
	for _, f := range e.families {
		for _, c := range f.Controls {
			switch c.Status {
			case "implemented":
				implemented++
			case "partial":
				partial++
			case "planned":
				planned++
			case "not_applicable":
				na++
			}
		}
	}
	total := implemented + partial + planned + na
	score := 0
	if total-na > 0 {
		score = ((implemented * 100) + (partial * 50)) / (total - na)
	}
	return Summary{
		TotalControls:       total,
		ImplementedControls: implemented,
		PartialControls:     partial,
		PlannedControls:     planned,
		NotApplicable:       na,
		OverallScore:        score,
		Baseline:            "moderate",
		EvaluatedAt:         time.Now().UTC().Format(time.RFC3339),
	}
}

func (e *Engine) buildDemoFamilies() []ControlFamily {
	return []ControlFamily{
		{
			ID: "AC", Name: "Access Control", Description: "Manage system access and privileges.",
			Controls: []Control{
				{ID: "AC-2", Name: "Account Management", Description: "Manage information system accounts.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "Kubernetes RBAC with OIDC provider enforces account lifecycle", Remediation: ""},
				{ID: "AC-3", Name: "Access Enforcement", Description: "Enforce approved authorizations for logical access.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "NetworkPolicy + RBAC on all namespaces", Remediation: ""},
				{ID: "AC-6", Name: "Least Privilege", Description: "Employ the principle of least privilege.", Priority: "P1", Baseline: "low", Status: "partial", Evidence: "80% of service accounts scoped; 3 legacy accounts need tightening", Remediation: "Audit and restrict remaining legacy service accounts"},
				{ID: "AC-17", Name: "Remote Access", Description: "Establish and manage remote access sessions.", Priority: "P1", Baseline: "moderate", Status: "implemented", Evidence: "VPN + mTLS for all kubectl access", Remediation: ""},
			},
			PassRate: 83,
		},
		{
			ID: "AU", Name: "Audit and Accountability", Description: "Create, protect, and retain audit records.",
			Controls: []Control{
				{ID: "AU-2", Name: "Audit Events", Description: "Determine auditable events.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "API server audit policy covers create/delete/patch", Remediation: ""},
				{ID: "AU-3", Name: "Content of Audit Records", Description: "Audit records contain required information.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "Structured JSON audit logs with user, timestamp, resource, action", Remediation: ""},
				{ID: "AU-6", Name: "Audit Review, Analysis, and Reporting", Description: "Review and analyze audit records.", Priority: "P1", Baseline: "low", Status: "partial", Evidence: "Logs shipped to SIEM; automated alerting covers 60% of events", Remediation: "Expand alert rules for remaining 40% of audit events"},
				{ID: "AU-12", Name: "Audit Generation", Description: "Provide audit record generation capability.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "All nodes emit audit logs via Fluentd", Remediation: ""},
			},
			PassRate: 87,
		},
		{
			ID: "SC", Name: "System and Communications Protection", Description: "Protect communications and system boundaries.",
			Controls: []Control{
				{ID: "SC-7", Name: "Boundary Protection", Description: "Monitor and control communications at boundaries.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "Ingress/egress NetworkPolicy on all namespaces; WAF at edge", Remediation: ""},
				{ID: "SC-8", Name: "Transmission Confidentiality", Description: "Protect transmitted information.", Priority: "P1", Baseline: "moderate", Status: "implemented", Evidence: "All inter-pod traffic encrypted via service mesh mTLS", Remediation: ""},
				{ID: "SC-12", Name: "Cryptographic Key Management", Description: "Establish and manage cryptographic keys.", Priority: "P1", Baseline: "low", Status: "partial", Evidence: "KMS-backed encryption at rest; key rotation every 90d for 80% of keys", Remediation: "Enable automatic rotation for remaining etcd encryption keys"},
				{ID: "SC-28", Name: "Protection of Information at Rest", Description: "Protect information at rest.", Priority: "P1", Baseline: "moderate", Status: "implemented", Evidence: "etcd encryption enabled with AES-256-GCM", Remediation: ""},
			},
			PassRate: 87,
		},
		{
			ID: "CM", Name: "Configuration Management", Description: "Establish configuration baselines and manage changes.",
			Controls: []Control{
				{ID: "CM-2", Name: "Baseline Configuration", Description: "Maintain baseline configurations.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "GitOps with Flux enforces desired state", Remediation: ""},
				{ID: "CM-6", Name: "Configuration Settings", Description: "Establish mandatory configuration settings.", Priority: "P1", Baseline: "low", Status: "partial", Evidence: "OPA Gatekeeper enforces 85% of policies; 3 policies pending", Remediation: "Deploy remaining OPA constraint templates"},
				{ID: "CM-7", Name: "Least Functionality", Description: "Configure to provide only essential capabilities.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "Minimal container images; no privileged containers allowed", Remediation: ""},
				{ID: "CM-8", Name: "Information System Component Inventory", Description: "Develop and maintain component inventory.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "SBOM generated for all deployments via Syft", Remediation: ""},
			},
			PassRate: 87,
		},
		{
			ID: "IR", Name: "Incident Response", Description: "Prepare for and respond to security incidents.",
			Controls: []Control{
				{ID: "IR-4", Name: "Incident Handling", Description: "Implement incident handling capability.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "PagerDuty integration with automated runbooks", Remediation: ""},
				{ID: "IR-5", Name: "Incident Monitoring", Description: "Track and document security incidents.", Priority: "P1", Baseline: "low", Status: "implemented", Evidence: "Incident tracking in JIRA with automated timeline", Remediation: ""},
				{ID: "IR-6", Name: "Incident Reporting", Description: "Report incidents to appropriate authorities.", Priority: "P1", Baseline: "low", Status: "planned", Evidence: "", Remediation: "Implement automated FedRAMP POAM reporting workflow"},
			},
			PassRate: 66,
		},
	}
}

func (e *Engine) buildDemoMappings() []ControlMapping {
	now := time.Now().UTC().Format(time.RFC3339)
	return []ControlMapping{
		{ControlID: "AC-2", Resources: []string{"ServiceAccount", "ClusterRoleBinding"}, Namespaces: []string{"kube-system", "production"}, Clusters: []string{"prod-east", "prod-west"}, Automated: true, LastAssessed: now},
		{ControlID: "AC-3", Resources: []string{"NetworkPolicy", "Role", "RoleBinding"}, Namespaces: []string{"*"}, Clusters: []string{"prod-east", "prod-west", "staging"}, Automated: true, LastAssessed: now},
		{ControlID: "SC-7", Resources: []string{"NetworkPolicy", "Ingress"}, Namespaces: []string{"*"}, Clusters: []string{"prod-east", "prod-west"}, Automated: true, LastAssessed: now},
		{ControlID: "SC-8", Resources: []string{"PeerAuthentication", "DestinationRule"}, Namespaces: []string{"*"}, Clusters: []string{"prod-east", "prod-west"}, Automated: true, LastAssessed: now},
		{ControlID: "CM-2", Resources: []string{"GitRepository", "Kustomization"}, Namespaces: []string{"flux-system"}, Clusters: []string{"prod-east", "prod-west", "staging"}, Automated: true, LastAssessed: now},
		{ControlID: "AU-2", Resources: []string{"AuditPolicy"}, Namespaces: []string{"kube-system"}, Clusters: []string{"prod-east", "prod-west"}, Automated: true, LastAssessed: now},
		{ControlID: "IR-4", Resources: []string{"AlertmanagerConfig"}, Namespaces: []string{"monitoring"}, Clusters: []string{"prod-east", "prod-west"}, Automated: false, LastAssessed: now},
	}
}
