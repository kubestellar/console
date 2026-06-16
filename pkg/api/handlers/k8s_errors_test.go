package handlers

import (
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
				"clusterStatus": "no_cluster",
				"errorType":     "no_cluster",
				"errorMessage":  "No cluster configured — configure a cluster before using this feature",
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
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)

			for key, expectedVal := range tt.wantJSON {
				assert.Contains(t, string(body), key)
				assert.Contains(t, string(body), expectedVal)
			}
		})
	}
}

func TestSanitizedErrorMessages(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		wantHave bool
	}{
		{"NetworkMessageExists", "network", true},
		{"AuthMessageExists", "auth", true},
		{"TimeoutMessageExists", "timeout", true},
		{"CertificateMessageExists", "certificate", true},
		{"UnknownKeyAbsent", "unknown", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, exists := SanitizedErrorMessages[tt.key]
			assert.Equal(t, tt.wantHave, exists)
		})
	}
}
