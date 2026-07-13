package agent

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/gorilla/websocket"

	"github.com/kubestellar/console/pkg/sanitize"
)

// sanitizeLogArgs sanitizes user-controlled key/value pairs for structured
// logging. Values at odd indices are treated as attribute values; strings are
// sanitized with sanitize.LogString and non-strings are stringified via
// fmt.Sprint and sanitized. Keys (even indices) are left untouched.
func sanitizeLogArgs(logArgs []any) []any {
	attrs := make([]any, len(logArgs))
	for i, v := range logArgs {
		if i%2 == 1 {
			switch value := v.(type) {
			case string:
				attrs[i] = sanitize.LogString(value)
			default:
				attrs[i] = sanitize.LogString(fmt.Sprint(v))
			}
		} else {
			attrs[i] = v
		}
	}
	return attrs
}

func setWSWriteDeadline(conn *websocket.Conn, logMsg string, logArgs ...any) error {
	if err := conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout)); err != nil {
		attrs := sanitizeLogArgs(logArgs)
		attrs = append(attrs, "client", sanitize.LogString(conn.RemoteAddr().String()), "error", sanitize.LogString(err.Error()))
		slog.Error(sanitize.LogString(logMsg), attrs...)
		return err
	}
	return nil
}

func clearWSWriteDeadline(conn *websocket.Conn, logMsg string, logArgs ...any) error {
	if err := conn.SetWriteDeadline(time.Time{}); err != nil {
		attrs := sanitizeLogArgs(logArgs)
		attrs = append(attrs, "client", sanitize.LogString(conn.RemoteAddr().String()), "error", sanitize.LogString(err.Error()))
		slog.Error(sanitize.LogString(logMsg), attrs...)
		return err
	}
	return nil
}
