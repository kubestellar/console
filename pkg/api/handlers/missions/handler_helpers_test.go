package missions

import (
	"context"
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/store"
)

func setupMissionsTest() (*fiber.App, *MissionsHandler) {
	app := fiber.New()
	handler := NewMissionsHandler()
	handler.RegisterRoutes(app.Group("/api/missions"))
	handler.RegisterPublicRoutes(app.Group("/api/missions"))
	return app, handler
}

type mockTransport struct {
	handler func(*http.Request) (*http.Response, error)
}

func (t *mockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return t.handler(req)
}

// stubKBGapStore satisfies the kbGapStore interface for handler tests.

type stubKBGapStore struct {
	gaps []store.KBQueryGap
}

func (s *stubKBGapStore) RecordKBGap(_ context.Context, _ string) error { return nil }

func (s *stubKBGapStore) ListTopKBGaps(_ context.Context, _ int) ([]store.KBQueryGap, error) {
	return s.gaps, nil
}
