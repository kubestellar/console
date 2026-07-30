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

var logInjectionReplacer = strings.NewReplacer(
	"\n", "⏎",
	"\r", "⏎",
	"\u2028", "⏎", // Unicode LINE SEPARATOR
	"\u2029", "⏎", // Unicode PARAGRAPH SEPARATOR
	"\x00", "",    // null byte — stripped rather than replaced
)

// ansiEscapeRe matches ANSI/VT100 terminal escape sequences that can forge
// log entries or manipulate terminal display. Covers:
//   - CSI sequences:  ESC [ <params> <final-byte>
//   - OSC sequences:  ESC ] <text> BEL
//   - Two-char Fe/Fs: ESC <byte in 0x40–0x5F>
var ansiEscapeRe = regexp.MustCompile(`\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07|[@-_])`)

// logC0Re matches C0 control characters and DEL that are not already handled
// by logInjectionReplacer (which covers \n, \r, \x00) or ansiEscapeRe (ESC \x1b).
// The range deliberately excludes \x00 (null, handled by replacer), \x09 (tab,
// safe to pass through), \x0a (\n), \x0d (\r), and \x1b (ESC).
// Stripping these prevents terminal-control injection via backspace, bell, etc.
var logC0Re = regexp.MustCompile(`[\x01-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]`)

// LogString sanitizes user-controlled input before logging to prevent
// log injection attacks (CWE-117). It:
//   - Strips ANSI/VT100 terminal escape sequences (cursor movement, color, OSC)
//   - Strips C0 control characters and DEL (null, backspace, bell, etc.)
//   - Replaces ASCII newlines, carriage-returns, and Unicode line/paragraph
//     separators (U+2028/U+2029) with a visible placeholder (⏎)
//
// Use this for any user-controlled value passed to log.Printf, slog.Info,
// zerolog, or other structured logging calls.
func LogString(input string) string {
	if input == "" {
		return ""
	}
	s := ansiEscapeRe.ReplaceAllString(input, "")
	s = logC0Re.ReplaceAllString(s, "")
	return logInjectionReplacer.Replace(s)
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
