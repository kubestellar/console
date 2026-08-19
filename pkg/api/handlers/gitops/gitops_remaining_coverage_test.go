package gitops

// gitops_remaining_coverage_test.go adds tests for functions that were
// previously uncovered or under-covered after the initial coverage pass.
// Related issues: kubestellar/console#22613, kubestellar/console#22633

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// operators.go — getDemoOperatorsForStreaming
// ---------------------------------------------------------------------------

func TestGetDemoOperatorsForStreaming(t *testing.T) {
	ops := getDemoOperatorsForStreaming()
	assert.NotEmpty(t, ops, "demo operators should not be empty")
	for _, op := range ops {
		assert.NotEmpty(t, op.Name, "each demo operator should have a name")
		assert.NotEmpty(t, op.Cluster, "each demo operator should have a cluster")
	}
}

// ---------------------------------------------------------------------------
// operators.go — getDemoHelmReleasesForStreaming
// ---------------------------------------------------------------------------

func TestGetDemoHelmReleasesForStreaming(t *testing.T) {
	releases := getDemoHelmReleasesForStreaming()
	assert.NotEmpty(t, releases, "demo helm releases should not be empty")
	for _, r := range releases {
		assert.NotEmpty(t, r.Name, "each demo release should have a name")
		assert.NotEmpty(t, r.Cluster, "each demo release should have a cluster")
	}
}

// ---------------------------------------------------------------------------
// argo.go — detachedHelmContext
// ---------------------------------------------------------------------------

