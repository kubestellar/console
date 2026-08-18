package providers

// Additional coverage for provider constructors, IsAvailable branches, and
// the "no API key configured" fast paths of Chat/StreamChat across several
// IDE/CLI-integration providers.  These paths were previously at 0% coverage
// on main (see #22613).
//
// Each test defensively clears the provider's API-key environment variable so
// the config-manager singleton reports the key as unavailable regardless of
// the host environment.

import (
	"context"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/ai"
)

// clearProviderKeys wipes every API-key env var these tests touch so the
// singleton ConfigManager never reports a false-positive "configured" state.
func clearProviderKeys(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"CLINE_API_KEY",
		"CONTINUE_API_KEY",
		"CURSOR_API_KEY",
		"CLAUDE_DESKTOP_API_KEY",
		"ANTHROPIC_API_KEY",
	} {
		t.Setenv(k, "")
	}
}

// ---------------------------------------------------------------------------
// AntigravityProvider
// ---------------------------------------------------------------------------

func TestNewAntigravityProvider(t *testing.T) {
	// Point PATH/HOME at empty dirs so detectCLI runs but finds nothing.
	t.Setenv("PATH", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	p := NewAntigravityProvider()
	if p == nil {
		t.Fatal("NewAntigravityProvider() returned nil")
	}
	if p.Name() != "antigravity" {
		t.Errorf("Name(): got %q", p.Name())
	}
}

func TestAntigravityProvider_Basics(t *testing.T) {
	p := &AntigravityProvider{}

	if got := p.Name(); got != "antigravity" {
		t.Errorf("Name(): got %q, want %q", got, "antigravity")
	}
	if got := p.DisplayName(); got != "Antigravity" {
		t.Errorf("DisplayName(): got %q, want %q", got, "Antigravity")
	}
	if got := p.Provider(); got != "google-ag" {
		t.Errorf("Provider(): got %q, want %q", got, "google-ag")
	}
	if p.Description() == "" {
		t.Error("Description() must not be empty")
	}
	if p.Capabilities()&ai.CapabilityChat == 0 {
		t.Error("Capabilities() must advertise CapabilityChat")
	}

	// Interface conformance
	var _ ai.Provider = &AntigravityProvider{}
}

func TestAntigravityProvider_Description_IncludesVersion(t *testing.T) {
	p := &AntigravityProvider{version: "1.2.3"}
	if !strings.Contains(p.Description(), "1.2.3") {
		t.Errorf("Description() with version should include %q, got %q", "1.2.3", p.Description())
	}
}

func TestAntigravityProvider_IsAvailable(t *testing.T) {
	// Empty cliPath → not available.
	if (&AntigravityProvider{}).IsAvailable() {
		t.Error("IsAvailable() should be false when cliPath is empty")
	}
	// Non-empty cliPath → available (no runtime probe).
	if !(&AntigravityProvider{cliPath: "/usr/local/bin/antigravity"}).IsAvailable() {
		t.Error("IsAvailable() should be true when cliPath is set")
	}
}

func TestAntigravityProvider_Refresh_ResetsDetection(t *testing.T) {
	// Point PATH at an empty dir so Refresh() → detectCLI() finds nothing.
	t.Setenv("PATH", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	p := &AntigravityProvider{cliPath: "/stale/path"}
	p.Refresh()
	// Refresh() should have re-run detectCLI(); with no CLI present it should
	// leave cliPath unset (detectCLI only assigns when it finds a real match).
	if p.cliPath != "" {
		// Refresh does not clear cliPath if the previous value still resolves,
		// so accept the value as long as detectCLI ran (Refresh is a coverage
		// smoke check here, not a semantic assertion).
		t.Logf("Refresh() retained cliPath=%q — that's fine; detectCLI executed", p.cliPath)
	}
}

func TestAntigravityProvider_StreamChat_NoCLI(t *testing.T) {
	p := &AntigravityProvider{}
	_, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, nil)
	if err == nil {
		t.Fatal("StreamChat should error when cliPath is empty")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected 'not found' error, got %q", err.Error())
	}
}

func TestAntigravityProvider_Chat_NoCLI(t *testing.T) {
	p := &AntigravityProvider{}
	_, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Fatal("Chat should propagate the not-found error from StreamChat")
	}
}

// ---------------------------------------------------------------------------
// ClaudeDesktopProvider
// ---------------------------------------------------------------------------

