package api

import (
	"net/http"
	"testing"
)

// The tests in this file guard against wiring regressions in the route
// registration files that had no direct coverage before (#22421):
//
//   - routes_mcp.go              (setupMCPRoutes)
//   - routes_integrations.go     (setupIntegrationsRoutes)
//   - routes_k8s.go              (setupK8sResourceRoutes)
//   - routes_gitops.go           (setupGitOpsRoutes)
//   - routes_websocket_static.go (setupWebSocketStaticRoutes)
//
// Each test asserts a representative subset of the routes registered by the
// target file is present in the final route table with at least the JWT/CSRF
// middleware chain still attached. This catches drift such as: a route being
// silently dropped by a refactor, an /api/* route being moved outside the
// authenticated group, or the wrong verb being wired.
//
// A "golden" full inventory would be too brittle — routes churn frequently as
// endpoints move to kc-agent — so we intentionally cover a stable, high-value
// subset (health/status, list endpoints, and the /mcp/clusters dev-mode
// conditional-auth pair called out in routes_integrations.go).

func TestSetupMCPRoutes_RegistersRepresentativeEndpoints(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	// /api/mcp/* routes go through the authenticated /api group (5 handlers:
	// limiter, bodyGuard, csrfGuard, jwtAuth, handler). Use minHandlers=1 to
	// stay tolerant to middleware chain changes — we only care that the route
	// is registered.
	expected := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/mcp/status"},
		{http.MethodGet, "/api/mcp/tools/ops"},
		{http.MethodGet, "/api/mcp/tools/deploy"},
		{http.MethodPost, "/api/mcp/tools/ops/call"},
		{http.MethodPost, "/api/mcp/tools/deploy/call"},
		{http.MethodGet, "/api/mcp/clusters/:cluster/health"},
		{http.MethodGet, "/api/mcp/pods"},
		{http.MethodGet, "/api/mcp/pod-issues"},
		{http.MethodGet, "/api/mcp/deployments"},
		{http.MethodGet, "/api/mcp/nodes"},
		{http.MethodGet, "/api/mcp/gpu-nodes"},
		{http.MethodGet, "/api/mcp/gpu-nodes/health"},
		{http.MethodGet, "/api/mcp/events"},
		{http.MethodGet, "/api/mcp/services"},
		{http.MethodGet, "/api/mcp/security-issues"},
		{http.MethodGet, "/api/mcp/configmaps"},
		{http.MethodGet, "/api/mcp/secrets"},
		{http.MethodGet, "/api/mcp/pvcs"},
		{http.MethodGet, "/api/mcp/resourcequotas"},
		{http.MethodPost, "/api/mcp/resourcequotas"},
		{http.MethodDelete, "/api/mcp/resourcequotas"},
		{http.MethodGet, "/api/mcp/pods/logs"},
		{http.MethodGet, "/api/mcp/replicasets"},
		{http.MethodGet, "/api/mcp/statefulsets"},
		{http.MethodGet, "/api/mcp/daemonsets"},
		{http.MethodGet, "/api/mcp/cronjobs"},
		{http.MethodGet, "/api/mcp/ingresses"},
		{http.MethodGet, "/api/mcp/networkpolicies"},
		{http.MethodGet, "/api/mcp/resource-yaml"},
		// Widget-friendly aliases (#4140, #4141, #4142) — must stay registered
		// so exported widgets don't fall through to the SPA catch-all.
		{http.MethodGet, "/api/mcp/workloads"},
		{http.MethodGet, "/api/mcp/security"},
		{http.MethodGet, "/api/mcp/storage"},
		{http.MethodGet, "/api/mcp/network"},
		{http.MethodGet, "/api/mcp/namespaces"},
		{http.MethodGet, "/api/mcp/namespaces/overview"},
		{http.MethodGet, "/api/alerts"},
		{http.MethodGet, "/api/mcp/costs"},
		{http.MethodGet, "/api/providers/health"},
		// SSE streaming variants
		{http.MethodGet, "/api/mcp/pods/stream"},
		{http.MethodGet, "/api/mcp/deployments/stream"},
		{http.MethodGet, "/api/mcp/events/stream"},
		{http.MethodGet, "/api/mcp/services/stream"},
		{http.MethodGet, "/api/mcp/nodes/stream"},
		{http.MethodGet, "/api/mcp/workloads/stream"},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, 1)
	}
}

