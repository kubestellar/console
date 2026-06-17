package missions

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateSlackWebhookURL_Valid(t *testing.T) {
	validURL := "https://hooks.slack.com/services/T00/B00/XXX"
	err := validateSlackWebhookURL(validURL)
	assert.NoError(t, err)
}

func TestValidateSlackWebhookURL_Invalid(t *testing.T) {
	tests := []struct {
		name string
		url  string
		msg  string
	}{
		{name: "http instead of https", url: "http://hooks.slack.com/services/T00/B00/XXX", msg: "must use https"},
		{name: "javascript protocol", url: "javascript:alert(1)", msg: "must use https"},
		{name: "file protocol", url: "file:///etc/passwd", msg: "must use https"},
		{name: "SSRF internal IP", url: "https://192.168.1.1/services/T", msg: "host must be hooks.slack.com"},
		{name: "SSRF localhost", url: "https://localhost/services/T", msg: "host must be hooks.slack.com"},
		{name: "wrong domain", url: "https://evil.com/services/T00/B00/XXX", msg: "host must be hooks.slack.com"},
		{name: "subdomain confusion", url: "https://hooks.slack.com.evil.com/services/T", msg: "host must be hooks.slack.com"},
		{name: "empty string", url: "", msg: "webhook URL is required"},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			err := validateSlackWebhookURL(tt.url)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tt.msg)
		})
	}
}

func TestResolveAllowedShareRepos(t *testing.T) {
	const envVar = "KC_ALLOWED_SHARE_REPOS"

	t.Run("env unset includes default repos", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		repos := resolveAllowedShareRepos()
		assert.NotEmpty(t, repos, "allowlist must not be empty")
		assert.Contains(t, repos, "kubestellar/console-kb")
	})

	t.Run("env with additional repos", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		require.NoError(t, os.Setenv(envVar, "org1/repo1,org2/repo2"))

		repos := resolveAllowedShareRepos()
		assert.Contains(t, repos, "kubestellar/console-kb")
		assert.Contains(t, repos, "org1/repo1")
		assert.Contains(t, repos, "org2/repo2")
		assert.GreaterOrEqual(t, len(repos), 3)
	})

	t.Run("env values are trimmed", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		require.NoError(t, os.Setenv(envVar, " org1/repo1 , org2/repo2 "))

		repos := resolveAllowedShareRepos()
		assert.Contains(t, repos, "kubestellar/console-kb")
		assert.Contains(t, repos, "org1/repo1")
		assert.Contains(t, repos, "org2/repo2")
	})

	t.Run("env with empty entries are ignored", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		require.NoError(t, os.Setenv(envVar, "org1/repo1,,org2/repo2"))

		repos := resolveAllowedShareRepos()
		assert.Contains(t, repos, "kubestellar/console-kb")
		assert.Contains(t, repos, "org1/repo1")
		assert.Contains(t, repos, "org2/repo2")
	})
}

func TestIsRepoAllowedForShareWithList(t *testing.T) {
	allowlist := []string{"kubestellar/console-kb", "org1/repo1"}

	t.Run("repo in list", func(t *testing.T) {
		assert.True(t, isRepoAllowedForShareWithList("kubestellar/console-kb", allowlist))
	})

	t.Run("case insensitive match", func(t *testing.T) {
		assert.True(t, isRepoAllowedForShareWithList("KubeStellar/Console-KB", allowlist))
	})

	t.Run("repo not in list", func(t *testing.T) {
		assert.False(t, isRepoAllowedForShareWithList("evil/repo", allowlist))
	})

	t.Run("empty list", func(t *testing.T) {
		assert.False(t, isRepoAllowedForShareWithList("kubestellar/console-kb", []string{}))
	})

	t.Run("nil list", func(t *testing.T) {
		assert.False(t, isRepoAllowedForShareWithList("kubestellar/console-kb", nil))
	})
}

func TestIsRepoAllowedForShare(t *testing.T) {
	const envVar = "KC_ALLOWED_SHARE_REPOS"

	t.Run("exact match", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.True(t, isRepoAllowedForShare("kubestellar/console-kb"))
	})

	t.Run("uppercase variant", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.True(t, isRepoAllowedForShare("KUBESTELLAR/CONSOLE-KB"))
	})

	t.Run("not in list", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.False(t, isRepoAllowedForShare("evil/repo"))
	})

	t.Run("empty string", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.False(t, isRepoAllowedForShare(""))
	})

	t.Run("path traversal attempt", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.False(t, isRepoAllowedForShare("layer5io/../admin/repo"))
	})
}
