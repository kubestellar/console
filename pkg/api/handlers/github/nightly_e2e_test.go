package github

import (
	"bytes"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsSafeImageKey(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		expected bool
	}{
		{
			name:     "SafeKey",
			key:      "nginx",
			expected: true,
		},
		{
			name:     "SafeKeyWithDash",
			key:      "api-gateway",
			expected: true,
		},
		{
			name:     "SafeKeyWithDot",
			key:      "node.exporter",
			expected: true,
		},
		{
			name:     "ProtoBlockedDoubleUnderscore",
			key:      "__proto__",
			expected: false,
		},
		{
			name:     "ConstructorBlocked",
			key:      "constructor",
			expected: false,
		},
		{
			name:     "PrototypeBlocked",
			key:      "prototype",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isSafeImageKey(tt.key)
			assert.Equal(t, tt.expected, got)
		})
	}
}

func TestParseImagesFromYAML(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected map[string]string
	}{
		{
			name: "DirectImageReference",
			content: `apiVersion: v1
kind: Pod
spec:
  containers:
  - image: ghcr.io/llm-d/api-server:v1.2.3
`,
			expected: map[string]string{
				"api-server": "v1.2.3",
			},
		},
		{
			name: "MultipleDirectImages",
			content: `apiVersion: v1
kind: Pod
spec:
  containers:
  - image: ghcr.io/llm-d/frontend:v2.0.0
  - image: ghcr.io/llm-d/backend:v1.5.0
`,
			expected: map[string]string{
				"frontend": "v2.0.0",
				"backend":  "v1.5.0",
			},
		},
		{
			name: "HubNameTagPattern",
			content: `images:
  - hub: ghcr.io/llm-d
    name: worker
    tag: v3.1.0
`,
			expected: map[string]string{
				"worker": "v3.1.0",
			},
		},
		{
			name: "SkipCommentedLines",
			content: `apiVersion: v1
# - image: ghcr.io/llm-d/commented:v9.9.9
spec:
  containers:
  - image: ghcr.io/llm-d/active:v1.0.0
`,
			expected: map[string]string{
				"active": "v1.0.0",
			},
		},
		{
			name: "PrototypePollutionBlocked",
			content: `apiVersion: v1
spec:
  containers:
  - image: ghcr.io/llm-d/__proto__:malicious
  - image: ghcr.io/llm-d/constructor:bad
  - image: ghcr.io/llm-d/safe:v1.0.0
`,
			expected: map[string]string{
				"safe": "v1.0.0",
			},
		},
		{
			name:     "NoImages",
			content:  `apiVersion: v1\nkind: Service\n`,
			expected: map[string]string{},
		},
		{
			name: "HubWithCommentedNameTag",
			content: `images:
  - hub: ghcr.io/llm-d
    # name: disabled
    name: enabled
    tag: v2.0.0
`,
			expected: map[string]string{
				"enabled": "v2.0.0",
			},
		},
		{
			name: "ImageWithDashAndDot",
			content: `spec:
  containers:
  - image: ghcr.io/llm-d/node.exporter:v1.7.0
`,
			expected: map[string]string{
				"node.exporter": "v1.7.0",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseImagesFromYAML(tt.content)
			assert.Equal(t, tt.expected, got)
		})
	}
}

func TestIsGPUStep(t *testing.T) {
	tests := []struct {
		name     string
		stepName string
		expected bool
	}{
		{
			name:     "GPUAvailabilityCheck",
			stepName: "Check GPU Availability",
			expected: true,
		},
		{
			name:     "LowercaseGPU",
			stepName: "check gpu availability",
			expected: true,
		},
		{
			name:     "MixedCase",
			stepName: "Verify Gpu Available",
			expected: true,
		},
		{
			name:     "GPUWithoutAvailable",
			stepName: "Configure GPU",
			expected: false,
		},
		{
			name:     "AvailableWithoutGPU",
			stepName: "Check Node Availability",
			expected: false,
		},
		{
			name:     "NoGPUNoAvailable",
			stepName: "Run Tests",
			expected: false,
		},
		{
			name:     "AvailabilPartialMatch",
			stepName: "Check GPU Availabil",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isGPUStep(tt.stepName)
			assert.Equal(t, tt.expected, got)
		})
	}
}

