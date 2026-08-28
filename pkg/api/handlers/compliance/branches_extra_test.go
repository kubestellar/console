package compliance

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/compliance/gxp"
)

// TestAttestationHandler_GetScore_Demo covers the IsDemoMode short-circuit
// branch in AttestationHandler.getScore. The existing attestation_test.go
// only exercises the non-demo path.
func TestAttestationHandler_GetScore_Demo(t *testing.T) {
	app := fiber.New()
	h := NewAttestationHandler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/attestation/score", nil)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]json.RawMessage
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	var source string
	require.NoError(t, json.Unmarshal(payload["source"], &source))
	assert.Equal(t, "demo", source)

	var scores AttestationResponse
	require.NoError(t, json.Unmarshal(payload["attestation"], &scores))
	assert.NotEmpty(t, scores.Clusters)
}

// TestComplianceFrameworks_RegisterPublicRoutes covers the RegisterPublicRoutes
// branch of ComplianceFrameworksHandler. The existing test uses
// RegisterRoutes (which mounts POST /evaluate too); this asserts that the
// public wrapper only mounts the two read-only GETs and that both work.
func TestComplianceFrameworks_RegisterPublicRoutes(t *testing.T) {
	app := fiber.New()
	h := NewComplianceFrameworksHandler(nil) // demo mode
	h.RegisterPublicRoutes(app.Group("/api/compliance/frameworks"))

	// GET list works.
	req := httptest.NewRequest(http.MethodGet, "/api/compliance/frameworks/", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), `"controls"`)

	// GET detail: not-found path also covered here.
	req2 := httptest.NewRequest(http.MethodGet, "/api/compliance/frameworks/does-not-exist", nil)
	req2.Host = "localhost"
	resp2, err := app.Test(req2, -1)
	require.NoError(t, err)
	defer resp2.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp2.StatusCode)

	// POST /evaluate must NOT be mounted by the public wrapper.
	req3 := httptest.NewRequest(http.MethodPost, "/api/compliance/frameworks/pci-dss-4.0/evaluate", nil)
	req3.Host = "localhost"
	resp3, err := app.Test(req3, -1)
	require.NoError(t, err)
	defer resp3.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp3.StatusCode)
}

// TestGxP_ListSignatures covers the previously-untested listSignatures GET
// handler, which delegates to gxp.Engine.Signatures() and is mounted at
// /compliance/gxp/signatures by RegisterPublicRoutes.
func TestGxP_ListSignatures(t *testing.T) {
	app := setupGxPApp()
	req, err := http.NewRequest(http.MethodGet, "/api/compliance/gxp/signatures", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var sigs []gxp.Signature
	require.NoError(t, json.Unmarshal(body, &sigs))
	assert.NotEmpty(t, sigs, "expected demo GxP signatures")
}
