package ops

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/transport"
	k8sclient "github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

// RegisterSelfUpgrade wires the /self-upgrade/status and
// /self-upgrade/trigger routes onto router, using the shared multi-cluster
// client, transport hub, and persistence store. It preserves the exact
// route order previously registered by hand in setupGitOpsRoutes so
// fiber's first-match semantics are unchanged (epic #23685 phase 2,
// #23725 slice 2b.7).
//
// A file-scoped registrar is used rather than a monolithic ops.Register
// because each ops handler (air-gap, manifest, notifications, onboarding,
// ping, self-upgrade, timeline, token-usage) is wired from a different
// route file in pkg/api. Individual RegisterXxx functions let each caller
// wire only what it needs without importing sibling subdomains.
//
// The signature is domain-local (not handlers.Registrar) because the
// parent pkg/api/handlers package still imports pkg/api/handlers/ops
// through ops_aliases.go, so this subpackage cannot import the parent's
// Deps/Registrar types without an import cycle. Slice 2c collapses all
// domain registrars onto a shared signature once the final _aliases.go
// files are retired.
func RegisterSelfUpgrade(router fiber.Router, k8sClient *k8sclient.MultiClusterClient, hub *transport.Hub, store store.Store) {
	h := NewSelfUpgradeHandler(k8sClient, hub, store)
	router.Get("/self-upgrade/status", h.GetStatus)
	router.Post("/self-upgrade/trigger", h.TriggerUpgrade)
}
