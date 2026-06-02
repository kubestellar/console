package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuthOAuth_IsLocalhostURL(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name string
		raw  string
		want bool
	}{
		{name: "localhost hostname", raw: "http://localhost:8080", want: true},
		{name: "ipv4 loopback", raw: "http://127.0.0.1:8080", want: true},
		{name: "ipv6 loopback", raw: "http://[::1]:8080", want: true},
		{name: "remote host", raw: "https://console.example.com", want: false},
		{name: "invalid url", raw: "://bad-url", want: false},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.want, isLocalhostURL(tc.raw))
		})
	}
}

func TestAuthOAuth_GetGitHubPrimaryEmail(t *testing.T) {
	t.Parallel()

	type responseCase struct {
		name       string
		payload    string
		statusCode int
		wantEmail  string
		wantErr    string
	}

	testCases := []responseCase{
		{
			name:       "selects primary verified email",
			statusCode: http.StatusOK,
			payload:    `[{"email":"secondary@example.com","verified":true},{"email":"primary@example.com","primary":true,"verified":true}]`,
			wantEmail:  "primary@example.com",
		},
		{
			name:       "falls back to first verified email",
			statusCode: http.StatusOK,
			payload:    `[{"email":"first@example.com","verified":true},{"email":"later@example.com","verified":true}]`,
			wantEmail:  "first@example.com",
		},
		{
			name:       "errors when no verified email exists",
			statusCode: http.StatusOK,
			payload:    `[{"email":"unverified@example.com","verified":false}]`,
			wantErr:    "no verified email found",
		},
		{
			name:       "errors on non-200 response",
			statusCode: http.StatusBadGateway,
			payload:    `[]`,
			wantErr:    "GitHub emails API returned 502",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "/user/emails", r.URL.Path)
				assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.statusCode)
				_, _ = w.Write([]byte(tc.payload))
			}))
			defer server.Close()

			h, _ := newRealStoreAuthHandler(t)
			h.githubAPIBase = server.URL
			h.githubHTTPClient = server.Client()

			email, err := h.getGitHubPrimaryEmail(context.Background(), "test-token")
			if tc.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
				assert.Empty(t, email)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tc.wantEmail, email)
		})
	}
}

func TestAuthOAuth_GetGitHubUser_FallsBackToPrimaryEmail(t *testing.T) {
	t.Parallel()

	var mu sync.Mutex
	paths := make([]string, 0, 2)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		paths = append(paths, r.URL.Path)
		mu.Unlock()

		assert.Equal(t, "Bearer access-token", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/user":
			_, _ = w.Write([]byte(`{"id":123,"login":"octocat","email":"","avatar_url":"https://avatars.example/octocat.png"}`))
		case "/user/emails":
			_, _ = w.Write([]byte(`[{"email":"octocat@example.com","primary":true,"verified":true}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	h, _ := newRealStoreAuthHandler(t)
	h.githubAPIBase = server.URL
	h.githubHTTPClient = server.Client()

	user, err := h.getGitHubUser(context.Background(), "access-token")
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, 123, user.ID)
	assert.Equal(t, "octocat", user.Login)
	assert.Equal(t, "octocat@example.com", user.Email)
	assert.Equal(t, "https://avatars.example/octocat.png", user.AvatarURL)

	mu.Lock()
	defer mu.Unlock()
	assert.Equal(t, []string{"/user", "/user/emails"}, paths)
}

func TestAuthOAuth_GitHubLoginAndCallback_SuccessFlow(t *testing.T) {
	app := fiber.New()
	h, s := newRealStoreAuthHandler(t)

	var tokenRequestCode string
	var tokenEndpointCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/login/oauth/access_token":
			tokenEndpointCalls++
			require.NoError(t, r.ParseForm())
			tokenRequestCode = r.Form.Get("code")
			assert.NotEmpty(t, r.Header.Get("Authorization"), "oauth2 client auth should be present")
			_ = json.NewEncoder(w).Encode(map[string]string{
				"access_token": "gh-access-token",
				"token_type":   "bearer",
			})
		case "/user":
			assert.Equal(t, "Bearer gh-access-token", r.Header.Get("Authorization"))
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":         4242,
				"login":      "octocat",
				"email":      "octocat@example.com",
				"avatar_url": "https://avatars.example/octocat.png",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	h.oauthConfig.Endpoint.TokenURL = server.URL + "/login/oauth/access_token"
	h.githubAPIBase = server.URL
	h.githubHTTPClient = server.Client()

	app.Get("/auth/github", h.GitHubLogin)
	app.Get("/auth/github/callback", h.GitHubCallback)

	loginReq, err := http.NewRequest(http.MethodGet, "/auth/github", nil)
	require.NoError(t, err)
	loginResp, err := app.Test(loginReq, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusTemporaryRedirect, loginResp.StatusCode)

	loginLocation, err := loginResp.Location()
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, loginReq.Method)
	assert.Equal(t, "no-store", loginResp.Header.Get("Cache-Control"))
	assert.Contains(t, loginLocation.String(), "client_id=client-id")

	loginQuery, err := url.ParseQuery(loginLocation.RawQuery)
	require.NoError(t, err)
	state := loginQuery.Get("state")
	require.NotEmpty(t, state)

	callbackReq, err := http.NewRequest(http.MethodGet, "/auth/github/callback?code=test-code&state="+url.QueryEscape(state), nil)
	require.NoError(t, err)
	callbackResp, err := app.Test(callbackReq, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusTemporaryRedirect, callbackResp.StatusCode)
	assert.Equal(t, "no-store", callbackResp.Header.Get("Cache-Control"))

	callbackLocation, err := callbackResp.Location()
	require.NoError(t, err)
	assert.Equal(t, "/auth/callback", callbackLocation.Path)
	assert.Contains(t, callbackLocation.RawQuery, "onboarded=false")
	assert.True(t, strings.HasPrefix(callbackLocation.Fragment, "kc_x="))

	fragmentValues, err := url.ParseQuery(callbackLocation.Fragment)
	require.NoError(t, err)
	assert.Equal(t, "gh-access-token", fragmentValues.Get("kc_x"))
	assert.Equal(t, 1, tokenEndpointCalls)
	assert.Equal(t, "test-code", tokenRequestCode)

	authCookie := findResponseCookie(t, callbackResp, jwtCookieName)
	assert.NotEmpty(t, authCookie.Value)
	assert.Equal(t, http.SameSiteStrictMode, authCookie.SameSite)

	createdUser, err := s.GetUserByGitHubID(context.Background(), "4242")
	require.NoError(t, err)
	require.NotNil(t, createdUser)
	assert.Equal(t, "octocat", createdUser.GitHubLogin)
	assert.Equal(t, "octocat@example.com", createdUser.Email)
	assert.Equal(t, "https://avatars.example/octocat.png", createdUser.AvatarURL)

	assert.False(t, h.validateAndConsumeOAuthState(context.Background(), state), "OAuth state should be single-use after callback")
}
