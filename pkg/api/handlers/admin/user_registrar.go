package admin

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
)

type userRegistrar struct {
	middleware []fiber.Handler
}

// NewUserRegistrar returns the registrar for the current-user (/api/me)
// routes. They are mounted on the root router rather than the pre-guarded
// /api group, so the route group supplies the cross-cutting middleware chain
// explicitly — auth policy stays owned by package api (epic #23685 phase 2).
func NewUserRegistrar(middleware ...fiber.Handler) handlers.Registrar {
	return userRegistrar{middleware: middleware}
}

func (r userRegistrar) Register(router fiber.Router, deps handlers.Deps) {
	user := NewUserHandler(deps.Store)
	router.Get("/api/me", r.chain(user.GetCurrentUser)...)
	router.Put("/api/me", r.chain(user.UpdateCurrentUser)...)
}

// chain preserves the route group's middleware ordering and appends the final
// handler, without aliasing the registrar's middleware slice.
func (r userRegistrar) chain(handler fiber.Handler) []fiber.Handler {
	chained := make([]fiber.Handler, 0, len(r.middleware)+1)
	chained = append(chained, r.middleware...)
	return append(chained, handler)
}
