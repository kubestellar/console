package agent

import (
	"log/slog"
	"time"

	"github.com/gorilla/websocket"

	"github.com/kubestellar/console/pkg/sanitize"
)

func sanitizeLogArgs(logArgs []any) []any {
	attrs := append([]any{}, logArgs...)
	for i := 1; i < len(attrs); i += 2 {
		if value, ok := attrs[i].(string); ok {
			attrs[i] = sanitize.LogString(value)
		}
	}
	return attrs
}

func setWSWriteDeadline(conn *websocket.Conn, logMsg string, logArgs ...any) error {
	if err := conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout)); err != nil {
		attrs := sanitizeLogArgs(logArgs)
		attrs = append(attrs, "client", sanitize.LogString(conn.RemoteAddr().String()), "error", err)
		slog.Error(sanitize.LogString(logMsg), attrs...)
		return err
	}
	return nil
}

func clearWSWriteDeadline(conn *websocket.Conn, logMsg string, logArgs ...any) error {
	if err := conn.SetWriteDeadline(time.Time{}); err != nil {
		attrs := sanitizeLogArgs(logArgs)
		attrs = append(attrs, "client", sanitize.LogString(conn.RemoteAddr().String()), "error", err)
		slog.Error(sanitize.LogString(logMsg), attrs...)
		return err
	}
	return nil
}
