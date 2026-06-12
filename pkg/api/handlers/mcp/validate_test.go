package mcp

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
		wantError bool
		errorMsg  string
	}{
		{
			name:      "empty value is valid",
			param:     "cluster",
			value:     "",
			wantError: false,
		},
		{
			name:      "valid lowercase name",
			param:     "namespace",
			value:     "default",
			wantError: false,
		},
		{
			name:      "valid name with hyphens",
			param:     "cluster",
			value:     "my-cluster-01",
			wantError: false,
		},
		{
			name:      "valid name with dots",
			param:     "namespace",
			value:     "kube-system.svc",
			wantError: false,
		},
		{
			name:      "valid single character",
			param:     "cluster",
			value:     "a",
			wantError: false,
		},
		{
			name:      "valid name with dots and hyphens",
			param:     "cluster",
			value:     "my.cluster-name.01",
			wantError: false,
		},
		{
			name:      "invalid uppercase",
			param:     "cluster",
			value:     "MyCluster",
			wantError: true,
			errorMsg:  "invalid cluster: must consist of lowercase alphanumeric characters",
		},
		{
			name:      "invalid starts with hyphen",
			param:     "namespace",
			value:     "-invalid",
			wantError: true,
			errorMsg:  "invalid namespace: must consist of lowercase alphanumeric characters",
		},
		{
			name:      "invalid ends with hyphen",
			param:     "cluster",
			value:     "invalid-",
			wantError: true,
			errorMsg:  "invalid cluster: must consist of lowercase alphanumeric characters",
		},
		{
			name:      "invalid starts with dot",
			param:     "namespace",
			value:     ".invalid",
			wantError: true,
			errorMsg:  "invalid namespace: must consist of lowercase alphanumeric characters",
		},
		{
			name:      "invalid ends with dot",
			param:     "cluster",
			value:     "invalid.",
			wantError: true,
			errorMsg:  "invalid cluster: must consist of lowercase alphanumeric characters",
		},
		{
			name:      "invalid contains underscore",
			param:     "cluster",
			value:     "my_cluster",
			wantError: true,
			errorMsg:  "invalid cluster: must consist of lowercase alphanumeric characters",
		},
		{
			name:      "invalid contains space",
			param:     "namespace",
			value:     "my namespace",
			wantError: true,
			errorMsg:  "invalid namespace: must consist of lowercase alphanumeric characters",
		},
		{
			name:      "invalid special characters",
			param:     "cluster",
			value:     "cluster@123",
			wantError: true,
			errorMsg:  "invalid cluster: must consist of lowercase alphanumeric characters",
		},
		{
			name:      "exceeds maximum length",
			param:     "cluster",
			value:     strings.Repeat("a", 254),
			wantError: true,
			errorMsg:  "invalid cluster: exceeds maximum length of 253 characters",
		},
		{
			name:      "exactly at maximum length",
			param:     "namespace",
			value:     strings.Repeat("a", 253),
			wantError: false,
		},
		{
			name:      "one character below maximum length",
			param:     "cluster",
			value:     strings.Repeat("a", 252),
			wantError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidateName(tt.param, tt.value)
			if tt.wantError {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Equal(t, fiber.StatusBadRequest, fiberErr.Code)
				assert.Contains(t, fiberErr.Message, tt.errorMsg)
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
		wantError bool
		errorMsg  string
	}{
		{
			name:      "empty value is valid",
			value:     "",
			wantError: false,
		},
		{
			name:      "simple label selector",
			value:     "app=nginx",
			wantError: false,
		},
		{
			name:      "multiple labels",
			value:     "app=nginx,env=prod",
			wantError: false,
		},
		{
			name:      "label with inequality",
			value:     "app!=nginx",
			wantError: false,
		},
		{
			name:      "complex valid selector",
			value:     "app=nginx,env in (prod,staging),tier notin (frontend)",
			wantError: false,
		},
		{
			name:      "selector with dots in keys",
			value:     "app.kubernetes.io/name=nginx",
			wantError: false,
		},
		{
			name:      "contains semicolon",
			value:     "app=nginx;env=prod",
			wantError: true,
			errorMsg:  "invalid labelSelector: contains disallowed characters",
		},
		{
			name:      "contains newline",
			value:     "app=nginx\nenv=prod",
			wantError: true,
			errorMsg:  "invalid labelSelector: contains disallowed characters",
		},
		{
			name:      "contains carriage return",
			value:     "app=nginx\renv=prod",
			wantError: true,
			errorMsg:  "invalid labelSelector: contains disallowed characters",
		},
		{
			name:      "contains backtick",
			value:     "app=`whoami`",
			wantError: true,
			errorMsg:  "invalid labelSelector: contains disallowed characters",
		},
		{
			name:      "exceeds maximum length",
			value:     strings.Repeat("a", 1025),
			wantError: true,
			errorMsg:  "invalid labelSelector: exceeds maximum length of 1024 characters",
		},
		{
			name:      "exactly at maximum length",
			value:     strings.Repeat("a", 1024),
			wantError: false,
		},
		{
			name:      "one character below maximum length",
			value:     strings.Repeat("a", 1023),
			wantError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidateLabelSelector(tt.value)
			if tt.wantError {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Equal(t, fiber.StatusBadRequest, fiberErr.Code)
				assert.Contains(t, fiberErr.Message, tt.errorMsg)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMcpValidatePositiveInt(t *testing.T) {
	const maxTestValue = 100

	tests := []struct {
		name      string
		param     string
		value     int
		max       int
		wantError bool
		errorMsg  string
	}{
		{
			name:      "zero is valid",
			param:     "limit",
			value:     0,
			max:       maxTestValue,
			wantError: false,
		},
		{
			name:      "positive value within range",
			param:     "limit",
			value:     50,
			max:       maxTestValue,
			wantError: false,
		},
		{
			name:      "value at maximum",
			param:     "limit",
			value:     maxTestValue,
			max:       maxTestValue,
			wantError: false,
		},
		{
			name:      "value one below maximum",
			param:     "limit",
			value:     99,
			max:       maxTestValue,
			wantError: false,
		},
		{
			name:      "negative value",
			param:     "limit",
			value:     -1,
			max:       maxTestValue,
			wantError: true,
			errorMsg:  "invalid limit: must be a positive integer",
		},
		{
			name:      "large negative value",
			param:     "tailLines",
			value:     -999,
			max:       maxTestValue,
			wantError: true,
			errorMsg:  "invalid tailLines: must be a positive integer",
		},
		{
			name:      "exceeds maximum",
			param:     "limit",
			value:     101,
			max:       maxTestValue,
			wantError: true,
			errorMsg:  "invalid limit: exceeds maximum of 100",
		},
		{
			name:      "greatly exceeds maximum",
			param:     "events",
			value:     9999,
			max:       maxTestValue,
			wantError: true,
			errorMsg:  "invalid events: exceeds maximum of 100",
		},
		{
			name:      "valid with real mcpMaxEventLimit",
			param:     "limit",
			value:     1000,
			max:       mcpMaxEventLimit,
			wantError: false,
		},
		{
			name:      "exceeds real mcpMaxEventLimit",
			param:     "limit",
			value:     1001,
			max:       mcpMaxEventLimit,
			wantError: true,
			errorMsg:  "invalid limit: exceeds maximum of 1000",
		},
		{
			name:      "valid with real mcpMaxTailLines",
			param:     "tailLines",
			value:     10000,
			max:       mcpMaxTailLines,
			wantError: false,
		},
		{
			name:      "exceeds real mcpMaxTailLines",
			param:     "tailLines",
			value:     10001,
			max:       mcpMaxTailLines,
			wantError: true,
			errorMsg:  "invalid tailLines: exceeds maximum of 10000",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidatePositiveInt(tt.param, tt.value, tt.max)
			if tt.wantError {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Equal(t, fiber.StatusBadRequest, fiberErr.Code)
				assert.Contains(t, fiberErr.Message, tt.errorMsg)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMcpValidateWorkloadType(t *testing.T) {
	tests := []struct {
		name      string
		value     string
		wantError bool
	}{
		{
			name:      "empty value is valid (all types)",
			value:     "",
			wantError: false,
		},
		{
			name:      "Deployment is valid",
			value:     "Deployment",
			wantError: false,
		},
		{
			name:      "StatefulSet is valid",
			value:     "StatefulSet",
			wantError: false,
		},
		{
			name:      "DaemonSet is valid",
			value:     "DaemonSet",
			wantError: false,
		},
		{
			name:      "lowercase deployment is invalid",
			value:     "deployment",
			wantError: true,
		},
		{
			name:      "Pod is invalid",
			value:     "Pod",
			wantError: true,
		},
		{
			name:      "ReplicaSet is invalid",
			value:     "ReplicaSet",
			wantError: true,
		},
		{
			name:      "Job is invalid",
			value:     "Job",
			wantError: true,
		},
		{
			name:      "CronJob is invalid",
			value:     "CronJob",
			wantError: true,
		},
		{
			name:      "random string is invalid",
			value:     "InvalidType",
			wantError: true,
		},
		{
			name:      "mixed case is invalid",
			value:     "deployMent",
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidateWorkloadType(tt.value)
			if tt.wantError {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Equal(t, fiber.StatusBadRequest, fiberErr.Code)
				assert.Equal(t, "invalid type: must be one of Deployment, StatefulSet, DaemonSet", fiberErr.Message)
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
		wantError bool
		errorMsg  string
	}{
		{
			name:      "both empty is valid",
			cluster:   "",
			namespace: "",
			wantError: false,
		},
		{
			name:      "both valid",
			cluster:   "prod-cluster",
			namespace: "default",
			wantError: false,
		},
		{
			name:      "valid cluster, empty namespace",
			cluster:   "prod-cluster",
			namespace: "",
			wantError: false,
		},
		{
			name:      "empty cluster, valid namespace",
			cluster:   "",
			namespace: "kube-system",
			wantError: false,
		},
		{
			name:      "invalid cluster",
			cluster:   "PROD-CLUSTER",
			namespace: "default",
			wantError: true,
			errorMsg:  "invalid cluster",
		},
		{
			name:      "invalid namespace",
			cluster:   "prod-cluster",
			namespace: "Default",
			wantError: true,
			errorMsg:  "invalid namespace",
		},
		{
			name:      "both invalid, cluster checked first",
			cluster:   "PROD",
			namespace: "Default",
			wantError: true,
			errorMsg:  "invalid cluster",
		},
		{
			name:      "cluster too long",
			cluster:   strings.Repeat("a", 254),
			namespace: "default",
			wantError: true,
			errorMsg:  "invalid cluster: exceeds maximum length",
		},
		{
			name:      "namespace too long",
			cluster:   "valid",
			namespace: strings.Repeat("a", 254),
			wantError: true,
			errorMsg:  "invalid namespace: exceeds maximum length",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mcpValidateClusterAndNamespace(tt.cluster, tt.namespace)
			if tt.wantError {
				require.Error(t, err)
				fiberErr, ok := err.(*fiber.Error)
				require.True(t, ok, "expected fiber.Error")
				assert.Equal(t, fiber.StatusBadRequest, fiberErr.Code)
				assert.Contains(t, fiberErr.Message, tt.errorMsg)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