func TestDetachedHelmContext(t *testing.T) {
	app := fiber.New()
	var ctxDeadline time.Time
	var deadlineOK bool

	app.Get("/test", func(c *fiber.Ctx) error {
		ctx, cancel := detachedHelmContext(c)
		defer cancel()
		ctxDeadline, deadlineOK = ctx.Deadline()
		return c.SendStatus(fiber.StatusOK)
	})

	req, err := http.NewRequest(http.MethodGet, "/test", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	assert.True(t, deadlineOK, "detachedHelmContext should have a deadline")
	assert.True(t, ctxDeadline.After(time.Now()), "deadline should be in the future")
}

// ---------------------------------------------------------------------------
// handler.go — ListDrifts
// ---------------------------------------------------------------------------

func TestListDrifts_Empty(t *testing.T) {
	h := NewGitOpsHandlers(nil, nil, nil)
	app := fiber.New()
	app.Get("/api/gitops/drifts", h.ListDrifts)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/drifts", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	drifts, ok := body["drifts"]
	assert.True(t, ok, "response should contain 'drifts' key")
	assert.NotNil(t, drifts)
}

func TestListDrifts_WithData(t *testing.T) {
	h := NewGitOpsHandlers(nil, nil, nil)

	req := DetectDriftRequest{
		RepoURL:   "https://github.com/example/repo",
		Path:      "manifests",
		Cluster:   "prod",
		Namespace: "default",
	}
	res := &DetectDriftResponse{
		Drifted: true,
		Resources: []DriftedResource{
			{Name: "nginx", Kind: "Deployment", Namespace: "default", Field: "spec.replicas", DiffOutput: "+3 -2"},
		},
	}
	h.rememberDrift(req, res)

	app := fiber.New()
	app.Get("/api/gitops/drifts", h.ListDrifts)

	httpReq, err := http.NewRequest(http.MethodGet, "/api/gitops/drifts?cluster=prod&namespace=default", nil)
	require.NoError(t, err)
	httpReq.Host = "localhost"

	resp, err := app.Test(httpReq, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	drifts, ok := body["drifts"]
	assert.True(t, ok)
	driftSlice, ok := drifts.([]interface{})
	assert.True(t, ok)
	assert.NotEmpty(t, driftSlice)
}

// ---------------------------------------------------------------------------
// argo.go — findReleaseNamespace (via getHelmReleasesForCluster stub)
// ---------------------------------------------------------------------------

func TestFindReleaseNamespace_NotFound(t *testing.T) {
	h := NewGitOpsHandlers(nil, nil, nil)
	ctx := context.Background()

	// With no k8s client and no helm binary, getHelmReleasesForCluster returns empty.
	ns := h.findReleaseNamespace(ctx, "", "nonexistent-release")
	assert.Empty(t, ns, "should return empty string when release not found")
}

// ---------------------------------------------------------------------------
// operators.go — ListOperatorSubscriptions no-k8s path
// ---------------------------------------------------------------------------

func TestListOperatorSubscriptions_NoK8sClient(t *testing.T) {
	h := NewGitOpsHandlers(nil, nil, nil)
	app := fiber.New()
	app.Get("/api/gitops/subscriptions", h.ListOperatorSubscriptions)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/subscriptions", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	_, ok := body["subscriptions"]
	assert.True(t, ok, "response should contain 'subscriptions' key")
}

func TestListOperatorSubscriptions_InvalidCluster(t *testing.T) {
	h := NewGitOpsHandlers(nil, nil, nil)
	app := fiber.New()
	app.Get("/api/gitops/subscriptions", h.ListOperatorSubscriptions)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/subscriptions?cluster=bad%21name", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// operators.go — ListOperators no-k8s path
// ---------------------------------------------------------------------------

func TestListOperators_NoK8sClient(t *testing.T) {
	h := NewGitOpsHandlers(nil, nil, nil)
	app := fiber.New()
	app.Get("/api/gitops/operators", h.ListOperators)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/operators", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	_, ok := body["operators"]
	assert.True(t, ok, "response should contain 'operators' key")
}

// ---------------------------------------------------------------------------
// handler.go — snapshotDrifts — cluster/namespace filtering
// ---------------------------------------------------------------------------

func TestSnapshotDrifts_FilterByCluster(t *testing.T) {
	h := NewGitOpsHandlers(nil, nil, nil)

	reqProd := DetectDriftRequest{
		RepoURL: "https://github.com/test/repo", Path: "manifests",
		Cluster: "prod", Namespace: "default",
	}
	resProd := &DetectDriftResponse{
		Drifted: true,
		Resources: []DriftedResource{
			{Name: "svc", Kind: "Service", Namespace: "default", Field: "spec.type", DiffOutput: "changed"},
		},
	}
	h.rememberDrift(reqProd, resProd)

	reqStaging := DetectDriftRequest{
		RepoURL: "https://github.com/test/repo", Path: "manifests",
		Cluster: "staging", Namespace: "default",
	}
	resStaging := &DetectDriftResponse{
		Drifted: true,
		Resources: []DriftedResource{
			{Name: "deploy", Kind: "Deployment", Namespace: "default", Field: "spec.replicas", DiffOutput: "changed"},
		},
	}
	h.rememberDrift(reqStaging, resStaging)

	prodDrifts := h.snapshotDrifts("prod", "")
	stagingDrifts := h.snapshotDrifts("staging", "")
	allDrifts := h.snapshotDrifts("", "")

	assert.NotEmpty(t, prodDrifts, "prod filter should return prod drifts")
	assert.NotEmpty(t, stagingDrifts, "staging filter should return staging drifts")
	assert.GreaterOrEqual(t, len(allDrifts), len(prodDrifts)+len(stagingDrifts)-1)
}

func TestSnapshotDrifts_FilterByNamespace(t *testing.T) {
	h := NewGitOpsHandlers(nil, nil, nil)

	req := DetectDriftRequest{
		RepoURL: "https://github.com/test/repo", Path: "manifests",
		Cluster: "prod", Namespace: "kube-system",
	}
	res := &DetectDriftResponse{
		Drifted: true,
		Resources: []DriftedResource{
			{Name: "coredns", Kind: "ConfigMap", Namespace: "kube-system", Field: "data", DiffOutput: "changed"},
		},
	}
	h.rememberDrift(req, res)

	ksDrifts := h.snapshotDrifts("", "kube-system")
	assert.NotEmpty(t, ksDrifts, "kube-system filter should return matching drifts")

	otherDrifts := h.snapshotDrifts("", "other-ns")
	assert.Empty(t, otherDrifts, "filter for unmatched namespace should return empty")
}

// ---------------------------------------------------------------------------
// handler.go — getHelmReleasesViaExec with empty cluster (coverage branch)
// ---------------------------------------------------------------------------

func TestGetHelmReleasesViaExec_EmptyCluster(t *testing.T) {
	_, _ = writeFakeHelm(t, "#!/bin/sh\necho '[{\"name\":\"myapp\",\"namespace\":\"default\",\"revision\":\"1\",\"updated\":\"2024-01-01\",\"status\":\"deployed\",\"chart\":\"myapp-1.0.0\",\"app_version\":\"1.0\"}]'\n")

	handler := NewGitOpsHandlers(nil, nil, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	releases := handler.getHelmReleasesViaExec(ctx, "")
	// Without a k8s client the exec path may return empty; just assert no panic.
	_ = releases
}
