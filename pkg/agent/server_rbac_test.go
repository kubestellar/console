package agent

import (
	"net/http/httptest"
	"strings"
	"testing"
)

// TestHandleCanIHTTP_CORSMethodsHeader verifies the POST-specific
// Access-Control-Allow-Methods override runs, so the browser preflight
// advertises POST and not the default "GET, OPTIONS" (#8188).
func TestHandleCanIHTTP_CORSMethodsHeader(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"http://localhost:3000"},
	}

	req := httptest.NewRequest("OPTIONS", "/rbac/can-i", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	s.handleCanIHTTP(w, req)

	methods := w.Header().Get("Access-Control-Allow-Methods")
	if !strings.Contains(methods, "POST") {
		t.Errorf("expected Access-Control-Allow-Methods to include POST, got %q", methods)
	}
}

// TestSetCORSHeaders_DefaultsToGET verifies that back-compat callers that
// pass no explicit methods still get the historical "GET, OPTIONS" value.
func TestSetCORSHeaders_DefaultsToGET(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"http://localhost:3000"},
	}

	req := httptest.NewRequest("OPTIONS", "/anything", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	s.setCORSHeaders(w, req)

	methods := w.Header().Get("Access-Control-Allow-Methods")
	if methods != defaultCORSAllowedMethods {
		t.Errorf("expected %q, got %q", defaultCORSAllowedMethods, methods)
	}
}

// TestSetCORSHeaders_ExplicitMethodsJoined verifies that passing an explicit
// method list produces a comma-separated Access-Control-Allow-Methods header.
func TestSetCORSHeaders_ExplicitMethodsJoined(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"http://localhost:3000"},
	}

	req := httptest.NewRequest("OPTIONS", "/anything", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	s.setCORSHeaders(w, req, "POST", "OPTIONS")

	methods := w.Header().Get("Access-Control-Allow-Methods")
	if methods != "POST, OPTIONS" {
		t.Errorf("expected %q, got %q", "POST, OPTIONS", methods)
	}
}
