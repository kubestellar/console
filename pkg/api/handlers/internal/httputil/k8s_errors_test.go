package httputil

import (
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleK8sError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantJSON   map[string]string
	}{
		{
			name:       "NoClusterConfigured",
			err:        k8s.ErrNoClusterConfigured,
			wantStatus: fiber.StatusServiceUnavailable,
			wantJSON: map[string]string{
				"error": "No cluster access",
			},
		},
		{
			name:       "NetworkError",
			err:        errors.New("dial tcp: connection refused"),
			wantStatus: fiber.StatusServiceUnavailable,
			wantJSON: map[string]string{
				"clusterStatus": "unavailable",
				"errorType":     "network",
				"errorMessage":  SanitizedErrorMessages["network"],
			},
		},
		{
			name:       "AuthError",
			err:        errors.New("Unauthorized: forbidden"),
			wantStatus: fiber.StatusServiceUnavailable,
			wantJSON: map[string]string{
				"clusterStatus": "unavailable",
				"errorType":     "auth",
				"errorMessage":  SanitizedErrorMessages["auth"],
			},
		},
		{
			name:       "TimeoutError",
			err:        errors.New("context deadline exceeded"),
			wantStatus: fiber.StatusServiceUnavailable,
			wantJSON: map[string]string{
				"clusterStatus": "unavailable",
				"errorType":     "timeout",
				"errorMessage":  SanitizedErrorMessages["timeout"],
			},
		},
		{
			name:       "CertificateError",
			err:        errors.New("x509: certificate signed by unknown authority"),
			wantStatus: fiber.StatusServiceUnavailable,
			wantJSON: map[string]string{
				"clusterStatus": "unavailable",
				"errorType":     "certificate",
				"errorMessage":  SanitizedErrorMessages["certificate"],
			},
		},
		{
			name:       "NotFoundError",
			err:        errors.New("cluster not found in kubeconfig"),
			wantStatus: fiber.StatusNotFound,
			wantJSON: map[string]string{
				"clusterStatus": "not_found",
				"errorType":     "not_found",
				"errorMessage":  "Cluster not found — verify the cluster name exists in your kubeconfig",
			},
		},
		{
			name:       "InternalError",
			err:        errors.New("unknown error"),
			wantStatus: fiber.StatusInternalServerError,
			wantJSON: map[string]string{
				"clusterStatus": "error",
				"errorType":     "internal",
				"errorMessage":  "An internal error occurred",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/test", func(c *fiber.Ctx) error {
				return HandleK8sError(c, tt.err)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			for k, v := range tt.wantJSON {
				assert.Contains(t, string(body), v, "expected body to contain %q for key %q", v, k)
			}
		})
	}
}

func TestHandleLegacyK8sError(t *testing.T) {
	t.Run("NilErrorDirect", func(t *testing.T) {
		assert.NoError(t, HandleLegacyK8sError(nil, nil))
	})

	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantError  string
	}{
		{
			name:       "NilError",
			err:        nil,
			wantStatus: fiber.StatusOK,
			wantError:  "",
		},
		{
			name:       "DeadlineExceeded",
			err:        context.DeadlineExceeded,
			wantStatus: fiber.StatusGatewayTimeout,
			wantError:  "Request timeout",
		},
		{
			name:       "Canceled",
			err:        context.Canceled,
			wantStatus: fiber.StatusGatewayTimeout,
			wantError:  "Request timeout",
		},
		{
			name:       "GenericError",
			err:        assert.AnError,
			wantStatus: fiber.StatusInternalServerError,
			wantError:  "Kubernetes operation failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/test", func(c *fiber.Ctx) error {
				if tt.err != nil {
					return HandleLegacyK8sError(c, tt.err)
				}
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.wantError != "" {
				body, err := io.ReadAll(resp.Body)
				require.NoError(t, err)
				assert.Contains(t, string(body), tt.wantError)
			}
		})
	}
}
