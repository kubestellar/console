package residency

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Engine evaluates data residency rules against cluster-workload mappings.
type Engine struct {
	rules          []Rule
	clusterRegions map[string]ClusterRegion // key: cluster name
}

// NewEngine creates a residency engine pre-loaded with built-in rules
// and demo cluster-region mappings.
func NewEngine() *Engine {
	e := &Engine{
		clusterRegions: make(map[string]ClusterRegion),
	}
	e.rules = builtinRules()
	e.loadDemoClusters()
	return e
}

// Rules returns all configured residency rules.
func (e *Engine) Rules() []Rule {
	return e.rules
}

// ClusterRegions returns the cluster-to-region mapping.
func (e *Engine) ClusterRegions() []ClusterRegion {
	regions := make([]ClusterRegion, 0, len(e.clusterRegions))
	for _, cr := range e.clusterRegions {
		regions = append(regions, cr)
	}
	return regions
}

// SetClusterRegion assigns a region to a cluster.
func (e *Engine) SetClusterRegion(cluster string, region Region, jurisdiction string) {
	e.clusterRegions[cluster] = ClusterRegion{
		ClusterName:  cluster,
		Region:       region,
		Jurisdiction: jurisdiction,
	}
}

// Evaluate checks all workloads against all rules and returns violations.
// In demo mode this generates synthetic workload-to-cluster mappings.
func (e *Engine) Evaluate() ([]Violation, *ResidencySummary) {
	workloads := e.demoWorkloads()
	var violations []Violation

	for _, w := range workloads {
		cr, ok := e.clusterRegions[w.cluster]
		if !ok {
			continue
		}

		for _, rule := range e.rules {
			if rule.Classification != w.classification {
				continue
			}
			if !regionAllowed(cr.Region, rule.AllowedRegions) {
				violations = append(violations, Violation{
					ID:             uuid.New().String(),
					ClusterName:    w.cluster,
					ClusterRegion:  cr.Region,
					Namespace:      w.namespace,
					WorkloadName:   w.name,
					WorkloadKind:   w.kind,
					Classification: w.classification,
					RuleID:         rule.ID,
					AllowedRegions: rule.AllowedRegions,
					Severity:       classificationSeverity(rule.Classification),
					DetectedAt:     time.Now().UTC(),
					Message: fmt.Sprintf("%s %s/%s in %s (%s) violates %s residency rule — allowed: %s",
						w.kind, w.namespace, w.name, w.cluster, cr.Region,
						rule.Classification, formatRegions(rule.AllowedRegions)),
				})
			}
		}
	}

	summary := e.buildSummary(violations)
	return violations, summary
}

// Summary returns the current residency posture without full violation details.
func (e *Engine) Summary() *ResidencySummary {
	_, summary := e.Evaluate()
	return summary
}

func (e *Engine) buildSummary(violations []Violation) *ResidencySummary {
	s := &ResidencySummary{
		TotalRules:      len(e.rules),
		TotalClusters:   len(e.clusterRegions),
		TotalViolations: len(violations),
		BySeverity:      make(map[string]int),
		ByRegion:        make(map[string]int),
	}

	for _, v := range violations {
		s.BySeverity[string(v.Severity)]++
	}

	violatingClusters := make(map[string]bool)
	for _, v := range violations {
		violatingClusters[v.ClusterName] = true
	}

	for _, cr := range e.clusterRegions {
		s.ByRegion[string(cr.Region)]++
		if violatingClusters[cr.ClusterName] {
			s.NonCompliant++
		} else {
			s.Compliant++
		}
	}

	return s
}

type demoWorkload struct {
	cluster        string
	namespace      string
	name           string
	kind           string
	classification DataClassification
}

