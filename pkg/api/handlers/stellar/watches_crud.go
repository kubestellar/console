package stellar

import (
	"context"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/store"
)

// Watch handlers

func (h *Handler) ListWatches(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	watches, err := h.store.(interface {
		GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error)
	}).GetActiveWatches(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load watches"})
	}
	return c.JSON(fiber.Map{"items": watches})
}

type createWatchRequest struct {
	Cluster      string `json:"cluster"`
	Namespace    string `json:"namespace"`
	ResourceKind string `json:"resourceKind"`
	ResourceName string `json:"resourceName"`
	Reason       string `json:"reason"`
}

func (h *Handler) CreateWatch(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	var body createWatchRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Namespace = strings.TrimSpace(body.Namespace)
	body.ResourceKind = strings.TrimSpace(body.ResourceKind)
	body.ResourceName = strings.TrimSpace(body.ResourceName)
	body.Reason = strings.TrimSpace(body.Reason)
	if body.Cluster == "" || body.ResourceKind == "" || body.ResourceName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster, resourceKind, and resourceName are required"})
	}
	watch := &store.StellarWatch{
		UserID:       userID,
		Cluster:      body.Cluster,
		Namespace:    body.Namespace,
		ResourceKind: body.ResourceKind,
		ResourceName: body.ResourceName,
		Reason:       body.Reason,
		Status:       "active",
	}
	id, err := h.store.(interface {
		CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
	}).CreateWatch(c.UserContext(), watch)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create watch"})
	}
	watch.ID = id
	return c.Status(fiber.StatusCreated).JSON(watch)
}

func (h *Handler) ResolveWatch(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	watchID := strings.TrimSpace(c.Params("id"))
	if watchID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.(interface {
		ResolveWatch(ctx context.Context, id, userID string) error
	}).ResolveWatch(c.UserContext(), watchID, userID); err != nil {
		if err == store.ErrNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "watch not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to resolve watch"})
	}
	return c.JSON(fiber.Map{
		"id":                  watchID,
		"status":              "resolved",
		"inactivityTimeoutMs": int64(stellarWatchInactivityTimeout / time.Millisecond),
	})
}

func (h *Handler) DismissWatch(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	watchID := strings.TrimSpace(c.Params("id"))
	if watchID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.(interface {
		UpdateWatchStatus(ctx context.Context, id, status, lastUpdate, userID string) error
	}).UpdateWatchStatus(c.UserContext(), watchID, "dismissed", "", userID); err != nil {
		if err == store.ErrNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "watch not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to dismiss watch"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ─── Sprint 5: Snooze watch ───────────────────────────────────────────────────

func (h *Handler) SnoozeWatch(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	watchID := strings.TrimSpace(c.Params("id"))
	if watchID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	var body struct {
		Minutes int `json:"minutes"`
	}
	if err := c.BodyParser(&body); err != nil || body.Minutes <= 0 {
		body.Minutes = 60
	}
	until := time.Now().Add(time.Duration(body.Minutes) * time.Minute)
	if err := h.store.SnoozeWatch(c.UserContext(), watchID, userID, until); err != nil {
		if err == store.ErrNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "watch not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to snooze watch"})
	}
	return c.JSON(fiber.Map{"id": watchID, "snoozedUntil": until.UTC().Format(time.RFC3339)})
}

// ─── Sprint 5: Audit log ──────────────────────────────────────────────────────

func (h *Handler) ListAuditLog(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	limit := readListLimit(c)
	entries, err := h.store.ListStellarAuditLog(c.UserContext(), userID, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load audit log"})
	}
	return c.JSON(fiber.Map{"items": entries})
}
