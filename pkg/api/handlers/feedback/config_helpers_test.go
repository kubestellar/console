package feedback

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestExtractPRNumber covers the Netlify deployment-ref → PR number parser.
func TestExtractPRNumber(t *testing.T) {
	cases := []struct {
		ref  string
		want int
	}{
		{"pull/42/head", 42},
		{"pull/1/head", 1},
		{"pull/9999/head", 9999},
		{"main", 0},
		{"", 0},
		{"refs/heads/main", 0},
		{"pull//head", 0},
		{"pull/abc/head", 0},
	}
	for _, tc := range cases {
		got := extractPRNumber(tc.ref)
		assert.Equal(t, tc.want, got, "extractPRNumber(%q)", tc.ref)
	}
}

// TestExtractHost covers URL → lowercase hostname normalisation.
func TestExtractHost(t *testing.T) {
	cases := []struct {
		raw     string
		want    string
		wantErr bool
	}{
		{"https://github.com", "github.com", false},
		{"github.com", "github.com", false},
		{"GITHUB.COM", "github.com", false},
		{"https://github.enterprise.example.com/api/v3", "github.enterprise.example.com", false},
		{"", "", true},
		{"   ", "", true},
	}
	for _, tc := range cases {
		got, err := extractHost(tc.raw)
		if tc.wantErr {
			assert.Error(t, err, "extractHost(%q) should return an error", tc.raw)
		} else {
			require.NoError(t, err, "extractHost(%q) should not error", tc.raw)
			assert.Equal(t, tc.want, got, "extractHost(%q)", tc.raw)
		}
	}
}

// TestExtractFeatureRequestID covers the "Console Request ID:" body parser.
func TestExtractFeatureRequestID(t *testing.T) {
	knownID := uuid.New()

	cases := []struct {
		name string
		body string
		want uuid.UUID
	}{
		{
			name: "valid ID in body",
			body: "Some text\n**Console Request ID:** " + knownID.String() + "\nMore text",
			want: knownID,
		},
		{
			name: "no marker",
			body: "No request ID here",
			want: uuid.Nil,
		},
		{
			name: "empty body",
			body: "",
			want: uuid.Nil,
		},
		{
			name: "truncated after prefix",
			body: "**Console Request ID:** short",
			want: uuid.Nil,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := extractFeatureRequestID(tc.body)
			assert.Equal(t, tc.want, got)
		})
	}
}

// TestGetEnvOrDefault covers the env-var helper with fallback.
func TestGetEnvOrDefault(t *testing.T) {
	t.Setenv("TEST_HANDLER_ENV_VAR_SET", "hello")
	assert.Equal(t, "hello", getEnvOrDefault("TEST_HANDLER_ENV_VAR_SET", "default"))
	assert.Equal(t, "default", getEnvOrDefault("TEST_HANDLER_ENV_VAR_UNSET_XYZ999", "default"))
}
