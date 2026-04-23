package frameworks

import (
	"context"
	"errors"
	"testing"
)

// mockProber implements ClusterProber for testing.
type mockProber struct {
	networkPolicyCovered int
	networkPolicyTotal   int
	networkPolicyErr     error

	hasDefaultDeny    bool
	hasDefaultDenyErr error

	podPrivileged int
	podRoot       int
	podHostNet    int
	podSecErr     error

	saAutomounted int
	saTotal       int
	saErr         error

	encryptionEnabled bool
	encryptionErr     error

	imgTotal    int
	imgCritical int
	imgHigh     int
	imgErr      error

	clusterAdminCount int
	clusterAdminErr   error

	wildcardCount int
	wildcardErr   error

	authConfigured bool
	authErr        error

	auditEnabled bool
	auditErr     error

	runtimeInstalled bool
	runtimeErr       error
}

func (m *mockProber) HasNetworkPolicies(_ context.Context, _ string) (int, int, error) {
	return m.networkPolicyCovered, m.networkPolicyTotal, m.networkPolicyErr
}
func (m *mockProber) HasDefaultDenyIngress(_ context.Context, _ string) (bool, error) {
	return m.hasDefaultDeny, m.hasDefaultDenyErr
}
func (m *mockProber) PodSecurityIssues(_ context.Context, _ string) (int, int, int, error) {
	return m.podPrivileged, m.podRoot, m.podHostNet, m.podSecErr
}
func (m *mockProber) ServiceAccountAutoMount(_ context.Context, _ string) (int, int, error) {
	return m.saAutomounted, m.saTotal, m.saErr
}
func (m *mockProber) EncryptionAtRestEnabled(_ context.Context, _ string) (bool, error) {
	return m.encryptionEnabled, m.encryptionErr
}
func (m *mockProber) ImageVulnerabilities(_ context.Context, _ string) (int, int, int, error) {
	return m.imgTotal, m.imgCritical, m.imgHigh, m.imgErr
}
func (m *mockProber) ClusterAdminBindings(_ context.Context, _ string) (int, error) {
	return m.clusterAdminCount, m.clusterAdminErr
}
func (m *mockProber) WildcardRBACRules(_ context.Context, _ string) (int, error) {
	return m.wildcardCount, m.wildcardErr
}
func (m *mockProber) AuthProviderConfigured(_ context.Context, _ string) (bool, error) {
	return m.authConfigured, m.authErr
}
func (m *mockProber) AuditLoggingEnabled(_ context.Context, _ string) (bool, error) {
	return m.auditEnabled, m.auditErr
}
func (m *mockProber) RuntimeSecurityInstalled(_ context.Context, _ string) (bool, error) {
	return m.runtimeInstalled, m.runtimeErr
}

// ────────────────────────────────────────────────────────────────────
// Registry / list tests
// ────────────────────────────────────────────────────────────────────

func TestListFrameworks(t *testing.T) {
	fws := ListFrameworks()
	if len(fws) < 2 {
		t.Fatalf("expected at least 2 built-in frameworks, got %d", len(fws))
	}
	ids := map[string]bool{}
	for _, fw := range fws {
		ids[fw.ID] = true
	}
	for _, want := range []string{"pci-dss-4.0", "soc2-type2"} {
		if !ids[want] {
			t.Errorf("missing framework %q", want)
		}
	}
}

func TestGetFramework(t *testing.T) {
	fw := GetFramework("pci-dss-4.0")
	if fw == nil {
		t.Fatal("expected pci-dss-4.0 framework")
	}
	if fw.Name != "PCI-DSS 4.0" {
		t.Errorf("name = %q, want %q", fw.Name, "PCI-DSS 4.0")
	}
	if !fw.BuiltIn {
		t.Error("expected BuiltIn = true")
	}
	if len(fw.Controls) == 0 {
		t.Error("expected controls")
	}
}

