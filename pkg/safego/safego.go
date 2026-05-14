// Package safego provides a panic-safe goroutine launcher.
// All background goroutines should use SafeGo instead of bare "go func()"
// to prevent an unhandled panic from crashing the entire process.
package safego

import (
	"log/slog"
	"runtime/debug"
)

// Go launches fn in a new goroutine with automatic panic recovery.
// If fn panics, the panic value and stack trace are logged via slog
// and the goroutine exits cleanly instead of crashing the process.
func Go(fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("goroutine panicked",
					"recover", r,
					"stack", string(debug.Stack()),
				)
			}
		}()
		fn()
	}()
}

// GoWith launches fn in a new goroutine with automatic panic recovery
// and a descriptive label for log context. Use this when you want the
// log entry to identify which background task panicked.
func GoWith(label string, fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("goroutine panicked",
					"label", label,
					"recover", r,
					"stack", string(debug.Stack()),
				)
			}
		}()
		fn()
	}()
}
