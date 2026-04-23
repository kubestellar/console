package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/baa"
)

func setupBAAApp() *fiber.App {
	app := fiber.New()
	h := NewBAAHandler()
	h.RegisterPublicRoutes(app.Group("/api"))
	return app
}

func TestBAAAgreements(t *testing.T) {
	app := setupBAAApp()
	req, _ := http.NewRequest("GET", "/api/compliance/baa/agreements", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var agreements []baa.Agreement
	if err := json.Unmarshal(body, &agreements); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(agreements) != 6 {
		t.Errorf("expected 6 agreements, got %d", len(agreements))
	}
}

func TestBAAAlerts(t *testing.T) {
	app := setupBAAApp()
	req, _ := http.NewRequest("GET", "/api/compliance/baa/alerts", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var alerts []baa.ExpiryAlert
	if err := json.Unmarshal(body, &alerts); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(alerts) != 2 {
		t.Errorf("expected 2 alerts, got %d", len(alerts))
	}
}

func TestBAASummary(t *testing.T) {
	app := setupBAAApp()
	req, _ := http.NewRequest("GET", "/api/compliance/baa/summary", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var summary baa.Summary
	if err := json.Unmarshal(body, &summary); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if summary.TotalAgreements != 6 {
		t.Errorf("expected 6, got %d", summary.TotalAgreements)
	}
}
