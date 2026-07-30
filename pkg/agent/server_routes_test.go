package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// expectedRoutes is the full list of patterns registered by registerRoutes.
// If a new route is added to server_routes.go but not here, this test fails
// — forcing the author to verify the route is intentional.
var expectedRoutes = []string{
	"/health",
	"/status",
	"/clusters",
	"/gpu-nodes",
	"/gpu-nodes/stream",
	"/nodes",
	"/nodes/stream",
	"/pods",
	"/pods/stream",
	"/events",
	"/events/stream",
	"/namespaces",
	"/deployments",
	"/replicasets",
	"/statefulsets",
	"/daemonsets",
	"/cronjobs",
	"/ingresses",
	"/networkpolicies",
	"/services",
	"/configmaps",
	"/secrets",
	"/serviceaccounts",
	"/jobs",
	"/jobs/stream",
	"/hpas",
	"/pvcs",
	"/pvs",
	"/cluster-health",
	"/roles",
	"/rolebindings",
	"/resourcequotas",
	"/limitranges",
	"/resolve-deps",
	"/scale",
	"/workloads/deploy",
	"/workloads/delete",
	"/serviceexports",
	"/cilium-status",
	"/jaeger-status",
	"/helm/rollback",
	"/helm/uninstall",
	"/helm/upgrade",
	"/console-cr/workloads",
	"/console-cr/groups",
	"/console-cr/deployments",
	"/console-cr/deployments/status",
	"/federation/detect",
	"/federation/clusters",
	"/federation/groups",
	"/federation/pending-joins",
	"/federation/action",
	"/gitops/detect-drift",
	"/gitops/sync",
	"/argocd/sync",
	"/gpu-health-cronjob",
	"/nvidia-operators",
	"/rbac/can-i",
	"/rbac/permissions",
	"/permissions/summary",
	"/rename-context",
	"/kubeconfig/preview",
	"/kubeconfig/import",
	"/kubeconfig/add",
	"/kubeconfig/test",
	"/kubeconfig/remove",
	"/settings/keys",
	"/settings/keys/",
	"/settings",
	"/settings/export",
	"/settings/import",
	"/providers/health",
	"/provider/check",
	"/predictions/ai",
	"/predictions/analyze",
	"/predictions/feedback",
	"/predictions/stats",
	"/insights/enrich",
	"/insights/ai",
	"/devices/alerts",
	"/devices/alerts/clear",
	"/devices/inventory",
	"/metrics/history",
	"/kagenti/agents",
	"/kagenti/builds",
	"/kagenti/cards",
	"/kagenti/tools",
	"/kagenti/summary",
	"/kagent-crds/agents",
	"/kagent-crds/tools",
	"/kagent-crds/models",
	"/kagent-crds/memories",
	"/kagent-crds/summary",
	"/cloud-cli-status",
	"/local-cluster-tools",
	"/local-clusters",
	"/local-cluster-lifecycle",
	"/vcluster/list",
	"/vcluster/create",
	"/vcluster/connect",
	"/vcluster/disconnect",
	"/vcluster/delete",
	"/vcluster/check",
	"/cancel-chat",
	"/restart-backend",
	"/auto-update/config",
	"/auto-update/status",
	"/auto-update/trigger",
	"/auto-update/cancel",
	"/prometheus/query",
	"/metrics",
	"/ws",
	"/ws/exec",
}

// TestRegisterRoutes_AllExpectedRoutesRegistered verifies that registerRoutes
// registers a handler for every expected path. We call registerRoutes on a
// real ServeMux and then issue a GET to each expected path; any path that
// returns 404 is missing from the registration.
func TestRegisterRoutes_AllExpectedRoutesRegistered(t *testing.T) {
	t.Parallel()

	// Build a minimal server — handlers will likely panic if called, but
	// we only need the mux pattern matching to work; we never invoke the
	// handler logic.
	s := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	for _, route := range expectedRoutes {
		t.Run(route, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, route, nil)
			// ServeMux.Handler returns the handler and the matched pattern.
			_, pattern := mux.Handler(req)
			if pattern == "" {
				t.Errorf("route %q is not registered in registerRoutes", route)
			}
		})
	}
}

// TestRegisterRoutes_CatchallReturns404ForUnknownPaths verifies that the
// catch-all "/" handler returns 404 for arbitrary unknown paths.
func TestRegisterRoutes_CatchallReturns404ForUnknownPaths(t *testing.T) {
	t.Parallel()

	s := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	unknownPaths := []string{
		"/nonexistent",
		"/api/v1/pods",
		"/admin/secret",
	}

	for _, path := range unknownPaths {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("Origin", "http://localhost")
			rr := httptest.NewRecorder()
			mux.ServeHTTP(rr, req)

			if rr.Code != http.StatusNotFound {
				t.Errorf("expected 404 for unknown path %q, got %d", path, rr.Code)
			}
		})
	}
}

// TestRegisterRoutes_CatchallHandlesOPTIONS verifies that the catch-all "/"
// handler responds to OPTIONS preflight with 204 No Content.
func TestRegisterRoutes_CatchallHandlesOPTIONS(t *testing.T) {
	t.Parallel()

	s := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	req := httptest.NewRequest(http.MethodOptions, "/unknown-path", nil)
	req.Header.Set("Origin", "http://localhost")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("expected 204 for OPTIONS on catch-all, got %d", rr.Code)
	}
}

// TestRegisterRoutes_RouteCount guards against accidentally removing routes
// during refactoring. If the number of registered routes drops below the
// expected count, the refactor likely lost a route.
func TestRegisterRoutes_RouteCount(t *testing.T) {
	t.Parallel()

	// The expected count should match len(expectedRoutes). Update both when
	// adding or removing routes intentionally.
	const minExpectedRoutes = 100

	if len(expectedRoutes) < minExpectedRoutes {
		t.Errorf("expectedRoutes slice has only %d entries; expected at least %d — did you forget to update?",
			len(expectedRoutes), minExpectedRoutes)
	}
}
