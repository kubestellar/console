package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/api/transport"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/store"
)

// Deps is the shared dependency set that every handler subpackage needs.
// Add new fields here instead of adding parameters to individual handler
// constructors (epic #23685 phase 2).
//
// Server configuration lives in package api, which imports this package, so
// config-derived values are carried as explicit fields (GitHubToken today)
// rather than as a *api.Config reference.
type Deps struct {
	Store               store.Store
	Hub                 *transport.Hub
	K8sClient           *k8s.MultiClusterClient
	PersistenceStore    *store.PersistenceStore
	NotificationService *notifications.Service
	FailureTracker      *middleware.FailureTracker
	GitHubToken         string
}

// Registrar is implemented by each handler subpackage. Route groups call
// Register once per subpackage instead of constructing individual handlers
// and wiring their routes by hand.
type Registrar interface {
	Register(router fiber.Router, deps Deps)
}
