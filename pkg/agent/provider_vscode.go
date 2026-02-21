package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// VSCodeProvider implements the AIProvider interface for VS Code
type VSCodeProvider struct {
	appDetected bool
}

func NewVSCodeProvider() *VSCodeProvider {
	p := &VSCodeProvider{}
	p.detectApp()
	return p
}

func (v *VSCodeProvider) detectApp() {
	if _, err := exec.LookPath("code"); err == nil {
		v.appDetected = true
		return
	}
	switch runtime.GOOS {
	case "darwin":
		if _, err := os.Stat("/Applications/Visual Studio Code.app"); err == nil {
			v.appDetected = true
		}
	case "windows":
		home, _ := os.UserHomeDir()
		if _, err := os.Stat(home + "\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"); err == nil {
			v.appDetected = true
		}
	case "linux":
		if _, err := os.Stat("/usr/bin/code"); err == nil {
			v.appDetected = true
		}
	}
}

func (v *VSCodeProvider) Name() string        { return "vscode" }
func (v *VSCodeProvider) DisplayName() string { return "VS Code" }
func (v *VSCodeProvider) Provider() string    { return "microsoft" }
func (v *VSCodeProvider) Description() string {
	return "Visual Studio Code by Microsoft - AI-powered code editor"
}
func (v *VSCodeProvider) IsAvailable() bool {
	return v.appDetected || GetConfigManager().IsKeyAvailable("vscode")
}
func (v *VSCodeProvider) Capabilities() ProviderCapability { return CapabilityChat }

func (v *VSCodeProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("vscode") {
		return &ChatResponse{Content: fmt.Sprintf("VS Code is detected but no API key is configured. Set VSCODE_API_KEY to enable chat."), Agent: v.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "vscode", "https://api.github.com/copilot/chat/completions", v.Name())
}

func (v *VSCodeProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("vscode") {
		msg := "VS Code is detected but no API key is configured. Set VSCODE_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ChatResponse{Content: msg, Agent: v.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "vscode", "https://api.github.com/copilot/chat/completions", v.Name(), onChunk)
}
