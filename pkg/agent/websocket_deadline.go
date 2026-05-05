package agent

import (
	"log/slog"
	"time"

	"github.com/gorilla/websocket"
)

func setWSWriteDeadline(conn *websocket.Conn, logMsg string, logArgs ...any) error {
	if err := conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout)); err != nil {
		attrs := append([]any{}, logArgs...)
		attrs = append(attrs, "client", conn.RemoteAddr(), "error", err)
		slog.Error(logMsg, attrs...)
		return err
	}
	return nil
}

func clearWSWriteDeadline(conn *websocket.Conn, logMsg string, logArgs ...any) error {
	if err := conn.SetWriteDeadline(time.Time{}); err != nil {
		attrs := append([]any{}, logArgs...)
		attrs = append(attrs, "client", conn.RemoteAddr(), "error", err)
		slog.Error(logMsg, attrs...)
		return err
	}
	return nil
}
