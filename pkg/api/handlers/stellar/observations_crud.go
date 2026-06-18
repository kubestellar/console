package stellar

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers/auth"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

func (h *Handler) GetState(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	_ = h.syncTimelineNotifications(c.UserContext(), userID)
	state, err := h.buildState(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to build state"})
	}
	return c.JSON(state)
}

func (h *Handler) GetDigest(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}

	since := time.Now().UTC().Add(-stellarDigestLookbackHours * time.Hour)
	executions, execErr := h.store.ListStellarExecutions(c.UserContext(), userID, "", "", 500, 0)
	if execErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load executions"})
	}
	notifications, notifErr := h.store.ListStellarNotifications(c.UserContext(), userID, 500, false)
	if notifErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load notifications"})
	}

	var summary strings.Builder
	summary.WriteString(fmt.Sprintf("Period: last 24 hours (since %s UTC)\n\n", since.Format("2006-01-02 15:04")))
	filteredNotifications := make([]store.StellarNotification, 0)
	for _, notification := range notifications {
		if notification.CreatedAt.Before(since) {
			continue
		}
		filteredNotifications = append(filteredNotifications, notification)
	}
	if len(filteredNotifications) == 0 {
		summary.WriteString("No notable events logged.\n")
	} else {
		summary.WriteString("Events logged:\n")
		for _, notification := range filteredNotifications {
			summary.WriteString(fmt.Sprintf("  [%s] %s: %s\n", notification.Severity, notification.Title, notification.Body))
		}
	}

	executionCount := 0
	for _, execution := range executions {
		if execution.StartedAt.Before(since) {
			continue
		}
		executionCount++
	}
	if executionCount > 0 {
		summary.WriteString(fmt.Sprintf("\n%d mission executions ran.\n", executionCount))
	}

	resolved, err := h.resolveProviderAndModel(c.UserContext(), userID, "", "")
	if err != nil {
		slog.Error("stellar: provider resolution failed", "error", err, "userID", userID)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "provider resolution failed"})
	}
	if resolved.Provider == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "no AI provider configured"})
	}
	response, err := resolved.Provider.Generate(c.UserContext(), providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   600,
		Temperature: 0.4,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.Digest},
			{Role: "user", Content: summary.String()},
		},
	})
	if err != nil {
		slog.Error("stellar: digest generation failed", "error", err, "userID", userID)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "digest generation failed"})
	}
	if err := h.store.CreateStellarMemoryEntry(c.UserContext(), &store.StellarMemoryEntry{
		UserID:     userID,
		Cluster:    "",
		Category:   "digest",
		Summary:    truncateString(response.Content, 300),
		Tags:       []string{"digest"},
		Importance: 5,
		ExpiresAt:  ptr(time.Now().AddDate(0, 0, 30)),
	}); err != nil {
		slog.Warn("stellar: digest memory entry failed", "userID", userID, "error", err)
	}

	return c.JSON(fiber.Map{
		"digest":      response.Content,
		"model":       response.Model,
		"provider":    response.Provider,
		"generatedAt": time.Now().UTC(),
	})
}

func (h *Handler) ListObservations(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	_ = userID
	cluster := strings.TrimSpace(c.Query("cluster"))
	limit := readListLimit(c)
	items, err := h.store.GetRecentObservations(c.UserContext(), cluster, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load observations"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

// IngestEvent receives k8s events from the agent and forwards them to ProcessEvent.
// This is the HTTP bridge that connects the agent process to Stellar's notification system.
// Only editor and admin users may inject events to prevent forged system events (CWE-285, #16709).
func (h *Handler) IngestEvent(c *fiber.Ctx) error {
	if err := auth.RequireEditorOrAdmin(c, h.userStore); err != nil {
		return err
	}

	var event IncomingEvent
	if err := c.BodyParser(&event); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid event"})
	}

	// Validate required fields
	if event.Cluster == "" || event.Namespace == "" || event.Name == "" || event.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing required fields"})
	}

	// Process event asynchronously (non-blocking) with a bounded lifetime.
	safego.GoWith("stellar-process-event", func() {
		processCtx, cancel := context.WithTimeout(context.Background(), stellarProcessEventTimeout)
		defer cancel()
		h.ProcessEvent(processCtx, event)
	})

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"status": "accepted"})
}

// ─── Observability: Health endpoint ───────────────────────────────────────────

// Health returns a snapshot of Stellar's operational status so operators can
// verify SSE connectivity, provider availability, and background goroutine health.
func (h *Handler) Health(c *fiber.Ctx) error {
	ctx := c.UserContext()

	h.sseClientsMu.RLock()
	clientCount := len(h.sseClients)
	h.sseClientsMu.RUnlock()

	unread, _ := h.store.CountUnreadStellarNotifications(ctx, "system")
	recentCount, _ := h.store.CountRecentEventsForResource(ctx, "", "", "", 1*time.Hour)

	resolved, resolveErr := h.resolveProviderAndModel(ctx, "system", "", "")
	providerName := ""
	modelName := ""
	providerAvailable := false
	if resolveErr == nil && resolved.Provider != nil {
		providerName = resolved.Provider.Name()
		modelName = resolved.Model
		health := resolved.Provider.Health(ctx)
		providerAvailable = health.Available
	}

	return c.JSON(fiber.Map{
		"status":              "ok",
		"sseClientsConnected": clientCount,
		"unreadNotifications": unread,
		"eventsLastHour":      recentCount,
		"provider":            providerName,
		"model":               modelName,
		"providerAvailable":   providerAvailable,
		"ts":                  time.Now().UTC(),
	})
}
