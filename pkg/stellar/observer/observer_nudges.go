package observer

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	consolemetrics "github.com/kubestellar/console/pkg/api/metrics"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

const observerNudgeLookback = 2 * time.Hour
const observerNudgeMaxEvents = 20
const observerNudgeMinLength = 20

// generateNudges asks the LLM for one cross-cutting observation about recent
// events, then creates an observation notification for each user.
func (o *Observer) generateNudges(ctx context.Context, userIDs []string) {
	since := time.Now().Add(-observerNudgeLookback)
	notifications, err := o.store.GetNotificationsSince(ctx, since)
	if err != nil || len(notifications) == 0 {
		return
	}

	var summary strings.Builder
	summary.WriteString("Recent cluster events in the last 2 hours:\n\n")
	count := 0
	for _, n := range notifications {
		if count >= observerNudgeMaxEvents {
			break
		}
		summary.WriteString(fmt.Sprintf("- [%s] %s on %s: %s\n", n.Severity, n.Title, n.Cluster, truncate(n.Body, 120)))
		count++
	}

	// Proactive nudges are background batch scans — prefer the local Ollama
	// scanner provider to save API costs, falling back to a cloud provider.
	primaryUser := ""
	if len(userIDs) > 0 {
		primaryUser = userIDs[0]
	}
	resolved := o.resolveScannerProvider(ctx, primaryUser)
	if resolved.Provider == nil {
		return
	}
	resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   150,
		Temperature: 0.5,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.ProactiveNudge},
			{Role: "user", Content: summary.String()},
		},
	})
	if err != nil {
		slog.Debug("stellar/observer: nudge generation failed", "error", err)
		consolemetrics.RecordStellarObserverError(consolemetrics.StellarObserverErrorNudgeGeneration)
		return
	}

	nudge := strings.TrimSpace(resp.Content)
	if len(nudge) < observerNudgeMinLength {
		return
	}
	if strings.EqualFold(nudge, "NOTHING") {
		return
	}

	// 1 nudge per hour max (per user)
	dedupKey := fmt.Sprintf("nudge:%s", time.Now().UTC().Format("2006-01-02-15"))

	for _, userID := range userIDs {
		if strings.TrimSpace(userID) == "" {
			continue
		}
		exists, _ := o.store.NotificationExistsByDedup(ctx, userID, dedupKey)
		if exists {
			continue
		}
		err := o.store.CreateStellarNotification(ctx, &store.StellarNotification{
			UserID:    userID,
			Type:      "observation",
			Severity:  "info",
			Title:     "Stellar observation",
			Body:      nudge,
			DedupeKey: dedupKey,
		})
		if err != nil {
			slog.Warn("stellar/observer: failed to create nudge notification", "error", err, "user", userID)
			continue
		}
		consolemetrics.RecordStellarObserverNudgeCreated()
		slog.Info("stellar/observer: nudge created", "user", userID, "summary", truncate(nudge, 60))
	}
}
