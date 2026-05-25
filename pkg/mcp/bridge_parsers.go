package mcp

import (
	"encoding/json"
	"fmt"
)

// parseClustersResult parses a CallToolResult into a slice of ClusterInfo.
func (b *Bridge) parseClustersResult(result *CallToolResult) ([]ClusterInfo, error) {
	if result.IsError {
		if len(result.Content) == 0 {
			return nil, fmt.Errorf("tool returned error with empty content")
		}
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	clusters := make([]ClusterInfo, 0)
	parsed := false
	for _, content := range result.Content {
		if content.Type == "text" {
			parsed = true
			if err := json.Unmarshal([]byte(content.Text), &clusters); err != nil {
				return nil, fmt.Errorf("failed to parse clusters response: %w", err)
			}
		}
	}
	if !parsed || len(clusters) == 0 {
		return nil, fmt.Errorf("tool returned no parseable text content")
	}
	return clusters, nil
}

func (b *Bridge) parseClustersFromText(text string) []ClusterInfo {
	// Fallback parser for human-readable output
	// This is a simplified parser - in production you'd want proper parsing
	return []ClusterInfo{}
}

func (b *Bridge) parseHealthResult(result *CallToolResult) (*ClusterHealth, error) {
	if result.IsError {
		if len(result.Content) == 0 {
			return nil, fmt.Errorf("tool returned error with empty content")
		}
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	var health ClusterHealth
	parsed := false
	for _, content := range result.Content {
		if content.Type == "text" {
			parsed = true
			if err := json.Unmarshal([]byte(content.Text), &health); err != nil {
				return nil, fmt.Errorf("failed to parse health response: %w", err)
			}
		}
	}
	if !parsed {
		return nil, fmt.Errorf("tool returned no parseable text content")
	}
	return &health, nil
}

func (b *Bridge) parsePodsResult(result *CallToolResult) ([]PodInfo, error) {
	if result.IsError {
		if len(result.Content) == 0 {
			return nil, fmt.Errorf("tool returned error with empty content")
		}
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	pods := make([]PodInfo, 0)
	parsed := false
	for _, content := range result.Content {
		if content.Type == "text" {
			parsed = true
			if err := json.Unmarshal([]byte(content.Text), &pods); err != nil {
				return nil, fmt.Errorf("failed to parse pods response: %w", err)
			}
		}
	}
	if !parsed || len(pods) == 0 {
		return nil, fmt.Errorf("tool returned no parseable text content")
	}
	return pods, nil
}

func (b *Bridge) parsePodIssuesResult(result *CallToolResult) ([]PodIssue, error) {
	if result.IsError {
		if len(result.Content) == 0 {
			return nil, fmt.Errorf("tool returned error with empty content")
		}
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	issues := make([]PodIssue, 0)
	parsed := false
	for _, content := range result.Content {
		if content.Type == "text" {
			parsed = true
			if err := json.Unmarshal([]byte(content.Text), &issues); err != nil {
				return nil, fmt.Errorf("failed to parse pod issues response: %w", err)
			}
		}
	}
	if !parsed || len(issues) == 0 {
		return nil, fmt.Errorf("tool returned no parseable text content")
	}
	return issues, nil
}

func (b *Bridge) parseEventsResult(result *CallToolResult) ([]Event, error) {
	if result.IsError {
		if len(result.Content) == 0 {
			return nil, fmt.Errorf("tool returned error with empty content")
		}
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	events := make([]Event, 0)
	parsed := false
	for _, content := range result.Content {
		if content.Type == "text" {
			parsed = true
			if err := json.Unmarshal([]byte(content.Text), &events); err != nil {
				return nil, fmt.Errorf("failed to parse events response: %w", err)
			}
		}
	}
	if !parsed || len(events) == 0 {
		return nil, fmt.Errorf("tool returned no parseable text content")
	}
	return events, nil
}