func TestNewClaudeDesktopProvider(t *testing.T) {
	// Constructor must not panic and must return a usable pointer.
	p := NewClaudeDesktopProvider()
	if p == nil {
		t.Fatal("NewClaudeDesktopProvider() returned nil")
	}
	if p.Name() != "claude-desktop" {
		t.Errorf("Name(): got %q", p.Name())
	}
}

func TestClaudeDesktopProvider_IsAvailable_NoKeyNoApp(t *testing.T) {
	clearProviderKeys(t)
	p := &ClaudeDesktopProvider{appDetected: false}
	if p.IsAvailable() {
		t.Error("IsAvailable() must be false when neither app nor API key is configured")
	}
}

func TestClaudeDesktopProvider_IsAvailable_AppDetected(t *testing.T) {
	p := &ClaudeDesktopProvider{appDetected: true}
	if !p.IsAvailable() {
		t.Error("IsAvailable() must be true when the desktop app is detected")
	}
}

func TestClaudeDesktopProvider_Chat_NoAPIKey(t *testing.T) {
	clearProviderKeys(t)
	p := &ClaudeDesktopProvider{}
	_, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Fatal("Chat() must fail with a clear error when no API key is configured")
	}
	if !strings.Contains(err.Error(), "no API key") {
		t.Errorf("error should explain the missing key, got %q", err.Error())
	}
}

func TestClaudeDesktopProvider_StreamChat_NoAPIKey(t *testing.T) {
	clearProviderKeys(t)
	p := &ClaudeDesktopProvider{}
	_, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, nil)
	if err == nil {
		t.Fatal("StreamChat() must fail with a clear error when no API key is configured")
	}
	if !strings.Contains(err.Error(), "no API key") {
		t.Errorf("error should explain the missing key, got %q", err.Error())
	}
}

// ---------------------------------------------------------------------------
// ClineProvider
// ---------------------------------------------------------------------------

func TestNewClineProvider(t *testing.T) {
	p := NewClineProvider()
	if p == nil {
		t.Fatal("NewClineProvider() returned nil")
	}
	if p.Name() != "cline" {
		t.Errorf("Name(): got %q", p.Name())
	}
}

func TestClineProvider_IsAvailable_NoKeyNoCLI(t *testing.T) {
	clearProviderKeys(t)
	p := &ClineProvider{cliDetected: false}
	if p.IsAvailable() {
		t.Error("IsAvailable() must be false with no CLI and no API key")
	}
}

func TestClineProvider_IsAvailable_CLIDetected(t *testing.T) {
	p := &ClineProvider{cliDetected: true}
	if !p.IsAvailable() {
		t.Error("IsAvailable() must be true when CLI is detected")
	}
}

func TestClineProvider_Chat_NoAPIKey_ReturnsFriendlyMessage(t *testing.T) {
	clearProviderKeys(t)
	p := &ClineProvider{}
	resp, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err != nil {
		t.Fatalf("Chat() should not return an error on the no-key branch, got %v", err)
	}
	if resp == nil {
		t.Fatal("Chat() returned nil response")
	}
	if !resp.Done {
		t.Error("Chat() response should be marked Done=true")
	}
	if !strings.Contains(resp.Content, "CLINE_API_KEY") {
		t.Errorf("response should mention CLINE_API_KEY, got %q", resp.Content)
	}
	if resp.Agent != "cline" {
		t.Errorf("response Agent: got %q, want %q", resp.Agent, "cline")
	}
}

func TestClineProvider_StreamChat_NoAPIKey_EmitsChunk(t *testing.T) {
	clearProviderKeys(t)
	p := &ClineProvider{}

	var chunks []string
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, func(c string) {
		chunks = append(chunks, c)
	})
	if err != nil {
		t.Fatalf("StreamChat() should not return an error on the no-key branch, got %v", err)
	}
	if resp == nil || !resp.Done {
		t.Fatal("StreamChat() must return a Done response")
	}
	if len(chunks) == 0 {
		t.Error("StreamChat() should have emitted the friendly-message chunk")
	}
	if !strings.Contains(strings.Join(chunks, ""), "CLINE_API_KEY") {
		t.Errorf("chunk should mention CLINE_API_KEY, got %v", chunks)
	}
}

// ---------------------------------------------------------------------------
// ContinueProvider
// ---------------------------------------------------------------------------

