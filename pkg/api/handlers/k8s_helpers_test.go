package handlers

import (
	"context"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleK8sErrorHelper(t *testing.T) {
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
				err := handleK8sError(c, tt.err)
				if err != nil {
					return err
				}
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test", nil)
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
