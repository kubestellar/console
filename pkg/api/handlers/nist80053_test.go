package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestNIST80053Families(t *testing.T) {
	app := fiber.New()
	h := NewNIST80053Handler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/nist/families", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var families []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&families); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(families) == 0 {
		t.Error("expected non-empty families list")
	}
}

func TestNIST80053Mappings(t *testing.T) {
	app := fiber.New()
	h := NewNIST80053Handler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/nist/mappings", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var mappings []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&mappings); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(mappings) == 0 {
		t.Error("expected non-empty mappings list")
	}
}

func TestNIST80053Summary(t *testing.T) {
	app := fiber.New()
	h := NewNIST80053Handler()
	h.RegisterPublicRoutes(app.Group("/api"))

	req := httptest.NewRequest(http.MethodGet, "/api/compliance/nist/summary", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var summary map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&summary); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if summary["total_controls"] == nil {
		t.Error("missing total_controls in summary")
	}
}
