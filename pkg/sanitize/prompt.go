// Package sanitize provides string sanitization utilities for prompt
// injection prevention. These functions neutralize user-controlled input
// before it is interpolated into LLM prompts.
//
// Extracted from pkg/agent to break the pkg/api → pkg/agent coupling.
// Both packages can depend on this leaf package without creating a cycle.
package sanitize

import (
	"html"
	"regexp"
	"strings"
)

var promptUnsafeControlCharsRe = regexp.MustCompile(`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`)
var promptRoleMarkerRe = regexp.MustCompile(`(?i)\b(system|assistant|user|developer|tool)\s*:`)

var promptInjectionReplacer = strings.NewReplacer(
	"\n", " ",
	"\r", " ",
	"\t", " ",
	"```", "'''",
)

// PromptString neutralizes prompt-sensitive user-controlled input before it
// is interpolated into downstream LLM prompts. It:
//   - Replaces newlines, tabs, and backtick fences (prompt structure markers)
//   - Strips control characters
//   - HTML-escapes to prevent quote breakout
//   - Neutralizes role markers (e.g., "system:" → "system-")
//   - Collapses whitespace
func PromptString(input string) string {
	if input == "" {
		return ""
	}

	sanitized := promptInjectionReplacer.Replace(input)
	sanitized = promptUnsafeControlCharsRe.ReplaceAllString(sanitized, "")
	sanitized = html.EscapeString(sanitized)
	sanitized = promptRoleMarkerRe.ReplaceAllString(sanitized, "$1-")
	return strings.Join(strings.Fields(sanitized), " ")
}

// PromptStrings sanitizes a slice of strings, dropping empty results.
func PromptStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	sanitized := make([]string, 0, len(values))
	for _, value := range values {
		cleaned := PromptString(value)
		if cleaned != "" {
			sanitized = append(sanitized, cleaned)
		}
	}
	return sanitized
}
