package stellar

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/sanitize"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

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

func (h *Handler) Ask(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	var body quickAskRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Prompt = sanitize.PromptString(body.Prompt)
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
		state = &OperationalState{
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
						"userId":  userID,
						"id":      id,
						"cluster": watch.Cluster,
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
	if err := h.store.CreateStellarExecution(c.UserContext(), execution); err != nil {
		slog.Warn("stellar: quick-ask execution persist failed", "userID", userID, "error", err)
	}
	if err := h.store.CreateStellarMemoryEntry(c.UserContext(), &store.StellarMemoryEntry{
		UserID:     userID,
		Cluster:    firstOrUnknown(state.ClustersWatching),
		Category:   "quick-ask",
		Summary:    summarizeQuickAsk(body.Prompt, generated.Content),
		RawContent: generated.Content,
		Tags:       []string{"quick-ask"},
		Importance: 3,
		ExpiresAt:  ptr(now.AddDate(0, 0, 7)),
	}); err != nil {
		slog.Warn("stellar: quick-ask memory entry persist failed", "userID", userID, "error", err)
	}
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
