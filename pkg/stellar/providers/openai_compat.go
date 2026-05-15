package providers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const openAIChatCompletionsPath = "/chat/completions"

var ProviderDefaults = map[string]struct {
	BaseURL      string
	DefaultModel string
}{
	"openai":         {"https://api.openai.com/v1", "gpt-4o"},
	"anthropic":      {"https://api.anthropic.com/v1", "claude-sonnet-4-20250514"},
	"groq":           {"https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"},
	"openrouter":     {"https://openrouter.ai/api/v1", "meta-llama/llama-3-70b-instruct"},
	"together":       {"https://api.together.xyz/v1", "meta-llama/Llama-3-70b-chat-hf"},
	"llamacpp":       {"", ""},
	"lm-studio":      {"http://127.0.0.1:1234/v1", ""},
	"localai":        {"", ""},
	"vllm":           {"", ""},
	"rhaiis":         {"", ""},
	"ramalama":       {"", ""},
	"claude-desktop": {"", ""},
	"google-ag":      {"", ""},
	"goose":          {"", ""},
	"codex":          {"", ""},
	"gemini":         {"", ""},
	"bob":            {"", ""},
	"claude-code":    {"", ""},
}

type OpenAICompatProvider struct {
	BaseURL string
	APIKey  string
	name    string
	client  *http.Client
}

func NewOpenAICompat(baseURL, apiKey, name string) *OpenAICompatProvider {
	return &OpenAICompatProvider{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		name:    name,
		client:  &http.Client{Timeout: providerHTTPTimeout},
	}
}

func (o *OpenAICompatProvider) Name() string { return o.name }

func (o *OpenAICompatProvider) Health(ctx context.Context) HealthResult {
	if o.APIKey == "" {
		return HealthResult{Available: false, Error: "no API key configured"}
	}
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, o.BaseURL+"/models", nil)
	if err != nil {
		return HealthResult{Available: false, LatencyMs: int(time.Since(start).Milliseconds()), Error: err.Error()}
	}
	req.Header.Set("Authorization", "Bearer "+o.APIKey)
	resp, err := o.client.Do(req)
	latency := int(time.Since(start).Milliseconds())
	if err != nil {
		return HealthResult{Available: false, LatencyMs: latency, Error: err.Error()}
	}
	resp.Body.Close()
	return HealthResult{Available: resp.StatusCode == http.StatusOK, LatencyMs: latency}
}

func (o *OpenAICompatProvider) SupportsStreaming() bool { return true }

func (o *OpenAICompatProvider) Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	start := time.Now()

	// Just use the model that the user has access to if not explicitly set or if it's a default that might not exist locally
	if req.Model == "" || req.Model == "llama3" || req.Model == "gpt-4o" {
		if modelsReq, err := http.NewRequestWithContext(ctx, http.MethodGet, o.BaseURL+"/models", nil); err == nil {
			if o.APIKey != "" {
				modelsReq.Header.Set("Authorization", "Bearer "+o.APIKey)
			}
			if modelsResp, err := o.client.Do(modelsReq); err == nil {
				defer modelsResp.Body.Close()
				var models struct {
					Data []struct {
						ID string `json:"id"`
					} `json:"data"`
				}
				if err := json.NewDecoder(modelsResp.Body).Decode(&models); err == nil && len(models.Data) > 0 {
					found := false
					if req.Model != "" {
						for _, m := range models.Data {
							if m.ID == req.Model {
								found = true
								break
							}
						}
					}
					// Fallback to first available model
					if !found {
						req.Model = models.Data[0].ID
					}
				}
			}
		}
	}

	payload := map[string]any{
		"model":       req.Model,
		"messages":    req.Messages,
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
		"stream":      req.Stream && req.StreamCh != nil,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("%s marshal: %w", o.name, err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+openAIChatCompletionsPath, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+o.APIKey)

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("%s request: %w", o.name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("%s: unexpected status %d", o.name, resp.StatusCode)
	}

	if req.Stream && req.StreamCh != nil {
		var full strings.Builder
		reader := bufio.NewScanner(resp.Body)
		for reader.Scan() {
			line := strings.TrimSpace(reader.Text())
			if line == "" || !strings.HasPrefix(line, "data: ") {
				continue
			}
			payload := strings.TrimPrefix(line, "data: ")
			if payload == "[DONE]" {
				close(req.StreamCh)
				return &GenerateResponse{
					Content:    full.String(),
					Model:      req.Model,
					Provider:   o.name,
					DurationMs: int(time.Since(start).Milliseconds()),
				}, nil
			}
			var chunk struct {
				Choices []struct {
					Delta struct {
						Content string `json:"content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
				continue
			}
			if len(chunk.Choices) == 0 {
				continue
			}
			token := chunk.Choices[0].Delta.Content
			if token == "" {
				continue
			}
			full.WriteString(token)
			req.StreamCh <- token
		}
		close(req.StreamCh)
		if err := reader.Err(); err != nil {
			return nil, err
		}
		return &GenerateResponse{
			Content:    full.String(),
			Model:      req.Model,
			Provider:   o.name,
			DurationMs: int(time.Since(start).Milliseconds()),
		}, nil
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
		Model string `json:"model"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("%s decode: %w", o.name, err)
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("%s: no choices in response", o.name)
	}

	return &GenerateResponse{
		Content:      result.Choices[0].Message.Content,
		TokensInput:  result.Usage.PromptTokens,
		TokensOutput: result.Usage.CompletionTokens,
		Model:        result.Model,
		Provider:     o.name,
		DurationMs:   int(time.Since(start).Milliseconds()),
	}, nil
}