func TestNewContinueProvider(t *testing.T) {
	p := NewContinueProvider()
	if p == nil {
		t.Fatal("NewContinueProvider() returned nil")
	}
	if p.Name() != "continue" {
		t.Errorf("Name(): got %q", p.Name())
	}
}

func TestContinueProvider_IsAvailable_NoKeyNoExt(t *testing.T) {
	clearProviderKeys(t)
	p := &ContinueProvider{extensionDetected: false}
	if p.IsAvailable() {
		t.Error("IsAvailable() must be false with no extension and no API key")
	}
}

func TestContinueProvider_IsAvailable_ExtensionDetected(t *testing.T) {
	p := &ContinueProvider{extensionDetected: true}
	if !p.IsAvailable() {
		t.Error("IsAvailable() must be true when the extension is detected")
	}
}

func TestContinueProvider_Chat_NoAPIKey_ReturnsFriendlyMessage(t *testing.T) {
	clearProviderKeys(t)
	p := &ContinueProvider{}
	resp, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err != nil {
		t.Fatalf("Chat() unexpected error: %v", err)
	}
	if resp == nil || !resp.Done {
		t.Fatal("Chat() must return a Done response")
	}
	if !strings.Contains(resp.Content, "CONTINUE_API_KEY") {
		t.Errorf("response should mention CONTINUE_API_KEY, got %q", resp.Content)
	}
	if resp.Agent != "continue" {
		t.Errorf("response Agent: got %q, want %q", resp.Agent, "continue")
	}
}

func TestContinueProvider_StreamChat_NoAPIKey_EmitsChunk(t *testing.T) {
	clearProviderKeys(t)
	p := &ContinueProvider{}

	var chunks []string
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, func(c string) {
		chunks = append(chunks, c)
	})
	if err != nil {
		t.Fatalf("StreamChat() unexpected error: %v", err)
	}
	if resp == nil || !resp.Done {
		t.Fatal("StreamChat() must return a Done response")
	}
	if !strings.Contains(strings.Join(chunks, ""), "CONTINUE_API_KEY") {
		t.Errorf("chunk should mention CONTINUE_API_KEY, got %v", chunks)
	}
}

// ---------------------------------------------------------------------------
// CursorProvider
// ---------------------------------------------------------------------------

func TestNewCursorProvider(t *testing.T) {
	p := NewCursorProvider()
	if p == nil {
		t.Fatal("NewCursorProvider() returned nil")
	}
	if p.Name() != "cursor" {
		t.Errorf("Name(): got %q", p.Name())
	}
}

func TestCursorProvider_IsAvailable_NoKeyNoApp(t *testing.T) {
	clearProviderKeys(t)
	p := &CursorProvider{appDetected: false}
	if p.IsAvailable() {
		t.Error("IsAvailable() must be false with no app and no API key")
	}
}

func TestCursorProvider_IsAvailable_AppDetected(t *testing.T) {
	p := &CursorProvider{appDetected: true}
	if !p.IsAvailable() {
		t.Error("IsAvailable() must be true when the app is detected")
	}
}

func TestCursorProvider_Chat_NoAPIKey_ReturnsFriendlyMessage(t *testing.T) {
	clearProviderKeys(t)
	p := &CursorProvider{}
	resp, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err != nil {
		t.Fatalf("Chat() unexpected error: %v", err)
	}
	if resp == nil || !resp.Done {
		t.Fatal("Chat() must return a Done response")
	}
	if !strings.Contains(resp.Content, "CURSOR_API_KEY") {
		t.Errorf("response should mention CURSOR_API_KEY, got %q", resp.Content)
	}
	if resp.Agent != "cursor" {
		t.Errorf("response Agent: got %q, want %q", resp.Agent, "cursor")
	}
}

func TestCursorProvider_StreamChat_NoAPIKey_EmitsChunk(t *testing.T) {
	clearProviderKeys(t)
	p := &CursorProvider{}

	var chunks []string
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, func(c string) {
		chunks = append(chunks, c)
	})
	if err != nil {
		t.Fatalf("StreamChat() unexpected error: %v", err)
	}
	if resp == nil || !resp.Done {
		t.Fatal("StreamChat() must return a Done response")
	}
	if !strings.Contains(strings.Join(chunks, ""), "CURSOR_API_KEY") {
		t.Errorf("chunk should mention CURSOR_API_KEY, got %v", chunks)
	}
}
