package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

func (h *StellarHandler) ListMemory(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	limit := readListLimit(c)
	offset := readListOffset(c)
	cluster := strings.TrimSpace(c.Query("cluster"))
	category := strings.TrimSpace(c.Query("category"))
	items, err := h.store.ListStellarMemoryEntries(c.UserContext(), userID, cluster, category, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load memory"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

type searchMemoryRequest struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

func (h *StellarHandler) SearchMemory(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	var body searchMemoryRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Query = strings.TrimSpace(body.Query)
	if body.Query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query is required"})
	}
	limit := body.Limit
	if limit <= 0 {
		limit = 20
	}
	items, err := h.store.SearchStellarMemoryEntries(c.UserContext(), userID, body.Query, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to search memory"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *StellarHandler) DeleteMemory(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	entryID := strings.TrimSpace(c.Params("id"))
	if entryID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.DeleteStellarMemoryEntry(c.UserContext(), userID, entryID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete memory entry"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
