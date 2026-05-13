package agent

// Federation awareness handlers for kc-agent — see Issue 9368 and the master
// plan at /Users/andan02/.claude/plans/glistening-stargazing-toast.md.
//
// These endpoints are the kc-agent side of Phase 1 of the federation
// roll-out. The UI calls them to learn which multi-cluster-management
// backends (OCM, Karmada, Clusternet, Liqo, KubeAdmiral, CAPI) are present
// on each kubeconfig context the user holds, plus the federated clusters,
// groups, and pending joins each hub reports.
//
// Identity: all reads run through the dynamic client that kc-agent resolves
// from the user's kubeconfig via MultiClusterClient.GetRestConfig. There is
// NO pod-ServiceAccount fallback — if the user's bearer token is not on
// the request the handler returns 401 to make the absence of identity loud
// instead of silently falling through to cluster-level credentials.
//
// Fan-out: when `?cluster=` is omitted, the handler iterates every
// de-duplicated context in the user's kubeconfig in parallel. One
// (provider, hubContext) pair may fail (offline controller, 403, missing
// CRDs) — that pair is turned into a FederationError and aggregated
// alongside the successful results. The classification pattern matches
// pkg/k8s classifyError() so UI error handling generalizes cleanly.
//
// Result aggregation follows the return-then-aggregate pattern from Issue
// 9364: every goroutine returns its own slice to a local results channel
// and the caller concatenates once all goroutines exit. No outer-scope
// slice mutation, no per-goroutine mutex.

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
)

// federationRequestTimeout bounds each HTTP handler. Matches
// rbacAnalysisTimeout because both involve cross-context fan-out.
const federationRequestTimeout = 60 * time.Second

// federationPerProviderTimeout bounds a single (provider, context) probe so
// one slow controller cannot block the aggregated response. Individual
// providers typically respond in under 2s; 10s leaves comfortable slack for
// large ManagedCluster / Cluster lists without extending the overall
// handler deadline.
const federationPerProviderTimeout = 10 * time.Second

// handleFederationDetect serves `GET /federation/detect[?cluster=<ctx>]` and
// returns []ProviderHubStatus — one row per (registered provider, resolved
// context) pair. When `cluster` is omitted the handler fans out over every
// de-duplicated context in the user's kubeconfig.
func (s *Server) handleFederationDetect(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !s.requireBearerToken(w, r) {
		return
	}
	if s.k8sClient == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "k8s client not initialized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), federationRequestTimeout)
	defer cancel()

	contexts, err := s.resolveFederationContexts(ctx, r)
	if err != nil {
		slog.Warn("federation detect: failed to resolve contexts, returning empty", "error", err)
		writeJSON(w, []federation.ProviderHubStatus{})
		return
	}
	providers := federation.All()

	results := fanOutDetect(ctx, providers, contexts, s.k8sClient.GetRestConfig)
	// Always return a non-nil slice so `[]` is JSON-encoded, not `null`.
	if results == nil {
		results = []federation.ProviderHubStatus{}
	}
	writeJSON(w, results)
}

// handleFederationClusters serves `GET /federation/clusters[?cluster=<ctx>]`
// and returns []FederatedCluster collected from every (provider, context)
// pair that Detect()ed positively. Per-pair errors are attached alongside
// under an "errors" envelope.
func (s *Server) handleFederationClusters(w http.ResponseWriter, r *http.Request) {
	s.handleFederationRead(w, r, func(
		ctx context.Context, p federation.Provider, cfg *rest.Config,
	) (interface{}, error) {
		return p.ReadClusters(ctx, cfg)
	}, "clusters")
}

// handleFederationGroups serves `GET /federation/groups[?cluster=<ctx>]`.
func (s *Server) handleFederationGroups(w http.ResponseWriter, r *http.Request) {
	s.handleFederationRead(w, r, func(
		ctx context.Context, p federation.Provider, cfg *rest.Config,
	) (interface{}, error) {
		return p.ReadGroups(ctx, cfg)
	}, "groups")
}

// handleFederationPendingJoins serves
// `GET /federation/pending-joins[?cluster=<ctx>]`.
func (s *Server) handleFederationPendingJoins(w http.ResponseWriter, r *http.Request) {
	s.handleFederationRead(w, r, func(
		ctx context.Context, p federation.Provider, cfg *rest.Config,
	) (interface{}, error) {
		return p.ReadPendingJoins(ctx, cfg)
	}, "pendingJoins")
}

