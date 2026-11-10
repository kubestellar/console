package observer

import (
	"os"
	"time"
)

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// isQuietWindow returns true if the current time falls within the configured
// quiet window (STELLAR_QUIET_START / STELLAR_QUIET_END env vars, 24h format).
func isQuietWindow() bool {
	start := os.Getenv("STELLAR_QUIET_START") // e.g. "22:00"
	end := os.Getenv("STELLAR_QUIET_END")     // e.g. "07:00"
	if start == "" || end == "" {
		return false
	}
	now := time.Now().Format("15:04")
	if start < end {
		return now >= start && now < end
	}
	// Overnight window: e.g. 22:00 → 07:00
	return now >= start || now < end
}
