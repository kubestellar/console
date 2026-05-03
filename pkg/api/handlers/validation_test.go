package handlers

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsValidCronSchedule(t *testing.T) {
	tests := []struct {
		name     string
		schedule string
		want     bool
	}{
		{"valid standard", "* * * * *", true},
		{"valid numbers", "1 2 3 4 5", true},
		{"valid ranges", "1-5 * * * *", true},
		{"valid steps", "*/5 * * * *", true},
		{"valid complex", "0 0 1,15 * 1-5", true},
		{"too few fields", "* * * *", false},
		{"too many fields", "* * * * * *", false},
		{"invalid characters", "* * * * a", false},
		{"field too long", "11111111111111111111111111111111111111111111111111111111111111111 * * * *", false},
		{"empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isValidCronSchedule(tt.schedule))
		})
	}
}

func TestIsValidK8sName(t *testing.T) {
	tests := []struct {
		name    string
		k8sName string
		want    bool
	}{
		{"simple name", "nginx", true},
		{"with dots", "keda.sh", true},
		{"with hyphens", "my-app", true},
		{"alphanumeric", "v1beta1", true},
		{"single char", "a", true},
		{"uppercase", "Nginx", false},
		{"invalid start", "-nginx", false},
		{"invalid end", "nginx.", false},
		{"special chars", "my_app", false},
		{"too long", string(make([]byte, 254)), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isValidK8sName(tt.k8sName))
		})
	}
}

func TestIsValidK8sVersion(t *testing.T) {
	tests := []struct {
		name    string
		version string
		want    bool
	}{
		{"v1", "v1", true},
		{"v1beta1", "v1beta1", true},
		{"v2alpha1", "v2alpha1", true},
		{"no v prefix", "1", false},
		{"invalid suffix", "v1beta", false}, // pattern is `^v[0-9]+([a-z]+[0-9]+)?$`
		{"just v", "v", false},
		{"v1beta1-extra", "v1beta1-extra", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isValidK8sVersion(tt.version))
		})
	}
}
