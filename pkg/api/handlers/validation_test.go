package handlers

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsValidK8sName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantOK   bool
	}{
		{
			name:   "ValidLowercase",
			input:  "myresource",
			wantOK: true,
		},
		{
			name:   "ValidWithDashes",
			input:  "my-resource",
			wantOK: true,
		},
		{
			name:   "ValidWithDots",
			input:  "apps.v1",
			wantOK: true,
		},
		{
			name:   "ValidSingleChar",
			input:  "a",
			wantOK: true,
		},
		{
			name:   "ValidWithNumbers",
			input:  "app1",
			wantOK: true,
		},
		{
			name:   "ValidComplexName",
			input:  "kube-system.v1beta1",
			wantOK: true,
		},
		{
			name:   "TooLong",
			input:  string(make([]byte, MaxK8sNameLen+1)),
			wantOK: false,
		},
		{
			name:   "Uppercase",
			input:  "MyResource",
			wantOK: false,
		},
		{
			name:   "StartsWithDash",
			input:  "-resource",
			wantOK: false,
		},
		{
			name:   "EndsWithDash",
			input:  "resource-",
			wantOK: false,
		},
		{
			name:   "StartsWithDot",
			input:  ".resource",
			wantOK: false,
		},
		{
			name:   "EndsWithDot",
			input:  "resource.",
			wantOK: false,
		},
		{
			name:   "Underscore",
			input:  "my_resource",
			wantOK: false,
		},
		{
			name:   "EmptyString",
			input:  "",
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsValidK8sName(tt.input)
			assert.Equal(t, tt.wantOK, result)
		})
	}
}

func TestMaxK8sNameLenConstant(t *testing.T) {
	// Verify the constant is defined and has the expected value
	assert.Equal(t, 253, MaxK8sNameLen)
}

// TestIsValidK8sVersionAlias checks that the root alias still delegates to
// httputil for both accepted and rejected version strings. The full table
// lives in internal/httputil/validation_test.go.
func TestIsValidK8sVersionAlias(t *testing.T) {
	assert.True(t, IsValidK8sVersion("v1"))
	assert.True(t, IsValidK8sVersion("v1beta1"))
	assert.False(t, IsValidK8sVersion("V1"))
	assert.False(t, IsValidK8sVersion(""))
}
