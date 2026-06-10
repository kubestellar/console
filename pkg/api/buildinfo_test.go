package api

import (
	"os"
	"testing"
)

// ---------- normalizeKCAgentBaseURL ----------

func TestNormalizeKCAgentBaseURL_Empty(t *testing.T) {
	got := normalizeKCAgentBaseURL("")
	if got != defaultKCAgentBaseURL {
		t.Errorf("expected default %q, got %q", defaultKCAgentBaseURL, got)
	}
}

func TestNormalizeKCAgentBaseURL_WhitespaceOnly(t *testing.T) {
	got := normalizeKCAgentBaseURL("   ")
	if got != defaultKCAgentBaseURL {
		t.Errorf("expected default %q for whitespace, got %q", defaultKCAgentBaseURL, got)
	}
}

func TestNormalizeKCAgentBaseURL_TrailingSlashStripped(t *testing.T) {
	got := normalizeKCAgentBaseURL("http://127.0.0.1:8585/")
	if got != "http://127.0.0.1:8585" {
		t.Errorf("expected trailing slash stripped, got %q", got)
	}
}

func TestNormalizeKCAgentBaseURL_MultipleTrailingSlashes(t *testing.T) {
	got := normalizeKCAgentBaseURL("http://127.0.0.1:8585///")
	if got != "http://127.0.0.1:8585" {
		t.Errorf("expected multiple trailing slashes stripped, got %q", got)
	}
}

func TestNormalizeKCAgentBaseURL_CleanURL(t *testing.T) {
	got := normalizeKCAgentBaseURL("http://10.0.0.1:9090")
	if got != "http://10.0.0.1:9090" {
		t.Errorf("expected unchanged clean URL, got %q", got)
	}
}

func TestNormalizeKCAgentBaseURL_FromEnv(t *testing.T) {
	t.Setenv(kcAgentURLEnvVar, "http://agent.svc:8585/")
	// Re-run the normalizer logic directly (init is already done; test the function)
	got := normalizeKCAgentBaseURL(os.Getenv(kcAgentURLEnvVar))
	if got != "http://agent.svc:8585" {
		t.Errorf("expected trailing slash stripped from env value, got %q", got)
	}
}

// ---------- kcAgentWebSocketBaseURL ----------

func TestKCAgentWebSocketBaseURL_HTTPtoWS(t *testing.T) {
	got := kcAgentWebSocketBaseURL("http://127.0.0.1:8585")
	if got != "ws://127.0.0.1:8585" {
		t.Errorf("expected 'ws://127.0.0.1:8585', got %q", got)
	}
}

func TestKCAgentWebSocketBaseURL_HTTPStoWSS(t *testing.T) {
	got := kcAgentWebSocketBaseURL("https://agent.example.com:443")
	if got != "wss://agent.example.com:443" {
		t.Errorf("expected 'wss://agent.example.com:443', got %q", got)
	}
}

func TestKCAgentWebSocketBaseURL_TrailingSlashStripped(t *testing.T) {
	got := kcAgentWebSocketBaseURL("http://127.0.0.1:8585/")
	if got != "ws://127.0.0.1:8585" {
		t.Errorf("expected trailing slash stripped, got %q", got)
	}
}

func TestKCAgentWebSocketBaseURL_InvalidURL(t *testing.T) {
	got := kcAgentWebSocketBaseURL("://bad-url")
	if got != "" {
		t.Errorf("expected empty string for invalid URL, got %q", got)
	}
}

func TestKCAgentWebSocketBaseURL_UnknownSchemePreserved(t *testing.T) {
	got := kcAgentWebSocketBaseURL("ws://already.ws:9090")
	// ws:// scheme is neither "http" nor "https", so it should be preserved as-is
	if got != "ws://already.ws:9090" {
		t.Errorf("expected unchanged 'ws://' scheme, got %q", got)
	}
}

// ---------- getProjectDashboards ----------

func TestGetProjectDashboards_KnownProject(t *testing.T) {
	got := getProjectDashboards("kubestellar")
	if len(got) == 0 {
		t.Error("expected non-empty dashboard list for 'kubestellar'")
	}
	// "dashboard" should always be in the kubestellar preset
	found := false
	for _, d := range got {
		if d == "dashboard" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected 'dashboard' in kubestellar preset, got %v", got)
	}
}

func TestGetProjectDashboards_UnknownProjectReturnsNil(t *testing.T) {
	if got := getProjectDashboards("nonexistent-project"); got != nil {
		t.Errorf("expected nil for unknown project, got %v", got)
	}
}

func TestGetProjectDashboards_EmptyStringReturnsNil(t *testing.T) {
	if got := getProjectDashboards(""); got != nil {
		t.Errorf("expected nil for empty project, got %v", got)
	}
}

// ---------- isProjectEnabled ----------

func TestIsProjectEnabled_Wildcard(t *testing.T) {
	if !isProjectEnabled("kubestellar", "*") {
		t.Error("expected true for wildcard project tag")
	}
}

func TestIsProjectEnabled_Match(t *testing.T) {
	if !isProjectEnabled("kubestellar", "kubestellar") {
		t.Error("expected true when project matches active project")
	}
}

func TestIsProjectEnabled_NoMatch(t *testing.T) {
	if isProjectEnabled("kubestellar", "other") {
		t.Error("expected false when project does not match active project")
	}
}

func TestIsProjectEnabled_EmptyActiveProject(t *testing.T) {
	if isProjectEnabled("", "kubestellar") {
		t.Error("expected false when active project is empty and tag is not wildcard")
	}
}

func TestIsProjectEnabled_BothEmpty(t *testing.T) {
	if !isProjectEnabled("", "") {
		t.Error("expected true when both active and tag are empty (exact match)")
	}
}
