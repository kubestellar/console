package missions

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestShareToGitHub_RequestValidation(t *testing.T) {
	tests := []struct {
		name       string
		makeApp    func(t *testing.T) *fiber.App
		body       string
		token      string
		wantStatus int
		wantError  string
		validate   func(t *testing.T, body map[string]interface{})
	}{
		{
			name: "missing token",
			makeApp: func(t *testing.T) *fiber.App {
				app, _ := setupMissionsTest()
				return app
			},
			body:       `{"repo":"kubestellar/console-kb","filePath":"missions/test.json","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`,
			wantStatus: http.StatusUnauthorized,
			wantError:  "X-GitHub-Token header is required",
		},
		{
			name: "payload too large",
			makeApp: func(t *testing.T) *fiber.App {
				app := fiber.New(fiber.Config{BodyLimit: missionsGitHubShareMaxBytes + 1024})
				handler := NewMissionsHandler()
				handler.RegisterRoutes(app.Group("/api/missions"))
				return app
			},
			body: `{"repo":"kubestellar/console-kb","filePath":"missions/test.json","content":"` +
				strings.Repeat("a", missionsGitHubShareMaxBytes) +
				`","branch":"mission-test","message":"add mission"}`,
			token:      "ghp_test123",
			wantStatus: http.StatusRequestEntityTooLarge,
			wantError:  "payload too large",
			validate: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, float64(missionsGitHubShareMaxBytes), body["maxSize"])
			},
		},
		{
			name: "invalid JSON body",
			makeApp: func(t *testing.T) *fiber.App {
				app, _ := setupMissionsTest()
				return app
			},
			body:       "{",
			token:      "ghp_test123",
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid request body",
		},
		{
			name: "missing required fields",
			makeApp: func(t *testing.T) *fiber.App {
				app, _ := setupMissionsTest()
				return app
			},
			body:       `{"repo":"kubestellar/console-kb","branch":"mission-test"}`,
			token:      "ghp_test123",
			wantStatus: http.StatusBadRequest,
			wantError:  "repo, filePath, content, and branch are required",
		},
		{
			name: "repo not allowlisted",
			makeApp: func(t *testing.T) *fiber.App {
				app, _ := setupMissionsTest()
				return app
			},
			body:       `{"repo":"attacker/private-repo","filePath":"missions/test.json","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`,
			token:      "ghp_test123",
			wantStatus: http.StatusBadRequest,
			wantError:  "repo is not on the share allowlist",
			validate: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, []interface{}{"kubestellar/console-kb"}, body["allowed_repos"])
			},
		},
		{
			name: "repo not allowlisted includes env entries",
			makeApp: func(t *testing.T) *fiber.App {
				t.Setenv(allowedShareRepoEnvVar, "MyOrg/Missions")
				app, _ := setupMissionsTest()
				return app
			},
			body:       `{"repo":"attacker/private-repo","filePath":"missions/test.json","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`,
			token:      "ghp_test123",
			wantStatus: http.StatusBadRequest,
			wantError:  "repo is not on the share allowlist",
			validate: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, []interface{}{"kubestellar/console-kb", "MyOrg/Missions"}, body["allowed_repos"])
			},
		},
		{
			name: "invalid file path",
			makeApp: func(t *testing.T) *fiber.App {
				app, _ := setupMissionsTest()
				return app
			},
			body:       `{"repo":"kubestellar/console-kb","filePath":"../etc/passwd","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`,
			token:      "ghp_test123",
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid filePath",
		},
		{
			name: "invalid branch",
			makeApp: func(t *testing.T) *fiber.App {
				app, _ := setupMissionsTest()
				return app
			},
			body:       `{"repo":"kubestellar/console-kb","filePath":"missions/test.json","content":"dGVzdA==","branch":"bad branch","message":"add mission"}`,
			token:      "ghp_test123",
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid branch",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := tt.makeApp(t)

			req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", strings.NewReader(tt.body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			if tt.token != "" {
				req.Header.Set("X-GitHub-Token", tt.token)
			}

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			require.Equal(t, tt.wantStatus, resp.StatusCode)

			var body map[string]interface{}
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			assert.Equal(t, tt.wantError, body["error"])
			if tt.validate != nil {
				tt.validate(t, body)
			}
		})
	}
}

