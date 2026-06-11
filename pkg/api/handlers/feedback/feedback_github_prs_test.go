package feedback

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestExtractPRNumber_ValidRef(t *testing.T) {
	testCases := []struct {
		name     string
		ref      string
		expected int
	}{
		{"PR ref", "refs/pull/123/head", 123},
		{"PR merge ref", "refs/pull/456/merge", 456},
		{"Large PR number", "refs/pull/99999/head", 99999},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := extractPRNumber(tc.ref)
			assert.Equal(t, tc.expected, result, "should extract correct PR number from ref")
		})
	}
}

func TestExtractPRNumber_InvalidRef(t *testing.T) {
	testCases := []struct {
		name string
		ref  string
	}{
		{"Branch ref", "refs/heads/main"},
		{"Tag ref", "refs/tags/v1.0.0"},
		{"Invalid format", "pull/123"},
		{"Empty string", ""},
		{"No number", "refs/pull/abc/head"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := extractPRNumber(tc.ref)
			assert.Equal(t, 0, result, "should return 0 for invalid ref")
		})
	}
}

func TestParseGitHubRequestID_ValidConsoleID(t *testing.T) {
	targetRepo, issueNum, ok := parseGitHubRequestID("gh-123")
	assert.True(t, ok, "should successfully parse console GitHub ID")
	assert.Equal(t, "console", string(targetRepo))
	assert.Equal(t, 123, issueNum)
}

func TestParseGitHubRequestID_ValidDocsID(t *testing.T) {
	targetRepo, issueNum, ok := parseGitHubRequestID("gh-docs-456")
	assert.True(t, ok, "should successfully parse docs GitHub ID")
	assert.Equal(t, "docs", string(targetRepo))
	assert.Equal(t, 456, issueNum)
}

func TestParseGitHubRequestID_InvalidFormat(t *testing.T) {
	testCases := []string{
		"123",                                    // plain number
		"gh-",                                    // missing number
		"gh-abc",                                 // non-numeric
		"gh-docs-",                               // missing docs number
		"gh-docs-xyz",                            // non-numeric docs
		uuid.New().String(),                      // UUID
		"",                                       // empty
		"gh-123-456",                             // too many parts
	}

	for _, tc := range testCases {
		t.Run(tc, func(t *testing.T) {
			_, _, ok := parseGitHubRequestID(tc)
			assert.False(t, ok, "should reject invalid GitHub request ID: %s", tc)
		})
	}
}
