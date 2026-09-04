package providers

// Coverage for the four IDE-integration providers whose Chat/StreamChat/
// IsAvailable methods were previously at 0% (see coverage report on main
// bbf22c4). Each provider follows the same shape:
//
//   Chat/StreamChat: if !HasAPIKey(name) → return a *ai.ChatResponse whose
//                    Content is the fixed "…is detected but no API key is
//                    configured. Set <ENV> to enable chat." message, nil err.
//   IsAvailable:     appDetected || IsKeyAvailable(name)
//
// PR #23115 added metadata getter tests for these providers but left the
// no-key fallback and IsAvailable branches uncovered. These tests close
// that gap without touching production code.

import (
	"context"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/ai"
)

// clearIDEProviderKeys wipes every env var the IDE providers under test
// consult so the singleton ConfigManager cannot report a false-positive
// "configured" state inherited from the host environment.
func clearIDEProviderKeys(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"RAYCAST_API_KEY",
		"VSCODE_API_KEY",
		"CODEIUM_API_KEY", // Windsurf
		"ZED_API_KEY",
	} {
		t.Setenv(k, "")
	}
}

// ---------------------------------------------------------------------------
// RaycastProvider
// ---------------------------------------------------------------------------

func TestRaycastProvider_IsAvailable_NoKeyNoApp(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &RaycastProvider{appDetected: false}
	if p.IsAvailable() {
		t.Error("IsAvailable() must be false with no app and no API key")
	}
}

func TestRaycastProvider_IsAvailable_AppDetected(t *testing.T) {
	p := &RaycastProvider{appDetected: true}
	if !p.IsAvailable() {
		t.Error("IsAvailable() must be true when the Raycast app is detected")
	}
}

func TestRaycastProvider_Chat_NoAPIKey(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &RaycastProvider{}
	resp, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err != nil {
		t.Fatalf("Chat() with no key returned unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("Chat() with no key returned nil response")
	}
	if !strings.Contains(resp.Content, "RAYCAST_API_KEY") {
		t.Errorf("Content should mention the env var name, got %q", resp.Content)
	}
	if resp.Agent != "raycast" {
		t.Errorf("Agent = %q, want %q", resp.Agent, "raycast")
	}
	if !resp.Done {
		t.Error("Done should be true for the no-key fallback")
	}
}

func TestRaycastProvider_StreamChat_NoAPIKey(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &RaycastProvider{}
	var chunks []string
	onChunk := func(c string) { chunks = append(chunks, c) }
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, onChunk)
	if err != nil {
		t.Fatalf("StreamChat() with no key returned unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("StreamChat() with no key returned nil response")
	}
	if len(chunks) != 1 {
		t.Fatalf("expected exactly one chunk with the no-key fallback message, got %d", len(chunks))
	}
	if chunks[0] != resp.Content {
		t.Errorf("chunk %q must equal response content %q", chunks[0], resp.Content)
	}
	if !strings.Contains(resp.Content, "RAYCAST_API_KEY") {
		t.Errorf("Content should mention the env var name, got %q", resp.Content)
	}
	if !resp.Done {
		t.Error("Done should be true for the no-key fallback")
	}
}

func TestRaycastProvider_StreamChat_NoAPIKey_NilCallback(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &RaycastProvider{}
	// Guard the nil-onChunk branch of the fallback: the code must not panic
	// even when the caller passed nil for the streaming callback.
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, nil)
	if err != nil {
		t.Fatalf("StreamChat(nil) returned unexpected error: %v", err)
	}
	if resp == nil || resp.Content == "" {
		t.Fatal("StreamChat(nil) with no key should still return a filled fallback response")
	}
}

// ---------------------------------------------------------------------------
// VSCodeProvider
// ---------------------------------------------------------------------------

func TestVSCodeProvider_IsAvailable_NoKeyNoApp(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &VSCodeProvider{appDetected: false}
	if p.IsAvailable() {
		t.Error("IsAvailable() must be false with no app and no API key")
	}
}

func TestVSCodeProvider_IsAvailable_AppDetected(t *testing.T) {
	p := &VSCodeProvider{appDetected: true}
	if !p.IsAvailable() {
		t.Error("IsAvailable() must be true when VS Code is detected")
	}
}

func TestVSCodeProvider_Chat_NoAPIKey(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &VSCodeProvider{}
	resp, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err != nil {
		t.Fatalf("Chat() with no key returned unexpected error: %v", err)
	}
	if resp == nil || !strings.Contains(resp.Content, "VSCODE_API_KEY") {
		t.Errorf("Content should mention VSCODE_API_KEY, got %+v", resp)
	}
	if resp.Agent != "vscode" {
		t.Errorf("Agent = %q, want %q", resp.Agent, "vscode")
	}
	if !resp.Done {
		t.Error("Done should be true for the no-key fallback")
	}
}

func TestVSCodeProvider_StreamChat_NoAPIKey(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &VSCodeProvider{}
	var chunks []string
	onChunk := func(c string) { chunks = append(chunks, c) }
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, onChunk)
	if err != nil {
		t.Fatalf("StreamChat() with no key returned unexpected error: %v", err)
	}
	if len(chunks) != 1 || chunks[0] != resp.Content {
		t.Fatalf("expected single fallback chunk equal to response content, got chunks=%v resp=%q", chunks, resp.Content)
	}
	if !strings.Contains(resp.Content, "VSCODE_API_KEY") {
		t.Errorf("Content should mention VSCODE_API_KEY, got %q", resp.Content)
	}
}