// federationReadFunc is the per-provider reader selector used by
// handleFederationRead. Returning interface{} keeps the three readers on a
// single fan-out path without per-reader generics.
type federationReadFunc func(
	ctx context.Context, p federation.Provider, cfg *rest.Config,
) (interface{}, error)

// handleFederationRead is the shared fan-out body for the three list
// handlers (clusters/groups/pending-joins). It returns a JSON envelope:
//
//	{ "items": [...], "errors": [...] }
//
// so the UI can render partial results even when some (provider, hub)
// pairs fail. The envelope key for items is provided by itemsKey so each
// handler can pick a semantically meaningful field name (clusters / groups
// / pendingJoins) without copy-pasting the rest of the body.
func (s *Server) handleFederationRead(
	w http.ResponseWriter, r *http.Request,
	read federationReadFunc, itemsKey string,
) {
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !s.requireBearerToken(w, r) {
		return
	}
	if s.k8sClient == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "k8s client not initialized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), federationRequestTimeout)
	defer cancel()

	contexts, err := s.resolveFederationContexts(ctx, r)
	if err != nil {
		slog.Error("failed to resolve federation contexts", "itemsKey", itemsKey, "error", err)
		writeJSONError(w, http.StatusInternalServerError, sanitizeAgentError("resolve federation contexts", err))
		return
	}
	providers := federation.All()

	items, errs := fanOutRead(ctx, providers, contexts, s.k8sClient.GetRestConfig, read)
	if items == nil {
		items = []interface{}{}
	}
	if errs == nil {
		errs = []federation.FederationError{}
	}
	writeJSON(w, map[string]interface{}{
		itemsKey: items,
		"errors": errs,
	})
}

// requireBearerToken enforces the "no pod-SA fallback" contract. It returns
// true only when the request carries a valid bearer token (or the agent was
// started without token auth — which is the dev-only path). On missing /
// mismatching tokens it responds 401 Unauthorized and returns false.
// Federation reads must NEVER execute without user identity; 401 is the
// semantically correct HTTP status for missing or invalid authentication
// and lets clients (and monitoring) distinguish auth failures from real
// server errors.
func (s *Server) requireBearerToken(w http.ResponseWriter, r *http.Request) bool {
	if s.validateToken(r) {
		return true
	}
	writeJSONError(w, http.StatusUnauthorized, "bearer token required for federation reads — no pod-SA fallback")
	return false
}

// resolveFederationContexts returns the set of kubeconfig contexts the
// handler should fan out over. When `?cluster=` is present, only that
// single context is returned; otherwise every de-duplicated cluster from
// the user's kubeconfig is returned so we don't double-count the same
// physical hub under two context aliases.
func (s *Server) resolveFederationContexts(ctx context.Context, r *http.Request) ([]string, error) {
	if single := r.URL.Query().Get("cluster"); single != "" {
		return []string{single}, nil
	}
	clusters, err := s.k8sClient.DeduplicatedClusters(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(clusters))
	for _, c := range clusters {
		out = append(out, c.Context)
	}
	return out, nil
}

// configResolver is the narrow function interface fanOutDetect / fanOutRead
// depend on. Using a func type instead of a method reference makes these
// helpers test-injectable without dragging the whole MultiClusterClient
// into unit tests.
type configResolver func(contextName string) (*rest.Config, error)

func newFederationError(provider federation.FederationProviderName, hubContext, operation string, err error) *federation.FederationError {
	slog.Error("federation provider request failed", "provider", provider, "hubContext", hubContext, "operation", operation, "error", err)
	return &federation.FederationError{
		Provider:   provider,
		HubContext: hubContext,
		Type:       federation.ClusterErrorType(k8s.ClassifyError(err.Error())),
		Message:    sanitizeAgentError(operation, err),
	}
}

