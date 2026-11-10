package observer

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

func (o *Observer) observeUser(ctx context.Context, userID string) {
	tasks, err := o.store.GetOpenTasks(ctx, userID)
	if err != nil {
		return
	}
	events, err := o.store.ListStellarNotifications(ctx, userID, observerRecentLimit, true)
	if err != nil {
		return
	}
	observations, err := o.store.GetRecentObservations(ctx, "", observerMaxRecentFlags)
	if err != nil {
		return
	}

	// Inject live cluster events
	var liveEvents strings.Builder
	if o.client != nil {
		clusters, clErr := o.client.ListClusters(ctx)
		if clErr == nil && len(clusters) > 0 {
			liveEvents.WriteString("\nRecent cluster warnings:\n")
			for _, cluster := range clusters {
				clusterName := cluster.Name
				if clusterName == "" {
					continue
				}
				warningEvents, evErr := o.client.GetWarningEvents(ctx, clusterName, "", 5)
				if evErr == nil && len(warningEvents) > 0 {
					liveEvents.WriteString(fmt.Sprintf("  %s:\n", clusterName))
					for _, ev := range warningEvents {
						liveEvents.WriteString(fmt.Sprintf("    - %s: %s\n", ev.Reason, ev.Message))
					}
				}
			}
		}
	}

	// Inject top weighted memories for context
	var memoryContext strings.Builder
	if o.client != nil {
		clusters, clErr := o.client.ListClusters(ctx)
		if clErr == nil && len(clusters) > 0 {
			for _, cluster := range clusters {
				if cluster.Name == "" {
					continue
				}
				memories, _ := o.store.GetRecentMemoryEntries(ctx, userID, cluster.Name, 5)
				if len(memories) > 0 {
					memoryContext.WriteString(fmt.Sprintf("\nWhat I know about %s:\n", cluster.Name))
					for _, m := range memories {
						memoryContext.WriteString(fmt.Sprintf("  [%s] %s: %s\n",
							m.CreatedAt.Format("Jan 02 15:04"), m.Category, truncate(m.Summary, 150)))
					}
				}
			}
		}
	} else {
		// No cluster client — still pull memories without cluster filter
		memories, _ := o.store.GetRecentMemoryEntries(ctx, userID, "", 5)
		if len(memories) > 0 {
			memoryContext.WriteString("\nWhat I know:\n")
			for _, m := range memories {
				memoryContext.WriteString(fmt.Sprintf("  [%s] %s: %s\n",
					m.CreatedAt.Format("Jan 02 15:04"), m.Category, truncate(m.Summary, 150)))
			}
		}
	}

	contextPayload := buildObserverContext(tasks, events, observations) + liveEvents.String() + memoryContext.String()

	// Prefer the user's saved provider (set via the Stellar provider UI)
	// before falling back to the global registry default. Without this, users
	// who picked Anthropic in the UI saw "ollama connection refused" warnings
	// in the log because the observer was using the env-level default.
	resolved := o.resolveProviderForUser(ctx, userID)
	if resolved.Provider == nil {
		return
	}

	resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   300,
		Temperature: 0.2,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.ObserverCheck},
			{Role: "user", Content: contextPayload},
		},
	})
	if err != nil {
		return
	}

	surface, suggest := parseObserverResponse(resp.Content)
	if surface == "" {
		slog.Debug("stellar/observer: NOTHING", "user", userID)
		return
	}
	slog.Info("stellar/observer: SURFACE", "user", userID, "surface", surface, "model", resolved.Model)

	// Fix #5: Extract reasoning from response (text before SURFACE:)
	reasoning := extractReasoning(resp.Content, surface)

	detail := ""
	if suggest != "" {
		detail = "SUGGEST: " + suggest
	}
	_, _ = o.store.CreateObservation(ctx, &store.StellarObservation{
		Cluster:     "",
		Kind:        "noticed",
		Summary:     surface,
		Detail:      detail,
		Reasoning:   reasoning,
		RefType:     "notification",
		RefID:       "",
		ShownToUser: false,
	})
}

func buildObserverContext(tasks []store.StellarTask, events []store.StellarNotification, observations []store.StellarObservation) string {
	var sb strings.Builder
	sb.WriteString("Open tasks:\n")
	if len(tasks) == 0 {
		sb.WriteString("  - none\n")
	} else {
		for i, task := range tasks {
			if i >= observerRecentLimit {
				break
			}
			sb.WriteString(fmt.Sprintf("  - [%d] %s (%s)\n", task.Priority, task.Title, task.Status))
		}
	}
	sb.WriteString("Recent unread events:\n")
	if len(events) == 0 {
		sb.WriteString("  - none\n")
	} else {
		for _, event := range events {
			sb.WriteString(fmt.Sprintf("  - [%s] %s — %s\n", event.Severity, event.Title, event.Body))
		}
	}
	sb.WriteString("Recently flagged:\n")
	if len(observations) == 0 {
		sb.WriteString("  - none\n")
	} else {
		for _, obs := range observations {
			sb.WriteString(fmt.Sprintf("  - %s\n", obs.Summary))
		}
	}
	return sb.String()
}

func parseObserverResponse(raw string) (surface string, suggest string) {
	trimmed := strings.TrimSpace(raw)
	if strings.EqualFold(trimmed, "NOTHING") {
		return "", ""
	}
	lines := strings.Split(trimmed, "\n")
	for _, line := range lines {
		l := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(strings.ToUpper(l), "SURFACE:"):
			surface = strings.TrimSpace(l[len("SURFACE:"):])
		case strings.HasPrefix(strings.ToUpper(l), "SUGGEST:"):
			suggest = strings.TrimSpace(l[len("SUGGEST:"):])
		}
	}
	return strings.TrimSpace(surface), strings.TrimSpace(suggest)
}

// extractReasoning extracts the reasoning text that appears before "SURFACE:" in the LLM response.
// This is the "why Stellar flagged this" explanation.
func extractReasoning(response, surface string) string {
	surfaceIdx := strings.Index(strings.ToUpper(response), "SURFACE:")
	if surfaceIdx <= 0 {
		return ""
	}
	reasoning := strings.TrimSpace(response[:surfaceIdx])
	// Remove any leading "REASONING:" prefix if present
	reasoning = strings.TrimPrefix(strings.TrimSpace(reasoning), "REASONING:")
	reasoning = strings.TrimSpace(reasoning)
	return reasoning
}
