package compliance

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/compliance/residency"
)

// The existing data_residency_test.go tests only exercise the non-demo
// branches. Every DataResidencyHandler method has an IsDemoMode(c) short
// circuit that returns via handlers.DemoResponse — a distinct branch and
// distinct response shape ({"<key>": ..., "source": "demo"}). These tests
// cover that branch for all 5 endpoints.

func setupResidencyApp(t *testing.T) *fiber.App {
	t.Helper()
	app := fiber.New()
	engine := residency.NewEngine()
	handler := NewDataResidencyHandler(engine)
	handler.RegisterPublicRoutes(app.Group("/api/compliance/residency"))
	return app
}

// demoRequest sends a GET with X-Demo-Mode: true.
func demoRequest(t *testing.T, app *fiber.App, path string) map[string]json.RawMessage {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var payload map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode demo response: %v", err)
	}
	return payload
}

func TestDataResidencyHandler_ListRules_Demo(t *testing.T) {
	app := setupResidencyApp(t)
	payload := demoRequest(t, app, "/api/compliance/residency/rules")

	if _, ok := payload["source"]; !ok {
		t.Fatalf("demo response missing 'source' field: %v", payload)
	}
	var source string
	if err := json.Unmarshal(payload["source"], &source); err != nil || source != "demo" {
		t.Fatalf("expected source=demo, got %q", source)
	}

	raw, ok := payload["rules"]
	if !ok {
		t.Fatalf("demo response missing 'rules' key: %v", payload)
	}
	var rules []residency.Rule
	if err := json.Unmarshal(raw, &rules); err != nil {
		t.Fatalf("failed to decode rules: %v", err)
	}
	if len(rules) < 4 {
		t.Errorf("expected at least 4 built-in demo rules, got %d", len(rules))
	}
}

func TestDataResidencyHandler_ListRegions_Demo(t *testing.T) {
	app := setupResidencyApp(t)
	payload := demoRequest(t, app, "/api/compliance/residency/regions")

	var source string
	if err := json.Unmarshal(payload["source"], &source); err != nil || source != "demo" {
		t.Fatalf("expected source=demo, got %q", source)
	}

	raw, ok := payload["regions"]
	if !ok {
		t.Fatalf("demo response missing 'regions' key: %v", payload)
	}
	// Demo branch builds its own inline regionInfo type — verify shape.
	var regions []map[string]string
	if err := json.Unmarshal(raw, &regions); err != nil {
		t.Fatalf("failed to decode regions: %v", err)
	}
	if len(regions) < 6 {
		t.Errorf("expected at least 6 regions, got %d", len(regions))
	}
	for _, r := range regions {
		if r["code"] == "" || r["label"] == "" {
			t.Errorf("region missing code or label: %v", r)
		}
	}
}

func TestDataResidencyHandler_ListClusterRegions_Demo(t *testing.T) {
	app := setupResidencyApp(t)
	payload := demoRequest(t, app, "/api/compliance/residency/clusters")

	var source string
	if err := json.Unmarshal(payload["source"], &source); err != nil || source != "demo" {
		t.Fatalf("expected source=demo, got %q", source)
	}

	raw, ok := payload["clusterRegions"]
	if !ok {
		t.Fatalf("demo response missing 'clusterRegions' key: %v", payload)
	}
	var clusters []residency.ClusterRegion
	if err := json.Unmarshal(raw, &clusters); err != nil {
		t.Fatalf("failed to decode clusters: %v", err)
	}
	if len(clusters) < 5 {
		t.Errorf("expected at least 5 demo clusters, got %d", len(clusters))
	}
}

func TestDataResidencyHandler_ListViolations_Demo(t *testing.T) {
	app := setupResidencyApp(t)
	payload := demoRequest(t, app, "/api/compliance/residency/violations")

	var source string
	if err := json.Unmarshal(payload["source"], &source); err != nil || source != "demo" {
		t.Fatalf("expected source=demo, got %q", source)
	}

	raw, ok := payload["violations"]
	if !ok {
		t.Fatalf("demo response missing 'violations' key: %v", payload)
	}
	var violations []residency.Violation
	if err := json.Unmarshal(raw, &violations); err != nil {
		t.Fatalf("failed to decode violations: %v", err)
	}
	if len(violations) == 0 {
		t.Fatal("expected at least one demo violation")
	}
	v := violations[0] //nolint:nilaway // guarded by len check above
	if v.ID == "" || v.ClusterName == "" || v.Message == "" {
		t.Error("demo violation missing required fields")
	}
}

func TestDataResidencyHandler_GetSummary_Demo(t *testing.T) {
	app := setupResidencyApp(t)
	payload := demoRequest(t, app, "/api/compliance/residency/summary")

	var source string
	if err := json.Unmarshal(payload["source"], &source); err != nil || source != "demo" {
		t.Fatalf("expected source=demo, got %q", source)
	}

	raw, ok := payload["summary"]
	if !ok {
		t.Fatalf("demo response missing 'summary' key: %v", payload)
	}
	var summary residency.ResidencySummary
	if err := json.Unmarshal(raw, &summary); err != nil {
		t.Fatalf("failed to decode summary: %v", err)
	}
	if summary.TotalRules == 0 {
		t.Error("expected non-zero TotalRules")
	}
	if summary.TotalClusters == 0 {
		t.Error("expected non-zero TotalClusters")
	}
}

// Ensure a header value that is NOT exactly "true" falls through to the
// non-demo branch — IsDemoMode uses strict equality.
func TestDataResidencyHandler_NonDemoHeaderFallsThrough(t *testing.T) {
	app := setupResidencyApp(t)

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/residency/rules", nil)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "TRUE") // wrong case — must NOT trigger demo
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	// Non-demo response is a bare array, not an object with a "source" field.
	var arr []residency.Rule
	if err := json.NewDecoder(resp.Body).Decode(&arr); err != nil {
		t.Fatalf("expected array response for non-demo header, got decode error: %v", err)
	}
}
