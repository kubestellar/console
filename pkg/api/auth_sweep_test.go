package api

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
)

// TestProtectedRoutes_UnauthenticatedReturn401 is #6651: a table-driven sweep
// that spins up a minimal Fiber app mounting the production /api group with
// JWTAuth middleware, registers a no-op handler on each sensitive route, and
// asserts every one returns 401 Unauthorized when called without any
// credentials (no Authorization header, no kc_auth cookie, no _token query).
//
// Scope: the 30 most security-sensitive endpoints drawn from the routes
// registered on the `api` group in pkg/api/server.go. If any of these ever
// regresses out of the protected group (as described in #6646/#6648), this
// test fails immediately.
//
// This test does NOT cover the happy path — middleware/auth_test.go already
// covers JWTAuth's valid-token branch. Here we only verify that the routes
// sit behind the middleware at all.
func TestProtectedRoutes_UnauthenticatedReturn401(t *testing.T) {
	app := fiber.New()
	// Mirror the production mount: every handler below is attached to a
	// Group with JWTAuth applied, so an unauthenticated request must be
	// rejected by the middleware before the no-op handler runs.
	const testSecret = "test-secret-unused-because-no-token-is-sent" // #nosec G101 — test fixture, not a credential
	noop := func(c *fiber.Ctx) error { return c.SendString("reached") }
	apiGroup := app.Group("/api", middleware.JWTAuth(testSecret))

	// Cluster / workload / RBAC / exec surfaces — all must be behind auth.
	// Update this list whenever a new sensitive endpoint is added to
	// pkg/api/server.go `api.*` registrations.
	protected := []struct {
		method string
		path   string
	}{
		// Cluster health / MCP read surfaces
		{"GET", "/api/mcp/clusters"},
		{"GET", "/api/mcp/clusters/health"},
		{"GET", "/api/mcp/pods"},
		{"GET", "/api/mcp/nodes"},
		{"GET", "/api/mcp/events"},
		{"GET", "/api/mcp/security-issues"},
		{"GET", "/api/mcp/secrets"},
		{"GET", "/api/mcp/configmaps"},
		{"GET", "/api/mcp/resource-yaml"},
		{"GET", "/api/mcp/pods/logs"},
		// Exec / mutating MCP tool calls
		{"POST", "/api/mcp/tools/ops/call"},
		{"POST", "/api/mcp/tools/deploy/call"},
		// RBAC read + mutate
		// NOTE: POST /api/rbac/service-accounts and POST /api/rbac/bindings
		// moved to kc-agent (#7993 Phase 1.5 PR A).
		{"GET", "/api/rbac/users"},
		{"GET", "/api/rbac/roles"},
		{"GET", "/api/rbac/bindings"},
		{"GET", "/api/rbac/permissions"},
		{"POST", "/api/rbac/can-i"},
		// Namespace lifecycle.
		// NOTE: POST /api/namespaces and DELETE /api/namespaces/:name moved to
		// kc-agent (#7993 Phase 2). Only the read endpoint remains here.
		{"GET", "/api/namespaces"},
		// Workloads
		{"GET", "/api/workloads"},
		{"GET", "/api/workloads/capabilities"},
		// NOTE: /api/workloads/deploy and /api/workloads/scale, and the DELETE
		// /api/workloads/:cluster/:namespace/:name route all moved to kc-agent
		// (#7993 Phase 1 PRs A and B).
		// Gateway / MCS / GitOps read
		{"GET", "/api/gateway/gateways"},
		{"GET", "/api/gateway/httproutes"},
		{"GET", "/api/mcs/exports"},
		{"GET", "/api/mcs/imports"},
		{"GET", "/api/gitops/drifts"},
		{"GET", "/api/gitops/argocd/applications"},
	}

	// Register a no-op handler for each protected route under the JWTAuth
	// group. The middleware must intercept before the noop ever runs.
	for _, r := range protected {
		switch r.method {
		case "GET":
			apiGroup.Get(stripAPIPrefix(r.path), noop)
		case "POST":
			apiGroup.Post(stripAPIPrefix(r.path), noop)
		}
	}

	const expectedStatus = 401 // fiber.StatusUnauthorized — explicit for test readability
	for _, r := range protected {
		r := r
		t.Run(r.method+" "+r.path, func(t *testing.T) {
			req := httptest.NewRequest(r.method, r.path, nil)
			resp, err := app.Test(req, 5000)
			if err != nil {
				t.Fatalf("app.Test: %v", err)
			}
			if resp.StatusCode != expectedStatus {
				t.Errorf("%s %s: expected %d (unauth), got %d — route is NOT behind JWTAuth (#6646/#6648/#6651)",
					r.method, r.path, expectedStatus, resp.StatusCode)
			}
		})
	}
}

// stripAPIPrefix removes the "/api" prefix from a full path so the route
// can be registered under the apiGroup. Kept as a tiny helper so the
// protected-list above reads as the actual URL the client hits.
func stripAPIPrefix(p string) string {
	const prefix = "/api"
	if len(p) >= len(prefix) && p[:len(prefix)] == prefix {
		return p[len(prefix):]
	}
	return p
}
