package workloads

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsDemoMode(t *testing.T) {
	tests := []struct {
		name       string
		headerVal  string
		wantResult bool
	}{
		{
			name:       "DemoModeTrue",
			headerVal:  "true",
			wantResult: true,
		},
		{
			name:       "DemoModeFalse",
			headerVal:  "false",
			wantResult: false,
		},
		{
			name:       "NoHeader",
			headerVal:  "",
			wantResult: false,
		},
		{
			name:       "InvalidValue",
			headerVal:  "yes",
			wantResult: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			var gotResult bool

			app.Get("/test", func(c *fiber.Ctx) error {
				gotResult = isDemoMode(c)
				return c.SendStatus(200)
			})

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tt.headerVal != "" {
				req.Header.Set("X-Demo-Mode", tt.headerVal)
			}

			resp, err := app.Test(req)
			require.NoError(t, err)
			resp.Body.Close()

			assert.Equal(t, tt.wantResult, gotResult)
		})
	}
}

func TestGetDemoWorkloads(t *testing.T) {
	workloads := getDemoWorkloads()

	assert.NotEmpty(t, workloads, "demo workloads should not be empty")
	assert.GreaterOrEqual(t, len(workloads), 1, "should have at least one demo workload")

	// Verify all workloads have required fields
	for _, w := range workloads {
		assert.NotEmpty(t, w.Name, "workload name should not be empty")
		assert.NotEmpty(t, w.Namespace, "workload namespace should not be empty")
		assert.NotEmpty(t, w.Type, "workload type should not be empty")
		assert.NotEmpty(t, w.Status, "workload status should not be empty")
		assert.NotEmpty(t, w.Image, "workload image should not be empty")
		assert.False(t, w.CreatedAt.IsZero(), "workload CreatedAt should not be zero")
		assert.True(t, w.CreatedAt.Before(time.Now()), "workload CreatedAt should be in the past")
	}

	// Verify specific demo workload examples exist
	foundNginx := false
	for _, w := range workloads {
		if w.Name == "nginx-ingress" {
			foundNginx = true
			assert.Equal(t, "ingress-system", w.Namespace)
			assert.Equal(t, "Deployment", w.Type)
			assert.Equal(t, "Running", w.Status)
			break
		}
	}
	assert.True(t, foundNginx, "nginx-ingress demo workload should exist")
}
