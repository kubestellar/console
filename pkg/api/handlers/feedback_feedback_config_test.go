package handlers

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFeedbackConfigHelpers(t *testing.T) {
	t.Run("resolveGitHubAPIBase", func(t *testing.T) {
		orig := os.Getenv("GITHUB_URL")
		defer os.Setenv("GITHUB_URL", orig)

		os.Setenv("GITHUB_URL", "")
		assert.Equal(t, "https://api.github.com", resolveGitHubAPIBase())

		os.Setenv("GITHUB_URL", "https://github.com")
		assert.Equal(t, "https://api.github.com", resolveGitHubAPIBase())

		os.Setenv("GITHUB_URL", "https://ghe.example.com")
		assert.Equal(t, "https://ghe.example.com/api/v3", resolveGitHubAPIBase())
	})

	t.Run("extractHost", func(t *testing.T) {
		host, err := extractHost("https://github.com/foo")
		assert.NoError(t, err)
		assert.Equal(t, "github.com", host)

		host, err = extractHost("github.com")
		assert.NoError(t, err)
		assert.Equal(t, "github.com", host)
	})

	t.Run("extractPRNumber", func(t *testing.T) {
		assert.Equal(t, 123, extractPRNumber("pull/123/head"))
		assert.Equal(t, 0, extractPRNumber("invalid"))
	})

	t.Run("extractLinkedIssueNumbers", func(t *testing.T) {
		issues := extractLinkedIssueNumbers("Fixes #123 and closes #456")
		assert.ElementsMatch(t, []int{123, 456}, issues)

		issues = extractLinkedIssueNumbers("Resolves kubestellar/console#789")
		assert.ElementsMatch(t, []int{789}, issues)
	})
}
