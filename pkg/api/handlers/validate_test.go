package handlers

import (
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateK8sName(t *testing.T) {
	tests := []struct {
		name        string
		param       string
		value       string
		wantErr     bool
		errContains string
	}{
		{
			name:    "EmptyValue",
			param:   "namespace",
			value:   "",
			wantErr: false,
		},
		{
			name:    "ValidLowercase",
			param:   "namespace",
			value:   "kube-system",
			wantErr: false,
		},
		{
			name:    "ValidWithDots",
			param:   "group",
			value:   "apps.v1",
			wantErr: false,
		},
		{
			name:    "ValidSingleChar",
			param:   "namespace",
			value:   "a",
			wantErr: false,
		},
		{
			name:    "ValidNumber",
			param:   "namespace",
			value:   "namespace1",
			wantErr: false,
		},
		{
			name:        "TooLong",
			param:       "namespace",
			value:       string(make([]byte, MaxK8sNameLen+1)),
			wantErr:     true,
			errContains: "exceeds maximum length",
		},
		{
			name:        "InvalidUppercase",
			param:       "namespace",
			value:       "MyNamespace",
			wantErr:     true,
			errContains: "lowercase alphanumeric",
		},
		{
			name:        "InvalidUnderscore",
			param:       "namespace",
			value:       "my_namespace",
			wantErr:     true,
			errContains: "lowercase alphanumeric",
		},
		{
			name:        "InvalidStartsWithDash",
			param:       "namespace",
			value:       "-namespace",
			wantErr:     true,
			errContains: "lowercase alphanumeric",
		},
		{
			name:        "InvalidEndsWithDash",
			param:       "namespace",
			value:       "namespace-",
			wantErr:     true,
			errContains: "lowercase alphanumeric",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateK8sName(tt.param, tt.value)
			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errContains)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestValidateClusterAndNamespace(t *testing.T) {
	tests := []struct {
		name        string
		cluster     string
		namespace   string
		wantErr     bool
		errContains string
	}{
		{
			name:      "BothValid",
			cluster:   "prod-cluster",
			namespace: "kube-system",
			wantErr:   false,
		},
		{
			name:      "BothEmpty",
			cluster:   "",
			namespace: "",
			wantErr:   false,
		},
		{
			name:      "ValidClusterEmptyNamespace",
			cluster:   "dev-cluster",
			namespace: "",
			wantErr:   false,
		},
		{
			name:      "EmptyClusterValidNamespace",
			cluster:   "",
			namespace: "default",
			wantErr:   false,
		},
		{
			name:        "InvalidCluster",
			cluster:     "INVALID_CLUSTER",
			namespace:   "default",
			wantErr:     true,
			errContains: "cluster",
		},
		{
			name:        "InvalidNamespace",
			cluster:     "prod",
			namespace:   "INVALID_NS",
			wantErr:     true,
			errContains: "namespace",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateClusterAndNamespace(tt.cluster, tt.namespace)
			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errContains)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestValidateK8sNameIntegration(t *testing.T) {
	// Integration test with Fiber
	app := fiber.New()
	app.Get("/validate/:resource", func(c *fiber.Ctx) error {
		resource := c.Params("resource")
		if err := ValidateK8sName("resource", resource); err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	tests := []struct {
		name       string
		resource   string
		wantStatus int
	}{
		{
			name:       "ValidResource",
			resource:   "deployments",
			wantStatus: fiber.StatusOK,
		},
		{
			name:       "InvalidResource",
			resource:   "INVALID",
			wantStatus: fiber.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/validate/"+tt.resource, nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestValidateClusterAndNamespaceIntegration(t *testing.T) {
	// Integration test with Fiber
	app := fiber.New()
	app.Get("/api/:cluster/:namespace", func(c *fiber.Ctx) error {
		cluster := c.Params("cluster")
		namespace := c.Params("namespace")
		if err := ValidateClusterAndNamespace(cluster, namespace); err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	tests := []struct {
		name       string
		cluster    string
		namespace  string
		wantStatus int
	}{
		{
			name:       "BothValid",
			cluster:    "prod",
			namespace:  "default",
			wantStatus: fiber.StatusOK,
		},
		{
			name:       "InvalidCluster",
			cluster:    "PROD",
			namespace:  "default",
			wantStatus: fiber.StatusBadRequest,
		},
		{
			name:       "InvalidNamespace",
			cluster:    "prod",
			namespace:  "DEFAULT",
			wantStatus: fiber.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/"+tt.cluster+"/"+tt.namespace, nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}