// fanOutDetect runs Detect for every (provider, context) pair in parallel.
// Each goroutine returns its own ProviderHubStatus to the results channel;
// the caller concatenates after all goroutines exit. No outer-scope slice
// mutation — the pattern mandated by the concurrent-mutation-safety ratchet
// from Issue 9364.
func fanOutDetect(
	ctx context.Context,
	providers []federation.Provider,
	contexts []string,
	getConfig configResolver,
) []federation.ProviderHubStatus {
	type job struct {
		provider   federation.Provider
		hubContext string
	}
	if len(providers) == 0 || len(contexts) == 0 {
		return []federation.ProviderHubStatus{}
	}

	jobs := make([]job, 0, len(providers)*len(contexts))
	for _, p := range providers {
		for _, c := range contexts {
			jobs = append(jobs, job{provider: p, hubContext: c})
		}
	}

	out := make(chan federation.ProviderHubStatus, len(jobs))
	var wg sync.WaitGroup
	wg.Add(len(jobs))
	for _, j := range jobs {
		jobItem := j
		safego.GoWith("federation-detect/"+jobItem.hubContext+"/"+string(jobItem.provider.Name()), func() {
			defer wg.Done()
			out <- runOneDetect(ctx, jobItem.provider, jobItem.hubContext, getConfig)
		})
	}
	wg.Wait()
	close(out)

	results := make([]federation.ProviderHubStatus, 0, len(jobs))
	for r := range out {
		results = append(results, r)
	}
	return results
}

// runOneDetect is the body of a single fanOutDetect goroutine. Broken out
// for readability and so tests can exercise error classification without
// spinning up the full fan-out.
func runOneDetect(
	ctx context.Context,
	p federation.Provider,
	hubContext string,
	getConfig configResolver,
) federation.ProviderHubStatus {
	probeCtx, cancel := context.WithTimeout(ctx, federationPerProviderTimeout)
	defer cancel()

	cfg, err := getConfig(hubContext)
	if err != nil {
		return federation.ProviderHubStatus{
			Provider:   p.Name(),
			HubContext: hubContext,
			Detected:   false,
			Error:      newFederationError(p.Name(), hubContext, "detect federation provider", err),
		}
	}

	res, err := p.Detect(probeCtx, cfg)
	if err != nil {
		return federation.ProviderHubStatus{
			Provider:   p.Name(),
			HubContext: hubContext,
			Detected:   false,
			Error:      newFederationError(p.Name(), hubContext, "detect federation provider", err),
		}
	}
	return federation.ProviderHubStatus{
		Provider:   p.Name(),
		HubContext: hubContext,
		Detected:   res.Detected,
		Version:    res.Version,
	}
}

// fanOutRead runs one of the three reader methods for every (provider,
// context) pair in parallel. Items are appended in whatever order the
// goroutines finish; the UI sorts them at render time. Per-pair errors are
// classified and returned alongside — one pair failing never poisons
// another pair's results.
func fanOutRead(
	ctx context.Context,
	providers []federation.Provider,
	contexts []string,
	getConfig configResolver,
	read federationReadFunc,
) ([]interface{}, []federation.FederationError) {
	if len(providers) == 0 || len(contexts) == 0 {
		return []interface{}{}, []federation.FederationError{}
	}

	type pairResult struct {
		items []interface{}
		err   *federation.FederationError
	}

	pairs := make([]struct {
		p federation.Provider
		c string
	}, 0, len(providers)*len(contexts))
	for _, p := range providers {
		for _, c := range contexts {
			pairs = append(pairs, struct {
				p federation.Provider
				c string
			}{p: p, c: c})
		}
	}

	out := make(chan pairResult, len(pairs))
	var wg sync.WaitGroup
	wg.Add(len(pairs))
	for _, pr := range pairs {
		provider := pr.p
		hubContext := pr.c
		safego.GoWith("federation-read/"+hubContext+"/"+string(provider.Name()), func() {
			defer wg.Done()
			out <- runOneRead(ctx, provider, hubContext, getConfig, read)
		})
	}
	wg.Wait()
	close(out)

	items := make([]interface{}, 0)
	errs := make([]federation.FederationError, 0)
	for r := range out {
		items = append(items, r.items...)
		if r.err != nil {
			errs = append(errs, *r.err)
		}
	}
	return items, errs
}

