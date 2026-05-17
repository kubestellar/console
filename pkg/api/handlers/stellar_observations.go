package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

func (h *StellarHandler) GetState(c *fiber.Ctx) error {
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

func (h *StellarHandler) GetDigest(c *fiber.Ctx) error {
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
	_ = h.store.CreateStellarMemoryEntry(c.UserContext(), &store.StellarMemoryEntry{
		UserID:     userID,
		Cluster:    "",
		Category:   "digest",
		Summary:    truncateString(response.Content, 300),
		Tags:       []string{"digest"},
		Importance: 5,
		ExpiresAt:  ptr(time.Now().AddDate(0, 0, 30)),
	})

	return c.JSON(fiber.Map{
		"digest":      response.Content,
		"model":       response.Model,
		"provider":    response.Provider,
		"generatedAt": time.Now().UTC(),
	})
}

// stellarMaxHistoryTurns caps how many conversation turns are sent to the LLM.
const stellarMaxHistoryTurns = 10

type quickAskRequest struct {
	Prompt   string              `json:"prompt"`
	Cluster  string              `json:"cluster"`
	Provider string              `json:"provider"`
	Model    string              `json:"model"`
	History  []providers.Message `json:"history"`
}

type watchSuggestion struct {
	Cluster      string
	Namespace    string
	ResourceKind string
	ResourceName string
	Reason       string
}

func parseWatchLine(content string) (string, *watchSuggestion) {
	idx := strings.Index(content, "\nWATCH:")
	if idx == -1 {
		return content, nil
	}
	line := strings.TrimSpace(content[idx+7:])
	// line format: "prod-a/payments/Deployment/payment-worker — monitoring recovery"
	parts := strings.SplitN(line, " — ", 2)
	reason := ""
	if len(parts) == 2 {
		reason = strings.TrimSpace(parts[1])
	}
	segments := strings.SplitN(strings.TrimSpace(parts[0]), "/", 4)
	if len(segments) != 4 {
		return strings.TrimSpace(content[:idx]), nil // malformed, strip line, no watch
	}
	return strings.TrimSpace(content[:idx]), &watchSuggestion{
		Cluster:      segments[0],
		Namespace:    segments[1],
		ResourceKind: segments[2],
		ResourceName: segments[3],
		Reason:       reason,
	}
}

func (h *StellarHandler) Ask(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	var body quickAskRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Prompt = sanitizePromptInput(body.Prompt)
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Provider = strings.TrimSpace(body.Provider)
	body.Model = strings.TrimSpace(body.Model)
	if body.Prompt == "" || len(body.Prompt) > stellarMaxPromptLength {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "prompt is required and must be <= 5000 chars"})
	}

	userCfg, _ := h.resolveUserProvider(c.UserContext(), userID)
	resolved := h.providerRegistry.Resolve(body.Provider, body.Model, userCfg)

	state, err := h.buildOperationalState(c.UserContext(), userID, body.Cluster)
	if err != nil {
		slog.Warn("stellar: could not build operational state", "error", err)
		state = &StellarOperationalState{
			GeneratedAt:      time.Now().UTC(),
			EventCounts:      map[string]int{"critical": 0, "warning": 0, "info": 0},
			RecentEvents:     []store.ClusterEvent{},
			ClustersWatching: []string{},
		}
	}
	memories, _ := h.store.ListStellarMemoryEntries(c.UserContext(), userID, body.Cluster, "", 5, 0)
	tasks, _ := h.store.GetOpenTasks(c.UserContext(), userID)
	contextString := buildLLMContext(state, memories, tasks, body.Cluster)

	if resolved.Provider == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "no AI provider configured"})
	}

	// Build message chain: system prompt → context → history → current question
	messages := []providers.Message{
		{Role: "system", Content: prompts.QuickAsk},
		{Role: "user", Content: "Current cluster state:\n" + contextString},
		{Role: "assistant", Content: "Got it. What do you need?"},
	}
	// Inject conversation history (capped to prevent token budget blowout)
	history := body.History
	if len(history) > stellarMaxHistoryTurns {
		history = history[len(history)-stellarMaxHistoryTurns:]
	}
	for _, msg := range history {
		role := strings.TrimSpace(msg.Role)
		if role != "user" && role != "assistant" {
			continue // skip invalid roles
		}
		messages = append(messages, providers.Message{Role: role, Content: msg.Content})
	}
	// Current user question always goes last
	messages = append(messages, providers.Message{Role: "user", Content: body.Prompt})

	startTime := time.Now()
	generated, err := resolved.Provider.Generate(c.UserContext(), providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   800,
		Temperature: 0.3,
		Messages:    messages,
	})
	fallbackUsed := false
	fallbackReason := ""
	durationMs := int(time.Since(startTime).Milliseconds())
	if err != nil {
		fallbackName := os.Getenv("STELLAR_FALLBACK_PROVIDER")
		if fallbackName != "" && fallbackName != resolved.Provider.Name() {
			if fp, ok := h.providerRegistry.GetGlobal(fallbackName); ok && fp != nil {
				fallbackUsed = true
				slog.Warn("stellar: primary provider failed, using fallback", "primary", resolved.Provider.Name(), "fallback", fallbackName, "durationMs", durationMs, "error", err)
				fallbackReason = fmt.Sprintf("%s unavailable after %dms. Falling back to %s.", resolved.Provider.Name(), durationMs, fallbackName)
				startTime = time.Now()
				generated, err = fp.Generate(c.UserContext(), providers.GenerateRequest{
					Model:       resolved.Model,
					MaxTokens:   800,
					Temperature: 0.3,
					Messages: []providers.Message{
						{Role: "system", Content: prompts.QuickAsk},
						{Role: "user", Content: "Current cluster state:\n" + contextString + "\n\nQuestion: " + body.Prompt},
					},
				})
				durationMs = int(time.Since(startTime).Milliseconds())
			}
		}
	}
	if err != nil {
		slog.Error("stellar: AI provider error", "error", err, "userID", userID)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI provider error"})
	}
	if generated == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI provider returned empty response"})
	}

	// Parse WATCH: line from LLM response before persisting
	cleanContent, watch := parseWatchLine(generated.Content)
	generated.Content = cleanContent

	var watchCreated bool
	var watchID string
	if watch != nil {
		// Q2: Deduplication — don't create a duplicate active watch for the same resource
		existing, _ := h.store.GetWatchByResource(c.UserContext(), userID, watch.Cluster, watch.Namespace, watch.ResourceKind, watch.ResourceName)
		if existing != nil {
			watchCreated = true
			watchID = existing.ID
		} else {
			id, wErr := h.store.CreateWatch(c.UserContext(), &store.StellarWatch{
				UserID:       userID,
				Cluster:      watch.Cluster,
				Namespace:    watch.Namespace,
				ResourceKind: watch.ResourceKind,
				ResourceName: watch.ResourceName,
				Reason:       watch.Reason,
			})
			if wErr == nil {
				watchCreated = true
				watchID = id
				if h.broadcaster != nil {
					h.broadcaster.Broadcast(SSEEvent{Type: "watch_created", Data: map[string]string{
						"id": id, "cluster": watch.Cluster,
					}})
				}
			}
		}
	}

	now := time.Now().UTC()
	execution := &store.StellarExecution{
		UserID:       userID,
		MissionID:    "quick-ask",
		TriggerType:  "manual",
		TriggerData:  "{}",
		Status:       "completed",
		RawInput:     body.Prompt,
		Output:       generated.Content,
		TokensInput:  generated.TokensInput,
		TokensOutput: generated.TokensOutput,
		Provider:     generated.Provider,
		Model:        generated.Model,
		DurationMs:   durationMs,
		StartedAt:    now,
		CompletedAt:  &now,
	}
	_ = h.store.CreateStellarExecution(c.UserContext(), execution)
	_ = h.store.CreateStellarMemoryEntry(c.UserContext(), &store.StellarMemoryEntry{
		UserID:     userID,
		Cluster:    firstOrUnknown(state.ClustersWatching),
		Category:   "quick-ask",
		Summary:    summarizeQuickAsk(body.Prompt, generated.Content),
		RawContent: generated.Content,
		Tags:       []string{"quick-ask"},
		Importance: 3,
		ExpiresAt:  ptr(now.AddDate(0, 0, 7)),
	})
	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		detailBytes, _ := json.Marshal(map[string]string{"provider": generated.Provider, "model": generated.Model})
		_ = auditable.CreateAuditEntry(c.UserContext(), &store.StellarAuditEntry{
			UserID:     userID,
			Action:     "ask",
			EntityType: "execution",
			EntityID:   execution.ID,
			Cluster:    body.Cluster,
			Detail:     string(detailBytes),
		})
	}

	return c.JSON(fiber.Map{
		"answer":         generated.Content,
		"executionId":    execution.ID,
		"provider":       generated.Provider,
		"model":          generated.Model,
		"providerSource": resolved.Source,
		"tokens":         generated.TokensInput + generated.TokensOutput,
		"durationMs":     durationMs,
		"fallbackUsed":   fallbackUsed,
		"fallbackReason": fallbackReason,
		"watchCreated":   watchCreated,
		"watchId":        watchID,
		"state":          state,
	})
}
func (h *StellarHandler) ListObservations(c *fiber.Ctx) error {
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

func (h *StellarHandler) Stream(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}

	// Sprint 5: detect returning user and update last-seen
	lastSeen, _ := h.store.GetUserLastSeen(c.UserContext(), userID)
	awayThreshold := 15 * time.Minute
	isReturning := lastSeen != nil && time.Since(*lastSeen) > awayThreshold
	_ = h.store.UpsertUserLastSeen(c.UserContext(), userID)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		connID := fmt.Sprintf("%s-%d", userID, time.Now().UnixNano())
		clientCh := make(chan SSEEvent, 32)
		h.registerSSEClient(connID, clientCh)
		defer h.unregisterSSEClient(connID)

		// Send initial batch of unread notifications and state
		initialNotifs, err := h.store.ListStellarNotifications(context.Background(), userID, 50, true)
		if err == nil && len(initialNotifs) > 0 {
			for i := len(initialNotifs) - 1; i >= 0; i-- {
				_ = writeSSE(w, "notification", initialNotifs[i])
			}
			state, err := h.buildState(context.Background(), userID)
			if err == nil && state != nil {
				_ = writeSSE(w, "state", fiber.Map{
					"clustersWatching":   state.ClustersWatching,
					"unreadCount":        state.UnreadAlerts,
					"pendingActionCount": len(state.PendingActionIDs),
				})
			}
		}
		_ = w.Flush()

		// If returning after a gap, push catch-up summary after stream establishes
		if isReturning && lastSeen != nil {
			safego.GoWith("stellar-catch-up-summary", func() {
				h.pushCatchUpSummary(context.Background(), w, userID, *lastSeen)
			})
		}

		ticker := time.NewTicker(stellarStreamInterval)
		defer ticker.Stop()
		lastSentID := ""
		send := func() bool {
			_ = h.syncTimelineNotifications(context.Background(), userID)
			// Stream only unread notifications so dismissed/read items do not
			// get re-sent to clients after "dismiss" or "clear all".
			items, err := h.store.ListStellarNotifications(context.Background(), userID, 30, true)
			if err != nil {
				return writeSSE(w, "error", fiber.Map{"message": "failed to load notifications"}) == nil
			}
			if len(items) > 0 && items[0].ID != lastSentID {
				lastSentID = items[0].ID
				if writeSSE(w, "notification", items[0]) != nil {
					return false
				}
			}
			observations, err := h.store.GetUnshownObservations(context.Background())
			if err == nil && len(observations) > 0 {
				next := observations[0]
				payload := fiber.Map{
					"id":      next.ID,
					"summary": next.Summary,
				}
				if suggest := extractObservationSuggest(next.Detail); suggest != "" {
					payload["suggest"] = suggest
				}
				if writeSSE(w, "observation", payload) != nil {
					return false
				}
				_ = h.store.MarkObservationShown(context.Background(), next.ID)
			}
			state, err := h.buildState(context.Background(), userID)
			if err != nil {
				return writeSSE(w, "error", fiber.Map{"message": "failed to build state"}) == nil
			}
			if writeSSE(w, "state", fiber.Map{
				"clustersWatching":   state.ClustersWatching,
				"unreadCount":        state.UnreadAlerts,
				"pendingActionCount": len(state.PendingActionIDs),
			}) != nil {
				return false
			}
			// Push current active watches so the frontend stays in sync
			activeWatches, _ := h.store.GetActiveWatches(context.Background(), userID)
			if writeSSE(w, "watches", activeWatches) != nil {
				return false
			}
			return writeSSE(w, "heartbeat", fiber.Map{"ts": time.Now().UTC().Format(time.RFC3339)}) == nil
		}
		if !send() {
			return
		}
		for {
			select {
			case <-ticker.C:
				if !send() {
					return
				}
			case event := <-clientCh:
				if writeSSE(w, event.Type, event.Data) != nil {
					return
				}
			}
		}
	})
	return nil
}

