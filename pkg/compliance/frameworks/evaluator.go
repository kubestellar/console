package frameworks

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"
)

// ClusterProber abstracts the queries an evaluator needs to run against
// a live Kubernetes cluster. The console implements this via kubectl
// proxy calls; tests can provide a stub.
type ClusterProber interface {
	// HasNetworkPolicies returns whether the cluster has any NetworkPolicies
	// in non-system namespaces, and how many namespaces have coverage.
	HasNetworkPolicies(ctx context.Context, cluster string) (covered, total int, err error)
	// HasDefaultDenyIngress checks for default-deny ingress policies.
	HasDefaultDenyIngress(ctx context.Context, cluster string) (bool, error)
	// PodSecurityIssues returns counts of pods running privileged, as root,
	// or with host networking.
	PodSecurityIssues(ctx context.Context, cluster string) (privileged, root, hostNet int, err error)
	// ServiceAccountAutoMount returns how many pods have the default SA
	// token auto-mounted.
	ServiceAccountAutoMount(ctx context.Context, cluster string) (automounted, total int, err error)
	// EncryptionAtRestEnabled checks if etcd encryption is configured.
	EncryptionAtRestEnabled(ctx context.Context, cluster string) (bool, error)
	// ImageVulnerabilities returns total images and those with critical/high CVEs.
	ImageVulnerabilities(ctx context.Context, cluster string) (total, critical, high int, err error)
	// ClusterAdminBindings returns the count of non-system ClusterRoleBindings
	// that grant cluster-admin.
	ClusterAdminBindings(ctx context.Context, cluster string) (int, error)
	// WildcardRBACRules returns the count of Role/ClusterRole rules that use
	// wildcard verbs or resources.
	WildcardRBACRules(ctx context.Context, cluster string) (int, error)
	// AuthProviderConfigured checks if an external auth provider (OIDC, OAuth)
	// is configured on the API server.
	AuthProviderConfigured(ctx context.Context, cluster string) (bool, error)
	// AuditLoggingEnabled checks if K8s API audit logging is active.
	AuditLoggingEnabled(ctx context.Context, cluster string) (bool, error)
	// RuntimeSecurityInstalled checks for Falco, Tetragon, or similar.
	RuntimeSecurityInstalled(ctx context.Context, cluster string) (bool, error)
}

// Evaluator runs framework checks against a cluster.
type Evaluator struct {
	prober ClusterProber
}

// NewEvaluator creates an evaluator with the given cluster prober.
func NewEvaluator(prober ClusterProber) *Evaluator {
	return &Evaluator{prober: prober}
}

// Evaluate runs all checks in a framework against the named cluster and
// returns a full EvaluationResult.
func (e *Evaluator) Evaluate(ctx context.Context, fw Framework, cluster string) (*EvaluationResult, error) {
	result := &EvaluationResult{
		FrameworkID:   fw.ID,
		FrameworkName: fw.Name,
		ClusterName:   cluster,
		EvaluatedAt:   time.Now(),
	}

	for _, ctrl := range fw.Controls {
		cr := ControlResult{
			ControlID: ctrl.ID,
			Title:     ctrl.Title,
			Severity:  ctrl.Severity,
			Category:  ctrl.Category,
		}

		var passed, failed, errors int
		for _, check := range ctrl.Checks {
			checkResult := e.runCheck(ctx, check, cluster)
			cr.Checks = append(cr.Checks, checkResult)
			result.TotalChecks++
			switch checkResult.Status {
			case StatusPass:
				passed++
				result.Passed++
			case StatusFail:
				failed++
				result.Failed++
			case StatusPartial:
				result.Partial++
			case StatusSkipped:
				result.Skipped++
			case StatusError:
				errors++
				result.Errors++
			}
		}

		// Derive control status from its checks.
		cr.Status = deriveControlStatus(passed, failed, errors, len(ctrl.Checks))
		if cr.Status == StatusFail {
			cr.Remediation = remediationHint(ctrl)
		}
		result.Controls = append(result.Controls, cr)
	}

	// Compute overall score as percentage of passing checks.
	evaluated := result.TotalChecks - result.Skipped
	if evaluated > 0 {
		// Partial counts as half a pass.
		score := float64(result.Passed) + float64(result.Partial)*0.5
		result.Score = int(math.Round(score / float64(evaluated) * 100))
	}
	return result, nil
}

// ListFrameworks returns all registered frameworks.
func ListFrameworks() []Framework {
	out := make([]Framework, 0, len(Registry))
	for _, fw := range Registry {
		out = append(out, fw)
	}
	return out
}

// GetFramework returns a framework by ID, or nil if not found.
func GetFramework(id string) *Framework {
	fw, ok := Registry[id]
	if !ok {
		return nil
	}
	return &fw
}

