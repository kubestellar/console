package providers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	defaultOllamaBaseURL  = "http://localhost:11434"
	providerHTTPTimeout   = 120 * time.Second
	defaultPromptTokenCap = 800
)

type OllamaProvider struct {
	BaseURL string
	client  *http.Client
}

func NewOllama(baseURL string) *OllamaProvider {
	if baseURL == "" {
		baseURL = defaultOllamaBaseURL
	}
	return &OllamaProvider{
		BaseURL: baseURL,
		client:  &http.Client{Timeout: providerHTTPTimeout},
	}
}

func (o *OllamaProvider) Name() string { return "ollama" }

func (o *OllamaProvider) Health(ctx context.Context) HealthResult {
	start := time.Now()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, o.BaseURL+"/api/tags", nil)
	resp, err := o.client.Do(req)
	latency := int(time.Since(start).Milliseconds())
	if err != nil {
		return HealthResult{Available: false, Error: err.Error(), LatencyMs: latency}
	}
	resp.Body.Close()
	return HealthResult{Available: resp.StatusCode == http.StatusOK, LatencyMs: latency}
}

func (o *OllamaProvider) Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	start := time.Now()
	
	// Just use the model that the user has access to if not explicitly set
	if req.Model == "" || req.Model == "llama3" {
		if tagsReq, err := http.NewRequestWithContext(ctx, http.MethodGet, o.BaseURL+"/api/tags", nil); err == nil {
			if tagsResp, err := o.client.Do(tagsReq); err == nil {
				defer tagsResp.Body.Close()
				var tags struct {
					Models []struct {
						Name string `json:"name"`
					} `json:"models"`
				}
				if err := json.NewDecoder(tagsResp.Body).Decode(&tags); err == nil && len(tags.Models) > 0 {
					// Check if requested model exists
					found := false
					if req.Model != "" {
						for _, m := range tags.Models {
							if m.Name == req.Model || strings.HasPrefix(m.Name, req.Model+":") {
								found = true
								req.Model = m.Name
								break
							}
						}
					}
					// Fallback to first available model
					if !found {
						req.Model = tags.Models[0].Name
					}
				}
			}
		}
	}

	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = defaultPromptTokenCap
	}
	payload := map[string]any{
		"model":    req.Model,
		"messages": req.Messages,
		"stream":   req.Stream && req.StreamCh != nil,
		"options": map[string]any{
			"temperature": req.Temperature,
			"num_predict": maxTokens,
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("ollama marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("ollama request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("ollama: unexpected status %d", resp.StatusCode)
	}

	if req.Stream && req.StreamCh != nil {
		type streamResp struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Done            bool   `json:"done"`
			PromptEvalCount int    `json:"prompt_eval_count"`
			EvalCount       int    `json:"eval_count"`
			Model           string `json:"model"`
		}
		reader := bufio.NewReader(resp.Body)
		var full strings.Builder
		last := streamResp{}
		for {
			line, readErr := reader.ReadBytes('\n')
			if len(bytes.TrimSpace(line)) > 0 {
				var chunk streamResp
				if unmarshalErr := json.Unmarshal(bytes.TrimSpace(line), &chunk); unmarshalErr == nil {
					last = chunk
					if chunk.Message.Content != "" {
						full.WriteString(chunk.Message.Content)
						req.StreamCh <- chunk.Message.Content
					}
					if chunk.Done {
						close(req.StreamCh)
						return &GenerateResponse{
							Content:      full.String(),
							TokensInput:  chunk.PromptEvalCount,
							TokensOutput: chunk.EvalCount,
							Model:        chunk.Model,
							Provider:     "ollama",
							DurationMs:   int(time.Since(start).Milliseconds()),
						}, nil
					}
				}
			}
			if readErr != nil {
				if readErr == io.EOF {
					close(req.StreamCh)
					return &GenerateResponse{
						Content:      full.String(),
						TokensInput:  last.PromptEvalCount,
						TokensOutput: last.EvalCount,
						Model:        last.Model,
						Provider:     "ollama",
						DurationMs:   int(time.Since(start).Milliseconds()),
					}, nil
				}
				close(req.StreamCh)
				return nil, fmt.Errorf("ollama stream read: %w", readErr)
			}
		}
	}

	var result struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		PromptEvalCount int    `json:"prompt_eval_count"`
		EvalCount       int    `json:"eval_count"`
		Model           string `json:"model"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("ollama decode: %w", err)
	}
	return &GenerateResponse{
		Content:      result.Message.Content,
		TokensInput:  result.PromptEvalCount,
		TokensOutput: result.EvalCount,
		Model:        result.Model,
		Provider:     "ollama",
		DurationMs:   int(time.Since(start).Milliseconds()),
	}, nil
}

func (o *OllamaProvider) SupportsStreaming() bool { return true }