// IngestEvent receives k8s events from the agent and forwards them to ProcessEvent.
// This is the HTTP bridge that connects the agent process to Stellar's notification system.
func (h *StellarHandler) IngestEvent(c *fiber.Ctx) error {
	var event IncomingEvent
	if err := c.BodyParser(&event); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid event"})
	}

	// Validate required fields
	if event.Cluster == "" || event.Namespace == "" || event.Name == "" || event.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing required fields"})
	}

	// Process event asynchronously (non-blocking)
	safego.GoWith("stellar-process-event", func() { h.ProcessEvent(context.Background(), event) })

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"status": "accepted"})
}

// ─── Observability: Health endpoint ───────────────────────────────────────────

// Health returns a snapshot of Stellar's operational status so operators can
// verify SSE connectivity, provider availability, and background goroutine health.
func (h *StellarHandler) Health(c *fiber.Ctx) error {
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

// ─── Sprint 5: Catch-up summary ───────────────────────────────────────────────

func (h *StellarHandler) pushCatchUpSummary(ctx context.Context, w *bufio.Writer, userID string, since time.Time) {
	// Give SSE stream 2 seconds to establish before pushing
	time.Sleep(2 * time.Second)

	notifications, _ := h.store.GetUserNotificationsSince(ctx, userID, since)
	resolvedWatches, _ := h.store.GetWatchesSince(ctx, userID, since, "resolved")
	activeWatches, _ := h.store.GetActiveWatches(ctx, userID)
	memories, _ := h.store.GetRecentMemoryEntries(ctx, userID, "", 5)

	if len(notifications) == 0 && len(resolvedWatches) == 0 {
		// Nothing happened — push clean bill of health
		_ = writeSSE(w, "catchup", map[string]string{
			"summary": fmt.Sprintf("All clear while you were away (%s). Nothing notable happened.", formatDuration(time.Since(since))),
			"kind":    "clean",
		})
		return
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("The operator was away for %s (since %s UTC).\n\n",
		formatDuration(time.Since(since)), since.UTC().Format("15:04")))

	if len(notifications) > 0 {
		sb.WriteString(fmt.Sprintf("Events that fired (%d):\n", len(notifications)))
		for _, n := range notifications {
			sb.WriteString(fmt.Sprintf("  [%s] %s: %s\n", n.Severity, n.Title, truncateString(n.Body, 100)))
		}
	}
	if len(resolvedWatches) > 0 {
		sb.WriteString(fmt.Sprintf("\nWatches resolved (%d):\n", len(resolvedWatches)))
		for _, rw := range resolvedWatches {
			sb.WriteString(fmt.Sprintf("  ✓ %s/%s — %s\n", rw.Namespace, rw.ResourceName, rw.LastUpdate))
		}
	}
	if len(activeWatches) > 0 {
		sb.WriteString(fmt.Sprintf("\nStill watching (%d resources).\n", len(activeWatches)))
	}
	_ = memories // available for future enrichment

	resolved, err := h.resolveProviderAndModel(ctx, userID, "", "")
	if err != nil || resolved.Provider == nil {
		// Fallback: push raw summary without LLM
		_ = writeSSE(w, "catchup", map[string]string{
			"summary": sb.String(),
			"kind":    "summary",
		})
		return
	}

	resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
		Model: resolved.Model, MaxTokens: 250, Temperature: 0.3,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.CatchUp},
			{Role: "user", Content: sb.String()},
		},
	})
	if err != nil {
		slog.Warn("stellar: catch-up summary LLM call failed", "error", err)
		_ = writeSSE(w, "catchup", map[string]string{
			"summary": sb.String(),
			"kind":    "summary",
		})
		return
	}

	slog.Info("stellar: catch-up summary generated", "tokens", len(resp.Content), "model", resolved.Model)
	_ = writeSSE(w, "catchup", map[string]string{
		"summary": resp.Content,
		"kind":    "summary",
	})
	_ = h.store.SetUserLastDigest(ctx, userID)
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Minute)
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}