// runCheck dispatches a single check to the appropriate prober method.
func (e *Evaluator) runCheck(ctx context.Context, check Check, cluster string) CheckResult {
	cr := CheckResult{
		CheckID: check.ID,
		Name:    check.Name,
		Status:  StatusSkipped,
	}

	switch check.CheckType {
	case "network_policy":
		cr = e.checkNetworkPolicy(ctx, check, cluster)
	case "pod_security":
		cr = e.checkPodSecurity(ctx, check, cluster)
	case "encryption_at_rest":
		cr = e.checkEncryption(ctx, check, cluster)
	case "image_scanning":
		cr = e.checkImageScanning(ctx, check, cluster)
	case "rbac_least_privilege":
		cr = e.checkRBAC(ctx, check, cluster)
	case "auth_provider":
		cr = e.checkAuthProvider(ctx, check, cluster)
	case "audit_logging":
		cr = e.checkAuditLogging(ctx, check, cluster)
	case "runtime_security":
		cr = e.checkRuntimeSecurity(ctx, check, cluster)
	default:
		cr.Status = StatusSkipped
		cr.Message = fmt.Sprintf("unknown check type: %s", check.CheckType)
	}
	return cr
}

func (e *Evaluator) checkNetworkPolicy(ctx context.Context, check Check, cluster string) CheckResult {
	cr := CheckResult{CheckID: check.ID, Name: check.Name}

	if check.Params["require_default_deny"] == "true" {
		ok, err := e.prober.HasDefaultDenyIngress(ctx, cluster)
		if err != nil {
			cr.Status = StatusError
			cr.Message = err.Error()
			return cr
		}
		cr.Status = boolStatus(ok)
		if ok {
			cr.Evidence = "Default deny ingress policy found"
		} else {
			cr.Message = "No default deny ingress policy found"
		}
		return cr
	}

	covered, total, err := e.prober.HasNetworkPolicies(ctx, cluster)
	if err != nil {
		cr.Status = StatusError
		cr.Message = err.Error()
		return cr
	}
	if total == 0 {
		cr.Status = StatusSkipped
		cr.Message = "No non-system namespaces found"
		return cr
	}
	ratio := float64(covered) / float64(total)
	switch {
	case ratio >= 1.0:
		cr.Status = StatusPass
	case ratio >= 0.5:
		cr.Status = StatusPartial
	default:
		cr.Status = StatusFail
	}
	cr.Evidence = fmt.Sprintf("%d/%d namespaces have NetworkPolicies", covered, total)
	return cr
}

func (e *Evaluator) checkPodSecurity(ctx context.Context, check Check, cluster string) CheckResult {
	cr := CheckResult{CheckID: check.ID, Name: check.Name}

	if check.Params["check_sa_automount"] == "true" {
		automounted, total, err := e.prober.ServiceAccountAutoMount(ctx, cluster)
		if err != nil {
			cr.Status = StatusError
			cr.Message = err.Error()
			return cr
		}
		if total == 0 {
			cr.Status = StatusPass
			cr.Evidence = "No pods found"
			return cr
		}
		ratio := float64(automounted) / float64(total)
		if ratio <= 0.1 {
			cr.Status = StatusPass
		} else if ratio <= 0.3 {
			cr.Status = StatusPartial
		} else {
			cr.Status = StatusFail
		}
		cr.Evidence = fmt.Sprintf("%d/%d pods have SA token auto-mounted", automounted, total)
		return cr
	}

	priv, root, hostNet, err := e.prober.PodSecurityIssues(ctx, cluster)
	if err != nil {
		cr.Status = StatusError
		cr.Message = err.Error()
		return cr
	}
	issues := priv + root + hostNet
	if issues == 0 {
		cr.Status = StatusPass
		cr.Evidence = "No privileged, root, or host-network pods found"
	} else {
		cr.Status = StatusFail
		cr.Evidence = fmt.Sprintf("Found %d privileged, %d root, %d host-network pods", priv, root, hostNet)
	}
	return cr
}

func (e *Evaluator) checkEncryption(ctx context.Context, check Check, cluster string) CheckResult {
	cr := CheckResult{CheckID: check.ID, Name: check.Name}
	ok, err := e.prober.EncryptionAtRestEnabled(ctx, cluster)
	if err != nil {
		cr.Status = StatusError
		cr.Message = err.Error()
		return cr
	}
	cr.Status = boolStatus(ok)
	if ok {
		cr.Evidence = "etcd encryption at rest is configured"
	} else {
		cr.Message = "etcd encryption at rest is not configured"
	}
	return cr
}

func (e *Evaluator) checkImageScanning(ctx context.Context, check Check, cluster string) CheckResult {
	cr := CheckResult{CheckID: check.ID, Name: check.Name}
	total, critical, high, err := e.prober.ImageVulnerabilities(ctx, cluster)
	if err != nil {
		cr.Status = StatusError
		cr.Message = err.Error()
		return cr
	}
	if total == 0 {
		cr.Status = StatusSkipped
		cr.Message = "No image scan results available"
		return cr
	}
	maxSev := check.Params["max_severity"]
	if maxSev == "critical" {
		cr.Status = boolStatus(critical == 0)
		cr.Evidence = fmt.Sprintf("%d critical CVEs across %d images", critical, total)
		return cr
	}
	// General scan: pass if no critical, partial if some high.
	if critical == 0 && high == 0 {
		cr.Status = StatusPass
	} else if critical == 0 {
		cr.Status = StatusPartial
	} else {
		cr.Status = StatusFail
	}
	cr.Evidence = fmt.Sprintf("%d images scanned, %d critical, %d high CVEs", total, critical, high)
	return cr
}