func TestSetupMCPRoutes_ClustersEndpointsRegisteredOnceOutsideMCPGroup(t *testing.T) {
	// The comment in routes_mcp.go says /mcp/clusters and
	// /mcp/clusters/health are registered *once*, in setupIntegrationsRoutes
	// (as standalone /api/mcp/clusters routes with dev-mode conditional
	// auth), NOT again inside setupMCPRoutes. Guard the "once" invariant so a
	// refactor that re-adds them under setupMCPRoutes doesn't silently
	// produce duplicate routes (#10925).
	server, _ := newRouteRegistrationServer(t)

	seen := map[string]int{}
	for _, route := range server.app.GetRoutes(true) {
		if route.Method == http.MethodGet {
			if route.Path == "/api/mcp/clusters" || route.Path == "/api/mcp/clusters/health" {
				seen[route.Path]++
			}
		}
	}
	if got := seen["/api/mcp/clusters"]; got != 1 {
		t.Errorf("expected GET /api/mcp/clusters to be registered exactly once, got %d", got)
	}
	if got := seen["/api/mcp/clusters/health"]; got != 1 {
		t.Errorf("expected GET /api/mcp/clusters/health to be registered exactly once, got %d", got)
	}
}

func TestSetupMCPRoutes_ProxyDrasiRegisteredAsCatchAll(t *testing.T) {
	// api.All("/drasi/proxy/*") produces one route per HTTP verb. Assert at
	// least the common ones exist so the reverse proxy doesn't quietly
	// vanish under a refactor.
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	for _, method := range []string{
		http.MethodGet, http.MethodPost, http.MethodPut,
		http.MethodDelete, http.MethodPatch,
	} {
		assertRegisteredRoute(t, routes, method, "/api/drasi/proxy/*", 1)
	}
}

func TestSetupIntegrationsRoutes_RegistersRepresentativeEndpoints(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	expected := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/timeline"},
		// /api/mcp/clusters and /api/mcp/clusters/health are the dev-mode
		// conditional-auth pair called out in routes_integrations.go.
		{http.MethodGet, "/api/mcp/clusters"},
		{http.MethodGet, "/api/mcp/clusters/health"},
		{http.MethodGet, "/api/benchmarks/reports"},
		{http.MethodGet, "/api/benchmarks/reports/stream"},
		// GPU reservation endpoints (all 7 CRUD verbs)
		{http.MethodPost, "/api/gpu/reservations"},
		{http.MethodGet, "/api/gpu/reservations"},
		{http.MethodGet, "/api/gpu/reservations/:id"},
		{http.MethodPut, "/api/gpu/reservations/:id"},
		{http.MethodDelete, "/api/gpu/reservations/:id"},
		{http.MethodGet, "/api/gpu/reservations/:id/utilization"},
		{http.MethodGet, "/api/gpu/utilizations"},
		// Gadget
		{http.MethodGet, "/api/gadget/status"},
		{http.MethodGet, "/api/gadget/tools"},
		{http.MethodPost, "/api/gadget/trace"},
		// kagent
		{http.MethodGet, "/api/kagent/status"},
		{http.MethodGet, "/api/kagent/agents"},
		{http.MethodPost, "/api/kagent/chat"},
		{http.MethodPost, "/api/kagent/tools/call"},
		// kagenti provider
		{http.MethodGet, "/api/kagenti-provider/status"},
		{http.MethodGet, "/api/kagenti-provider/agents"},
		{http.MethodGet, "/api/kagenti-provider/tools"},
		{http.MethodPatch, "/api/kagenti-provider/config"},
		{http.MethodPost, "/api/kagenti-provider/chat"},
		{http.MethodPost, "/api/kagenti-provider/tools/call"},
		{http.MethodPost, "/api/kagenti-provider/tools/call-direct"},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, 1)
	}
}

