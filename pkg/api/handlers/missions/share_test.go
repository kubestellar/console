package missions

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveAllowedShareRepos(t *testing.T) {
	tests := []struct {
		name     string
		envValue *string
		expected []string
	}{
		{
			name:     "env unset",
			envValue: nil,
			expected: []string{"kubestellar/console-kb"},
		},
		{
			name:     "env empty",
			envValue: ptr(""),
			expected: []string{"kubestellar/console-kb"},
		},
		{
			name:     "multiple repos",
			envValue: ptr("myorg/my-missions,anotherorg/repo"),
			expected: []string{"kubestellar/console-kb", "myorg/my-missions", "anotherorg/repo"},
		},
		{
			name:     "whitespace and empty entries",
			envValue: ptr("  myorg/my-missions , , anotherorg/repo  ,  "),
			expected: []string{"kubestellar/console-kb", "myorg/my-missions", "anotherorg/repo"},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			if tc.envValue == nil {
				require.NoError(t, os.Unsetenv(allowedShareRepoEnvVar))
			} else {
				t.Setenv(allowedShareRepoEnvVar, *tc.envValue)
			}

			assert.Equal(t, tc.expected, resolveAllowedShareRepos())
		})
	}
}

func TestIsRepoAllowedForShare(t *testing.T) {
	t.Setenv(allowedShareRepoEnvVar, "MyOrg/Repo-One")

	assert.True(t, isRepoAllowedForShare("kubestellar/console-kb"))
	assert.True(t, isRepoAllowedForShare("myorg/repo-one"))
	assert.False(t, isRepoAllowedForShare("myorg/repo-two"))
}

func TestIsRepoAllowedForShareWithList(t *testing.T) {
	tests := []struct {
		name    string
		repo    string
		allowed []string
		want    bool
	}{
		{
			name:    "exact match",
			repo:    "kubestellar/console-kb",
			allowed: []string{"kubestellar/console-kb", "myorg/repo-one"},
			want:    true,
		},
		{
			name:    "case insensitive match",
			repo:    "KUBESTELLAR/Console-KB",
			allowed: []string{"kubestellar/console-kb"},
			want:    true,
		},
		{
			name:    "not in list",
			repo:    "attacker/repo",
			allowed: []string{"kubestellar/console-kb"},
			want:    false,
		},
		{
			name:    "empty list",
			repo:    "kubestellar/console-kb",
			allowed: []string{},
			want:    false,
		},
		{
			name:    "prefix mismatch",
			repo:    "kubestellar/console-kb-extra",
			allowed: []string{"kubestellar/console-kb"},
			want:    false,
		},
		{
			name:    "suffix mismatch",
			repo:    "myorg/console-kb",
			allowed: []string{"kubestellar/console-kb"},
			want:    false,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, isRepoAllowedForShareWithList(tc.repo, tc.allowed))
		})
	}
}

