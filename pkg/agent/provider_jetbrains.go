package agent

import (
	"context"
	"fmt"
	"os"
	"runtime"
)

// JetBrainsProvider implements the AIProvider interface for JetBrains IDEs
type JetBrainsProvider struct {
	appDetected bool
	ideName     string
}

func NewJetBrainsProvider() *JetBrainsProvider {
	p := &JetBrainsProvider{}
	p.detectApp()
	return p
}

func (j *JetBrainsProvider) detectApp() {
	switch runtime.GOOS {
	case "darwin":
		ides := map[string]string{
			"/Applications/IntelliJ IDEA.app":          "IntelliJ IDEA",
			"/Applications/IntelliJ IDEA CE.app":       "IntelliJ IDEA CE",
			"/Applications/GoLand.app":                 "GoLand",
			"/Applications/PyCharm.app":                "PyCharm",
			"/Applications/PyCharm CE.app":             "PyCharm CE",
			"/Applications/WebStorm.app":               "WebStorm",
			"/Applications/PhpStorm.app":               "PhpStorm",
			"/Applications/CLion.app":                  "CLion",
			"/Applications/Rider.app":                  "Rider",
			"/Applications/RustRover.app":              "RustRover",
		}
		for path, name := range ides {
			if _, err := os.Stat(path); err == nil {
				j.appDetected = true
				j.ideName = name
				return
			}
		}
	case "linux":
		paths := []string{
			"/snap/intellij-idea-ultimate/current",
			"/snap/intellij-idea-community/current",
			"/snap/goland/current",
			"/snap/pycharm-professional/current",
			"/snap/pycharm-community/current",
		}
		for _, p := range paths {
			if _, err := os.Stat(p); err == nil {
				j.appDetected = true
				return
			}
		}
	}
}

func (j *JetBrainsProvider) Name() string        { return "jetbrains" }
func (j *JetBrainsProvider) DisplayName() string { return "JetBrains IDEs" }
func (j *JetBrainsProvider) Provider() string    { return "jetbrains" }
func (j *JetBrainsProvider) Description() string {
	if j.ideName != "" {
		return fmt.Sprintf("JetBrains %s - AI-assisted IDE", j.ideName)
	}
	return "JetBrains IDEs - AI-assisted development environment"
}
func (j *JetBrainsProvider) IsAvailable() bool {
	return j.appDetected || GetConfigManager().IsKeyAvailable("jetbrains")
}
func (j *JetBrainsProvider) Capabilities() ProviderCapability { return CapabilityChat }

func (j *JetBrainsProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("jetbrains") {
		return &ChatResponse{Content: fmt.Sprintf("JetBrains IDE is detected but no API key is configured. Set JETBRAINS_API_KEY to enable chat."), Agent: j.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "jetbrains", "https://api.jetbrains.ai/v1/chat/completions", j.Name())
}

func (j *JetBrainsProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("jetbrains") {
		msg := "JetBrains IDE is detected but no API key is configured. Set JETBRAINS_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ChatResponse{Content: msg, Agent: j.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "jetbrains", "https://api.jetbrains.ai/v1/chat/completions", j.Name(), onChunk)
}
