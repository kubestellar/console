package github

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/store"
)

// RoundTripFunc is a helper for mocking http.Client Transport in tests.
type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

// RequireAdmin delegates to the handlers package RequireAdmin for github package tests.
func RequireAdmin(c *fiber.Ctx, s store.Store) error {
	return handlers.RequireAdmin(c, s)
}