func TestReadTruncatedLog(t *testing.T) {
	tests := []struct {
		name           string
		input          string
		expectedPrefix string
		maxSize        int
	}{
		{
			name:           "ShortLog",
			input:          "Short log content",
			expectedPrefix: "Short log content",
			maxSize:        maxLogBytes,
		},
		{
			name:           "LongLogTruncated",
			input:          strings.Repeat("A", maxLogBytes+1000),
			expectedPrefix: "...[truncated]\n",
			maxSize:        maxLogBytes,
		},
		{
			name:           "ExactlyMaxLogBytes",
			input:          strings.Repeat("B", maxLogBytes),
			expectedPrefix: "B",
			maxSize:        maxLogBytes,
		},
		{
			name:           "EmptyLog",
			input:          "",
			expectedPrefix: "",
			maxSize:        0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reader := bytes.NewReader([]byte(tt.input))
			got := readTruncatedLog(reader)

			if tt.name == "LongLogTruncated" {
				assert.True(t, strings.HasPrefix(got, tt.expectedPrefix))
				// Ensure the result is at most maxLogBytes + truncation prefix
				assert.LessOrEqual(t, len(got), maxLogBytes+len("...[truncated]\n"))
				// Verify it contains the tail
				assert.True(t, strings.Contains(got, "A"))
			} else {
				assert.True(t, strings.HasPrefix(got, tt.expectedPrefix) || got == tt.expectedPrefix)
			}
		})
	}
}

func TestReadTruncatedLogErrorHandling(t *testing.T) {
	// Test with a reader that returns an error
	errorReader := &errorReader{err: io.ErrUnexpectedEOF}
	result := readTruncatedLog(errorReader)
	assert.Equal(t, "[error reading log]", result)
}

// errorReader is a helper that always returns an error
type errorReader struct {
	err error
}

func (e *errorReader) Read(p []byte) (n int, err error) {
	return 0, e.err
}

func TestValidateGitHubLogRedirect(t *testing.T) {
	tests := []struct {
		name      string
		location  string
		expectErr bool
		errMsg    string
	}{
		{
			name:      "ValidActionsGitHubUserContent",
			location:  "https://actions.githubusercontent.com/log/file.txt",
			expectErr: false,
		},
		{
			name:      "ValidPipelinesActionsGitHubUserContent",
			location:  "https://pipelines.actions.githubusercontent.com/log/file.txt",
			expectErr: false,
		},
		{
			name:      "ValidSubdomainActionsGitHubUserContent",
			location:  "https://storage.actions.githubusercontent.com/log/file.txt",
			expectErr: false,
		},
		{
			name:      "InvalidHTTPScheme",
			location:  "http://actions.githubusercontent.com/log/file.txt",
			expectErr: true,
			errMsg:    "scheme",
		},
		{
			name:      "InvalidHost",
			location:  "https://evil.com/log/file.txt",
			expectErr: true,
			errMsg:    "not a trusted GitHub Actions host",
		},
		{
			name:      "InvalidSubdomain",
			location:  "https://actions.githubusercontent.com.evil.com/log/file.txt",
			expectErr: true,
			errMsg:    "not a trusted GitHub Actions host",
		},
		{
			name:      "InvalidURLFormat",
			location:  "not-a-url",
			expectErr: true,
			errMsg:    "scheme",
		},
		{
			name:      "MissingScheme",
			location:  "//actions.githubusercontent.com/log/file.txt",
			expectErr: true,
			errMsg:    "scheme",
		},
		{
			name:      "FileScheme",
			location:  "file:///etc/passwd",
			expectErr: true,
			errMsg:    "scheme",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateGitHubLogRedirect(tt.location)

			if tt.expectErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errMsg)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
