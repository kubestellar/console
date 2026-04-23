package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestSoDHandler_ListRules(t *testing.T) {
	app := fiber.New()
	h := NewSoDHandler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/sod/rules", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var rules []json.RawMessage
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &rules); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(rules) != 5 {
		t.Errorf("expected 5 rules, got %d", len(rules))
	}
}

func TestSoDHandler_ListPrincipals(t *testing.T) {
	app := fiber.New()
	h := NewSoDHandler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/sod/principals", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestSoDHandler_ListViolations(t *testing.T) {
	app := fiber.New()
	h := NewSoDHandler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/sod/violations", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestSoDHandler_GetSummary(t *testing.T) {
	app := fiber.New()
	h := NewSoDHandler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/sod/summary", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var summary map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &summary); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if _, ok := summary["compliance_score"]; !ok {
		t.Error("expected compliance_score in summary")
	}
}
