package missions

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/kb"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetKBScores_Success(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "fixes/index.json")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(indexWithScores))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	// Only the mission with qualityScore set should appear
	assert.Equal(t, float64(1), body["count"])
	scores, ok := body["scores"].([]interface{})
	require.True(t, ok)
	require.Len(t, scores, 1)
	first := scores[0].(map[string]interface{})
	assert.Equal(t, "coredns", first["project"])
	assert.Equal(t, float64(82), first["qualityScore"])
}

func TestGetKBScores_EmptyResultsEncoding(t *testing.T) {
	// An index with no scored missions should return scores:[] not scores:null.
	emptyIndex := `{"version":1,"count":1,"missions":[{"path":"x","title":"x","cncfProjects":["k8s"]}]}`
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(emptyIndex))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Raw body must contain [] not null for the scores field
	rawBody, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(rawBody), `"scores":[]`,
		"empty scores must encode as [] not null")
}

func TestGetKBScores_UpstreamError(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body, "scores")
	assert.Contains(t, body, "count")
	assert.Contains(t, body, "hasMore")
	assert.Contains(t, body, "limit")
	assert.Contains(t, body, "offset")
}

func TestGetKBScores_StaleCache(t *testing.T) {
	var callCount atomic.Int32
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := callCount.Add(1)
		if count == 1 {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(indexWithScores))
		} else {
			w.WriteHeader(http.StatusForbidden)
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	// Populate cache
	req1, err := http.NewRequest("GET", "/api/missions/scores", nil)
	require.NoError(t, err)
	req1.Host = "localhost"
	resp1, err := app.Test(req1, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)

	// Expire fresh cache
	handler.cache.mu.Lock()
	for _, entry := range handler.cache.entries {
		entry.fetchedAt = time.Now().Add(-missionsCacheTTL - time.Second)
	}
	handler.cache.mu.Unlock()

	// Second request: GitHub 403, should fall back to stale cache
	req2, err := http.NewRequest("GET", "/api/missions/scores", nil)
	require.NoError(t, err)
	req2.Host = "localhost"
	resp2, err := app.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode, "should serve stale cache on rate-limit")
}

func TestGetKBScores_EmbeddedFallback(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`unavailable`))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body, "scores")
	assert.Contains(t, body, "count")
	assert.Contains(t, body, "hasMore")
	assert.Contains(t, body, "limit")
	assert.Contains(t, body, "offset")
}

// ---------- GetMissionScore ----------

func TestGetMissionScore_Success(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(indexWithScores))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores/coredns/coredns-123", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, "coredns", body["project"])
	assert.Equal(t, float64(82), body["qualityScore"])
	assert.NotNil(t, body["qualityBreakdown"])
}

func TestGetMissionScore_NotFound(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(indexWithScores))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores/coredns/coredns-999", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestGetMissionScore_NoScore(t *testing.T) {
	// Kubernetes mission exists but has no qualityScore
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(indexWithScores))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores/kubernetes/kubernetes-456", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "no score")
}

func TestGetMissionScore_ExactIDMatch(t *testing.T) {
	// Ensure "coredns-12" does NOT match "coredns-123.json" (substring false-positive)
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(indexWithScores))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores/coredns/coredns-12", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode,
		"partial ID 'coredns-12' must not match 'coredns-123'")
}

func TestGetMissionScore_UpstreamError(t *testing.T) {
	embeddedIndexBody, err := kb.ReadFile("fixes/index.json")
	require.NoError(t, err)

	var embeddedIndex indexJsonFormat
	require.NoError(t, json.Unmarshal(embeddedIndexBody, &embeddedIndex))

	project := ""
	missionID := ""
	for _, mission := range embeddedIndex.Missions {
		if len(mission.CncfProjects) == 0 || mission.QualityScore == nil {
			continue
		}
		segments := strings.Split(mission.Path, "/")
		project = mission.CncfProjects[0]
		missionID = strings.TrimSuffix(segments[len(segments)-1], ".json")
		break
	}
	require.NotEmpty(t, project)
	require.NotEmpty(t, missionID)

	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores/"+project+"/"+missionID, nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body, "project")
	assert.Contains(t, body, "qualityScore")
}

// ---------- GetKBGaps ----------

func TestGetKBGaps_NoStore_ReturnsDisabled(t *testing.T) {
	// Handler created without a store — gaps endpoint returns disabled source
	app, _ := setupMissionsTest()

	req, err := http.NewRequest("GET", "/api/missions/gaps", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, float64(0), body["count"])
	assert.Equal(t, "disabled", body["source"])
}

func TestGetKBGaps_WithStore_ReturnsGaps(t *testing.T) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	userID := uuid.New()
	lastSeen := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	olderSeen := lastSeen.Add(-time.Hour)
	mockStore.On("GetUser", userID).Return(&models.User{Role: models.UserRoleAdmin}, nil).Once()
	mockStore.On("ListTopKBGaps", 5).Return([]store.KBQueryGap{
		{Path: "fixes/istio", HitCount: 3, LastSeen: lastSeen},
		{Path: "fixes/cert-manager", HitCount: 1, LastSeen: olderSeen},
	}, nil).Once()

	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	handler := NewMissionsHandler().WithStore(mockStore)
	handler.RegisterRoutes(app.Group("/api/missions"))
	handler.RegisterPublicRoutes(app.Group("/api/missions"))

	req, err := http.NewRequest("GET", "/api/missions/gaps?limit=5", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, float64(2), body["count"])
	gaps := body["gaps"].([]interface{})
	require.Len(t, gaps, 2)
	assert.Equal(t, "fixes/istio", gaps[0].(map[string]interface{})["path"])
	assert.NotEmpty(t, gaps[0].(map[string]interface{})["lastSeen"])
}

func TestGetKBGaps_RequiresAdmin(t *testing.T) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	userID := uuid.New()
	mockStore.On("GetUser", userID).Return(&models.User{Role: models.UserRoleViewer}, nil).Once()

	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	handler := NewMissionsHandler().WithStore(mockStore)
	handler.RegisterRoutes(app.Group("/api/missions"))

	req, err := http.NewRequest("GET", "/api/missions/gaps", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// ---------- Helpers ----------

// mockTransport is a http.RoundTripper that delegates to a handler function.
