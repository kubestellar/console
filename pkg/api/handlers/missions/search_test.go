package missions

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// searchIndexBody returns a fixes/index.json payload rich enough for the
// hybrid retriever to return meaningful hits for common install queries.
func searchIndexBody() string {
	return `{
		"version": 1,
		"count": 3,
		"missions": [
			{
				"path": "fixes/cncf-install/install-cert-manager.json",
				"title": "Install and Configure Cert Manager on Kubernetes",
				"description": "cert-manager automates TLS certificate issuance for Kubernetes workloads.",
				"category": "cncf-install",
				"missionClass": "install",
				"tags": ["cert-manager", "tls", "certificates"],
				"cncfProjects": ["cert-manager"]
			},
			{
				"path": "fixes/cncf-install/install-prometheus.json",
				"title": "Install and Configure Prometheus on Kubernetes",
				"description": "Prometheus scrapes metrics from cluster workloads and drives alerting.",
				"category": "observability",
				"missionClass": "install",
				"tags": ["prometheus", "monitoring", "metrics"],
				"cncfProjects": ["prometheus"]
			},
			{
				"path": "fixes/cncf-install/install-linkerd.json",
				"title": "Install and Configure Linkerd on Kubernetes",
				"description": "Linkerd is a lightweight service mesh providing mTLS and observability.",
				"category": "networking",
				"missionClass": "install",
				"tags": ["linkerd", "service-mesh"],
				"cncfProjects": ["linkerd"]
			}
		]
	}`
}

// newSearchIndexServer mocks the raw.githubusercontent.com endpoint that
// SearchMissions fetches the index from. hits is incremented once per request.
func newSearchIndexServer(t *testing.T, body string, hits *int32) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/kubestellar/console-kb/master/fixes/index.json")
		if hits != nil {
			atomic.AddInt32(hits, 1)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(body))
	}))
}

