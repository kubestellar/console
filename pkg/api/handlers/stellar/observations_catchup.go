package stellar

// Catch-up summary: builds the plain-data payload (and, when an AI
// provider is available, an LLM-generated recap) describing what happened
// while an operator was away, for the handoff pushed by Stream's
// bufio.Writer SSE loop. Split out of observations.go — this subsystem has
// no fiber.Ctx dependency, unlike the rest of that file's HTTP handlers.

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

// ─── Sprint 5: Catch-up summary ───────────────────────────────────────────────

const (
	catchUpStreamEstablishDelay  = 2 * time.Second
	catchUpMemoryLookbackLimit   = 5
	catchUpMaxEventHighlights    = 3
	catchUpMaxResolvedHighlights = 2
)

type catchUpPayload struct {
	Summary    string   `json:"summary"`
	Kind       string   `json:"kind"`
	Highlights []string `json:"highlights,omitempty"`
}

func (h *Handler) pushCatchUpSummary(ctx context.Context, w *bufio.Writer, userID string, since time.Time) {
	// Give the SSE stream time to establish before pushing the handoff.
	time.Sleep(catchUpStreamEstablishDelay)

	notifications, _ := h.store.GetUserNotificationsSince(ctx, userID, since)
	resolvedWatches, _ := h.store.GetWatchesSince(ctx, userID, since, "resolved")
	activeWatches, _ := h.store.GetActiveWatches(ctx, userID)
	memories, _ := h.store.GetRecentMemoryEntries(ctx, userID, "", catchUpMemoryLookbackLimit)
	payload := buildCatchUpPayload(since, notifications, resolvedWatches, activeWatches)

	if payload.Kind == "clean" {
		_ = writeSSE(w, "catchup", payload)
		_ = h.store.SetUserLastDigest(ctx, userID)
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
		_ = writeSSE(w, "catchup", payload)
		_ = h.store.SetUserLastDigest(ctx, userID)
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
		_ = writeSSE(w, "catchup", payload)
		_ = h.store.SetUserLastDigest(ctx, userID)
		return
	}

	trimmedSummary := strings.TrimSpace(resp.Content)
	if trimmedSummary != "" {
		payload.Summary = trimmedSummary
	}
	slog.Info("stellar: catch-up summary generated", "tokens", len(payload.Summary), "model", resolved.Model)
	_ = writeSSE(w, "catchup", payload)
	_ = h.store.SetUserLastDigest(ctx, userID)
}

func buildCatchUpPayload(
	since time.Time,
	notifications []store.StellarNotification,
	resolvedWatches []store.StellarWatch,
	activeWatches []store.StellarWatch,
) catchUpPayload {
	awayFor := formatDuration(time.Since(since))
	highlights := []string{fmt.Sprintf("Away for %s (since %s UTC).", awayFor, since.UTC().Format("15:04"))}

	if len(notifications) == 0 && len(resolvedWatches) == 0 {
		highlights = append(highlights, "No alerts fired and no watches changed state.")
		return catchUpPayload{
			Summary:    fmt.Sprintf("All clear. You were away for %s and nothing notable happened.", awayFor),
			Kind:       "clean",
			Highlights: highlights,
		}
	}

	summaryParts := make([]string, 0, 3)
	if len(notifications) > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("%d %s fired while you were away.", len(notifications), pluralize(len(notifications), "event", "events")))
		for idx, notification := range notifications {
			if idx >= catchUpMaxEventHighlights {
				break
			}
			highlights = append(highlights, formatCatchUpNotificationHighlight(notification))
		}
		if len(notifications) > catchUpMaxEventHighlights {
			remaining := len(notifications) - catchUpMaxEventHighlights
			highlights = append(highlights, fmt.Sprintf("Plus %d more %s.", remaining, pluralize(remaining, "event", "events")))
		}
	}
	if len(resolvedWatches) > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("%d %s resolved.", len(resolvedWatches), pluralize(len(resolvedWatches), "watch", "watches")))
		for idx, resolvedWatch := range resolvedWatches {
			if idx >= catchUpMaxResolvedHighlights {
				break
			}
			highlights = append(highlights, formatCatchUpResolvedWatchHighlight(resolvedWatch))
		}
		if len(resolvedWatches) > catchUpMaxResolvedHighlights {
			remaining := len(resolvedWatches) - catchUpMaxResolvedHighlights
			highlights = append(highlights, fmt.Sprintf("Plus %d more resolved %s.", remaining, pluralize(remaining, "watch", "watches")))
		}
	}
	if len(activeWatches) > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("%d %s still need attention.", len(activeWatches), pluralize(len(activeWatches), "resource", "resources")))
		highlights = append(highlights, fmt.Sprintf("Still watching %d %s.", len(activeWatches), pluralize(len(activeWatches), "resource", "resources")))
	} else {
		highlights = append(highlights, "Nothing is still being watched right now.")
	}

	return catchUpPayload{
		Summary:    strings.Join(summaryParts, " "),
		Kind:       "summary",
		Highlights: highlights,
	}
}

func formatCatchUpNotificationHighlight(notification store.StellarNotification) string {
	title := strings.TrimSpace(notification.Title)
	if title == "" {
		title = truncateString(strings.TrimSpace(notification.Body), 100)
	}

	parts := make([]string, 0, 3)
	if severity := strings.TrimSpace(notification.Severity); severity != "" {
		parts = append(parts, fmt.Sprintf("[%s]", strings.ToUpper(severity)))
	}
	if title != "" {
		parts = append(parts, title)
	}
	if cluster := strings.TrimSpace(notification.Cluster); cluster != "" {
		parts = append(parts, fmt.Sprintf("on %s", cluster))
	}

	return strings.Join(parts, " ")
}

func formatCatchUpResolvedWatchHighlight(watch store.StellarWatch) string {
	resourcePath := strings.TrimPrefix(fmt.Sprintf("%s/%s", watch.Namespace, watch.ResourceName), "/")
	if resourcePath == "" {
		resourcePath = watch.ResourceName
	}
	if resourcePath == "" {
		resourcePath = "resource"
	}
	if strings.TrimSpace(watch.LastUpdate) == "" {
		return fmt.Sprintf("Resolved watch: %s.", resourcePath)
	}
	return fmt.Sprintf("Resolved watch: %s — %s.", resourcePath, watch.LastUpdate)
}

func pluralize(count int, singular string, plural string) string {
	if count == 1 {
		return singular
	}
	return plural
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