func TestValidateSlackWebhookURL(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{name: "valid slack webhook", url: "https://hooks.slack.com/services/T000/B000/XXXX", wantErr: false},
		{name: "prefix attack host", url: "https://hooks.slack.com.evil.com/services/T000/B000/XXXX", wantErr: true},
		{name: "scheme downgrade", url: "http://hooks.slack.com/services/T000/B000/XXXX", wantErr: true},
		{name: "port injection", url: "https://hooks.slack.com:8080/services/T000/B000/XXXX", wantErr: true},
		{name: "userinfo smuggling", url: "******hooks.slack.com/services/T000/B000/XXXX", wantErr: true},
		{name: "path escape", url: "https://hooks.slack.com/services/../T000/B000/XXXX", wantErr: true},
		{name: "double slash path", url: "https://hooks.slack.com/services//T000/B000/XXXX", wantErr: true},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			err := validateSlackWebhookURL(tc.url)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestShareToSlack(t *testing.T) {
	var webhookCalls atomic.Int32
	slackMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		webhookCalls.Add(1)
		if strings.Contains(r.URL.Path, "/fail") {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer slackMock.Close()

	tests := []struct {
		name           string
		payload        string
		expectedStatus int
		expectedCalls  int32
	}{
		{
			name:           "success",
			payload:        `{"webhookUrl":"https://hooks.slack.com/services/T0/B0/ok","text":"hello"}`,
			expectedStatus: http.StatusOK,
			expectedCalls:  1,
		},
		{
			name:           "non-200 from webhook",
			payload:        `{"webhookUrl":"https://hooks.slack.com/services/fail/T0/B0","text":"hello"}`,
			expectedStatus: http.StatusBadGateway,
			expectedCalls:  1,
		},
		{
			name:           "oversized text",
			payload:        fmt.Sprintf(`{"webhookUrl":"https://hooks.slack.com/services/T0/B0/ok","text":"%s"}`, strings.Repeat("x", slackMaxTextBytes+1)),
			expectedStatus: http.StatusBadRequest,
			expectedCalls:  0,
		},
		{
			name:           "empty text",
			payload:        `{"webhookUrl":"https://hooks.slack.com/services/T0/B0/ok","text":""}`,
			expectedStatus: http.StatusBadRequest,
			expectedCalls:  0,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			app, handler := setupMissionsTest()
			handler.httpClient = &http.Client{Transport: &mockTransport{handler: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(slackMock.URL, "http://")
				return http.DefaultTransport.RoundTrip(req)
			}}}

			webhookCalls.Store(0)
			req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", strings.NewReader(tc.payload))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, tc.expectedStatus, resp.StatusCode)
			assert.Equal(t, tc.expectedCalls, webhookCalls.Load())
		})
	}
}

func TestShareToGitHub(t *testing.T) {
	tests := []struct {
		name           string
		payload        string
		withToken      bool
		expectedStatus int
		setupMock      bool
	}{
		{
			name:           "allowlist rejection",
			payload:        `{"repo":"attacker/private","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`,
			withToken:      true,
			expectedStatus: http.StatusBadRequest,
			setupMock:      false,
		},
		{
			name:           "missing token",
			payload:        `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`,
			withToken:      false,
			expectedStatus: http.StatusUnauthorized,
			setupMock:      false,
		},
		{
			name:           "success flow",
			payload:        `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`,
			withToken:      true,
			expectedStatus: http.StatusOK,
			setupMock:      true,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			app, handler := setupMissionsTest()
			if tc.setupMock {
				ghMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "application/json")
					switch {
					case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/repos/kubestellar/console-kb/forks"):
						json.NewEncoder(w).Encode(map[string]interface{}{"full_name": "testuser/console-kb", "parent": map[string]interface{}{"default_branch": "main"}})
					case r.Method == http.MethodGet && r.URL.Path == "/repos/kubestellar/console-kb":
						json.NewEncoder(w).Encode(map[string]interface{}{"default_branch": "main"})
					case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/repos/testuser/console-kb/git/ref/heads/main"):
						json.NewEncoder(w).Encode(map[string]interface{}{"object": map[string]interface{}{"sha": "abc123"}})
					case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/repos/testuser/console-kb/git/refs"):
						w.WriteHeader(http.StatusCreated)
						json.NewEncoder(w).Encode(map[string]interface{}{"ref": "refs/heads/mission-test"})
					case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/repos/testuser/console-kb/contents/missions/test.yaml"):
						w.WriteHeader(http.StatusCreated)
						json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]interface{}{"sha": "deadbeef"}})
					case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/repos/kubestellar/console-kb/pulls"):
						w.WriteHeader(http.StatusCreated)
						json.NewEncoder(w).Encode(map[string]interface{}{"html_url": "https://github.com/kubestellar/console-kb/pull/1"})
					default:
						w.WriteHeader(http.StatusNotFound)
					}
				}))
				defer ghMock.Close()
				handler.githubAPIURL = ghMock.URL
			}

			req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", strings.NewReader(tc.payload))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			if tc.withToken {
				req.Header.Set("X-GitHub-Token", "ghp_test")
			}

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, tc.expectedStatus, resp.StatusCode)
		})
	}
}

func ptr(v string) *string { return &v }
