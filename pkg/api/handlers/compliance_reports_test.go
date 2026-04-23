package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestComplianceReportsHandler_GenerateReport(t *testing.T) {
	app := fiber.New()
	handler := NewComplianceReportsHandler(nil) // demo mode
	handler.RegisterRoutes(app.Group("/api/compliance/frameworks"))

	tests := []struct {
		name           string
		frameworkID    string
		body           string
		expectedStatus int
		checkBody      func(t *testing.T, body []byte)
	}{
		{
			name:           "json report for pci-dss",
			frameworkID:    "pci-dss-4.0",
			body:           `{"cluster":"test-cluster","format":"json"}`,
			expectedStatus: http.StatusOK,
			checkBody: func(t *testing.T, body []byte) {
				if !strings.Contains(string(body), "kc-compliance-report-v1") {
					t.Error("JSON report should contain schema version")
				}
				if !strings.Contains(string(body), "pci-dss-4.0") {
					t.Error("JSON report should contain framework ID")
				}
			},
		},
		{
			name:           "pdf report for pci-dss",
			frameworkID:    "pci-dss-4.0",
			body:           `{"cluster":"test-cluster","format":"pdf"}`,
			expectedStatus: http.StatusOK,
			checkBody: func(t *testing.T, body []byte) {
				if !strings.HasPrefix(string(body), "%PDF-1.4") {
					t.Error("PDF report should start with PDF header")
				}
			},
		},
		{
			name:           "json report for soc2",
			frameworkID:    "soc2-type2",
			body:           `{"cluster":"prod-cluster","format":"json"}`,
			expectedStatus: http.StatusOK,
			checkBody: func(t *testing.T, body []byte) {
				if !strings.Contains(string(body), "soc2-type2") {
					t.Error("JSON report should contain framework ID")
				}
			},
		},
		{
			name:           "default format is json",
			frameworkID:    "pci-dss-4.0",
			body:           `{"cluster":"test-cluster"}`,
			expectedStatus: http.StatusOK,
			checkBody: func(t *testing.T, body []byte) {
				if !strings.Contains(string(body), "kc-compliance-report-v1") {
					t.Error("default format should be JSON")
				}
			},
		},
		{
			name:           "unknown framework returns 404",
			frameworkID:    "nonexistent",
			body:           `{"cluster":"test-cluster","format":"json"}`,
			expectedStatus: http.StatusNotFound,
			checkBody: func(t *testing.T, body []byte) {
				if !strings.Contains(string(body), "framework not found") {
					t.Error("should return framework not found error")
				}
			},
		},
		{
			name:           "missing cluster returns 400",
			frameworkID:    "pci-dss-4.0",
			body:           `{"format":"json"}`,
			expectedStatus: http.StatusBadRequest,
			checkBody: func(t *testing.T, body []byte) {
				if !strings.Contains(string(body), "cluster name is required") {
					t.Error("should return cluster required error")
				}
			},
		},
		{
			name:           "unsupported format returns 400",
			frameworkID:    "pci-dss-4.0",
			body:           `{"cluster":"test-cluster","format":"xlsx"}`,
			expectedStatus: http.StatusBadRequest,
			checkBody: func(t *testing.T, body []byte) {
				if !strings.Contains(string(body), "unsupported format") {
					t.Error("should return unsupported format error")
				}
			},
		},
		{
			name:           "invalid JSON body returns 400",
			frameworkID:    "pci-dss-4.0",
			body:           `{invalid`,
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost,
				"/api/compliance/frameworks/"+tt.frameworkID+"/report",
				bytes.NewBufferString(tt.body))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, -1)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != tt.expectedStatus {
				body, _ := io.ReadAll(resp.Body)
				t.Fatalf("expected status %d, got %d (body: %s)",
					tt.expectedStatus, resp.StatusCode, string(body))
			}

			if tt.checkBody != nil {
				body, err := io.ReadAll(resp.Body)
				if err != nil {
					t.Fatalf("failed to read body: %v", err)
				}
				tt.checkBody(t, body)
			}
		})
	}
}

func TestComplianceReportsHandler_ContentDisposition(t *testing.T) {
	app := fiber.New()
	handler := NewComplianceReportsHandler(nil)
	handler.RegisterRoutes(app.Group("/api/compliance/frameworks"))

	tests := []struct {
		name        string
		format      string
		expectExt   string
		expectCType string
	}{
		{"pdf download headers", "pdf", ".pdf", "application/pdf"},
		{"json download headers", "json", ".json", "application/json"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(map[string]string{
				"cluster": "prod",
				"format":  tt.format,
			})
			req := httptest.NewRequest(http.MethodPost,
				"/api/compliance/frameworks/pci-dss-4.0/report",
				bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, -1)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				t.Fatalf("expected 200, got %d", resp.StatusCode)
			}

			ct := resp.Header.Get("Content-Type")
			if ct != tt.expectCType {
				t.Errorf("expected Content-Type %s, got %s", tt.expectCType, ct)
			}

			cd := resp.Header.Get("Content-Disposition")
			if !strings.Contains(cd, "attachment") {
				t.Error("Content-Disposition should contain 'attachment'")
			}
			if !strings.Contains(cd, tt.expectExt) {
				t.Errorf("Content-Disposition should contain %s extension", tt.expectExt)
			}
			if !strings.Contains(cd, "pci-dss-4.0") {
				t.Error("filename should contain framework ID")
			}
		})
	}
}
