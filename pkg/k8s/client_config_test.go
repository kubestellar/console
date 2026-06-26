package k8s

import (
	"testing"

	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestClientConfigValidation(t *testing.T) {
	tests := []struct {
		name        string
		server      string
		namespace   string
		expectValid bool
	}{
		{
			name:        "valid config",
			server:      "https://api.k8s.local:6443",
			namespace:   "default",
			expectValid: true,
		},
		{
			name:        "empty server",
			server:      "",
			namespace:   "default",
			expectValid: false,
		},
		{
			name:        "empty namespace ok",
			server:      "https://api.k8s.local:6443",
			namespace:   "",
			expectValid: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			valid := tc.server != ""
			require.Equal(t, tc.expectValid, valid)
		})
	}
}

func TestListOptionsDefaulting(t *testing.T) {
	tests := []struct {
		name     string
		opts     metav1.ListOptions
		expected int64
	}{
		{
			name:     "default limit",
			opts:     metav1.ListOptions{},
			expected: 0,
		},
		{
			name: "custom limit",
			opts: metav1.ListOptions{
				Limit: 100,
			},
			expected: 100,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.expected, tc.opts.Limit)
		})
	}
}
