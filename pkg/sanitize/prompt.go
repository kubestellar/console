// Package sanitize provides string sanitization utilities for prompt
// injection prevention and log injection prevention. These functions
// neutralize user-controlled input before it is interpolated into LLM
// prompts or structured log statements.
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

// logUnsafeCharsRe matches control characters (except tab which is harmless
// in logs), ANSI escape sequences, null bytes, and Unicode line/paragraph
// separators that could be exploited for log injection (CWE-117).
var logUnsafeCharsRe = regexp.MustCompile(`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x{2028}\x{2029}]|\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|.)`)

var logInjectionReplacer = strings.NewReplacer(
	"\n", "\u23ce",
	"\r", "\u23ce",
)

// LogString sanitizes user-controlled input before logging to prevent
// log injection attacks (CWE-117). It:
//   - Replaces newline/carriage-return with a visible placeholder (\u23ce)
//   - Strips ANSI escape sequences (terminal manipulation)
//   - Strips null bytes (C-based log aggregator truncation)
//   - Strips control characters (VT, FF, BS, BEL, DEL)
//   - Strips Unicode line/paragraph separators (U+2028, U+2029)
//
// Use this for any user-controlled value passed to log.Printf, slog.Info,
// zerolog, or other structured logging calls.
func LogString(input string) string {
	if input == "" {
		return ""
	}
	sanitized := logInjectionReplacer.Replace(input)
	sanitized = logUnsafeCharsRe.ReplaceAllString(sanitized, "")
	return sanitized
}

// LogStrings sanitizes a slice of user-controlled strings for logging.
// Each element is passed through LogString; the result is joined with commas.
func LogStrings(values []string) string {
	if len(values) == 0 {
		return ""
	}
	parts := make([]string, len(values))
	for i, v := range values {
		parts[i] = LogString(v)
	}
	return strings.Join(parts, ", ")
}