func (e *Engine) demoWorkloads() []demoWorkload {
	return []demoWorkload{
		// EU personal data workloads — some correctly placed, some not
		{"prod-eu-west", "payments", "user-profile-svc", "Deployment", ClassEUPersonal},
		{"prod-eu-west", "payments", "gdpr-processor", "Deployment", ClassEUPersonal},
		{"prod-us-east", "analytics", "user-analytics", "Deployment", ClassEUPersonal}, // violation!
		{"prod-apac", "marketing", "eu-campaign-svc", "Deployment", ClassEUPersonal},   // violation!

		// PCI cardholder data
		{"prod-us-east", "payments", "card-processor", "Deployment", ClassPCI},
		{"prod-eu-west", "payments", "payment-gateway", "Deployment", ClassPCI},
		{"prod-apac", "payments", "card-tokenizer", "StatefulSet", ClassPCI}, // violation if APAC not allowed

		// HIPAA PHI workloads
		{"prod-us-east", "health", "patient-records", "StatefulSet", ClassHIPAA},
		{"prod-us-east", "health", "lab-results-api", "Deployment", ClassHIPAA},
		{"prod-eu-west", "health", "eu-patient-portal", "Deployment", ClassHIPAA}, // violation!

		// Federal CUI
		{"prod-us-east", "govcloud", "cui-processor", "Deployment", ClassFederal},
		{"prod-us-east", "govcloud", "fedramp-api", "Deployment", ClassFederal},

		// Public data — no restrictions
		{"prod-us-east", "public", "docs-site", "Deployment", ClassPublic},
		{"prod-eu-west", "public", "status-page", "Deployment", ClassPublic},
		{"prod-apac", "public", "cdn-origin", "Deployment", ClassPublic},
	}
}

func (e *Engine) loadDemoClusters() {
	demoClusters := []ClusterRegion{
		{ClusterName: "prod-us-east", Region: RegionUS, Jurisdiction: "CCPA, HIPAA"},
		{ClusterName: "prod-eu-west", Region: RegionEU, Jurisdiction: "GDPR"},
		{ClusterName: "prod-apac", Region: RegionAPAC, Jurisdiction: "PDPA"},
		{ClusterName: "prod-uk-south", Region: RegionUK, Jurisdiction: "UK GDPR"},
		{ClusterName: "prod-ca-central", Region: RegionCanada, Jurisdiction: "PIPEDA"},
		{ClusterName: "staging-global", Region: RegionGlobal, Jurisdiction: "N/A"},
	}
	for _, cr := range demoClusters {
		e.clusterRegions[cr.ClusterName] = cr
	}
}

func builtinRules() []Rule {
	now := time.Now().UTC()
	return []Rule{
		{
			ID:             "rule-eu-personal",
			Classification: ClassEUPersonal,
			AllowedRegions: []Region{RegionEU, RegionUK},
			Description:    "EU personal data (GDPR) must remain in EU/UK jurisdictions",
			Enforcement:    EnforcementDeny,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		{
			ID:             "rule-pci-cardholder",
			Classification: ClassPCI,
			AllowedRegions: []Region{RegionUS, RegionEU, RegionUK},
			Description:    "PCI cardholder data restricted to certified regions",
			Enforcement:    EnforcementWarn,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		{
			ID:             "rule-hipaa-phi",
			Classification: ClassHIPAA,
			AllowedRegions: []Region{RegionUS},
			Description:    "HIPAA Protected Health Information must stay in US jurisdiction",
			Enforcement:    EnforcementDeny,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		{
			ID:             "rule-federal-cui",
			Classification: ClassFederal,
			AllowedRegions: []Region{RegionUS},
			Description:    "Federal CUI restricted to US sovereign infrastructure",
			Enforcement:    EnforcementDeny,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		{
			ID:             "rule-public",
			Classification: ClassPublic,
			AllowedRegions: []Region{RegionGlobal, RegionUS, RegionEU, RegionAPAC, RegionCanada, RegionUK},
			Description:    "Public data has no geographic restrictions",
			Enforcement:    EnforcementAudit,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
	}
}

func regionAllowed(actual Region, allowed []Region) bool {
	for _, r := range allowed {
		if r == RegionGlobal || r == actual {
			return true
		}
	}
	return false
}

func classificationSeverity(c DataClassification) ViolationSeverity {
	switch c {
	case ClassEUPersonal, ClassHIPAA, ClassFederal:
		return SeverityCritical
	case ClassPCI:
		return SeverityHigh
	case ClassConfidential:
		return SeverityMedium
	default:
		return SeverityLow
	}
}

func formatRegions(regions []Region) string {
	strs := make([]string, len(regions))
	for i, r := range regions {
		strs[i] = string(r)
	}
	return strings.Join(strs, ", ")
}
