package handlers

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func TestFedRAMPHandler(t *testing.T) {
	app := fiber.New()
	h := NewFedRAMPHandler()
	h.RegisterPublicRoutes(app)

	tests := []struct {
		name string
		url  string
	}{
		{"Controls", "/compliance/fedramp/controls"},
		{"POAMs", "/compliance/fedramp/poams"},
		{"Score", "/compliance/fedramp/score"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.url, nil)
			resp, err := app.Test(req)
			assert.NoError(t, err)
			assert.Equal(t, 200, resp.StatusCode)

			body, _ := io.ReadAll(resp.Body)
			var data interface{}
			err = json.Unmarshal(body, &data)
			assert.NoError(t, err)
			assert.NotNil(t, data)
		})
	}
}
