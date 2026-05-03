package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/kagent"
	"github.com/stretchr/testify/assert"
)

func TestKagentProxyHandler_GetStatus(t *testing.T) {
	t.Run("Nil Client", func(t *testing.T) {
		h := NewKagentProxyHandler(nil)
		app := fiber.New()
		app.Get("/status", h.GetStatus)

		req := httptest.NewRequest("GET", "/status", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)

		var body map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&body)
		assert.False(t, body["available"].(bool))
	})

	t.Run("Available", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		client := kagent.NewKagentClient(server.URL)
		h := NewKagentProxyHandler(client)
		app := fiber.New()
		app.Get("/status", h.GetStatus)

		req := httptest.NewRequest("GET", "/status", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)

		var body map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&body)
		assert.True(t, body["available"].(bool))
	})
}

func TestKagentProxyHandler_ListAgents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, `[{"name":"agent1","namespace":"ns1"}]`)
	}))
	defer server.Close()

	client := kagent.NewKagentClient(server.URL)
	h := NewKagentProxyHandler(client)
	app := fiber.New()
	app.Get("/agents", h.ListAgents)

	req := httptest.NewRequest("GET", "/agents", nil)
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.NotNil(t, body["agents"])
	agents := body["agents"].([]interface{})
	assert.Len(t, agents, 1)
}
