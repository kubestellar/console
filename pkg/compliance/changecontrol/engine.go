package changecontrol

import (
	"fmt"
	"sort"
	"sync"
	"time"
)

// Engine evaluates change-control policies and tracks configuration changes.
type Engine struct {
	mu         sync.RWMutex
	policies   []ChangePolicy
	changes    []ChangeRecord
	violations []PolicyViolation
}

// NewEngine returns an engine pre-loaded with demo policies, changes, and violations.
func NewEngine() *Engine {
	e := &Engine{
		policies: builtinPolicies(),
		changes:  demoChanges(),
	}
	e.violations = e.evaluate()
	return e
}

// Policies returns the configured change-control policies.
func (e *Engine) Policies() []ChangePolicy {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]ChangePolicy, len(e.policies))
	copy(out, e.policies)
	return out
}

// Changes returns tracked change records, newest first.
func (e *Engine) Changes() []ChangeRecord {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]ChangeRecord, len(e.changes))
	copy(out, e.changes)
	sort.Slice(out, func(i, j int) bool { return out[i].Timestamp.After(out[j].Timestamp) })
	return out
}

// Violations returns detected policy violations.
func (e *Engine) Violations() []PolicyViolation {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]PolicyViolation, len(e.violations))
	copy(out, e.violations)
	return out
}

// Summary returns aggregated change-control metrics.
func (e *Engine) Summary() AuditSummary {
	e.mu.RLock()
	defer e.mu.RUnlock()

	s := AuditSummary{
		ByCluster: make(map[string]int),
		ByType:    make(map[string]int),
		ByActor:   make(map[string]int),
	}
	for _, c := range e.changes {
		s.TotalChanges++
		s.ByCluster[c.Cluster]++
		s.ByType[string(c.ChangeType)]++
		s.ByActor[c.Actor]++
		switch c.ApprovalStatus {
		case ApprovalApproved:
			s.ApprovedChanges++
		case ApprovalUnapproved:
			s.UnapprovedChanges++
		case ApprovalEmergency:
			s.EmergencyChanges++
		}
	}
	s.PolicyViolations = len(e.violations)
	if s.TotalChanges > 0 {
		unapprovedRatio := float64(s.UnapprovedChanges+s.EmergencyChanges) / float64(s.TotalChanges)
		violationPenalty := float64(s.PolicyViolations) * 5
		score := int(unapprovedRatio*60 + violationPenalty)
		if score > 100 {
			score = 100
		}
		s.RiskScore = score
	}
	return s
}

func (e *Engine) evaluate() []PolicyViolation {
	var violations []PolicyViolation
	vid := 0
	for _, change := range e.changes {
		for _, policy := range e.policies {
			if !policyApplies(policy, change) {
				continue
			}
			if policy.RequiresApproval && change.ApprovalStatus == ApprovalUnapproved {
				vid++
				violations = append(violations, PolicyViolation{
					ID: fmt.Sprintf("cv-%03d", vid), ChangeID: change.ID, Policy: policy.ID,
					Severity: policy.Severity, DetectedAt: change.Timestamp.Add(time.Minute),
					Description: fmt.Sprintf("Change to %s/%s in %s requires approval but was unapproved", change.ResourceKind, change.ResourceName, change.Cluster),
				})
			}
			if policy.RequiresTicket && change.TicketRef == "" {
				vid++
				violations = append(violations, PolicyViolation{
					ID: fmt.Sprintf("cv-%03d", vid), ChangeID: change.ID, Policy: policy.ID,
					Severity: SeverityMedium, DetectedAt: change.Timestamp.Add(time.Minute),
					Description: fmt.Sprintf("Change to %s/%s has no ticket reference (required by %s)", change.ResourceKind, change.ResourceName, policy.Name),
				})
			}
			if len(policy.AllowedWindows) > 0 && !inWindow(change.Timestamp, policy.AllowedWindows) {
				vid++
				violations = append(violations, PolicyViolation{
					ID: fmt.Sprintf("cv-%03d", vid), ChangeID: change.ID, Policy: policy.ID,
					Severity: SeverityHigh, DetectedAt: change.Timestamp.Add(time.Minute),
					Description: fmt.Sprintf("Change to %s/%s occurred outside allowed change window", change.ResourceKind, change.ResourceName),
				})
			}
			for _, blocked := range policy.BlockedChangeTypes {
				if change.ChangeType == blocked {
					vid++
					violations = append(violations, PolicyViolation{
						ID: fmt.Sprintf("cv-%03d", vid), ChangeID: change.ID, Policy: policy.ID,
						Severity: SeverityCritical, DetectedAt: change.Timestamp.Add(time.Minute),
						Description: fmt.Sprintf("Change type %s is blocked by policy %s in scope %s", change.ChangeType, policy.Name, policy.Scope),
					})
				}
			}
		}
	}
	return violations
}

