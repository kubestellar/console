package agent

import (
	"bufio"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ClaudeInfo contains information about the local Claude Code installation
type ClaudeInfo struct {
	Installed  bool       `json:"installed"`
	Path       string     `json:"path,omitempty"`
	Version    string     `json:"version,omitempty"`
	TokenUsage TokenUsage `json:"tokenUsage"`
}

// TokenUsage contains token consumption statistics
type TokenUsage struct {
	Session   TokenCount `json:"session"`
	Today     TokenCount `json:"today"`
	ThisMonth TokenCount `json:"thisMonth"`
}

// TokenCount represents input/output token counts
type TokenCount struct {
	Input  int64 `json:"input"`
	Output int64 `json:"output"`
}

// ClaudeDetector detects and monitors the local Claude Code installation
type ClaudeDetector struct {
	claudeDir string
}

// NewClaudeDetector creates a new Claude detector
func NewClaudeDetector() *ClaudeDetector {
	home, _ := os.UserHomeDir()
	return &ClaudeDetector{
		claudeDir: filepath.Join(home, ".claude"),
	}
}

// Detect checks if Claude Code is installed and returns info
func (c *ClaudeDetector) Detect() ClaudeInfo {
	info := ClaudeInfo{
		Installed: false,
		TokenUsage: TokenUsage{
			Session:   TokenCount{},
			Today:     TokenCount{},
			ThisMonth: TokenCount{},
		},
	}

	// Check for claude CLI in PATH
	claudePath, err := exec.LookPath("claude")
	if err != nil {
		return info
	}

	info.Installed = true
	info.Path = claudePath

	// Get version
	cmd := exec.Command(claudePath, "--version")
	output, err := cmd.Output()
	if err == nil {
		info.Version = strings.TrimSpace(string(output))
	}

	// Read token usage from Claude's local files
	info.TokenUsage = c.readTokenUsage()

	return info
}

// StatsCache represents the structure of stats-cache.json
type StatsCache struct {
	ModelUsage map[string]ModelUsage `json:"modelUsage"`
}

// ModelUsage represents usage for a specific model
type ModelUsage struct {
	InputTokens  int64 `json:"inputTokens"`
	OutputTokens int64 `json:"outputTokens"`
}

// SessionMessage represents a message entry in session transcript
type SessionMessage struct {
	Type    string `json:"type"`
	Message struct {
		Usage *MessageUsage `json:"usage,omitempty"`
	} `json:"message,omitempty"`
	Timestamp string `json:"timestamp"` // ISO 8601 format "2026-01-14T00:55:36.001Z"
}

// MessageUsage represents per-message token usage
type MessageUsage struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
}

// readTokenUsage reads token usage from multiple sources
func (c *ClaudeDetector) readTokenUsage() TokenUsage {
	usage := TokenUsage{}

	// Read from stats-cache.json for cumulative totals (thisMonth)
	statsFile := filepath.Join(c.claudeDir, "stats-cache.json")
	if data, err := os.ReadFile(statsFile); err == nil {
		var stats StatsCache
		if json.Unmarshal(data, &stats) == nil {
			for _, model := range stats.ModelUsage {
				usage.ThisMonth.Input += model.InputTokens
				usage.ThisMonth.Output += model.OutputTokens
			}
		}
	}

	// Read today's usage from session transcripts
	todayStr := time.Now().Format("2006-01-02")
	usage.Today = c.readTodayUsage(todayStr)

	// Read current session usage from most recent session
	usage.Session = c.readCurrentSessionUsage()

	return usage
}

// readTodayUsage reads today's token usage from all session transcripts modified today
func (c *ClaudeDetector) readTodayUsage(todayStr string) TokenCount {
	count := TokenCount{}

	projectsDir := filepath.Join(c.claudeDir, "projects")
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return count
	}

	todayStart := time.Now().Truncate(24 * time.Hour)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		projectDir := filepath.Join(projectsDir, entry.Name())
		files, err := os.ReadDir(projectDir)
		if err != nil {
			continue
		}

		for _, f := range files {
			if !strings.HasSuffix(f.Name(), ".jsonl") {
				continue
			}
			info, err := f.Info()
			if err != nil {
				continue
			}
			// Only process files modified today
			if info.ModTime().Before(todayStart) {
				continue
			}

			sessionFile := filepath.Join(projectDir, f.Name())
			c.sumUsageFromTranscript(sessionFile, todayStr, &count)
		}
	}

	return count
}

// readCurrentSessionUsage reads usage from the most recently modified session
func (c *ClaudeDetector) readCurrentSessionUsage() TokenCount {
	count := TokenCount{}
	var latestFile string
	var latestTime time.Time

	projectsDir := filepath.Join(c.claudeDir, "projects")
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return count
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		projectDir := filepath.Join(projectsDir, entry.Name())
		files, err := os.ReadDir(projectDir)
		if err != nil {
			continue
		}

		for _, f := range files {
			if !strings.HasSuffix(f.Name(), ".jsonl") {
				continue
			}
			info, err := f.Info()
			if err != nil {
				continue
			}
			if info.ModTime().After(latestTime) {
				latestTime = info.ModTime()
				latestFile = filepath.Join(projectDir, f.Name())
			}
		}
	}

	if latestFile != "" {
		c.sumUsageFromTranscript(latestFile, "", &count)
	}

	return count
}

// sumUsageFromTranscript sums token usage from a session transcript file
func (c *ClaudeDetector) sumUsageFromTranscript(filePath, dateFilter string, count *TokenCount) {
	file, err := os.Open(filePath)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	// Handle large lines
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var msg SessionMessage
		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			continue
		}

		// Filter by date if specified (timestamp format: "2026-01-14T00:55:36.001Z")
		if dateFilter != "" && !strings.HasPrefix(msg.Timestamp, dateFilter) {
			continue
		}

		if msg.Message.Usage != nil {
			count.Input += msg.Message.Usage.InputTokens
			count.Output += msg.Message.Usage.OutputTokens
		}
	}
}

// IsInstalled returns true if Claude Code is installed
func (c *ClaudeDetector) IsInstalled() bool {
	_, err := exec.LookPath("claude")
	return err == nil
}
