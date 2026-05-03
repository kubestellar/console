package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/hipaa"
)

func setupHIPAAApp() *fiber.App {
	app := fiber.New()
	h := NewHIPAAHandler()
	h.RegisterPublicRoutes(app.Group("/api"))
	return app
}

func TestHIPAASafeguards(t *testing.T) {
	app := setupHIPAAApp()
	req, _ := http.NewRequest("GET", "/api/compliance/hipaa/safeguards", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var safeguards []hipaa.Safeguard
	if err := json.Unmarshal(body, &safeguards); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(safeguards) != 5 {
		t.Errorf("expected 5 safeguards, got %d", len(safeguards))
	}
}

func TestHIPAAPHINamespaces(t *testing.T) {
	app := setupHIPAAApp()
	req, _ := http.NewRequest("GET", "/api/compliance/hipaa/phi-namespaces", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var ns []hipaa.PHINamespace
	if err := json.Unmarshal(body, &ns); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(ns) != 4 {
		t.Errorf("expected 4 PHI namespaces, got %d", len(ns))
	}
}

func TestHIPAADataFlows(t *testing.T) {
	app := setupHIPAAApp()
	req, _ := http.NewRequest("GET", "/api/compliance/hipaa/data-flows", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var flows []hipaa.DataFlow
	if err := json.Unmarshal(body, &flows); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(flows) != 6 {
		t.Errorf("expected 6 data flows, got %d", len(flows))
	}
}

func TestHIPAASummary(t *testing.T) {
	app := setupHIPAAApp()
	req, _ := http.NewRequest("GET", "/api/compliance/hipaa/summary", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var summary hipaa.Summary
	if err := json.Unmarshal(body, &summary); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if summary.TotalSafeguards != 5 {
		t.Errorf("expected 5 total safeguards, got %d", summary.TotalSafeguards)
	}
	if summary.OverallScore != 60 {
		t.Errorf("expected score 60, got %d", summary.OverallScore)
	}
}
