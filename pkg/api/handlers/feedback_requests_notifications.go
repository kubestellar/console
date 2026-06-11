package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
)

// GetNotifications returns the user's notifications
func (h *FeedbackHandler) GetNotifications(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	limit := c.QueryInt("limit", 50)
	if limit > 100 {
		limit = 100
	}
	// #6291: a caller passing limit<=0 previously returned 0 rows (SQLite
	// treats LIMIT 0 as zero rows). After #6286 added clampLimit(limit)
	// to the store, limit=0 would return 1 row instead — a silent
	// semantic change. Treat any non-positive value as "use default" so
	// the handler contract is preserved.
	if limit <= 0 {
		limit = 50
	}

	notifications, err := h.store.GetUserNotifications(c.UserContext(), userID, limit)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get notifications")
	}

	if notifications == nil {
		notifications = []models.Notification{}
	}

	return c.JSON(notifications)
}

// GetUnreadCount returns the count of unread notifications
func (h *FeedbackHandler) GetUnreadCount(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	count, err := h.store.GetUnreadNotificationCount(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get unread count")
	}

	return c.JSON(fiber.Map{"count": count})
}

// MarkNotificationRead marks a notification as read
func (h *FeedbackHandler) MarkNotificationRead(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	notificationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid notification ID")
	}

	// Mark the notification as read, verifying ownership in a single query.
	// The store returns an error containing "not found" when the notification
	// does not exist or is not owned by the caller.
	if err := h.store.MarkNotificationReadByUser(c.UserContext(), notificationID, userID); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return fiber.NewError(fiber.StatusNotFound, "Notification not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to mark notification read")
	}

	return c.JSON(fiber.Map{"success": true})
}

// MarkAllNotificationsRead marks all notifications as read
func (h *FeedbackHandler) MarkAllNotificationsRead(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	if err := h.store.MarkAllNotificationsRead(c.UserContext(), userID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to mark all notifications read")
	}

	return c.JSON(fiber.Map{"success": true})
}
