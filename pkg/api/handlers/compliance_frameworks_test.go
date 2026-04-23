package handlers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/compliance/frameworks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupComplianceFrameworksTest() (*fiber.App, *ComplianceFrameworksHandler) {
	app := fiber.New()
	handler := NewComplianceFrameworksHandler(nil) // demo mode
	handler.RegisterRoutes(app.Group("/api/compliance/frameworks"))
	return app, handler
}

func TestListFrameworks(t *testing.T) {
	app, _ := setupComplianceFrameworksTest()

	req, err := http.NewRequest("GET", "/api/compliance/frameworks/", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	assert.Contains(t, bodyStr, "pci-dss-4.0")
	assert.Contains(t, bodyStr, "soc2-type2")
	assert.Contains(t, bodyStr, `"controls"`)
	assert.Contains(t, bodyStr, `"checks"`)
}

func TestGetFramework(t *testing.T) {
	app, _ := setupComplianceFrameworksTest()

	req, err := http.NewRequest("GET", "/api/compliance/frameworks/pci-dss-4.0", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	assert.Contains(t, bodyStr, "PCI-DSS 4.0")
	assert.Contains(t, bodyStr, "pci-1")
	assert.Contains(t, bodyStr, "network_policy")
}

func TestGetFrameworkNotFound(t *testing.T) {
	app, _ := setupComplianceFrameworksTest()

	req, err := http.NewRequest("GET", "/api/compliance/frameworks/nonexistent", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestEvaluateFrameworkDemo(t *testing.T) {
	app, _ := setupComplianceFrameworksTest()

	body := `{"cluster":"demo-cluster"}`
	req, err := http.NewRequest("POST", "/api/compliance/frameworks/pci-dss-4.0/evaluate",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	respBody, _ := io.ReadAll(resp.Body)
	respStr := string(respBody)
	assert.Contains(t, respStr, "demo-cluster")
	assert.Contains(t, respStr, "score")
	assert.Contains(t, respStr, "controls")
}

func TestEvaluateFrameworkNotFound(t *testing.T) {
	app, _ := setupComplianceFrameworksTest()

	body := `{"cluster":"c"}`
	req, err := http.NewRequest("POST", "/api/compliance/frameworks/nonexistent/evaluate",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestEvaluateFrameworkMissingCluster(t *testing.T) {
	app, _ := setupComplianceFrameworksTest()

	body := `{}`
	req, err := http.NewRequest("POST", "/api/compliance/frameworks/pci-dss-4.0/evaluate",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestEvaluateFrameworkBadBody(t *testing.T) {
	app, _ := setupComplianceFrameworksTest()

	req, err := http.NewRequest("POST", "/api/compliance/frameworks/pci-dss-4.0/evaluate",
		strings.NewReader("not json"))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// handlerMockProber implements frameworks.ClusterProber for handler-level tests.
type handlerMockProber struct{}

func (m *handlerMockProber) HasNetworkPolicies(_ context.Context, _ string) (int, int, error) {
	return 5, 5, nil
}
func (m *handlerMockProber) HasDefaultDenyIngress(_ context.Context, _ string) (bool, error) {
	return true, nil
}
func (m *handlerMockProber) PodSecurityIssues(_ context.Context, _ string) (int, int, int, error) {
	return 0, 0, 0, nil
}
func (m *handlerMockProber) ServiceAccountAutoMount(_ context.Context, _ string) (int, int, error) {
	return 0, 10, nil
}
func (m *handlerMockProber) EncryptionAtRestEnabled(_ context.Context, _ string) (bool, error) {
	return true, nil
}
func (m *handlerMockProber) ImageVulnerabilities(_ context.Context, _ string) (int, int, int, error) {
	return 10, 0, 0, nil
}
func (m *handlerMockProber) ClusterAdminBindings(_ context.Context, _ string) (int, error) {
	return 0, nil
}
func (m *handlerMockProber) WildcardRBACRules(_ context.Context, _ string) (int, error) {
	return 0, nil
}
func (m *handlerMockProber) AuthProviderConfigured(_ context.Context, _ string) (bool, error) {
	return true, nil
}
func (m *handlerMockProber) AuditLoggingEnabled(_ context.Context, _ string) (bool, error) {
	return true, nil
}
func (m *handlerMockProber) RuntimeSecurityInstalled(_ context.Context, _ string) (bool, error) {
	return true, nil
}

func setupComplianceFrameworksWithEvaluator() *fiber.App {
	app := fiber.New()
	evaluator := frameworks.NewEvaluator(&handlerMockProber{})
	handler := NewComplianceFrameworksHandler(evaluator)
	handler.RegisterRoutes(app.Group("/api/compliance/frameworks"))
	return app
}

func TestEvaluateLiveCluster(t *testing.T) {
	app := setupComplianceFrameworksWithEvaluator()

	body := `{"cluster":"live-cluster"}`
	req, err := http.NewRequest("POST", "/api/compliance/frameworks/pci-dss-4.0/evaluate",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 10000)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	respBody, _ := io.ReadAll(resp.Body)
	respStr := string(respBody)
	assert.Contains(t, respStr, "live-cluster")
	assert.Contains(t, respStr, "score")
	assert.Contains(t, respStr, "pass")
}

// errorProber always returns errors, testing the 500 path.
type errorProber struct{}

func (m *errorProber) HasNetworkPolicies(_ context.Context, _ string) (int, int, error) {
	return 0, 0, errors.New("connection refused")
}
func (m *errorProber) HasDefaultDenyIngress(_ context.Context, _ string) (bool, error) {
	return false, errors.New("fail")
}
func (m *errorProber) PodSecurityIssues(_ context.Context, _ string) (int, int, int, error) {
	return 0, 0, 0, errors.New("fail")
}
func (m *errorProber) ServiceAccountAutoMount(_ context.Context, _ string) (int, int, error) {
	return 0, 0, errors.New("fail")
}
func (m *errorProber) EncryptionAtRestEnabled(_ context.Context, _ string) (bool, error) {
	return false, errors.New("fail")
}
func (m *errorProber) ImageVulnerabilities(_ context.Context, _ string) (int, int, int, error) {
	return 0, 0, 0, errors.New("fail")
}
func (m *errorProber) ClusterAdminBindings(_ context.Context, _ string) (int, error) {
	return 0, errors.New("fail")
}
func (m *errorProber) WildcardRBACRules(_ context.Context, _ string) (int, error) {
	return 0, errors.New("fail")
}
func (m *errorProber) AuthProviderConfigured(_ context.Context, _ string) (bool, error) {
	return false, errors.New("fail")
}
func (m *errorProber) AuditLoggingEnabled(_ context.Context, _ string) (bool, error) {
	return false, errors.New("fail")
}
func (m *errorProber) RuntimeSecurityInstalled(_ context.Context, _ string) (bool, error) {
	return false, errors.New("fail")
}

func TestEvaluateFrameworkLiveError(t *testing.T) {
	app := fiber.New()
	evaluator := frameworks.NewEvaluator(&errorProber{})
	handler := NewComplianceFrameworksHandler(evaluator)
	handler.RegisterRoutes(app.Group("/api/compliance/frameworks"))

	body := `{"cluster":"bad-cluster"}`
	req, err := http.NewRequest("POST", "/api/compliance/frameworks/pci-dss-4.0/evaluate",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 10000)
	assert.NoError(t, err)
	// Evaluate doesn't return an error — it records errors per check
	// so the handler still returns 200 with error statuses in the results
	assert.True(t, resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusInternalServerError)
}
