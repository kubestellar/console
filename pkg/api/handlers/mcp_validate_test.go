package handlers

import (
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMcpValidateName(t *testing.T) {
	tests := []struct {
		name      string
		param     string
		value     string
		wantErr   bool
		wantCode  int
		wantSubst string
	}{
		{name: "empty value is valid", param: "cluster", value: "", wantErr: false},
		{name: "valid simple name", param: "namespace", value: "kube-system", wantErr: false},
		{name: "valid name with dots", param: "cluster", value: "prod.us-east-1.cluster", wantErr: false},
		{name: "valid single char", param: "cluster", value: "a", wantErr: false},
		{name: "valid two chars", param: "cluster", value: "ab", wantErr: false},
		{name: "starts with digit", param: "cluster", value: "1abc", wantErr: false},
		{name: "uppercase rejected", param: "cluster", value: "MyCluster", wantErr: true, wantCode: 400, wantSubst: "must consist of lowercase"},
		{name: "starts with dash rejected", param: "namespace", value: "-abc", wantErr: true, wantCode: 400, wantSubst: "must consist of lowercase"},
		{name: "ends with dash rejected", param: "namespace", value: "abc-", wantErr: true, wantCode: 400, wantSubst: "must consist of lowercase"},
		{name: "underscore rejected", param: "cluster", value: "my_cluster", wantErr: true, wantCode: 400, wantSubst: "must consist of lowercase"},
		{name: "space rejected", param: "cluster", value: "my cluster", wantErr: true, wantCode: 400, wantSubst: "must consist of lowercase"},
		{name: "exceeds max length", param: "cluster", value: strings.Repeat("a", 254), wantErr: true, wantCode: 400, wantSubst: "exceeds maximum length"},
		{name: "exactly max length valid", param: "cluster", value: strings.Repeat("a", 253), wantErr: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidateName(tt.param, tt.value)
			if tt.wantErr {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Equal(t, tt.wantCode, fiberErr.Code)
				assert.Contains(t, fiberErr.Message, tt.wantSubst)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMcpValidateLabelSelector(t *testing.T) {
	tests := []struct {
		name      string
		value     string
		wantErr   bool
		wantSubst string
	}{
		{name: "empty is valid", value: "", wantErr: false},
		{name: "simple equality", value: "app=nginx", wantErr: false},
		{name: "complex selector", value: "app in (nginx,apache),tier=frontend", wantErr: false},
		{name: "exceeds max length", value: strings.Repeat("a=b,", 300), wantErr: true, wantSubst: "exceeds maximum length"},
		{name: "semicolons rejected", value: "app=nginx;rm -rf /", wantErr: true, wantSubst: "disallowed characters"},
		{name: "newlines rejected", value: "app=nginx\nmalicious", wantErr: true, wantSubst: "disallowed characters"},
		{name: "carriage return rejected", value: "app=nginx\rmalicious", wantErr: true, wantSubst: "disallowed characters"},
		{name: "backtick rejected", value: "app=`whoami`", wantErr: true, wantSubst: "disallowed characters"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidateLabelSelector(tt.value)
			if tt.wantErr {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Equal(t, fiber.StatusBadRequest, fiberErr.Code)
				assert.Contains(t, fiberErr.Message, tt.wantSubst)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMcpValidatePositiveInt(t *testing.T) {
	tests := []struct {
		name      string
		param     string
		value     int
		max       int
		wantErr   bool
		wantSubst string
	}{
		{name: "zero is valid", param: "limit", value: 0, max: 100, wantErr: false},
		{name: "within range", param: "limit", value: 50, max: 100, wantErr: false},
		{name: "at max is valid", param: "limit", value: 100, max: 100, wantErr: false},
		{name: "negative rejected", param: "limit", value: -1, max: 100, wantErr: true, wantSubst: "must be a positive integer"},
		{name: "exceeds max", param: "tailLines", value: 101, max: 100, wantErr: true, wantSubst: "exceeds maximum of 100"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidatePositiveInt(tt.param, tt.value, tt.max)
			if tt.wantErr {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Equal(t, fiber.StatusBadRequest, fiberErr.Code)
				assert.Contains(t, fiberErr.Message, tt.wantSubst)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMcpValidateWorkloadType(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{name: "empty is valid (means all)", value: "", wantErr: false},
		{name: "Deployment valid", value: "Deployment", wantErr: false},
		{name: "StatefulSet valid", value: "StatefulSet", wantErr: false},
		{name: "DaemonSet valid", value: "DaemonSet", wantErr: false},
		{name: "lowercase rejected", value: "deployment", wantErr: true},
		{name: "unknown type rejected", value: "CronJob", wantErr: true},
		{name: "arbitrary string rejected", value: "foobar", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidateWorkloadType(tt.value)
			if tt.wantErr {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Equal(t, fiber.StatusBadRequest, fiberErr.Code)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMcpValidateClusterAndNamespace(t *testing.T) {
	tests := []struct {
		name      string
		cluster   string
		namespace string
		wantErr   bool
		wantSubst string
	}{
		{name: "both empty valid", cluster: "", namespace: "", wantErr: false},
		{name: "valid cluster only", cluster: "prod-east", namespace: "", wantErr: false},
		{name: "valid namespace only", cluster: "", namespace: "kube-system", wantErr: false},
		{name: "both valid", cluster: "prod-east", namespace: "default", wantErr: false},
		{name: "invalid cluster", cluster: "INVALID", namespace: "default", wantErr: true, wantSubst: "cluster"},
		{name: "invalid namespace", cluster: "valid", namespace: "INVALID", wantErr: true, wantSubst: "namespace"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidateClusterAndNamespace(tt.cluster, tt.namespace)
			if tt.wantErr {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Contains(t, fiberErr.Message, tt.wantSubst)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
