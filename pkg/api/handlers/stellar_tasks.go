package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/store"
)

func (h *StellarHandler) ListTasks(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	items, err := h.store.GetOpenTasks(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load tasks"})
	}
	return c.JSON(fiber.Map{"items": items})
}

func (h *StellarHandler) CreateTask(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	var body struct {
		SessionID   string `json:"sessionId"`
		Cluster     string `json:"cluster"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    int    `json:"priority"`
		Source      string `json:"source"`
		ParentID    string `json:"parentId"`
		DueAt       string `json:"dueAt"`
		ContextJSON string `json:"contextJson"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Title = strings.TrimSpace(body.Title)
	if body.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title is required"})
	}
	if body.Priority < 1 || body.Priority > 10 {
		body.Priority = 5
	}
	source := strings.TrimSpace(body.Source)
	if source == "" {
		source = "user"
	}
	var dueAt *time.Time
	if raw := strings.TrimSpace(body.DueAt); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "dueAt must be RFC3339"})
		}
		dueAt = &parsed
	}
	contextJSON := strings.TrimSpace(body.ContextJSON)
	if contextJSON == "" {
		contextJSON = "{}"
	}
	task := &store.StellarTask{
		SessionID:   strings.TrimSpace(body.SessionID),
		UserID:      userID,
		Cluster:     strings.TrimSpace(body.Cluster),
		Title:       body.Title,
		Description: strings.TrimSpace(body.Description),
		Status:      "open",
		Priority:    body.Priority,
		Source:      source,
		ParentID:    strings.TrimSpace(body.ParentID),
		DueAt:       dueAt,
		ContextJSON: contextJSON,
	}
	id, err := h.store.CreateTask(c.UserContext(), task)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create task"})
	}
	task.ID = id
	return c.Status(fiber.StatusCreated).JSON(task)
}

func (h *StellarHandler) UpdateTaskStatus(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	taskID := strings.TrimSpace(c.Params("id"))
	if taskID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	status := strings.TrimSpace(strings.ToLower(body.Status))
	switch status {
	case "open", "in_progress", "blocked", "done", "dismissed":
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid status"})
	}
	if err := h.store.UpdateTaskStatus(c.UserContext(), taskID, status, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update task status"})
	}
	items, err := h.store.GetOpenTasks(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"id": taskID, "status": status})
	}
	return c.JSON(fiber.Map{"id": taskID, "status": status, "items": items})
}