// runOneRead is the body of a single fanOutRead goroutine. It resolves the
// rest config, invokes the supplied reader, and normalizes the returned
// concrete slice into []interface{} (so the fan-out layer doesn't care
// whether the reader returned []FederatedCluster, []FederatedGroup, or
// []PendingJoin).
func runOneRead(
	ctx context.Context,
	p federation.Provider,
	hubContext string,
	getConfig configResolver,
	read federationReadFunc,
) struct {
	items []interface{}
	err   *federation.FederationError
} {
	probeCtx, cancel := context.WithTimeout(ctx, federationPerProviderTimeout)
	defer cancel()

	cfg, err := getConfig(hubContext)
	if err != nil {
		return struct {
			items []interface{}
			err   *federation.FederationError
		}{
			err: newFederationError(p.Name(), hubContext, "read federation data", err),
		}
	}

	raw, err := read(probeCtx, p, cfg)
	if err != nil {
		return struct {
			items []interface{}
			err   *federation.FederationError
		}{
			err: newFederationError(p.Name(), hubContext, "read federation data", err),
		}
	}

	// Normalize the reader's concrete slice into []interface{} without
	// importing reflect at the hot path. The three reader shapes are the
	// only ones the Provider contract allows.
	var items []interface{}
	switch v := raw.(type) {
	case []federation.FederatedCluster:
		items = make([]interface{}, 0, len(v))
		for i := range v {
			items = append(items, v[i])
		}
	case []federation.FederatedGroup:
		items = make([]interface{}, 0, len(v))
		for i := range v {
			items = append(items, v[i])
		}
	case []federation.PendingJoin:
		items = make([]interface{}, 0, len(v))
		for i := range v {
			items = append(items, v[i])
		}
	case nil:
		items = []interface{}{}
	default:
		// A provider returned an unexpected type. Surface it as a failure
		// so the bug is visible instead of silently dropped. Should never
		// fire in practice because the Provider interface constrains the
		// return types — but defensive.
		return struct {
			items []interface{}
			err   *federation.FederationError
		}{
			err: &federation.FederationError{
				Provider:   p.Name(),
				HubContext: hubContext,
				Type:       federation.ClusterErrorUnknown,
				Message:    "provider returned unsupported result type",
			},
		}
	}
	return struct {
		items []interface{}
		err   *federation.FederationError
	}{items: items}
}

// federationActionTimeout bounds a single action execution. Actions may
// involve real API mutations (CSR approval, ManagedCluster patch/delete)
// so we allow slightly more time than a read probe but still cap it to
// prevent runaway operations.
const federationActionTimeout = 30 * time.Second

// handleFederationAction serves `POST /federation/action` — the Phase 2
// imperative action endpoint. It decodes an ActionRequest from the body,
// looks up the provider in the registry, asserts ActionProvider, resolves
// the user's rest.Config for the specified hubContext, and delegates to
// the provider's Execute method. The result is returned as ActionResult JSON.
func (s *Server) handleFederationAction(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !s.requireBearerToken(w, r) {
		return
	}
	if s.k8sClient == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "k8s client not initialized")
		return
	}

	// Read and decode the request body.
	body, err := io.ReadAll(io.LimitReader(r.Body, int64(maxRequestBodyBytes)))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "failed to read request body")
		return
	}
	defer r.Body.Close()

	var req federation.ActionRequest
	if err := json.Unmarshal(body, &req); err != nil {
		slog.Error("failed to decode federation action request", "error", err)
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if req.ActionID == "" || req.Provider == "" || req.HubContext == "" {
		writeJSONError(w, http.StatusBadRequest, "actionId, provider, and hubContext are required")
		return
	}

	// Look up the provider in the registry.
	p, ok := federation.Get(req.Provider)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown federation provider: "+string(req.Provider))
		return
	}

	// Assert the provider implements ActionProvider.
	ap, ok := p.(federation.ActionProvider)
	if !ok {
		writeJSONError(w, http.StatusNotImplemented, "provider "+string(req.Provider)+" does not support actions")
		return
	}

	// Resolve the user's rest.Config for the specified hub context.
	cfg, err := s.k8sClient.GetRestConfig(req.HubContext)
	if err != nil {
		slog.Error("failed to resolve federation action config", "hubContext", req.HubContext, "error", err)
		writeJSONError(w, http.StatusInternalServerError, sanitizeAgentError("resolve federation action config", err))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), federationActionTimeout)
	defer cancel()

	result, err := ap.Execute(ctx, cfg, req)
	if err != nil {
		slog.Error("federation action execution failed", "provider", req.Provider, "actionID", req.ActionID, "hubContext", req.HubContext, "error", err)
		writeJSONError(w, http.StatusInternalServerError, sanitizeAgentError("execute federation action", err))
		return
	}
	writeJSON(w, result)
}
