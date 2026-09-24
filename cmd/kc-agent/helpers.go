package main

import (
	"io"
	"log/slog"
	"strings"
)

// parseAllowedOrigins returns the trimmed, non-empty entries of a
// comma-separated origins list. Extracted from main() so the parsing
// behaviour can be exercised in unit tests.
func parseAllowedOrigins(s string) []string {
	if s == "" {
		return nil
	}
	var out []string
	for _, o := range strings.Split(s, ",") {
		if trimmed := strings.TrimSpace(o); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// buildLogHandler returns the slog handler the agent installs at startup:
// a human-readable text handler at debug level when devMode is true, and a
// structured JSON handler at info level otherwise. Extracted from main() so
// the handler choice is unit-testable without invoking os.Exit.
func buildLogHandler(w io.Writer, devMode bool) slog.Handler {
	if devMode {
		return slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelDebug})
	}
	return slog.NewJSONHandler(w, &slog.HandlerOptions{Level: slog.LevelInfo})
}