func TestGetFrameworkNotFound(t *testing.T) {
	fw := GetFramework("nonexistent")
	if fw != nil {
		t.Fatalf("expected nil for nonexistent framework, got %+v", fw)
	}
}

// ────────────────────────────────────────────────────────────────────
// Built-in framework validation
// ────────────────────────────────────────────────────────────────────

func TestPCIDSS4Structure(t *testing.T) {
	fw := PCIDSS4()
	if fw.ID != "pci-dss-4.0" {
		t.Errorf("ID = %q", fw.ID)
	}
	if len(fw.Controls) != 8 {
		t.Errorf("expected 8 controls, got %d", len(fw.Controls))
	}
	totalChecks := 0
	for _, c := range fw.Controls {
		if c.ID == "" || c.Title == "" {
			t.Errorf("control missing ID or Title: %+v", c)
		}
		if c.Severity == "" {
			t.Errorf("control %s missing severity", c.ID)
		}
		totalChecks += len(c.Checks)
		for _, ch := range c.Checks {
			if ch.CheckType == "" {
				t.Errorf("check %s missing CheckType", ch.ID)
			}
		}
	}
	if totalChecks != 12 {
		t.Errorf("expected 12 total checks, got %d", totalChecks)
	}
}

func TestSOC2Structure(t *testing.T) {
	fw := SOC2Type2()
	if fw.ID != "soc2-type2" {
		t.Errorf("ID = %q", fw.ID)
	}
	if len(fw.Controls) != 4 {
		t.Errorf("expected 4 controls, got %d", len(fw.Controls))
	}
	totalChecks := 0
	for _, c := range fw.Controls {
		totalChecks += len(c.Checks)
	}
	if totalChecks != 8 {
		t.Errorf("expected 8 total checks, got %d", totalChecks)
	}
}

// ────────────────────────────────────────────────────────────────────
// Evaluator tests — all checks passing
// ────────────────────────────────────────────────────────────────────

func TestEvaluateAllPassing(t *testing.T) {
	prober := &mockProber{
		networkPolicyCovered: 5,
		networkPolicyTotal:   5,
		hasDefaultDeny:       true,
		encryptionEnabled:    true,
		imgTotal:             10,
		imgCritical:          0,
		imgHigh:              0,
		clusterAdminCount:    0,
		wildcardCount:        0,
		authConfigured:       true,
		auditEnabled:         true,
		runtimeInstalled:     true,
		saAutomounted:        0,
		saTotal:              20,
	}
	ev := NewEvaluator(prober)
	fw := PCIDSS4()
	result, err := ev.Evaluate(context.Background(), fw, "test-cluster")
	if err != nil {
		t.Fatalf("evaluate error: %v", err)
	}
	if result.Score != 100 {
		t.Errorf("expected score 100, got %d", result.Score)
	}
	if result.Failed != 0 {
		t.Errorf("expected 0 failures, got %d", result.Failed)
	}
	if result.ClusterName != "test-cluster" {
		t.Errorf("cluster = %q", result.ClusterName)
	}
	if result.FrameworkID != "pci-dss-4.0" {
		t.Errorf("framework = %q", result.FrameworkID)
	}
	for _, ctrl := range result.Controls {
		if ctrl.Status != StatusPass {
			t.Errorf("control %s status = %s, want pass", ctrl.ControlID, ctrl.Status)
		}
		if ctrl.Remediation != "" {
			t.Errorf("control %s has remediation when passing", ctrl.ControlID)
		}
	}
}

// ────────────────────────────────────────────────────────────────────
// Evaluator tests — all checks failing
// ────────────────────────────────────────────────────────────────────

