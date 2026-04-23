package airgap

import (
	"sync"
	"time"
)

// Engine evaluates air-gap readiness across clusters.
type Engine struct {
	mu           sync.RWMutex
	requirements []Requirement
	clusters     []ClusterReadiness
}

// NewEngine returns a pre-populated air-gap readiness engine with demo data.
func NewEngine() *Engine {
	e := &Engine{}
	e.requirements = e.buildDemoRequirements()
	e.clusters = e.buildDemoClusters()
	return e
}

// Requirements returns all air-gap readiness requirements.
func (e *Engine) Requirements() []Requirement {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]Requirement, len(e.requirements))
	copy(out, e.requirements)
	return out
}

// Clusters returns per-cluster air-gap readiness.
func (e *Engine) Clusters() []ClusterReadiness {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]ClusterReadiness, len(e.clusters))
	copy(out, e.clusters)
	return out
}

// Summary returns the overall air-gap readiness summary.
func (e *Engine) Summary() Summary {
	e.mu.RLock()
	defer e.mu.RUnlock()

	ready := 0
	for _, c := range e.clusters {
		if c.Ready {
			ready++
		}
	}
	met := 0
	for _, r := range e.requirements {
		if r.Status == "ready" {
			met++
		}
	}
	total := len(e.requirements)
	score := 0
	if total > 0 {
		score = (met * 100) / total
	}
	return Summary{
		TotalClusters:     len(e.clusters),
		ReadyClusters:     ready,
		NotReadyClusters:  len(e.clusters) - ready,
		OverallScore:      score,
		TotalRequirements: total,
		MetRequirements:   met,
		EvaluatedAt:       time.Now().UTC().Format(time.RFC3339),
	}
}

func (e *Engine) buildDemoRequirements() []Requirement {
	return []Requirement{
		{ID: "ag-01", Category: "registry", Name: "Private Container Registry", Description: "All container images served from an internal registry with no external pull dependencies.", Status: "ready", Evidence: "Harbor registry running in-cluster; all images mirrored", Remediation: ""},
		{ID: "ag-02", Category: "registry", Name: "Image Signature Verification", Description: "All images verified against local keyserver.", Status: "ready", Evidence: "Cosign admission controller validates signatures from local keys", Remediation: ""},
		{ID: "ag-03", Category: "dns", Name: "Internal DNS Resolution", Description: "CoreDNS configured for internal resolution only; no upstream forwarders.", Status: "ready", Evidence: "CoreDNS forward directive points to internal DNS only", Remediation: ""},
		{ID: "ag-04", Category: "ntp", Name: "Internal NTP Source", Description: "All nodes sync time from internal NTP server.", Status: "ready", Evidence: "chrony configured with internal NTP at 10.0.0.1", Remediation: ""},
		{ID: "ag-05", Category: "updates", Name: "Offline Update Channel", Description: "Kubernetes and OS updates available via internal repository.", Status: "partial", Evidence: "Kubernetes binaries mirrored; OS updates at 85% coverage", Remediation: "Mirror remaining RHEL repositories for air-gap nodes"},
		{ID: "ag-06", Category: "updates", Name: "Helm Chart Repository", Description: "All Helm charts available from internal ChartMuseum.", Status: "ready", Evidence: "ChartMuseum serving 47 charts from local storage", Remediation: ""},
		{ID: "ag-07", Category: "telemetry", Name: "Telemetry Disabled", Description: "No outbound telemetry or analytics from cluster components.", Status: "ready", Evidence: "All telemetry endpoints blocked by egress NetworkPolicy", Remediation: ""},
		{ID: "ag-08", Category: "telemetry", Name: "Certificate Revocation Offline", Description: "CRL/OCSP checks use local cache instead of external endpoints.", Status: "not_ready", Evidence: "", Remediation: "Deploy local CRL distribution point and configure cert-manager"},
		{ID: "ag-09", Category: "registry", Name: "Operator Catalog Mirror", Description: "OLM operator catalogs mirrored to internal registry.", Status: "ready", Evidence: "oc-mirror syncs 12 operator catalogs to internal registry", Remediation: ""},
		{ID: "ag-10", Category: "dns", Name: "External Egress Blocked", Description: "All outbound traffic blocked except approved internal routes.", Status: "ready", Evidence: "Default-deny egress NetworkPolicy on all namespaces; proxy allowlist empty", Remediation: ""},
	}
}

func (e *Engine) buildDemoClusters() []ClusterReadiness {
	return []ClusterReadiness{
		{Cluster: "airgap-prod-east", Ready: true, Score: 100, Requirements: 10, ReadyCount: 10, NotReadyCount: 0},
		{Cluster: "airgap-prod-west", Ready: true, Score: 100, Requirements: 10, ReadyCount: 10, NotReadyCount: 0},
		{Cluster: "classified-central", Ready: false, Score: 80, Requirements: 10, ReadyCount: 8, NotReadyCount: 2},
		{Cluster: "staging-isolated", Ready: false, Score: 70, Requirements: 10, ReadyCount: 7, NotReadyCount: 3},
	}
}
