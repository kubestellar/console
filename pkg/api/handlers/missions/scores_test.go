package missions

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMissions_GetKBScores_Success(t *testing.T) {
	mockBody := `{"version":1,"count":2,"missions":[
		{"path":"fixes/demo/test1.json","title":"Test 1","cncfProjects":["harbor"],"qualityScore":85,"qualityPass":true},
		{"path":"fixes/demo/test2.json","title":"Test 2","cncfProjects":["kubernetes"],"qualityScore":92,"qualityPass":true}
	]}`

	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/kubestellar/console-kb/master/fixes/index.json")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(mockBody))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))

	assert.Equal(t, float64(2), result["count"])
	scores := result["scores"].([]interface{})
	assert.Len(t, scores, 2)

	score1 := scores[0].(map[string]interface{})
	assert.Equal(t, "Test 1", score1["title"])
	assert.Equal(t, "harbor", score1["project"])
	assert.Equal(t, float64(85), score1["qualityScore"])
	assert.Equal(t, true, score1["qualityPass"])
}

func TestMissions_GetKBScores_Pagination(t *testing.T) {
	mockBody := `{"version":1,"count":5,"missions":[
		{"path":"fixes/1.json","title":"T1","cncfProjects":["p1"],"qualityScore":80,"qualityPass":true},
		{"path":"fixes/2.json","title":"T2","cncfProjects":["p2"],"qualityScore":81,"qualityPass":true},
		{"path":"fixes/3.json","title":"T3","cncfProjects":["p3"],"qualityScore":82,"qualityPass":true},
		{"path":"fixes/4.json","title":"T4","cncfProjects":["p4"],"qualityScore":83,"qualityPass":true},
		{"path":"fixes/5.json","title":"T5","cncfProjects":["p5"],"qualityScore":84,"qualityPass":true}
	]}`

	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(mockBody))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores?limit=2&offset=1", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))

	assert.Equal(t, float64(5), result["count"])
	assert.Equal(t, float64(2), result["limit"])
	assert.Equal(t, float64(1), result["offset"])
	assert.Equal(t, true, result["hasMore"])

	scores := result["scores"].([]interface{})
	assert.Len(t, scores, 2)
	assert.Equal(t, "T2", scores[0].(map[string]interface{})["title"])
}

func TestMissions_GetKBScores_DemoMode(t *testing.T) {
	app, _ := setupMissionsTest()

	req, err := http.NewRequest("GET", "/api/missions/scores", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))

	assert.Equal(t, float64(1), result["count"])
	scores := result["scores"].([]interface{})
	assert.Len(t, scores, 1)
	assert.Equal(t, "Demo Mission", scores[0].(map[string]interface{})["title"])
}

func TestMissions_GetMissionScore_Success(t *testing.T) {
	mockBody := `{"version":1,"count":1,"missions":[
		{
			"path":"fixes/demo/test-123.json",
			"title":"Test Mission",
			"cncfProjects":["demo"],
			"qualityScore":88,
			"qualityPass":true,
			"qualityBreakdown":{"structure":90,"completeness":86},
			"qualityIssues":[],
			"qualitySuggestions":["Add more context"]
		}
	]}`

	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(mockBody))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores/demo/test-123", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))

	assert.Equal(t, "Test Mission", result["title"])
	assert.Equal(t, "demo", result["project"])
	assert.Equal(t, float64(88), result["qualityScore"])
	assert.Equal(t, true, result["qualityPass"])

	breakdown := result["qualityBreakdown"].(map[string]interface{})
	assert.Equal(t, float64(90), breakdown["structure"])
}

func TestMissions_GetMissionScore_NotFound(t *testing.T) {
	mockBody := `{"version":1,"count":0,"missions":[]}`

	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(mockBody))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores/demo/nonexistent", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))
	assert.Contains(t, result["error"], "not found")
}

func TestMissions_GetMissionScore_NoScore(t *testing.T) {
	mockBody := `{"version":1,"count":1,"missions":[
		{"path":"fixes/demo/test-123.json","title":"Test Mission","cncfProjects":["demo"]}
	]}`

	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(mockBody))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/scores/demo/test-123", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))
	assert.Contains(t, result["error"], "no score")
}
