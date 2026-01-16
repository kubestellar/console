package agent

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
)

// ClaudeInfo contains Claude Code installation and usage info
type ClaudeInfo struct {
	Installed  bool       `json:"installed"`
	Path       string     `json:"path,omitempty"`
	Version    string     `json:"version,omitempty"`
	TokenUsage TokenUsage `json:"tokenUsage"`
}

// TokenUsage tracks Claude API token consumption
type TokenUsage struct {
	Session   TokenCount `json:"session"`
	Today     TokenCount `json:"today"`
	ThisMonth TokenCount `json:"thisMonth"`
}

// TokenCount holds input/output token counts
type TokenCount struct {
	Input  int64 `json:"input"`
	Output int64 `json:"output"`
	Total  int64 `json:"total"`
}

// ClaudeDetector finds and monitors Claude Code
type ClaudeDetector struct {
	claudePath string
	configDir  string
}

// NewClaudeDetector creates a new Claude detector
func NewClaudeDetector() *ClaudeDetector {
	home, _ := os.UserHomeDir()
	return &ClaudeDetector{
		configDir: filepath.Join(home, ".claude"),
	}
}

// Detect finds Claude Code installation
func (c *ClaudeDetector) Detect() ClaudeInfo {
	info := ClaudeInfo{}

	// Check for claude CLI in PATH
	path, err := exec.LookPath("claude")
	if err == nil {
		info.Installed = true
		info.Path = path
		c.claudePath = path

		// Get version
		out, err := exec.Command(path, "--version").Output()
		if err == nil {
			info.Version = string(out)
		}
	}

	// Check for Claude config directory
	if _, err := os.Stat(c.configDir); err == nil {
		info.Installed = true
	}

	// Read token usage from Claude's local data
	info.TokenUsage = c.readTokenUsage()

	return info
}

// readTokenUsage reads token usage from Claude Code's local storage
func (c *ClaudeDetector) readTokenUsage() TokenUsage {
	usage := TokenUsage{}

	// Try reading from Claude's usage tracking file
	// Claude Code stores usage in ~/.claude/usage.json or similar
	usageFile := filepath.Join(c.configDir, "usage.json")
	data, err := os.ReadFile(usageFile)
	if err == nil {
		var stored struct {
			Session struct {
				InputTokens  int64 `json:"input_tokens"`
				OutputTokens int64 `json:"output_tokens"`
			} `json:"session"`
			Today struct {
				InputTokens  int64 `json:"input_tokens"`
				OutputTokens int64 `json:"output_tokens"`
			} `json:"today"`
			Month struct {
				InputTokens  int64 `json:"input_tokens"`
				OutputTokens int64 `json:"output_tokens"`
			} `json:"month"`
		}
		if json.Unmarshal(data, &stored) == nil {
			usage.Session = TokenCount{
				Input:  stored.Session.InputTokens,
				Output: stored.Session.OutputTokens,
				Total:  stored.Session.InputTokens + stored.Session.OutputTokens,
			}
			usage.Today = TokenCount{
				Input:  stored.Today.InputTokens,
				Output: stored.Today.OutputTokens,
				Total:  stored.Today.InputTokens + stored.Today.OutputTokens,
			}
			usage.ThisMonth = TokenCount{
				Input:  stored.Month.InputTokens,
				Output: stored.Month.OutputTokens,
				Total:  stored.Month.InputTokens + stored.Month.OutputTokens,
			}
		}
	}

	// Also try projects directory for per-project usage
	projectsDir := filepath.Join(c.configDir, "projects")
	if entries, err := os.ReadDir(projectsDir); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			statsFile := filepath.Join(projectsDir, entry.Name(), "stats.json")
			if data, err := os.ReadFile(statsFile); err == nil {
				var stats struct {
					TotalInputTokens  int64 `json:"totalInputTokens"`
					TotalOutputTokens int64 `json:"totalOutputTokens"`
				}
				if json.Unmarshal(data, &stats) == nil {
					usage.Session.Input += stats.TotalInputTokens
					usage.Session.Output += stats.TotalOutputTokens
					usage.Session.Total = usage.Session.Input + usage.Session.Output
				}
			}
		}
	}

	return usage
}

// IsAvailable returns true if Claude Code is installed
func (c *ClaudeDetector) IsAvailable() bool {
	info := c.Detect()
	return info.Installed
}
