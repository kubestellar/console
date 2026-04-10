package api

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestHealth_OAuthConfiguredRequiresBothIdAndSecret covers #6056: the
// /health endpoint must report oauth_configured=true ONLY when BOTH the
// GitHub client ID AND the client secret are present. A partial config
// (id set but no secret, or vice versa) is unusable for OAuth — the token
// exchange step needs the secret to authenticate to GitHub — so the probe
// must not lie to the frontend about OAuth readiness. The helper lives on
// Server so we exercise it directly without spinning up the full server
// with DB, k8s, hub, etc.
func TestHealth_OAuthConfiguredRequiresBothIdAndSecret(t *testing.T) {
	cases := []struct {
		name     string
		clientID string
		secret   string
		want     bool
	}{
		{
			name:     "both empty",
			clientID: "",
			secret:   "",
			want:     false,
		},
		{
			name:     "id only (the #6056 regression case)",
			clientID: "client-id",
			secret:   "",
			want:     false,
		},
		{
			name:     "secret only",
			clientID: "",
			secret:   "shhh",
			want:     false,
		},
		{
			name:     "both set",
			clientID: "client-id",
			secret:   "shhh",
			want:     true,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			s := &Server{
				config: Config{
					GitHubClientID: tc.clientID,
					GitHubSecret:   tc.secret,
				},
			}
			assert.Equal(t, tc.want, s.oauthConfigured(),
				"oauth_configured must require both client id and secret (#6056)")
		})
	}
}
