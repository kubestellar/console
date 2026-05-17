package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

func (h *StellarHandler) ListExecutions(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	limit := readListLimit(c)
	offset := readListOffset(c)
	missionID := strings.TrimSpace(c.Query("mission_id"))
	status := strings.TrimSpace(c.Query("status"))
	items, err := h.store.ListStellarExecutions(c.UserContext(), userID, missionID, status, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load executions"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *StellarHandler) GetExecution(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	executionID := strings.TrimSpace(c.Params("id"))
	if executionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	item, err := h.store.GetStellarExecution(c.UserContext(), userID, executionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load execution"})
	}
	if item == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "execution not found"})
	}
	return c.JSON(item)
}