func TestEvaluateAllFailing(t *testing.T) {
	prober := &mockProber{
		networkPolicyCovered: 0,
		networkPolicyTotal:   5,
		hasDefaultDeny:       false,
		encryptionEnabled:    false,
		imgTotal:             10,
		imgCritical:          3,
		imgHigh:              5,
		clusterAdminCount:    2,
		wildcardCount:        4,
		authConfigured:       false,
		auditEnabled:         false,
		runtimeInstalled:     false,
		podPrivileged:        3,
		podRoot:              2,
		podHostNet:           1,
		saAutomounted:        15,
		saTotal:              20,
	}
	ev := NewEvaluator(prober)
	fw := PCIDSS4()
	result, err := ev.Evaluate(context.Background(), fw, "bad-cluster")
	if err != nil {
		t.Fatalf("evaluate error: %v", err)
	}
	if result.Score >= 50 {
		t.Errorf("expected low score, got %d", result.Score)
	}
	if result.Passed > 0 {
		t.Errorf("expected 0 passes, got %d", result.Passed)
	}
	// All controls should have remediation hints.
	for _, ctrl := range result.Controls {
		if ctrl.Status == StatusFail && ctrl.Remediation == "" {
			t.Errorf("control %s failed but no remediation hint", ctrl.ControlID)
		}
	}
}

// ────────────────────────────────────────────────────────────────────
// Evaluator tests — mixed results
// ────────────────────────────────────────────────────────────────────

func TestEvaluateMixed(t *testing.T) {
	prober := &mockProber{
		networkPolicyCovered: 3,
		networkPolicyTotal:   5,
		hasDefaultDeny:       true,
		encryptionEnabled:    true,
		imgTotal:             10,
		imgCritical:          0,
		imgHigh:              2,
		clusterAdminCount:    0,
		wildcardCount:        1,
		authConfigured:       true,
		auditEnabled:         false,
		runtimeInstalled:     true,
		saAutomounted:        2,
		saTotal:              20,
	}
	ev := NewEvaluator(prober)
	result, err := ev.Evaluate(context.Background(), PCIDSS4(), "mixed-cluster")
	if err != nil {
		t.Fatalf("evaluate error: %v", err)
	}
	if result.Score == 0 || result.Score == 100 {
		t.Errorf("expected mixed score, got %d", result.Score)
	}
	if result.Partial == 0 {
		t.Errorf("expected some partial results, got 0")
	}
}

// ────────────────────────────────────────────────────────────────────
// Evaluator tests — error handling
// ────────────────────────────────────────────────────────────────────

func TestEvaluateWithErrors(t *testing.T) {
	prober := &mockProber{
		networkPolicyErr:  errors.New("connection refused"),
		hasDefaultDenyErr: errors.New("timeout"),
		podSecErr:         errors.New("forbidden"),
		saErr:             errors.New("forbidden"),
		encryptionErr:     errors.New("not supported"),
		imgErr:            errors.New("scanner unavailable"),
		clusterAdminErr:   errors.New("forbidden"),
		wildcardErr:       errors.New("forbidden"),
		authErr:           errors.New("not supported"),
		auditErr:          errors.New("not supported"),
		runtimeErr:        errors.New("timeout"),
	}
	ev := NewEvaluator(prober)
	result, err := ev.Evaluate(context.Background(), PCIDSS4(), "err-cluster")
	if err != nil {
		t.Fatalf("evaluate should not return top-level error, got: %v", err)
	}
	// All checks should be error status.
	for _, ctrl := range result.Controls {
		for _, check := range ctrl.Checks {
			if check.Status != StatusError {
				t.Errorf("check %s status = %s, want error", check.CheckID, check.Status)
			}
		}
	}
}

// ────────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────────

func TestEvaluateEmptyNamespaces(t *testing.T) {
	prober := &mockProber{
		networkPolicyCovered: 0,
		networkPolicyTotal:   0, // No non-system namespaces.
		hasDefaultDeny:       false,
		encryptionEnabled:    true,
		imgTotal:             0, // No images scanned.
		clusterAdminCount:    0,
		wildcardCount:        0,
		authConfigured:       true,
		auditEnabled:         true,
		runtimeInstalled:     true,
		saAutomounted:        0,
		saTotal:              0,
	}
	ev := NewEvaluator(prober)
	result, err := ev.Evaluate(context.Background(), PCIDSS4(), "empty-cluster")
	if err != nil {
		t.Fatal(err)
	}
	if result.Skipped == 0 {
		t.Error("expected some skipped checks for empty cluster")
	}
}

