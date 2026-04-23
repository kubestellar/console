package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/gxp"
)

func setupGxPApp() *fiber.App {
	app := fiber.New()
	h := NewGxPHandler()
	h.RegisterPublicRoutes(app.Group("/api"))
	return app
}

func TestGxPConfig(t *testing.T) {
	app := setupGxPApp()
	req, _ := http.NewRequest("GET", "/api/compliance/gxp/config", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var cfg gxp.Config
	if err := json.Unmarshal(body, &cfg); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if !cfg.Enabled {
		t.Error("expected GxP mode enabled")
	}
}

func TestGxPRecords(t *testing.T) {
	app := setupGxPApp()
	req, _ := http.NewRequest("GET", "/api/compliance/gxp/records", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var records []gxp.AuditRecord
	if err := json.Unmarshal(body, &records); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(records) != 8 {
		t.Errorf("expected 8 records, got %d", len(records))
	}
}

func TestGxPChainVerify(t *testing.T) {
	app := setupGxPApp()
	req, _ := http.NewRequest("GET", "/api/compliance/gxp/chain/verify", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var status gxp.ChainStatus
	if err := json.Unmarshal(body, &status); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if !status.Valid {
		t.Error("expected valid chain")
	}
}

func TestGxPSummary(t *testing.T) {
	app := setupGxPApp()
	req, _ := http.NewRequest("GET", "/api/compliance/gxp/summary", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var summary gxp.Summary
	if err := json.Unmarshal(body, &summary); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if summary.TotalRecords != 8 {
		t.Errorf("expected 8 records, got %d", summary.TotalRecords)
	}
}
