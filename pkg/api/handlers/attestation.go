package handlers

// Runtime Attestation Score handler — Issue #9987
//
// Computes a weighted 0-100 per-cluster attestation score from four CNCF signals:
//   - Image provenance (TUF trust root compliant)  — 30%
//   - Workload identity coverage (SPIFFE/SPIRE)    — 25%
//   - Policy admission compliance (Kyverno audit)  — 25%
//   - Runtime privilege posture (no privileged pods) — 20%
//
// Currently serves demo data. When live signal collectors land (TUF bridge,
// SPIFFE agent queries, Kyverno policy-report CRD reads, pod security-context
// scans), the fetcher will pick up real data with no contract changes.

import (
	"github.com/gofiber/fiber/v2"
)

// ── Score signal weights (must sum to 100) ──────────────────────────────────

const (
	weightImageProvenance   = 30 // TUF trust-root compliance
	weightWorkloadIdentity  = 25 // SPIFFE/SPIRE coverage
	weightPolicyCompliance  = 25 // Kyverno audit pass rate
	weightPrivilegePosture  = 20 // no privileged / hostPath containers
)

// ── Response types ──────────────────────────────────────────────────────────

// AttestationSignal represents one of the four scoring dimensions.
type AttestationSignal struct {
	Name   string `json:"name"`
	Score  int    `json:"score"`
	Weight int    `json:"weight"`
	Detail string `json:"detail"`
}

// NonCompliantWorkload identifies a workload that reduces the score.
type NonCompliantWorkload struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Reason    string `json:"reason"`
	Signal    string `json:"signal"`
}

// ClusterAttestationScore holds the per-cluster attestation breakdown.
type ClusterAttestationScore struct {
	Cluster              string                 `json:"cluster"`
	OverallScore         int                    `json:"overallScore"`
	Signals              []AttestationSignal    `json:"signals"`
	NonCompliantWorkloads []NonCompliantWorkload `json:"nonCompliantWorkloads"`
}

// AttestationResponse is the top-level API response.
type AttestationResponse struct {
	Clusters []ClusterAttestationScore `json:"clusters"`
}

// ── Handler ─────────────────────────────────────────────────────────────────

// AttestationHandler serves runtime attestation score endpoints.
type AttestationHandler struct{}

// NewAttestationHandler creates an attestation handler.
func NewAttestationHandler() *AttestationHandler { return &AttestationHandler{} }

// RegisterPublicRoutes mounts attestation endpoints under /api/attestation.
func (h *AttestationHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/attestation")
	g.Get("/score", h.getScore)
}

func (h *AttestationHandler) getScore(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return demoResponse(c, "attestation", getDemoAttestationScores())
	}
	// TODO: replace with live signal collection when backends land.
	return c.JSON(getDemoAttestationScores())
}

// ── Demo data ───────────────────────────────────────────────────────────────

func getDemoAttestationScores() AttestationResponse {
	return AttestationResponse{
		Clusters: []ClusterAttestationScore{
			buildDemoCluster("eks-prod-us-east-1", 92, 95, 88, 100),
			buildDemoCluster("gke-staging", 85, 80, 90, 95),
			buildDemoCluster("k3s-edge", 70, 60, 75, 80),
			buildDemoCluster("aks-dev-westeu", 88, 85, 82, 90),
			buildDemoCluster("openshift-prod", 96, 100, 94, 100),
			buildDemoCluster("kind-local", 50, 40, 55, 60),
		},
	}
}

func buildDemoCluster(name string, imgScore, idScore, polScore, privScore int) ClusterAttestationScore {
	overall := (imgScore*weightImageProvenance +
		idScore*weightWorkloadIdentity +
		polScore*weightPolicyCompliance +
		privScore*weightPrivilegePosture) / 100 // weights sum to 100

	signals := []AttestationSignal{
		{Name: "Image Provenance", Score: imgScore, Weight: weightImageProvenance, Detail: detailForImageScore(imgScore)},
		{Name: "Workload Identity", Score: idScore, Weight: weightWorkloadIdentity, Detail: detailForIdentityScore(idScore)},
		{Name: "Policy Compliance", Score: polScore, Weight: weightPolicyCompliance, Detail: detailForPolicyScore(polScore)},
		{Name: "Privilege Posture", Score: privScore, Weight: weightPrivilegePosture, Detail: detailForPrivilegeScore(privScore)},
	}

	nonCompliant := make([]NonCompliantWorkload, 0)
	if imgScore < 100 {
		nonCompliant = append(nonCompliant, NonCompliantWorkload{
			Name: "legacy-api", Namespace: "default", Reason: "Image not signed with TUF trust root", Signal: "Image Provenance",
		})
	}
	if idScore < 100 {
		nonCompliant = append(nonCompliant, NonCompliantWorkload{
			Name: "batch-worker", Namespace: "jobs", Reason: "No SPIFFE identity assigned", Signal: "Workload Identity",
		})
	}
	if polScore < 100 {
		nonCompliant = append(nonCompliant, NonCompliantWorkload{
			Name: "debug-pod", Namespace: "kube-system", Reason: "Kyverno audit policy violation", Signal: "Policy Compliance",
		})
	}
	if privScore < 100 {
		nonCompliant = append(nonCompliant, NonCompliantWorkload{
			Name: "node-exporter", Namespace: "monitoring", Reason: "Runs as privileged container", Signal: "Privilege Posture",
		})
	}

	return ClusterAttestationScore{
		Cluster:               name,
		OverallScore:          overall,
		Signals:               signals,
		NonCompliantWorkloads: nonCompliant,
	}
}

// ── Detail string helpers ───────────────────────────────────────────────────

const (
	imageThresholdHigh = 90
	imageThresholdMed  = 70

	identityThresholdHigh = 90
	identityThresholdMed  = 70

	policyThresholdHigh = 90
	policyThresholdMed  = 70

	privThresholdFull = 100
	privThresholdHigh = 90
)

func detailForImageScore(score int) string {
	if score >= imageThresholdHigh {
		return "Nearly all images signed via TUF trust root"
	}
	if score >= imageThresholdMed {
		return "Most images signed; some unsigned images remain"
	}
	return "Many images lack TUF-verified signatures"
}

func detailForIdentityScore(score int) string {
	if score >= identityThresholdHigh {
		return "SPIFFE identities cover most workloads"
	}
	if score >= identityThresholdMed {
		return "Partial SPIFFE coverage — some workloads unidentified"
	}
	return "Low SPIFFE/SPIRE coverage across workloads"
}

func detailForPolicyScore(score int) string {
	if score >= policyThresholdHigh {
		return "Kyverno audit policies passing at high rate"
	}
	if score >= policyThresholdMed {
		return "Some Kyverno policy violations detected"
	}
	return "Significant Kyverno policy violations present"
}

func detailForPrivilegeScore(score int) string {
	if score == privThresholdFull {
		return "No privileged or hostPath containers detected"
	}
	if score >= privThresholdHigh {
		return "Nearly all containers follow least-privilege"
	}
	return "Privileged or hostPath containers present"
}
