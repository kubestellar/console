package mcp

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pkgmcp "github.com/kubestellar/console/pkg/mcp"
)

// The pre-existing CallOpsTool/CallDeployTool tests only exercised the
// bridge==nil early-return arm (→ 503). Everything past that check — the
// body parser, validateToolName's allowlist branches, and the bridge
// dispatch itself — was uncovered.
//
// These tests wire in a real *mcp.Bridge (with nil sub-clients) so the
// bridge!=nil arm is taken, then poke each remaining branch:
//   • malformed JSON body → 400 "invalid request body"
//   • unknown tool name   → 403 "tool not allowed"
//   • empty tool name     → 400 "tool name is required"
//   • allowlisted tool    → bridge.CallOpsTool/CallDeployTool returns
//                           "ops/deploy client not available" → HandleK8sError

func newBridgeWithoutClients() *pkgmcp.Bridge {
	// NewBridge stores config only; sub-clients stay nil until Start().
	return pkgmcp.NewBridge(pkgmcp.BridgeConfig{})
}

func TestCallOpsTool_InvalidBodyReturns400(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(newBridgeWithoutClients(), env.K8sClient, env.Store)
	app.Post("/ops", h.CallOpsTool)

	req := httptest.NewRequest(http.MethodPost, "/ops", strings.NewReader("not-json"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestCallOpsTool_UnknownToolReturns403(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(newBridgeWithoutClients(), env.K8sClient, env.Store)
	app.Post("/ops", h.CallOpsTool)

	body := `{"name":"delete_all_the_things","arguments":{}}`
	req := httptest.NewRequest(http.MethodPost, "/ops", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusForbidden, resp.StatusCode)
}

func TestCallOpsTool_EmptyToolNameReturns400(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(newBridgeWithoutClients(), env.K8sClient, env.Store)
	app.Post("/ops", h.CallOpsTool)

	body := `{"name":"","arguments":{}}`
	req := httptest.NewRequest(http.MethodPost, "/ops", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestCallOpsTool_AllowedToolReachesBridgeAndReturnsError(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(newBridgeWithoutClients(), env.K8sClient, env.Store)
	app.Post("/ops", h.CallOpsTool)

	body := `{"name":"list_clusters","arguments":{}}`
	req := httptest.NewRequest(http.MethodPost, "/ops", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	// Bridge sub-client is nil so CallOpsTool returns an error, which is
	// forwarded through HandleK8sError. Any non-2xx status proves the
	// dispatch path was taken (validateToolName + bridge.CallOpsTool).
	assert.GreaterOrEqual(t, resp.StatusCode, 400)
}

func TestCallDeployTool_InvalidBodyReturns400(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(newBridgeWithoutClients(), env.K8sClient, env.Store)
	app.Post("/deploy", h.CallDeployTool)

	req := httptest.NewRequest(http.MethodPost, "/deploy", strings.NewReader("not-json"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestCallDeployTool_UnknownToolReturns403(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(newBridgeWithoutClients(), env.K8sClient, env.Store)
	app.Post("/deploy", h.CallDeployTool)

	// scale_app is intentionally NOT in AllowedDeployTools (write op).
	body := `{"name":"scale_app","arguments":{}}`
	req := httptest.NewRequest(http.MethodPost, "/deploy", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusForbidden, resp.StatusCode)
}

func TestCallDeployTool_AllowedToolReachesBridgeAndReturnsError(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(newBridgeWithoutClients(), env.K8sClient, env.Store)
	app.Post("/deploy", h.CallDeployTool)

	body := `{"name":"get_app_status","arguments":{}}`
	req := httptest.NewRequest(http.MethodPost, "/deploy", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, resp.StatusCode, 400)
}

// TestValidateToolName_EmptyReturnsRequired locks in the empty-name arm of
// validateToolName directly, complementing the HTTP-level tests above.
func TestValidateToolName_EmptyReturnsRequired(t *testing.T) {
	err := validateToolName("", AllowedOpsTools)
	require.Error(t, err)
	fiberErr, ok := err.(*fiber.Error)
	require.True(t, ok, "expected *fiber.Error")
	assert.Equal(t, fiber.StatusBadRequest, fiberErr.Code)
	assert.Contains(t, fiberErr.Message, "tool name is required")
}