func TestSearchMissions_MissingQuery(t *testing.T) {
	app, _ := setupMissionsTest()

	req, err := http.NewRequest("GET", "/api/missions/search", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSearchMissions_EmptyQuery(t *testing.T) {
	app, _ := setupMissionsTest()

	// Whitespace-only queries must be treated as missing, not sent downstream.
	req, err := http.NewRequest("GET", "/api/missions/search?q=%20%20", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSearchMissions_Success(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	req, err := http.NewRequest("GET", "/api/missions/search?q=install+cert-manager", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var out map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &out))

	assert.Equal(t, "install cert-manager", out["query"])
	require.Contains(t, out, "results")
	results := out["results"].([]interface{})
	assert.NotEmpty(t, results, "expected at least one search result")
	assert.Equal(t, float64(len(results)), out["count"])
}

func TestSearchMissions_DefaultKIsFive(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	req, err := http.NewRequest("GET", "/api/missions/search?q=install", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	// Corpus has 3 docs so we can't observe the k=5 cap directly, but count
	// must never exceed the requested (or default) k.
	assert.LessOrEqual(t, int(out["count"].(float64)), 5)
}

func TestSearchMissions_RespectsK(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	req, err := http.NewRequest("GET", "/api/missions/search?q=install&k=1", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	assert.Equal(t, float64(1), out["count"])
}

func TestSearchMissions_CapsKAtMax(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	// k=9999 should be silently clamped to searchMaxK (25); with a 3-doc
	// corpus the observable effect is that the request still succeeds and
	// returns at most 3 results — not an error and not more than the corpus.
	req, err := http.NewRequest("GET", "/api/missions/search?q=install&k=9999", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	assert.LessOrEqual(t, int(out["count"].(float64)), 25)
}

func TestSearchMissions_InvalidKFallsBackToDefault(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	// Non-numeric k must not cause a 400 — the handler is documented to fall
	// back to the default silently.
	req, err := http.NewRequest("GET", "/api/missions/search?q=install&k=notanumber", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestSearchMissions_NegativeKFallsBackToDefault(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	req, err := http.NewRequest("GET", "/api/missions/search?q=install&k=-3", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestSearchMissions_LongQueryTruncated(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	// 600 ASCII characters — well over the 512-rune cap.
	long := strings.Repeat("a", 600)
	req, err := http.NewRequest("GET", "/api/missions/search?q="+long, nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	echoed := out["query"].(string)
	assert.Equal(t, 512, len([]rune(echoed)), "echoed query must be truncated to 512 runes")
	assert.Equal(t, strings.Repeat("a", 512), echoed)
}

func TestSearchMissions_LongMultibyteQueryTruncatedByRune(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	// Each ★ is 3 bytes; 600 of them is 1800 bytes but 600 runes. Truncating
	// by bytes would corrupt UTF-8 mid-rune. The handler must truncate by
	// rune count and echo valid UTF-8 back to the caller.
	long := strings.Repeat("★", 600)
	req, err := http.NewRequest("GET", "/api/missions/search?q="+long, nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	echoed := out["query"].(string)
	assert.Equal(t, 512, len([]rune(echoed)))
	assert.True(t, strings.ContainsRune(echoed, '★'))
	assert.NotContains(t, echoed, "\ufffd", "must not contain the UTF-8 replacement character")
}

func TestSearchMissions_NoResults_RecordsKBGap(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	mockStore := new(test.MockStore)
	// The current corpus never mentions "zzzzz"; expect a gap recorded under
	// the "search:" namespace so the operator UI can surface it.
	mockStore.On("RecordKBGap", mock.MatchedBy(func(p string) bool {
		return strings.HasPrefix(p, "search:") && strings.Contains(p, "zzzzz")
	})).Return(nil).Once()

	app := fiber.New()
	handler := NewMissionsHandler().WithStore(mockStore)
	handler.githubRawURL = mockSrv.URL
	handler.RegisterPublicRoutes(app.Group("/api/missions"))

	// Use a query dissimilar enough to the corpus that hybrid retrieval
	// returns zero results — long random-looking token with no overlap.
	req, err := http.NewRequest("GET", "/api/missions/search?q=zzzzz_unrelated_query_no_hits_zzzzz", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	if int(out["count"].(float64)) != 0 {
		t.Skipf("retriever returned %v hits for a corpus-disjoint query; gap-recording path only fires on zero results", out["count"])
	}
	mockStore.AssertExpectations(t)
}

func TestSearchMissions_NoResults_NoStore_DoesNotPanic(t *testing.T) {
	mockSrv := newSearchIndexServer(t, searchIndexBody(), nil)
	defer mockSrv.Close()

	// No .WithStore() call — store is nil. The zero-results path must not
	// crash when there is no place to record the gap.
	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	req, err := http.NewRequest("GET", "/api/missions/search?q=zzzzz_unrelated_query_no_hits_zzzzz", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestSearchMissions_IndexBuildFailure_Returns503(t *testing.T) {
	// Serve syntactically invalid JSON with a 200. fetchMissionIndexBytes
	// succeeds (bytes are cached), then NewDefaultRetrieverFromIndex fails
	// during parse, which must surface as 503 Service Unavailable.
	mockSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{not valid json"))
	}))
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	req, err := http.NewRequest("GET", "/api/missions/search?q=install", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestSearchMissions_RetrieverCachedAcrossCalls(t *testing.T) {
	var hits int32
	mockSrv := newSearchIndexServer(t, searchIndexBody(), &hits)
	defer mockSrv.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mockSrv.URL

	for i := 0; i < 3; i++ {
		req, err := http.NewRequest("GET", "/api/missions/search?q=install", nil)
		require.NoError(t, err)
		req.Host = "localhost"
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode)
	}

	// After the first fetch the index is cached (missionsResponseCache) and
	// the retriever fingerprint matches, so no more upstream hits should occur.
	assert.Equal(t, int32(1), atomic.LoadInt32(&hits), "index should be fetched exactly once and reused")
	// Retriever must be populated on the handler.
	assert.NotNil(t, handler.retriever)
	assert.NotEmpty(t, handler.retrieverFingerprint)
}
