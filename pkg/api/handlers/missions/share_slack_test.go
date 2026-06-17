package missions

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveAllowedShareRepos(t *testing.T) {
	t.Run("defaults only", func(t *testing.T) {
		t.Setenv(allowedShareRepoEnvVar, "")

		allowed := resolveAllowedShareRepos()

		require.Equal(t, []string{"kubestellar/console-kb"}, allowed)
	})

	t.Run("appends trimmed env entries", func(t *testing.T) {
		t.Setenv(allowedShareRepoEnvVar, " MyOrg/Missions , , another/repo ")

		allowed := resolveAllowedShareRepos()

		require.Equal(t, []string{
			"kubestellar/console-kb",
			"MyOrg/Missions",
			"another/repo",
		}, allowed)
	})
}

func TestIsRepoAllowedForShareWithList_CaseInsensitive(t *testing.T) {
	allowed := []string{"Kubestellar/Console-KB", "MyOrg/Missions"}

	assert.True(t, isRepoAllowedForShareWithList("kubestellar/console-kb", allowed))
	assert.True(t, isRepoAllowedForShareWithList("KUBESTELLAR/CONSOLE-KB", allowed))
	assert.True(t, isRepoAllowedForShareWithList("myorg/missions", allowed))
	assert.False(t, isRepoAllowedForShareWithList("attacker/evil", allowed))
}

func TestValidateSlackWebhookURL_StrictValidation(t *testing.T) {
	tests := []struct {
		name    string
		rawURL  string
		wantErr string
	}{
		{
			name:   "valid webhook",
			rawURL: "https://hooks.slack.com/services/T000/B000/XXX",
		},
		{
			name:    "empty webhook",
			rawURL:  "",
			wantErr: "webhook URL is required",
		},
		{
			name:    "invalid URL",
			rawURL:  "://bad",
			wantErr: "webhook URL is not a valid URL",
		},
		{
			name:    "http rejected",
			rawURL:  "http://hooks.slack.com/services/T000/B000/XXX",
			wantErr: "webhook URL must use https",
		},
		{
			name:    "userinfo rejected",
			rawURL:  "https://attacker@hooks.slack.com/services/T000/B000/XXX",
			wantErr: "webhook URL must not include userinfo",
		},
		{
			name:    "prefix attack rejected",
			rawURL:  "https://hooks.slack.com.evil.com/services/T000/B000/XXX",
			wantErr: "webhook URL host must be hooks.slack.com",
		},
		{
			name:    "subdomain rejected",
			rawURL:  "https://api.hooks.slack.com/services/T000/B000/XXX",
			wantErr: "webhook URL host must be hooks.slack.com",
		},
		{
			name:    "port rejected",
			rawURL:  "https://hooks.slack.com:443/services/T000/B000/XXX",
			wantErr: "webhook URL must not specify a port",
		},
		{
			name:    "wrong path rejected",
			rawURL:  "https://hooks.slack.com/api/T000/B000/XXX",
			wantErr: "webhook URL path must begin with /services/",
		},
		{
			name:    "path escape rejected",
			rawURL:  "https://hooks.slack.com/@attacker.evil",
			wantErr: "webhook URL path must begin with /services/",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSlackWebhookURL(tt.rawURL)
			if tt.wantErr == "" {
				require.NoError(t, err)
				return
			}
			require.EqualError(t, err, tt.wantErr)
		})
	}
}

func TestShareToSlack_ValidationAndUpstreamFailures(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		httpClient *http.Client
		wantStatus int
		wantError  string
	}{
		{
			name:       "invalid JSON body",
			body:       "{",
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid request body",
		},
		{
			name:       "invalid webhook",
			body:       `{"webhookUrl":"https://evil.com/webhook","text":"hello"}`,
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid webhook URL",
		},
		{
			name:       "missing text",
			body:       `{"webhookUrl":"https://hooks.slack.com/services/T000/B000/XXX"}`,
			wantStatus: http.StatusBadRequest,
			wantError:  "text is required",
		},
		{
			name:       "oversized text",
			body:       `{"webhookUrl":"https://hooks.slack.com/services/T000/B000/XXX","text":"` + strings.Repeat("a", slackMaxTextBytes+1) + `"}`,
			wantStatus: http.StatusBadRequest,
			wantError:  "text exceeds maximum size (10240 bytes)",
		},
		{
			name: "transport error",
			body: `{"webhookUrl":"https://hooks.slack.com/services/T000/B000/XXX","text":"hello"}`,
			httpClient: &http.Client{
				Transport: &mockTransport{handler: func(*http.Request) (*http.Response, error) {
					return nil, errors.New("boom")
				}},
			},
			wantStatus: http.StatusBadGateway,
			wantError:  "slack webhook request failed",
		},
		{
			name: "non-200 upstream",
			body: `{"webhookUrl":"https://hooks.slack.com/services/T000/B000/XXX","text":"hello"}`,
			httpClient: &http.Client{
				Transport: &mockTransport{handler: func(*http.Request) (*http.Response, error) {
					return &http.Response{
						StatusCode: http.StatusInternalServerError,
						Body:       io.NopCloser(strings.NewReader("fail")),
						Header:     make(http.Header),
					}, nil
				}},
			},
			wantStatus: http.StatusBadGateway,
			wantError:  "slack returned status 500",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, handler := setupMissionsTest()
			if tt.httpClient != nil {
				handler.httpClient = tt.httpClient
			}

			req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", strings.NewReader(tt.body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			require.Equal(t, tt.wantStatus, resp.StatusCode)

			var body map[string]interface{}
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			require.Equal(t, tt.wantError, body["error"])
		})
	}
}

func TestShareToSlack_SendsExpectedPayload(t *testing.T) {
	var (
		gotMethod      string
		gotContentType string
		gotPayload     map[string]string
	)

	slackMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotContentType = r.Header.Get("Content-Type")

		defer r.Body.Close()
		require.NoError(t, json.NewDecoder(r.Body).Decode(&gotPayload))

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer slackMock.Close()

	app, handler := setupMissionsTest()
	handler.httpClient = &http.Client{
		Transport: &mockTransport{handler: func(req *http.Request) (*http.Response, error) {
			req.URL.Scheme = "http"
			req.URL.Host = strings.TrimPrefix(slackMock.URL, "http://")
			return http.DefaultTransport.RoundTrip(req)
		}},
	}

	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", strings.NewReader(
		`{"webhookUrl":"https://hooks.slack.com/services/T000/B000/XXX","text":"mission ready"}`,
	))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, true, body["success"])
	assert.Equal(t, http.MethodPost, gotMethod)
	assert.Equal(t, "application/json", gotContentType)
	assert.Equal(t, map[string]string{"text": "mission ready"}, gotPayload)
}