func TestEvaluateSOC2(t *testing.T) {
	prober := &mockProber{
		networkPolicyCovered: 5,
		networkPolicyTotal:   5,
		clusterAdminCount:    0,
		wildcardCount:        0,
		saAutomounted:        0,
		saTotal:              10,
		runtimeInstalled:     true,
		auditEnabled:         true,
		imgTotal:             5,
		imgCritical:          0,
		imgHigh:              0,
	}
	ev := NewEvaluator(prober)
	result, err := ev.Evaluate(context.Background(), SOC2Type2(), "soc2-cluster")
	if err != nil {
		t.Fatal(err)
	}
	if result.Score < 80 {
		t.Errorf("expected high SOC2 score for passing cluster, got %d", result.Score)
	}
	if result.FrameworkID != "soc2-type2" {
		t.Errorf("framework = %q", result.FrameworkID)
	}
}

func TestUnknownCheckType(t *testing.T) {
	prober := &mockProber{}
	ev := NewEvaluator(prober)
	fw := Framework{
		ID:   "test",
		Name: "test",
		Controls: []Control{
			{
				ID: "c1", Title: "Test", Severity: SeverityLow, Category: "Test",
				Checks: []Check{
					{ID: "x1", Name: "unknown", CheckType: "does_not_exist"},
				},
			},
		},
	}
	result, err := ev.Evaluate(context.Background(), fw, "cluster")
	if err != nil {
		t.Fatal(err)
	}
	if result.Skipped != 1 {
		t.Errorf("expected 1 skipped, got %d", result.Skipped)
	}
}

// ────────────────────────────────────────────────────────────────────
// Helper function tests
// ────────────────────────────────────────────────────────────────────

func TestBoolStatus(t *testing.T) {
	if boolStatus(true) != StatusPass {
		t.Error("true should be pass")
	}
	if boolStatus(false) != StatusFail {
		t.Error("false should be fail")
	}
}

func TestDeriveControlStatus(t *testing.T) {
	cases := []struct {
		passed, failed, total int
		want                  CheckStatus
	}{
		{3, 0, 3, StatusPass},
		{0, 3, 3, StatusFail},
		{2, 1, 3, StatusFail},
		{2, 0, 3, StatusPartial},
		{0, 0, 0, StatusSkipped},
	}
	for _, c := range cases {
		got := deriveControlStatus(c.passed, c.failed, c.total)
		if got != c.want {
			t.Errorf("deriveControlStatus(%d,%d,%d) = %s, want %s",
				c.passed, c.failed, c.total, got, c.want)
		}
	}
}

func TestRemediationHint(t *testing.T) {
	ctrl := Control{Category: "Network Security"}
	hint := remediationHint(ctrl)
	if hint == "" {
		t.Error("expected non-empty hint for Network Security")
	}
	// Unknown category should still return something.
	ctrl2 := Control{Category: "Unknown Category"}
	hint2 := remediationHint(ctrl2)
	if hint2 == "" {
		t.Error("expected fallback hint for unknown category")
	}
}

// ────────────────────────────────────────────────────────────────────
// Demo evaluation tests
// ────────────────────────────────────────────────────────────────────

func TestDemoEvaluation(t *testing.T) {
	fw := PCIDSS4()
	result := DemoEvaluation(fw, "demo-cluster")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.ClusterName != "demo-cluster" {
		t.Errorf("cluster = %q", result.ClusterName)
	}
	if result.TotalChecks != 12 {
		t.Errorf("expected 12 total checks, got %d", result.TotalChecks)
	}
	if result.Score < 0 || result.Score > 100 {
		t.Errorf("score out of range: %d", result.Score)
	}
	total := result.Passed + result.Failed + result.Partial + result.Skipped
	if total != result.TotalChecks {
		t.Errorf("check totals don't add up: %d != %d", total, result.TotalChecks)
	}
}

