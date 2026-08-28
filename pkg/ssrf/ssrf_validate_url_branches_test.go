package ssrf

import (
	"strings"
	"testing"
)

// Regression guards for the two uncovered branches of ValidateURL in
// pkg/ssrf/ssrf.go (function-level coverage 85.7% because
// TestValidateURL's "not-a-url" case masks both the parse-error arm
// and the empty-host arm behind identical wantErr=true expectations,
// leaving the two distinct error messages untested). If a regression
// changed which branch was hit — for example, by silently swallowing
// a parse error and treating a malformed URL as an empty-host case —
// the existing suite would not detect it.

func TestValidateURL_ParseError_ControlChar(t *testing.T) {
	// A control character in the URL is rejected by url.Parse itself,
	// exercising the "invalid URL" arm before Hostname() is called.
	err := ValidateURL("http://\x7f/foo")
	if err == nil {
		t.Fatal("expected error for URL with control character")
	}
	if !strings.Contains(err.Error(), "ssrf: invalid URL") {
		t.Errorf("error = %q, want to contain 'ssrf: invalid URL'", err.Error())
	}
}

func TestValidateURL_ParseError_InvalidEscape(t *testing.T) {
	// Invalid percent-encoding also fails url.Parse. Guards against a
	// future change that would blanket-catch parse errors and return
	// a misleading "no host" message.
	err := ValidateURL("%%%%%%%")
	if err == nil {
		t.Fatal("expected error for malformed percent-encoding")
	}
	if !strings.Contains(err.Error(), "ssrf: invalid URL") {
		t.Errorf("error = %q, want to contain 'ssrf: invalid URL', got %q",
			err.Error(), err.Error())
	}
}

func TestValidateURL_EmptyHost_ParsesButNoHost(t *testing.T) {
	// Relative/opaque URLs like "not-a-url" parse cleanly but yield
	// an empty Hostname(), exercising the "URL %q has no host" arm.
	// The existing TestValidateURL case uses the same input under
	// wantErr=true, but does not check WHICH error message is
	// returned — so a regression that started rejecting these at
	// url.Parse instead would pass the existing test.
	err := ValidateURL("not-a-url")
	if err == nil {
		t.Fatal("expected error for URL with no host")
	}
	if !strings.Contains(err.Error(), "has no host") {
		t.Errorf("error = %q, want to contain 'has no host'", err.Error())
	}
}

func TestValidateURL_EmptyHost_SchemeOnly(t *testing.T) {
	// "http:" is a valid URL per RFC 3986 (opaque form) but has no
	// authority component, so Hostname() returns "". Confirms the
	// empty-host arm fires even for well-formed but authority-less
	// URLs.
	err := ValidateURL("http:")
	if err == nil {
		t.Fatal("expected error for scheme-only URL")
	}
	if !strings.Contains(err.Error(), "has no host") {
		t.Errorf("error = %q, want to contain 'has no host'", err.Error())
	}
}