func (e *Evaluator) checkRBAC(ctx context.Context, check Check, cluster string) CheckResult {
	cr := CheckResult{CheckID: check.ID, Name: check.Name}

	if check.Params["check_wildcards"] == "true" {
		count, err := e.prober.WildcardRBACRules(ctx, cluster)
		if err != nil {
			cr.Status = StatusError
			cr.Message = err.Error()
			return cr
		}
		cr.Status = boolStatus(count == 0)
		cr.Evidence = fmt.Sprintf("%d wildcard RBAC rules found", count)
		return cr
	}

	count, err := e.prober.ClusterAdminBindings(ctx, cluster)
	if err != nil {
		cr.Status = StatusError
		cr.Message = err.Error()
		return cr
	}
	cr.Status = boolStatus(count == 0)
	cr.Evidence = fmt.Sprintf("%d non-system cluster-admin bindings found", count)
	return cr
}

func (e *Evaluator) checkAuthProvider(ctx context.Context, check Check, cluster string) CheckResult {
	cr := CheckResult{CheckID: check.ID, Name: check.Name}
	ok, err := e.prober.AuthProviderConfigured(ctx, cluster)
	if err != nil {
		cr.Status = StatusError
		cr.Message = err.Error()
		return cr
	}
	cr.Status = boolStatus(ok)
	if ok {
		cr.Evidence = "External auth provider configured"
	} else {
		cr.Message = "No external auth provider detected"
	}
	return cr
}

func (e *Evaluator) checkAuditLogging(ctx context.Context, check Check, cluster string) CheckResult {
	cr := CheckResult{CheckID: check.ID, Name: check.Name}
	ok, err := e.prober.AuditLoggingEnabled(ctx, cluster)
	if err != nil {
		cr.Status = StatusError
		cr.Message = err.Error()
		return cr
	}
	cr.Status = boolStatus(ok)
	if ok {
		cr.Evidence = "Kubernetes audit logging is active"
	} else {
		cr.Message = "Kubernetes audit logging is not enabled"
	}
	return cr
}

func (e *Evaluator) checkRuntimeSecurity(ctx context.Context, check Check, cluster string) CheckResult {
	cr := CheckResult{CheckID: check.ID, Name: check.Name}
	ok, err := e.prober.RuntimeSecurityInstalled(ctx, cluster)
	if err != nil {
		cr.Status = StatusError
		cr.Message = err.Error()
		return cr
	}
	cr.Status = boolStatus(ok)
	if ok {
		cr.Evidence = "Runtime security tool is active"
	} else {
		cr.Message = "No runtime security tool (Falco/Tetragon) detected"
	}
	return cr
}

// boolStatus maps a boolean to pass/fail.
func boolStatus(ok bool) CheckStatus {
	if ok {
		return StatusPass
	}
	return StatusFail
}

// deriveControlStatus computes an overall status for a control from
// its check results.
func deriveControlStatus(passed, failed, total int) CheckStatus {
	if total == 0 {
		return StatusSkipped
	}
	if passed == total {
		return StatusPass
	}
	if failed == total {
		return StatusFail
	}
	if failed == 0 {
		return StatusPartial
	}
	return StatusFail
}

// remediationHint returns a short remediation message for a failed control.
func remediationHint(ctrl Control) string {
	hints := map[string]string{
		"Network Security":       "Add NetworkPolicies to namespaces handling sensitive data. Consider a default-deny ingress policy.",
		"Configuration":          "Enforce pod security standards. Disable automountServiceAccountToken on pods that don't need API access.",
		"Data Protection":        "Enable etcd encryption at rest via EncryptionConfiguration.",
		"Vulnerability Management": "Deploy Trivy or similar scanner. Remediate critical CVEs before deploying images.",
		"Access Control":         "Remove unnecessary cluster-admin bindings. Avoid wildcard verbs and resources in RBAC rules.",
		"Authentication":         "Configure an OIDC or OAuth provider for the Kubernetes API server.",
		"Audit & Monitoring":     "Enable Kubernetes API audit logging with an appropriate policy.",
		"Security Testing":       "Deploy Falco or Tetragon for runtime security monitoring.",
		"Monitoring":             "Deploy a runtime security monitor and ensure audit logging is active.",
		"Change Management":      "Scan images for vulnerabilities before deployment. Enforce pod security standards.",
	}
	if h, ok := hints[ctrl.Category]; ok {
		return h
	}
	return fmt.Sprintf("Review failed checks in the %s category.", strings.ToLower(ctrl.Category))
}