func TestDemoEvaluationSOC2(t *testing.T) {
	fw := SOC2Type2()
	result := DemoEvaluation(fw, "soc2-demo")
	if result.FrameworkID != "soc2-type2" {
		t.Errorf("framework = %q", result.FrameworkID)
	}
	if len(result.Controls) != 4 {
		t.Errorf("expected 4 controls, got %d", len(result.Controls))
	}
}

// ────────────────────────────────────────────────────────────────────
// Individual check evaluator coverage
// ────────────────────────────────────────────────────────────────────

func TestCheckNetworkPolicyPartial(t *testing.T) {
	prober := &mockProber{
		networkPolicyCovered: 3,
		networkPolicyTotal:   5,
	}
	ev := NewEvaluator(prober)
	check := Check{ID: "test", Name: "test", CheckType: "network_policy"}
	result := ev.runCheck(context.Background(), check, "c")
	if result.Status != StatusPartial {
		t.Errorf("expected partial, got %s", result.Status)
	}
}

func TestCheckImageScanningCriticalOnly(t *testing.T) {
	prober := &mockProber{
		imgTotal: 10, imgCritical: 2, imgHigh: 3,
	}
	ev := NewEvaluator(prober)
	check := Check{
		ID: "test", Name: "test", CheckType: "image_scanning",
		Params: map[string]string{"max_severity": "critical"},
	}
	result := ev.runCheck(context.Background(), check, "c")
	if result.Status != StatusFail {
		t.Errorf("expected fail with critical CVEs, got %s", result.Status)
	}
}

func TestCheckImageScanningNoCritical(t *testing.T) {
	prober := &mockProber{
		imgTotal: 10, imgCritical: 0, imgHigh: 3,
	}
	ev := NewEvaluator(prober)
	check := Check{
		ID: "test", Name: "test", CheckType: "image_scanning",
		Params: map[string]string{"max_severity": "critical"},
	}
	result := ev.runCheck(context.Background(), check, "c")
	if result.Status != StatusPass {
		t.Errorf("expected pass with no critical CVEs, got %s", result.Status)
	}
}

func TestCheckImageScanningGeneral(t *testing.T) {
	// No critical, some high => partial
	prober := &mockProber{imgTotal: 10, imgCritical: 0, imgHigh: 2}
	ev := NewEvaluator(prober)
	check := Check{ID: "test", Name: "test", CheckType: "image_scanning"}
	result := ev.runCheck(context.Background(), check, "c")
	if result.Status != StatusPartial {
		t.Errorf("expected partial, got %s", result.Status)
	}

	// Some critical => fail
	prober.imgCritical = 1
	result = ev.runCheck(context.Background(), check, "c")
	if result.Status != StatusFail {
		t.Errorf("expected fail with critical CVEs, got %s", result.Status)
	}
}

func TestCheckRBACWildcard(t *testing.T) {
	prober := &mockProber{wildcardCount: 3}
	ev := NewEvaluator(prober)
	check := Check{
		ID: "test", Name: "test", CheckType: "rbac_least_privilege",
		Params: map[string]string{"check_wildcards": "true"},
	}
	result := ev.runCheck(context.Background(), check, "c")
	if result.Status != StatusFail {
		t.Errorf("expected fail with wildcards, got %s", result.Status)
	}
}

func TestCheckSAAutoMountPartial(t *testing.T) {
	// 25% automounted => partial
	prober := &mockProber{saAutomounted: 5, saTotal: 20}
	ev := NewEvaluator(prober)
	check := Check{
		ID: "test", Name: "test", CheckType: "pod_security",
		Params: map[string]string{"check_sa_automount": "true"},
	}
	result := ev.runCheck(context.Background(), check, "c")
	if result.Status != StatusPartial {
		t.Errorf("expected partial for 25%%, got %s", result.Status)
	}
}
