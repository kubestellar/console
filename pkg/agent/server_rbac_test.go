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

// TestHandleServiceAccounts_CORSMethodsHeader verifies the audit fix for
// #8201 — the /serviceaccounts handler now advertises GET/POST/DELETE on the
// preflight response, so cross-origin POST/DELETE requests aren't rejected by
// the browser. Before the audit, every handler that fell through to the
// default "GET, OPTIONS" had this bug; this test pins the fix for one of the
// handlers Copilot specifically called out.
func TestHandleServiceAccounts_CORSMethodsHeader(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"http://localhost:3000"},
	}

	req := httptest.NewRequest("OPTIONS", "/serviceaccounts", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	s.handleServiceAccountsHTTP(w, req)

	methods := w.Header().Get("Access-Control-Allow-Methods")
	for _, want := range []string{"GET", "POST", "DELETE", "OPTIONS"} {
		if !strings.Contains(methods, want) {
			t.Errorf("expected Access-Control-Allow-Methods to include %q, got %q", want, methods)
		}
	}
}
