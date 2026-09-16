package missions

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMissions_ValidateMission_ValidMission(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/kubestellar/console-kb/master/fixes/index.json", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"version":1,"count":1,"missions":[{"path":"fixes/demo/install.json","qualityPass":true,"qualityScore":97,"testedOn":["kind"],"qualityIssues":[]}]}`))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	payload := `{"mission":{"apiVersion":"kc-mission-v1","kind":"Mission","metadata":{"name":"test-mission"},"spec":{"description":"A test mission"}},"path":"fixes/demo/install.json"}`
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, true, body["valid"])
	assert.Equal(t, true, body["qualityPass"])
	assert.Equal(t, float64(97), body["qualityScore"])
	assert.Equal(t, []interface{}{"kind"}, body["testedOn"])
}

func TestMissions_ValidateMission_QualityFailure(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"version":1,"count":1,"missions":[{"path":"fixes/demo/install.json","qualityPass":false,"qualityScore":61,"testedOn":["kind"],"qualityIssues":["Missing validation steps"]}]}`))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	payload := `{"mission":{"apiVersion":"kc-mission-v1","kind":"Mission","metadata":{"name":"test-mission"},"spec":{"description":"A test mission"}},"path":"fixes/demo/install.json"}`
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusUnprocessableEntity, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, false, body["valid"])
	assert.Equal(t, false, body["qualityPass"])
	assert.Equal(t, float64(61), body["qualityScore"])
	assert.Equal(t, []interface{}{"Missing validation steps"}, body["errors"])
}

func TestMissions_ValidateMission_MissionNotInIndex(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"version":1,"count":0,"missions":[]}`))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	payload := `{"mission":{"apiVersion":"kc-mission-v1","kind":"Mission","metadata":{"name":"test-mission"},"spec":{"description":"A test mission"}},"path":"fixes/demo/install.json"}`
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusUnprocessableEntity, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, false, body["valid"])
	assert.Equal(t, []interface{}{"Mission not found in validated KB index"}, body["errors"])
}

func TestMissions_ValidateMission_InvalidMission(t *testing.T) {
	app, _ := setupMissionsTest()

	// Missing apiVersion, kind, metadata.name
	payload := `{"mission":{"apiVersion":"wrong","spec":{}},"path":"fixes/demo/install.json"}`
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, false, body["valid"])
	errs, ok := body["errors"].([]interface{})
	require.True(t, ok)
	assert.GreaterOrEqual(t, len(errs), 2, "should have at least 2 validation errors")
}

func TestMissions_ValidateMission_EmptyBody(t *testing.T) {
	app, _ := setupMissionsTest()

	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(""))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, false, body["valid"])
}

func TestMissions_ValidateMission_TooLarge(t *testing.T) {
	// Use a Fiber app with a large enough body limit so the request reaches our handler
	app := fiber.New(fiber.Config{
		BodyLimit: missionsMaxBodyBytes + 1024,
	})
	handler := NewMissionsHandler()
	handler.RegisterRoutes(app.Group("/api/missions"))

	largePayload := strings.Repeat("x", missionsMaxBodyBytes+1)
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(largePayload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	// Handler returns 413 for payload too large
	assert.True(t, resp.StatusCode == http.StatusRequestEntityTooLarge || resp.StatusCode == http.StatusBadRequest,
		"expected 413 or 400, got %d", resp.StatusCode)
}

// ---------- ShareToSlack ----------

func TestSanitizePath_DoubleEncodedTraversal(t *testing.T) {
	bad := []string{
		// Single-encoded traversal — rejected because we decode once inside sanitizePath
		"%2e%2e%2ftarget",
		// Double-encoded — decoded by sanitizePath to %2e%2e%2f, then cleaned to ..
		"%252e%252e%252ftarget",
		// Mixed
		"missions/%2e%2e/%2e%2e/etc/passwd",
		// Raw traversal
		"../etc/passwd",
		"foo/../../bar",
		// Backslash (decoded from %5c)
		"missions%5c..%5cetc",
		// Single literal backslash
		"missions\\file",
	}
	for _, p := range bad {
		_, err := sanitizePath(p)
		assert.Error(t, err, "expected sanitizePath to reject %q", p)
	}

	good := []string{
		"",                              // repo root
		"missions/fixes/cncf-generated", // nested path
		"fixes/kubernetes/foo.json",
		"a/b/c",
	}
	for _, p := range good {
		_, err := sanitizePath(p)
		assert.NoError(t, err, "expected sanitizePath to accept %q", p)
	}
}

// TestValidateKBBrowsePath ensures public browse paths are constrained to
// simple slug-like directory paths before they can be recorded in the KB gap
// tracker.

func TestValidateKBBrowsePath(t *testing.T) {
	good := []string{"", "fixes", "fixes/cert-manager", "cncf-generated/kubernetes"}
	for _, p := range good {
		assert.NoError(t, validateKBBrowsePath(p), "expected validateKBBrowsePath to accept %q", p)
	}

	bad := []string{"fixes/cert_manager", "fixes/README.md", "fixes/../../etc", "fixes/$weird"}
	for _, p := range bad {
		assert.Error(t, validateKBBrowsePath(p), "expected validateKBBrowsePath to reject %q", p)
	}
}

// TestValidateSlackWebhookURL covers the #6416 regression: The pre-fix check
// used strings.HasPrefix to validate Slack webhook URLs, which is structural
// rather than semantic. Any URL parser quirk (userinfo, port, fragment,
// case-folding) could sneak past. The fixed version uses net/url.Parse and
// compares parsed.Hostname() to the literal allowlist entry.
