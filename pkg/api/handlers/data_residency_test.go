package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/compliance/residency"
)

func TestDataResidencyHandler_ListRules(t *testing.T) {
	app := fiber.New()
	engine := residency.NewEngine()
	handler := NewDataResidencyHandler(engine)
	handler.RegisterPublicRoutes(app.Group("/api/compliance/residency"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/residency/rules", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var rules []residency.Rule
	if err := json.NewDecoder(resp.Body).Decode(&rules); err != nil {
		t.Fatalf("failed to decode rules: %v", err)
	}
	if len(rules) < 4 {
		t.Errorf("expected at least 4 built-in rules, got %d", len(rules))
	}
}

func TestDataResidencyHandler_ListRegions(t *testing.T) {
	app := fiber.New()
	engine := residency.NewEngine()
	handler := NewDataResidencyHandler(engine)
	handler.RegisterPublicRoutes(app.Group("/api/compliance/residency"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/residency/regions", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var regions []map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&regions); err != nil {
		t.Fatalf("failed to decode regions: %v", err)
	}
	if len(regions) < 6 {
		t.Errorf("expected at least 6 regions, got %d", len(regions))
	}
	// Each region should have code and label
	for _, r := range regions {
		if r["code"] == "" || r["label"] == "" {
			t.Errorf("region missing code or label: %v", r)
		}
	}
}

func TestDataResidencyHandler_ListViolations(t *testing.T) {
	app := fiber.New()
	engine := residency.NewEngine()
	handler := NewDataResidencyHandler(engine)
	handler.RegisterPublicRoutes(app.Group("/api/compliance/residency"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/residency/violations", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var violations []residency.Violation
	if err := json.NewDecoder(resp.Body).Decode(&violations); err != nil {
		t.Fatalf("failed to decode violations: %v", err)
	}
	if len(violations) == 0 {
		t.Error("expected at least one demo violation")
	}
	// Verify violation structure
	v := violations[0]
	if v.ID == "" || v.ClusterName == "" || v.Message == "" {
		t.Error("violation missing required fields")
	}
}

func TestDataResidencyHandler_GetSummary(t *testing.T) {
	app := fiber.New()
	engine := residency.NewEngine()
	handler := NewDataResidencyHandler(engine)
	handler.RegisterPublicRoutes(app.Group("/api/compliance/residency"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/residency/summary", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var summary residency.ResidencySummary
	if err := json.NewDecoder(resp.Body).Decode(&summary); err != nil {
		t.Fatalf("failed to decode summary: %v", err)
	}
	if summary.TotalRules == 0 {
		t.Error("expected non-zero total_rules")
	}
	if summary.TotalClusters == 0 {
		t.Error("expected non-zero total_clusters")
	}
	if summary.TotalViolations == 0 {
		t.Error("expected non-zero total_violations in demo data")
	}
}

func TestDataResidencyHandler_ListClusterRegions(t *testing.T) {
	app := fiber.New()
	engine := residency.NewEngine()
	handler := NewDataResidencyHandler(engine)
	handler.RegisterPublicRoutes(app.Group("/api/compliance/residency"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/residency/clusters", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var clusters []residency.ClusterRegion
	if err := json.NewDecoder(resp.Body).Decode(&clusters); err != nil {
		t.Fatalf("failed to decode clusters: %v", err)
	}
	if len(clusters) < 5 {
		t.Errorf("expected at least 5 demo clusters, got %d", len(clusters))
	}
}
