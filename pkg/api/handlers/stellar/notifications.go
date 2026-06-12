package stellar

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/store"
)

const (
	stellarNotificationStatusEscalated     = "escalated"
	stellarNotificationStatusInvestigating = "investigating"
	stellarNotificationStatusResolved      = "resolved"
	stellarNotificationStatusDismissed     = "dismissed"
)

type notificationStateRequest struct {
	ResolutionNote       string `json:"resolutionNote"`
	DismissalReason      string `json:"dismissalReason"`
	InvestigationSummary string `json:"investigationSummary"`
}

func (h *Handler) ListNotifications(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	_ = h.syncTimelineNotifications(c.UserContext(), userID)
	limit := readListLimit(c)
	unreadOnly := strings.EqualFold(strings.TrimSpace(c.Query("unread")), "true")
	items, err := h.store.ListStellarNotifications(c.UserContext(), userID, limit, unreadOnly)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load notifications"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *Handler) MarkNotificationRead(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	notificationID := strings.TrimSpace(c.Params("id"))
	if notificationID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.MarkStellarNotificationRead(c.UserContext(), userID, notificationID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to mark notification read"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) MarkNotificationInvestigating(c *fiber.Ctx) error {
	var req notificationStateRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}
	return h.updateNotificationState(c, stellarNotificationStatusInvestigating, strings.TrimSpace(req.InvestigationSummary))
}

func (h *Handler) ResolveNotification(c *fiber.Ctx) error {
	var req notificationStateRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}
	return h.updateNotificationState(c, stellarNotificationStatusResolved, strings.TrimSpace(req.ResolutionNote))
}

func (h *Handler) DismissNotification(c *fiber.Ctx) error {
	var req notificationStateRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}
	return h.updateNotificationState(c, stellarNotificationStatusDismissed, strings.TrimSpace(req.DismissalReason))
}

func (h *Handler) updateNotificationState(c *fiber.Ctx, status, note string) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	notificationID := strings.TrimSpace(c.Params("id"))
	if notificationID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}

	notification, err := h.store.GetStellarNotification(c.UserContext(), userID, notificationID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load notification"})
	}
	if notification == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "notification not found"})
	}

	updated := *notification
	now := time.Now().UTC()
	updated.Status = status
	updated.UpdatedAt = &now
	if updated.BatchTimestamp == nil {
		batchTimestamp := updated.CreatedAt.UTC().Truncate(time.Hour)
		updated.BatchTimestamp = &batchTimestamp
	}
	if strings.TrimSpace(updated.AffectedResource) == "" {
		updated.AffectedResource = deriveStellarNotificationResource(&updated)
	}
	if strings.TrimSpace(updated.ErrorMessage) == "" {
		updated.ErrorMessage = strings.TrimSpace(updated.Body)
	}

	switch status {
	case stellarNotificationStatusInvestigating:
		updated.InvestigationSummary = note
		updated.Read = false
		updated.ReadAt = nil
	case stellarNotificationStatusResolved:
		updated.ResolutionNote = note
		updated.Read = true
		updated.ReadAt = &now
	case stellarNotificationStatusDismissed:
		updated.DismissalReason = note
		updated.Read = true
		updated.ReadAt = &now
	default:
		updated.Status = stellarNotificationStatusEscalated
	}

	if err := h.store.UpdateStellarNotification(c.UserContext(), &updated); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update notification"})
	}

	h.logNotificationStateChange(c.UserContext(), userID, notification, &updated, note)
	h.broadcastToClients(SSEEvent{Type: "notification_replace", Data: updated, TargetUserID: userID})
	return c.JSON(updated)
}

func (h *Handler) logNotificationStateChange(ctx context.Context, userID string, before, after *store.StellarNotification, note string) {
	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		detailBytes, _ := json.Marshal(map[string]string{
			"status": after.Status,
			"note":   note,
		})
		_ = auditable.CreateAuditEntry(ctx, &store.StellarAuditEntry{
			UserID:     userID,
			Action:     "update_notification_state",
			EntityType: "stellar_notification",
			EntityID:   after.ID,
			Cluster:    after.Cluster,
			Detail:     string(detailBytes),
		})
	}

	full, ok := h.fullStore()
	if !ok {
		return
	}
	if before.Status == after.Status && before.Read == after.Read && note == "" {
		return
	}

	title, detail, kind := describeNotificationStateChange(after, note)
	activityEntry := &store.StellarActivity{
		ID:        uuid.NewString(),
		UserID:    userID,
		Ts:        time.Now().UTC(),
		Kind:      kind,
		EventID:   after.ID,
		Cluster:   after.Cluster,
		Namespace: after.Namespace,
		Workload:  deriveNotificationWorkload(after),
		Title:     title,
		Detail:    detail,
		Severity:  after.Severity,
	}
	_ = full.LogActivity(ctx, activityEntry)
	h.broadcastToClients(SSEEvent{Type: "activity", Data: activityEntry, TargetUserID: userID})
}

func describeNotificationStateChange(notification *store.StellarNotification, note string) (title string, detail string, kind string) {
	switch notification.Status {
	case stellarNotificationStatusInvestigating:
		kind = "manual_investigating"
		title = "Event marked investigating"
		if note != "" {
			detail = note
		} else {
			detail = "Operator opened investigation from the escalated event modal."
		}
	case stellarNotificationStatusResolved:
		kind = "manual_resolved"
		title = "Event resolved manually"
		if note != "" {
			detail = note
		} else {
			detail = "Operator resolved the escalated event from the modal."
		}
	case stellarNotificationStatusDismissed:
		kind = "manual_dismissed"
		title = "Event removed from escalated list"
		if note != "" {
			detail = note
		} else {
			detail = "Operator dismissed the escalated event from the modal."
		}
	default:
		kind = "manual_updated"
		title = "Event updated"
		detail = note
	}
	return title, detail, kind
}

func deriveNotificationWorkload(notification *store.StellarNotification) string {
	parts := strings.Split(notification.DedupeKey, ":")
	offset := 0
	if len(parts) > 0 && parts[0] == "ev" {
		offset = 1
	}
	if len(parts) >= offset+3 {
		return parts[offset+2]
	}
	return ""
}

func deriveStellarNotificationResource(notification *store.StellarNotification) string {
	parts := strings.Split(notification.DedupeKey, ":")
	offset := 0
	if len(parts) > 0 && parts[0] == "ev" {
		offset = 1
	}
	if len(parts) >= offset+3 {
		kind := parts[offset+1]
		name := parts[offset+2]
		if kind != "" && name != "" {
			return kind + "/" + name
		}
		return name
	}
	if notification.Namespace != "" && notification.Title != "" {
		return notification.Namespace + "/" + notification.Title
	}
	return notification.Title
}
