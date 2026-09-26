package k8s

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/transport"
	k8sclient "github.com/kubestellar/console/pkg/k8s"
)

// Register wires the MCS, Gateway API, CRD, Lima, ServiceExport,
// admission-webhook, and topology handlers onto router, using the shared
// multi-cluster client and transport hub. It preserves the exact route
// order the setupK8sResourceRoutes function registered by hand before epic
// #23685 phase 2 (#23725 slice 2b.6), so fiber's first-match semantics
// (e.g. /mcs/exports vs /mcs/exports/:cluster/:namespace/:name) are
// unchanged.
//
// Workload/cluster-group wiring is not included: those handlers own
// side-effectful startup (LoadPersistedClusterGroups, StartCacheRefresh)
// and are stored on the server's background group, which is not a concern
// this registrar carries. They stay wired directly in
// setupK8sResourceRoutes.
//
// The signature is domain-local (not handlers.Registrar) because the
// parent pkg/api/handlers package still imports this subpackage via
// shared_types.go and demo_data.go, so this subpackage cannot import the
// parent's Deps/Registrar types without an import cycle. Slice 2c
// collapses all domain registrars onto a single shared signature.
func Register(router fiber.Router, k8sClient *k8sclient.MultiClusterClient, hub *transport.Hub) {
	mcsHandlers := NewMCSHandlers(k8sClient, hub)
	router.Get("/mcs/status", mcsHandlers.GetMCSStatus)
	router.Get("/mcs/exports", mcsHandlers.ListServiceExports)
	router.Get("/mcs/exports/:cluster/:namespace/:name", mcsHandlers.GetServiceExport)
	// Create/Delete ServiceExport routes removed in #7993 Phase 1.5 PR B.
	router.Get("/mcs/imports", mcsHandlers.ListServiceImports)
	router.Get("/mcs/imports/:cluster/:namespace/:name", mcsHandlers.GetServiceImport)

	gatewayHandlers := NewGatewayHandlers(k8sClient, hub)
	router.Get("/gateway/status", gatewayHandlers.GetGatewayAPIStatus)
	router.Get("/gateway/gateways", gatewayHandlers.ListGateways)
	router.Get("/gateway/gateways/:cluster/:namespace/:name", gatewayHandlers.GetGateway)
	router.Get("/gateway/httproutes", gatewayHandlers.ListHTTPRoutes)
	router.Get("/gateway/httproutes/:cluster/:namespace/:name", gatewayHandlers.GetHTTPRoute)

	crdHandlers := NewCRDHandlers(k8sClient)
	router.Get("/crds", crdHandlers.ListCRDs)

	limaHandlers := NewLimaHandlers(k8sClient)
	router.Get("/lima", limaHandlers.ListLima)

	svcExportHandlers := NewServiceExportHandlers(k8sClient)
	router.Get("/service-exports", svcExportHandlers.ListServiceExports)

	webhookHandlers := NewWebhookHandlers(k8sClient)
	router.Get("/admission-webhooks", webhookHandlers.ListWebhooks)

	topologyHandlers := NewTopologyHandlers(k8sClient, hub)
	router.Get("/topology", topologyHandlers.GetTopology)
}
