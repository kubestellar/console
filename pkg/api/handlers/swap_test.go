package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestSwapHandlers(t *testing.T) {
	env := setupTestEnv(t)
	h := NewSwapHandler(env.Store, env.Hub)

	swapID := uuid.New()
	cardID := uuid.New()

	t.Run("ListPendingSwaps", func(t *testing.T) {
		mockStore := env.Store.(*test.MockStore)
		mockStore.ExpectedCalls = nil
		
		expected := []models.PendingSwap{
			{ID: swapID, UserID: testAdminUserID, CardID: cardID},
		}
		mockStore.On("GetUserPendingSwaps", testAdminUserID, 0, 0).Return(expected, nil)

		app := fiber.New()
		app.Get("/api/swaps", func(c *fiber.Ctx) error {
			c.Locals("userID", testAdminUserID)
			return h.ListPendingSwaps(c)
		})

		req := httptest.NewRequest("GET", "/api/swaps", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		
		var result []models.PendingSwap
		err = json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)
		
		assert.Len(t, result, 1)
		assert.Equal(t, swapID, result[0].ID)
		mockStore.AssertExpectations(t)
	})

	t.Run("SnoozeSwap", func(t *testing.T) {
		mockStore := env.Store.(*test.MockStore)
		mockStore.ExpectedCalls = nil
		
		swap := &models.PendingSwap{ID: swapID, UserID: testAdminUserID}
		mockStore.On("GetPendingSwap", swapID).Return(swap, nil)
		mockStore.On("SnoozeSwap", swapID, mock.Anything).Return(nil)

		app := fiber.New()
		app.Post("/api/swaps/:id/snooze", func(c *fiber.Ctx) error {
			c.Locals("userID", testAdminUserID)
			return h.SnoozeSwap(c)
		})

		body := `{"duration": "1h"}`
		req := httptest.NewRequest("POST", "/api/swaps/"+swapID.String()+"/snooze", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req)
		require.NoError(t, err)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("ExecuteSwap", func(t *testing.T) {
		mockStore := env.Store.(*test.MockStore)
		mockStore.ExpectedCalls = nil
		
		swap := &models.PendingSwap{
			ID: swapID, UserID: testAdminUserID, CardID: cardID,
			NewCardType: "new-type", NewCardConfig: []byte(`{}`),
		}
		card := &models.Card{ID: cardID, CardType: "old-type"}
		
		mockStore.On("GetPendingSwap", swapID).Return(swap, nil)
		mockStore.On("GetCard", cardID).Return(card, nil)
		mockStore.On("AddCardHistory", mock.Anything).Return(nil)
		mockStore.On("UpdateCard", mock.Anything).Return(nil)
		mockStore.On("UpdateSwapStatus", swapID, models.SwapStatusCompleted).Return(nil)

		app := fiber.New()
		app.Post("/api/swaps/:id/execute", func(c *fiber.Ctx) error {
			c.Locals("userID", testAdminUserID)
			return h.ExecuteSwap(c)
		})

		req := httptest.NewRequest("POST", "/api/swaps/"+swapID.String()+"/execute", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("CancelSwap", func(t *testing.T) {
		mockStore := env.Store.(*test.MockStore)
		mockStore.ExpectedCalls = nil
		
		swap := &models.PendingSwap{ID: swapID, UserID: testAdminUserID}
		mockStore.On("GetPendingSwap", swapID).Return(swap, nil)
		mockStore.On("UpdateSwapStatus", swapID, models.SwapStatusCancelled).Return(nil)

		app := fiber.New()
		app.Post("/api/swaps/:id/cancel", func(c *fiber.Ctx) error {
			c.Locals("userID", testAdminUserID)
			return h.CancelSwap(c)
		})

		req := httptest.NewRequest("POST", "/api/swaps/"+swapID.String()+"/cancel", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})
}