func TestShareToGitHub_UpstreamFailures(t *testing.T) {
	tests := []struct {
		name       string
		handler    http.HandlerFunc
		wantStatus int
		wantError  string
	}{
		{
			name: "fork failure",
			handler: func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/repos/kubestellar/console-kb/forks" {
					http.Error(w, "boom", http.StatusBadGateway)
					return
				}
				http.NotFound(w, r)
			},
			wantStatus: http.StatusBadGateway,
			wantError:  "GitHub fork failed with status 502",
		},
		{
			name: "fork missing full name",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.URL.Path == "/repos/kubestellar/console-kb/forks" {
					_ = json.NewEncoder(w).Encode(map[string]interface{}{"full_name": ""})
					return
				}
				http.NotFound(w, r)
			},
			wantStatus: http.StatusBadGateway,
			wantError:  "fork response missing or malformed full_name",
		},
		{
			name: "commit response missing sha",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/repos/kubestellar/console-kb/forks":
					_ = json.NewEncoder(w).Encode(map[string]interface{}{
						"full_name": "testuser/console-kb",
					})
				case "/repos/kubestellar/console-kb":
					_ = json.NewEncoder(w).Encode(map[string]string{"default_branch": "main"})
				case "/repos/testuser/console-kb/git/ref/heads/main":
					_ = json.NewEncoder(w).Encode(map[string]interface{}{
						"object": map[string]string{"sha": "headsha"},
					})
				case "/repos/testuser/console-kb/git/refs":
					w.WriteHeader(http.StatusCreated)
					_ = json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/mission-test"})
				case "/repos/testuser/console-kb/contents/missions/test.json":
					w.WriteHeader(http.StatusCreated)
					_ = json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{}})
				default:
					http.NotFound(w, r)
				}
			},
			wantStatus: http.StatusBadGateway,
			wantError:  "GitHub commit response missing expected content SHA",
		},
		{
			name: "pr response missing url",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/repos/kubestellar/console-kb/forks":
					_ = json.NewEncoder(w).Encode(map[string]interface{}{
						"full_name": "testuser/console-kb",
					})
				case "/repos/kubestellar/console-kb":
					_ = json.NewEncoder(w).Encode(map[string]string{"default_branch": "main"})
				case "/repos/testuser/console-kb/git/ref/heads/main":
					_ = json.NewEncoder(w).Encode(map[string]interface{}{
						"object": map[string]string{"sha": "headsha"},
					})
				case "/repos/testuser/console-kb/git/refs":
					w.WriteHeader(http.StatusCreated)
					_ = json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/mission-test"})
				case "/repos/testuser/console-kb/contents/missions/test.json":
					w.WriteHeader(http.StatusCreated)
					_ = json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{"sha": "commitsha"}})
				case "/repos/kubestellar/console-kb/pulls":
					w.WriteHeader(http.StatusCreated)
					_ = json.NewEncoder(w).Encode(map[string]string{})
				default:
					http.NotFound(w, r)
				}
			},
			wantStatus: http.StatusBadGateway,
			wantError:  "GitHub PR response missing html_url",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock := httptest.NewServer(tt.handler)
			defer mock.Close()

			app, handler := setupMissionsTest()
			handler.githubAPIURL = mock.URL

			req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", strings.NewReader(
				`{"repo":"kubestellar/console-kb","filePath":"missions/test.json","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`,
			))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-GitHub-Token", "ghp_test123")

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			require.Equal(t, tt.wantStatus, resp.StatusCode)

			var body map[string]interface{}
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			assert.Equal(t, tt.wantError, body["error"])
		})
	}
}

func TestShareToGitHub_SuccessUsesResolvedDefaultBranchAndExpectedPayloads(t *testing.T) {
	type requestRecord struct {
		Method        string
		Path          string
		Authorization string
		Accept        string
		ContentType   string
		Body          map[string]interface{}
	}

	records := make([]requestRecord, 0, 6)

	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		record := requestRecord{
			Method:        r.Method,
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Accept:        r.Header.Get("Accept"),
			ContentType:   r.Header.Get("Content-Type"),
		}
		if r.Body != nil && r.ContentLength != 0 {
			defer r.Body.Close()
			body := make(map[string]interface{})
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			record.Body = body
		}
		records = append(records, record)

		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/repos/kubestellar/console-kb/forks":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"full_name":      "testuser/console-kb",
				"default_branch": "stale-branch",
				"parent": map[string]interface{}{
					"default_branch": "also-stale",
				},
			})
		case "/repos/kubestellar/console-kb":
			_ = json.NewEncoder(w).Encode(map[string]string{"default_branch": "trunk"})
		case "/repos/testuser/console-kb/git/ref/heads/trunk":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "headsha"},
			})
		case "/repos/testuser/console-kb/git/refs":
			w.WriteHeader(http.StatusUnprocessableEntity)
			_, _ = w.Write([]byte(`{"message":"Reference already exists"}`))
		case "/repos/testuser/console-kb/contents/missions/test.json":
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"content": map[string]string{"sha": "commitsha"},
			})
		case "/repos/kubestellar/console-kb/pulls":
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"html_url": "https://github.com/kubestellar/console-kb/pull/42",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", strings.NewReader(
		`{"repo":"kubestellar/console-kb","filePath":"missions/test.json","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`,
	))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, true, body["success"])
	assert.Equal(t, "https://github.com/kubestellar/console-kb/pull/42", body["pr_url"])
	assert.Equal(t, "testuser/console-kb", body["fork"])

	require.Len(t, records, 6)
	assert.Equal(t, http.MethodPost, records[0].Method)
	assert.Equal(t, "/repos/kubestellar/console-kb/forks", records[0].Path)
	assert.Equal(t, "Bearer ghp_test123", records[0].Authorization)
	assert.Equal(t, "application/vnd.github.v3+json", records[0].Accept)
	assert.Equal(t, "application/json", records[0].ContentType)

	assert.Equal(t, http.MethodGet, records[1].Method)
	assert.Equal(t, "/repos/kubestellar/console-kb", records[1].Path)

	assert.Equal(t, http.MethodGet, records[2].Method)
	assert.Equal(t, "/repos/testuser/console-kb/git/ref/heads/trunk", records[2].Path)

	assert.Equal(t, http.MethodPost, records[3].Method)
	assert.Equal(t, "/repos/testuser/console-kb/git/refs", records[3].Path)
	assert.Equal(t, map[string]interface{}{
		"ref": "refs/heads/mission-test",
		"sha": "headsha",
	}, records[3].Body)

	assert.Equal(t, http.MethodPut, records[4].Method)
	assert.Equal(t, "/repos/testuser/console-kb/contents/missions/test.json", records[4].Path)
	assert.Equal(t, map[string]interface{}{
		"branch":  "mission-test",
		"content": "dGVzdA==",
		"message": "add mission",
	}, records[4].Body)

	assert.Equal(t, http.MethodPost, records[5].Method)
	assert.Equal(t, "/repos/kubestellar/console-kb/pulls", records[5].Path)
	assert.Equal(t, map[string]interface{}{
		"base":  "trunk",
		"body":  "Mission shared via KubeStellar Console",
		"head":  "testuser:mission-test",
		"title": "add mission",
	}, records[5].Body)
}