func TestVSCodeProvider_StreamChat_NoAPIKey_NilCallback(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &VSCodeProvider{}
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, nil)
	if err != nil {
		t.Fatalf("StreamChat(nil) returned unexpected error: %v", err)
	}
	if resp == nil || resp.Content == "" {
		t.Fatal("StreamChat(nil) with no key should still return a filled fallback response")
	}
}

// ---------------------------------------------------------------------------
// WindsurfProvider
// ---------------------------------------------------------------------------

func TestWindsurfProvider_IsAvailable_NoKeyNoApp(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &WindsurfProvider{appDetected: false}
	if p.IsAvailable() {
		t.Error("IsAvailable() must be false with no app and no API key")
	}
}

func TestWindsurfProvider_IsAvailable_AppDetected(t *testing.T) {
	p := &WindsurfProvider{appDetected: true}
	if !p.IsAvailable() {
		t.Error("IsAvailable() must be true when Windsurf is detected")
	}
}

func TestWindsurfProvider_Chat_NoAPIKey(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &WindsurfProvider{}
	resp, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err != nil {
		t.Fatalf("Chat() with no key returned unexpected error: %v", err)
	}
	if resp == nil || !strings.Contains(resp.Content, "CODEIUM_API_KEY") {
		t.Errorf("Content should mention CODEIUM_API_KEY (Windsurf's env var), got %+v", resp)
	}
	if resp.Agent != "windsurf" {
		t.Errorf("Agent = %q, want %q", resp.Agent, "windsurf")
	}
	if !resp.Done {
		t.Error("Done should be true for the no-key fallback")
	}
}

func TestWindsurfProvider_StreamChat_NoAPIKey(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &WindsurfProvider{}
	var chunks []string
	onChunk := func(c string) { chunks = append(chunks, c) }
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, onChunk)
	if err != nil {
		t.Fatalf("StreamChat() with no key returned unexpected error: %v", err)
	}
	if len(chunks) != 1 || chunks[0] != resp.Content {
		t.Fatalf("expected single fallback chunk equal to response content, got chunks=%v resp=%q", chunks, resp.Content)
	}
	if !strings.Contains(resp.Content, "CODEIUM_API_KEY") {
		t.Errorf("Content should mention CODEIUM_API_KEY, got %q", resp.Content)
	}
}

func TestWindsurfProvider_StreamChat_NoAPIKey_NilCallback(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &WindsurfProvider{}
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, nil)
	if err != nil {
		t.Fatalf("StreamChat(nil) returned unexpected error: %v", err)
	}
	if resp == nil || resp.Content == "" {
		t.Fatal("StreamChat(nil) with no key should still return a filled fallback response")
	}
}

// ---------------------------------------------------------------------------
// ZedProvider
// ---------------------------------------------------------------------------

func TestZedProvider_IsAvailable_NoKeyNoApp(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &ZedProvider{appDetected: false}
	if p.IsAvailable() {
		t.Error("IsAvailable() must be false with no app and no API key")
	}
}

func TestZedProvider_IsAvailable_AppDetected(t *testing.T) {
	p := &ZedProvider{appDetected: true}
	if !p.IsAvailable() {
		t.Error("IsAvailable() must be true when Zed is detected")
	}
}

func TestZedProvider_Chat_NoAPIKey(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &ZedProvider{}
	resp, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err != nil {
		t.Fatalf("Chat() with no key returned unexpected error: %v", err)
	}
	if resp == nil || !strings.Contains(resp.Content, "ZED_API_KEY") {
		t.Errorf("Content should mention ZED_API_KEY, got %+v", resp)
	}
	if resp.Agent != "zed" {
		t.Errorf("Agent = %q, want %q", resp.Agent, "zed")
	}
	if !resp.Done {
		t.Error("Done should be true for the no-key fallback")
	}
}

func TestZedProvider_StreamChat_NoAPIKey(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &ZedProvider{}
	var chunks []string
	onChunk := func(c string) { chunks = append(chunks, c) }
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, onChunk)
	if err != nil {
		t.Fatalf("StreamChat() with no key returned unexpected error: %v", err)
	}
	if len(chunks) != 1 || chunks[0] != resp.Content {
		t.Fatalf("expected single fallback chunk equal to response content, got chunks=%v resp=%q", chunks, resp.Content)
	}
	if !strings.Contains(resp.Content, "ZED_API_KEY") {
		t.Errorf("Content should mention ZED_API_KEY, got %q", resp.Content)
	}
}

func TestZedProvider_StreamChat_NoAPIKey_NilCallback(t *testing.T) {
	clearIDEProviderKeys(t)
	p := &ZedProvider{}
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, nil)
	if err != nil {
		t.Fatalf("StreamChat(nil) returned unexpected error: %v", err)
	}
	if resp == nil || resp.Content == "" {
		t.Fatal("StreamChat(nil) with no key should still return a filled fallback response")
	}
}