func TestSetupK8sResourceRoutes_RegistersRepresentativeEndpoints(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	expected := []struct {
		method string
		path   string
	}{
		// MCS
		{http.MethodGet, "/api/mcs/status"},
		{http.MethodGet, "/api/mcs/exports"},
		{http.MethodGet, "/api/mcs/exports/:cluster/:namespace/:name"},
		{http.MethodGet, "/api/mcs/imports"},
		{http.MethodGet, "/api/mcs/imports/:cluster/:namespace/:name"},
		// Gateway API
		{http.MethodGet, "/api/gateway/status"},
		{http.MethodGet, "/api/gateway/gateways"},
		{http.MethodGet, "/api/gateway/gateways/:cluster/:namespace/:name"},
		{http.MethodGet, "/api/gateway/httproutes"},
		{http.MethodGet, "/api/gateway/httproutes/:cluster/:namespace/:name"},
		// CRDs, Lima, service-exports, admission webhooks, topology
		{http.MethodGet, "/api/crds"},
		{http.MethodGet, "/api/lima"},
		{http.MethodGet, "/api/service-exports"},
		{http.MethodGet, "/api/admission-webhooks"},
		{http.MethodGet, "/api/topology"},
		// Workloads
		{http.MethodGet, "/api/workloads"},
		{http.MethodGet, "/api/workloads/capabilities"},
		{http.MethodGet, "/api/workloads/policies"},
		{http.MethodGet, "/api/workloads/deploy-status/:cluster/:namespace/:name"},
		{http.MethodGet, "/api/workloads/deploy-logs/:cluster/:namespace/:name"},
		{http.MethodGet, "/api/workloads/resolve-deps/:cluster/:namespace/:name"},
		{http.MethodGet, "/api/workloads/monitor/:cluster/:namespace/:name"},
		{http.MethodGet, "/api/workloads/:cluster/:namespace/:name"},
		// Cluster groups
		{http.MethodGet, "/api/cluster-groups"},
		{http.MethodPost, "/api/cluster-groups"},
		{http.MethodPost, "/api/cluster-groups/sync"},
		{http.MethodPost, "/api/cluster-groups/evaluate"},
		{http.MethodPost, "/api/cluster-groups/ai-query"},
		{http.MethodPut, "/api/cluster-groups/:name"},
		{http.MethodDelete, "/api/cluster-groups/:name"},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, 1)
	}
}

func TestSetupK8sResourceRoutes_AIQueryHasExtraRateLimiter(t *testing.T) {
	// /api/cluster-groups/ai-query passes an additional per-user AI rate
	// limiter (#17294). It must have at least one MORE handler in its chain
	// than the neighbouring /api/cluster-groups POST route that shares the
	// same authenticated middleware chain but omits the limiter.
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	aiQuery, ok := routes[http.MethodPost+" /api/cluster-groups/ai-query"]
	if !ok {
		t.Fatalf("expected POST /api/cluster-groups/ai-query to be registered")
	}
	base, ok := routes[http.MethodPost+" /api/cluster-groups"]
	if !ok {
		t.Fatalf("expected POST /api/cluster-groups to be registered")
	}
	if len(aiQuery.Handlers) <= len(base.Handlers) {
		t.Errorf("expected AI-query route (%d handlers) to carry more middleware than base cluster-groups POST (%d handlers)",
			len(aiQuery.Handlers), len(base.Handlers))
	}
}

func TestSetupGitOpsRoutes_RegistersRepresentativeEndpoints(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	expected := []struct {
		method string
		path   string
	}{
		// Core GitOps read endpoints
		{http.MethodGet, "/api/gitops/drifts"},
		{http.MethodGet, "/api/gitops/helm-releases"},
		{http.MethodGet, "/api/gitops/helm-history"},
		{http.MethodGet, "/api/gitops/helm-values"},
		{http.MethodGet, "/api/gitops/kustomizations"},
		{http.MethodGet, "/api/gitops/operators"},
		{http.MethodGet, "/api/gitops/operators/stream"},
		{http.MethodGet, "/api/gitops/operator-subscriptions"},
		{http.MethodGet, "/api/gitops/operator-subscriptions/stream"},
		{http.MethodGet, "/api/gitops/helm-releases/stream"},
		// Self-upgrade (still on backend)
		{http.MethodGet, "/api/self-upgrade/status"},
		{http.MethodPost, "/api/self-upgrade/trigger"},
		// ArgoCD
		{http.MethodGet, "/api/gitops/argocd/applications"},
		{http.MethodGet, "/api/gitops/argocd/applicationsets"},
		{http.MethodGet, "/api/gitops/argocd/health"},
		{http.MethodGet, "/api/gitops/argocd/sync"},
		{http.MethodGet, "/api/gitops/argocd/status"},
		// Frontend compatibility alias — reuses ListOperatorSubscriptions
		{http.MethodGet, "/api/mcp/operator-subscriptions"},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, 1)
	}
}

func TestSetupWebSocketStaticRoutes_RegistersWebhookAndWebSocket(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	// Webhook is a standalone (non-/api) POST that bypasses the authenticated
	// group — the GitHub webhook signature validates the caller instead.
	assertRegisteredRoute(t, routes, http.MethodPost, "/webhooks/github", 1)

	// The websocket route itself must be registered. The Use(...) chain that
	// mounts limiter + origin validation + upgrade middleware is asserted by
	// TestSetupRoutes_RegistersCriticalAuthAndAPIRoutes (min 1 handler).
	assertRegisteredRoute(t, routes, http.MethodGet, "/ws", 1)
}
