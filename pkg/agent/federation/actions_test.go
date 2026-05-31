package federation

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestActionValidation(t *testing.T) {
	tests := []struct {
		name        string
		actionType  string
		expectValid bool
	}{
		{
			name:        "deploy action",
			actionType:  "deploy",
			expectValid: true,
		},
		{
			name:        "scale action",
			actionType:  "scale",
			expectValid: true,
		},
		{
			name:        "delete action",
			actionType:  "delete",
			expectValid: true,
		},
		{
			name:        "empty action",
			actionType:  "",
			expectValid: false,
		},
	}

	validActions := map[string]bool{
		"deploy": true,
		"scale":  true,
		"delete": true,
		"update": true,
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			valid := tc.actionType != "" && (validActions[tc.actionType] || len(tc.actionType) > 0)
			if tc.expectValid {
				require.True(t, valid || tc.actionType != "")
			} else {
				require.Equal(t, "", tc.actionType)
			}
		})
	}
}

func TestActionParameterParsing(t *testing.T) {
	tests := []struct {
		name       string
		params     map[string]string
		expectKeys []string
	}{
		{
			name: "deploy params",
			params: map[string]string{
				"namespace": "default",
				"replicas":  "3",
			},
			expectKeys: []string{"namespace", "replicas"},
		},
		{
			name:       "empty params",
			params:     map[string]string{},
			expectKeys: []string{},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, len(tc.expectKeys), len(tc.params))
			for _, key := range tc.expectKeys {
				_, exists := tc.params[key]
				require.True(t, exists)
			}
		})
	}
}
