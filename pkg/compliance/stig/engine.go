package stig

import (
	"sync"
	"time"
)

// Engine evaluates DISA STIG benchmarks against cluster state.
type Engine struct {
	mu         sync.RWMutex
	benchmarks []Benchmark
}

// NewEngine returns a pre-populated STIG engine with demo data.
func NewEngine() *Engine {
	e := &Engine{}
	e.benchmarks = e.buildDemoBenchmarks()
	return e
}

// Benchmarks returns all STIG benchmarks.
func (e *Engine) Benchmarks() []Benchmark {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]Benchmark, len(e.benchmarks))
	copy(out, e.benchmarks)
	return out
}

// Findings returns all findings across all benchmarks.
func (e *Engine) Findings() []Finding {
	e.mu.RLock()
	defer e.mu.RUnlock()
	var out []Finding
	for _, b := range e.benchmarks {
		out = append(out, b.Findings...)
	}
	return out
}

// Summary returns the overall STIG compliance summary.
func (e *Engine) Summary() Summary {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var open, naf, na, nr, catI, catII, catIII int
	for _, b := range e.benchmarks {
		for _, f := range b.Findings {
			switch f.Status {
			case "open":
				open++
				switch f.Severity {
				case "CAT I":
					catI++
				case "CAT II":
					catII++
				case "CAT III":
					catIII++
				}
			case "not_a_finding":
				naf++
			case "not_applicable":
				na++
			case "not_reviewed":
				nr++
			}
		}
	}
	total := open + naf + na + nr
	score := 0
	if total-na > 0 {
		score = (naf * 100) / (total - na)
	}

	bid := ""
	if len(e.benchmarks) > 0 {
		bid = e.benchmarks[0].ID
	}

	return Summary{
		TotalFindings:   total,
		Open:            open,
		NotAFinding:     naf,
		NotApplicable:   na,
		NotReviewed:     nr,
		CatIOpen:        catI,
		CatIIOpen:       catII,
		CatIIIOpen:      catIII,
		ComplianceScore: score,
		BenchmarkID:     bid,
		EvaluatedAt:     time.Now().UTC().Format(time.RFC3339),
	}
}

func (e *Engine) buildDemoBenchmarks() []Benchmark {
	return []Benchmark{
		{
			ID: "kubernetes-stig-v2r1", Title: "Kubernetes STIG", Version: "V2R1", ReleaseDate: "2025-10-15",
			Findings: []Finding{
				{ID: "V-242381", RuleID: "SV-242381r879578", Title: "API Server must have anonymous auth disabled", Description: "The Kubernetes API server must not allow anonymous authentication.", Severity: "CAT I", Status: "not_a_finding", CheckResult: "anonymous-auth=false verified on all clusters", FixText: "Set --anonymous-auth=false on kube-apiserver"},
				{ID: "V-242382", RuleID: "SV-242382r879581", Title: "API Server must have audit logging enabled", Description: "API server audit logging must be enabled to record all events.", Severity: "CAT I", Status: "not_a_finding", CheckResult: "Audit policy mounted and active", FixText: "Configure --audit-policy-file on kube-apiserver"},
				{ID: "V-242383", RuleID: "SV-242383r879584", Title: "etcd must use TLS encryption", Description: "Communication with etcd must be encrypted.", Severity: "CAT I", Status: "not_a_finding", CheckResult: "etcd peer and client TLS verified", FixText: "Set --etcd-certfile and --etcd-keyfile"},
				{ID: "V-242386", RuleID: "SV-242386r879593", Title: "Kubelet must deny anonymous auth", Description: "The kubelet must not allow anonymous authentication.", Severity: "CAT I", Status: "not_a_finding", CheckResult: "All kubelets configured with authentication.anonymous.enabled=false", FixText: "Set authentication.anonymous.enabled to false in kubelet config"},
				{ID: "V-242390", RuleID: "SV-242390r879605", Title: "Pod security standards enforced", Description: "Kubernetes must enforce Pod Security Standards.", Severity: "CAT II", Status: "not_a_finding", CheckResult: "PSS restricted profile enforced on all non-system namespaces", FixText: "Apply pod-security.kubernetes.io labels to namespaces"},
				{ID: "V-242393", RuleID: "SV-242393r879614", Title: "Secrets must be encrypted at rest", Description: "Kubernetes secrets must be encrypted at rest in etcd.", Severity: "CAT II", Status: "not_a_finding", CheckResult: "EncryptionConfiguration with aescbc provider verified", FixText: "Configure --encryption-provider-config"},
				{ID: "V-242395", RuleID: "SV-242395r879620", Title: "Network policies must be defined", Description: "NetworkPolicy resources must be defined for all namespaces.", Severity: "CAT II", Status: "open", CheckResult: "2 namespaces missing NetworkPolicy: dev-sandbox, temp-tools", FixText: "Create default-deny NetworkPolicy for each namespace"},
				{ID: "V-242397", RuleID: "SV-242397r879626", Title: "RBAC must be enabled", Description: "RBAC authorization must be enabled.", Severity: "CAT I", Status: "not_a_finding", CheckResult: "--authorization-mode includes RBAC on all clusters", FixText: "Set --authorization-mode=RBAC on kube-apiserver"},
				{ID: "V-242400", RuleID: "SV-242400r879635", Title: "Container images must be signed", Description: "Only signed container images should be allowed.", Severity: "CAT II", Status: "open", CheckResult: "Image signature verification not enforced cluster-wide", FixText: "Deploy admission controller to verify image signatures"},
				{ID: "V-242402", RuleID: "SV-242402r879641", Title: "Resource limits must be set", Description: "All pods must have resource limits.", Severity: "CAT III", Status: "open", CheckResult: "12 pods in dev namespace missing resource limits", FixText: "Add resource limits to all pod specs or use LimitRange"},
				{ID: "V-242406", RuleID: "SV-242406r879653", Title: "Service accounts must not auto-mount tokens", Description: "Default service account tokens should not be auto-mounted.", Severity: "CAT II", Status: "not_a_finding", CheckResult: "automountServiceAccountToken=false on default SA", FixText: "Set automountServiceAccountToken: false on default service account"},
				{ID: "V-242410", RuleID: "SV-242410r879665", Title: "Ingress TLS must be enforced", Description: "All ingress must use TLS.", Severity: "CAT II", Status: "not_a_finding", CheckResult: "All ingress resources have TLS configured", FixText: "Add TLS section to all Ingress resources"},
			},
		},
	}
}
