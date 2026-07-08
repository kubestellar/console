// Package logutil provides shared helpers for safe structured logging.
package logutil

import "strings"

// Sanitize removes newline and carriage-return characters from a string to
// prevent log injection (CWE-117 / OWASP Log Injection).  Apply it to any
// user-controlled string value before passing it to a slog statement.
func Sanitize(s string) string {
	s = strings.ReplaceAll(s, "\n", "")
	return strings.ReplaceAll(s, "\r", "")
}
