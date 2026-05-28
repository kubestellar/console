package api

import (
	"context"
	"os"
	"testing"

	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
)

// oauthCredentialStore is a minimal store interface for resolveOAuthCredentials testing.
type oauthCredentialStore struct {
	store.Store
	clientID     string
	clientSecret string
	err          error
	called       bool
}

func (s *oauthCredentialStore) GetOAuthCredentials(_ context.Context) (string, string, error) {
	s.called = true
	return s.clientID, s.clientSecret, s.err
}

func newTestServerWithOAuthStore(cfg Config, st *oauthCredentialStore) *Server {
	return &Server{
		config: cfg,
		store:  st,
	}
}

func TestResolveOAuthCredentials_SkipsDBWhenEnvVarSet(t *testing.T) {
	tests := []struct {
		name           string
		envValue       string
		initialID      string
		initialSecret  string
		dbID           string
		dbSecret       string
		expectDBCalled bool
		expectID       string
		expectSecret   string
	}{
		{
			name:           "env var true — DB is never queried",
			envValue:       "true",
			dbID:           "db-id",
			dbSecret:       "db-secret",
			expectDBCalled: false,
			expectID:       "",
			expectSecret:   "",
		},
		{
			name:           "env var unset — DB credentials are loaded",
			envValue:       "",
			dbID:           "db-id",
			dbSecret:       "db-secret",
			expectDBCalled: true,
			expectID:       "db-id",
			expectSecret:   "db-secret",
		},
		{
			name:           "env var false — DB credentials are loaded",
			envValue:       "false",
			dbID:           "db-id",
			dbSecret:       "db-secret",
			expectDBCalled: true,
			expectID:       "db-id",
			expectSecret:   "db-secret",
		},
		{
			name:           "explicit config takes precedence over DB regardless of env var",
			envValue:       "",
			initialID:      "env-id",
			initialSecret:  "env-secret",
			dbID:           "db-id",
			dbSecret:       "db-secret",
			expectDBCalled: false,
			expectID:       "env-id",
			expectSecret:   "env-secret",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Set/unset the env var for this test (cannot use t.Parallel with t.Setenv).
			if tc.envValue != "" {
				t.Setenv("IGNORE_PERSISTED_OAUTH_CREDENTIALS", tc.envValue)
			} else {
				t.Setenv("IGNORE_PERSISTED_OAUTH_CREDENTIALS", "")
				os.Unsetenv("IGNORE_PERSISTED_OAUTH_CREDENTIALS")
			}

			st := &oauthCredentialStore{
				clientID:     tc.dbID,
				clientSecret: tc.dbSecret,
			}

			srv := newTestServerWithOAuthStore(Config{
				GitHubClientID: tc.initialID,
				GitHubSecret:   tc.initialSecret,
			}, st)

			srv.resolveOAuthCredentials()

			assert.Equal(t, tc.expectDBCalled, st.called, "DB call expectation mismatch")
			assert.Equal(t, tc.expectID, srv.config.GitHubClientID)
			assert.Equal(t, tc.expectSecret, srv.config.GitHubSecret)
		})
	}
}