func policyApplies(p ChangePolicy, c ChangeRecord) bool {
	switch p.Scope {
	case "production":
		return isProdCluster(c.Cluster)
	case "staging":
		return !isProdCluster(c.Cluster)
	default:
		return true
	}
}

func isProdCluster(name string) bool {
	for _, prefix := range []string{"prod-", "production-", "pci-"} {
		if len(name) >= len(prefix) && name[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}

func inWindow(t time.Time, windows []Window) bool {
	dayName := dayOfWeekName(t.UTC().Weekday())
	hour := t.UTC().Hour()
	for _, w := range windows {
		if !dayMatches(w.DayOfWeek, dayName, t.UTC().Weekday()) {
			continue
		}
		if hour >= w.StartHour && hour < w.EndHour {
			return true
		}
	}
	return false
}

func dayOfWeekName(d time.Weekday) string {
	return [...]string{"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"}[d]
}

func dayMatches(pattern, actual string, wd time.Weekday) bool {
	switch pattern {
	case "weekday":
		return wd >= time.Monday && wd <= time.Friday
	case "weekend":
		return wd == time.Saturday || wd == time.Sunday
	default:
		return pattern == actual
	}
}

func builtinPolicies() []ChangePolicy {
	return []ChangePolicy{
		{ID: "sox-prod-approval", Name: "SOX Production Approval", Description: "All production changes must be pre-approved with a change ticket (SOX IT General Controls)", Scope: "production", RequiresApproval: true, RequiresTicket: true, Severity: SeverityCritical},
		{ID: "pci-change-window", Name: "PCI Change Window", Description: "PCI-scoped changes only permitted during weekday business hours (06:00-22:00 UTC)", Scope: "production", RequiresApproval: true, AllowedWindows: []Window{{DayOfWeek: "weekday", StartHour: 6, EndHour: 22}}, Severity: SeverityHigh},
		{ID: "prod-secret-block", Name: "Production Secret Direct Edit", Description: "Direct secret modifications in production are blocked — use sealed-secrets or external-secrets operator", Scope: "production", RequiresApproval: true, BlockedChangeTypes: []ChangeType{ChangeSecret}, Severity: SeverityCritical},
		{ID: "rbac-dual-control", Name: "RBAC Dual Control", Description: "RBAC changes require dual approval (SOX segregation of duties)", Scope: "all", RequiresApproval: true, RequiresTicket: true, Severity: SeverityHigh},
		{ID: "staging-approval", Name: "Staging Approval", Description: "Staging changes should be tracked with tickets for audit trail", Scope: "staging", RequiresApproval: false, RequiresTicket: true, Severity: SeverityLow},
	}
}

func demoChanges() []ChangeRecord {
	now := time.Now().UTC()
	return []ChangeRecord{
		{ID: "chg-001", Timestamp: now.Add(-2 * time.Hour), Cluster: "prod-us-east", Namespace: "payments", ResourceKind: "Deployment", ResourceName: "payment-api", ChangeType: ChangeDeployment, Actor: "ci-bot@acme.com", ApprovalStatus: ApprovalApproved, ApprovedBy: "jane.smith@acme.com", TicketRef: "CHG-4521", Description: "Scaled replicas 3→5 for load test", DiffSummary: "spec.replicas: 3 → 5", RiskScore: 15},
		{ID: "chg-002", Timestamp: now.Add(-90 * time.Minute), Cluster: "prod-us-east", Namespace: "payments", ResourceKind: "ConfigMap", ResourceName: "payment-config", ChangeType: ChangeConfigMap, Actor: "john.doe@acme.com", ApprovalStatus: ApprovalUnapproved, Description: "Updated rate limit thresholds without approval", DiffSummary: "data.rateLimit: 100 → 500", RiskScore: 65},
		{ID: "chg-003", Timestamp: now.Add(-75 * time.Minute), Cluster: "prod-eu-west", Namespace: "customer-data", ResourceKind: "Secret", ResourceName: "db-credentials", ChangeType: ChangeSecret, Actor: "john.doe@acme.com", ApprovalStatus: ApprovalEmergency, ApprovedBy: "emergency-override", TicketRef: "INC-891", Description: "Emergency credential rotation after suspected leak", RiskScore: 90},
		{ID: "chg-004", Timestamp: now.Add(-60 * time.Minute), Cluster: "prod-us-east", Namespace: "kube-system", ResourceKind: "ClusterRoleBinding", ResourceName: "admin-binding", ChangeType: ChangeRBAC, Actor: "admin@acme.com", ApprovalStatus: ApprovalUnapproved, Description: "Added new admin binding without change ticket", DiffSummary: "subjects: +ops-team", RiskScore: 80},
		{ID: "chg-005", Timestamp: now.Add(-45 * time.Minute), Cluster: "staging-us", Namespace: "payments", ResourceKind: "Deployment", ResourceName: "payment-api-v2", ChangeType: ChangeDeployment, Actor: "ci-bot@acme.com", ApprovalStatus: ApprovalApproved, ApprovedBy: "jane.smith@acme.com", Description: "Deploy v2.4.1 to staging", DiffSummary: "image: v2.4.0 → v2.4.1", RiskScore: 10},
		{ID: "chg-006", Timestamp: now.Add(-30 * time.Minute), Cluster: "prod-us-east", Namespace: "ingress", ResourceKind: "NetworkPolicy", ResourceName: "allow-external", ChangeType: ChangeNetPolicy, Actor: "devops@acme.com", ApprovalStatus: ApprovalApproved, ApprovedBy: "security-team@acme.com", TicketRef: "CHG-4523", Description: "Open port 8443 for new API endpoint", DiffSummary: "spec.ingress: +port 8443", RiskScore: 45},
		{ID: "chg-007", Timestamp: now.Add(-15 * time.Minute), Cluster: "pci-cardholder", Namespace: "card-processing", ResourceKind: "Deployment", ResourceName: "tokenizer", ChangeType: ChangeDeployment, Actor: "ci-bot@acme.com", ApprovalStatus: ApprovalApproved, ApprovedBy: "pci-qsa@acme.com", TicketRef: "CHG-4525", Description: "Deploy tokenizer v3.1 with PCI DSS 4.0 patches", DiffSummary: "image: v3.0.2 → v3.1.0", RiskScore: 30},
		{ID: "chg-008", Timestamp: now.Add(-5 * time.Minute), Cluster: "prod-eu-west", Namespace: "analytics", ResourceKind: "HelmRelease", ResourceName: "grafana", ChangeType: ChangeHelmRelease, Actor: "devops@acme.com", ApprovalStatus: ApprovalUnapproved, Description: "Upgraded Grafana chart without approval or ticket", DiffSummary: "chart: 7.0.1 → 7.1.0", RiskScore: 55},
	}
}
