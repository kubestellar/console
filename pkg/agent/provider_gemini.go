package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const (
	geminiAPIBaseURL   = "https://generativelanguage.googleapis.com/v1beta/models"
	defaultGeminiModel = "gemini-2.0-flash"
)

// GeminiProvider implements AIProvider for Google Gemini
type GeminiProvider struct {
	apiKey  string
	model   string
	client  *http.Client
}

// NewGeminiProvider creates a new Gemini provider
func NewGeminiProvider() *GeminiProvider {
	cm := GetConfigManager()
	return &GeminiProvider{
		apiKey: cm.GetAPIKey("gemini"),
		model:  cm.GetModel("gemini", defaultGeminiModel),
		client: &http.Client{},
	}
}

func (g *GeminiProvider) Name() string        { return "gemini" }
func (g *GeminiProvider) DisplayName() string { return "Gemini (Google)" }
func (g *GeminiProvider) Provider() string    { return "google" }
func (g *GeminiProvider) Description() string {
	return "Google Gemini - fast and cost-effective for general tasks and analysis"
}

func (g *GeminiProvider) IsAvailable() bool {
	// Check dynamically in case key was added via settings
	// Also checks cached validity - returns false if key is known to be invalid
	return GetConfigManager().IsKeyAvailable("gemini")
}

// Chat sends a message and returns the complete response
func (g *GeminiProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if !g.IsAvailable() {
		return nil, fmt.Errorf("Gemini provider not configured - GOOGLE_API_KEY not set")
	}

	contents := g.buildContents(req)
	body := map[string]interface{}{
		"contents":         contents,
		"generationConfig": map[string]interface{}{
			"maxOutputTokens": 4096,
		},
	}

	// Add system instruction if provided
	systemPrompt := req.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = DefaultSystemPrompt
	}
	body["systemInstruction"] = map[string]interface{}{
		"parts": []map[string]string{
			{"text": systemPrompt},
		},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/%s:generateContent?key=%s", geminiAPIBaseURL, g.model, GetConfigManager().GetAPIKey("gemini"))
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result geminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	content := ""
	if len(result.Candidates) > 0 && len(result.Candidates[0].Content.Parts) > 0 {
		content = result.Candidates[0].Content.Parts[0].Text
	}

	var tokenUsage *ProviderTokenUsage
	if result.UsageMetadata != nil {
		tokenUsage = &ProviderTokenUsage{
			InputTokens:  result.UsageMetadata.PromptTokenCount,
			OutputTokens: result.UsageMetadata.CandidatesTokenCount,
			TotalTokens:  result.UsageMetadata.TotalTokenCount,
		}
	}

	return &ChatResponse{
		Content:    content,
		Agent:      g.Name(),
		TokenUsage: tokenUsage,
		Done:       true,
	}, nil
}

// StreamChat sends a message and streams the response
func (g *GeminiProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if !g.IsAvailable() {
		return nil, fmt.Errorf("Gemini provider not configured - GOOGLE_API_KEY not set")
	}

	contents := g.buildContents(req)
	body := map[string]interface{}{
		"contents":         contents,
		"generationConfig": map[string]interface{}{
			"maxOutputTokens": 4096,
		},
	}

	// Add system instruction
	systemPrompt := req.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = DefaultSystemPrompt
	}
	body["systemInstruction"] = map[string]interface{}{
		"parts": []map[string]string{
			{"text": systemPrompt},
		},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/%s:streamGenerateContent?key=%s&alt=sse", geminiAPIBaseURL, g.model, GetConfigManager().GetAPIKey("gemini"))
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var fullContent strings.Builder
	var usage ProviderTokenUsage

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "" {
			continue
		}

		var event geminiStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		// Handle content
		if len(event.Candidates) > 0 && len(event.Candidates[0].Content.Parts) > 0 {
			chunk := event.Candidates[0].Content.Parts[0].Text
			fullContent.WriteString(chunk)
			if onChunk != nil {
				onChunk(chunk)
			}
		}

		// Handle usage metadata
		if event.UsageMetadata != nil {
			usage.InputTokens = event.UsageMetadata.PromptTokenCount
			usage.OutputTokens = event.UsageMetadata.CandidatesTokenCount
			usage.TotalTokens = event.UsageMetadata.TotalTokenCount
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading stream: %w", err)
	}

	return &ChatResponse{
		Content:    fullContent.String(),
		Agent:      g.Name(),
		TokenUsage: &usage,
		Done:       true,
	}, nil
}

func (g *GeminiProvider) buildContents(req *ChatRequest) []map[string]interface{} {
	contents := make([]map[string]interface{}, 0)

	// Add history
	for _, msg := range req.History {
		if msg.Role == "system" {
			continue // System handled separately
		}
		role := msg.Role
		if role == "assistant" {
			role = "model" // Gemini uses "model" instead of "assistant"
		}
		contents = append(contents, map[string]interface{}{
			"role": role,
			"parts": []map[string]string{
				{"text": msg.Content},
			},
		})
	}

	// Add current prompt
	contents = append(contents, map[string]interface{}{
		"role": "user",
		"parts": []map[string]string{
			{"text": req.Prompt},
		},
	})

	return contents
}

// Gemini API response types
type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata *struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
		TotalTokenCount      int `json:"totalTokenCount"`
	} `json:"usageMetadata,omitempty"`
}

type geminiStreamEvent struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata *struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
		TotalTokenCount      int `json:"totalTokenCount"`
	} `json:"usageMetadata,omitempty"`
}
