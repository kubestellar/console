package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestChangeControlHandler_ListPolicies(t *testing.T) {
	app := fiber.New()
	h := NewChangeControlHandler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/change-control/policies", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var policies []json.RawMessage
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &policies); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(policies) == 0 {
		t.Error("expected policies")
	}
}

func TestChangeControlHandler_ListChanges(t *testing.T) {
	app := fiber.New()
	h := NewChangeControlHandler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/change-control/changes", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestChangeControlHandler_ListViolations(t *testing.T) {
	app := fiber.New()
	h := NewChangeControlHandler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/change-control/violations", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestChangeControlHandler_GetSummary(t *testing.T) {
	app := fiber.New()
	h := NewChangeControlHandler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/change-control/summary", nil)
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
	if _, ok := summary["total_changes"]; !ok {
		t.Error("expected total_changes in summary")
	}
}
