package stellar

import (
	"fmt"
	"html"
	"log/slog"

	"github.com/kubestellar/console/pkg/store"
)

const stellarMaxUntrustedFieldLen = 512

func renderUntrustedPromptData(source, value string) string {
	truncated := value
	if len(truncated) > stellarMaxUntrustedFieldLen {
		truncated = truncated[:stellarMaxUntrustedFieldLen] + "… [truncated]"
		slog.Warn("truncated untrusted prompt field", "source", source, "originalLen", len(value))
	}
	return fmt.Sprintf(
		"<cluster-data source=%q trust=\"untrusted\">%s</cluster-data>",
		source,
		html.EscapeString(truncated),
	)
}

func buildAutoMissionPrompt(event IncomingEvent, rootCauseHeadline string) string {
	safeEventCluster := renderUntrustedPromptData("k8s-event-cluster", event.Cluster)
	safeEventNamespace := renderUntrustedPromptData("k8s-event-namespace", event.Namespace)
	safeEventKind := renderUntrustedPromptData("k8s-event-kind", event.Kind)
	safeEventName := renderUntrustedPromptData("k8s-event-name", event.Name)
	safeEventReason := renderUntrustedPromptData("k8s-event-reason", event.Reason)
	safeEventMessage := renderUntrustedPromptData("k8s-event-message", event.Message)
	safeRootCauseHeadline := renderUntrustedPromptData("stellar-root-cause-headline", rootCauseHeadline)

	return fmt.Sprintf(`I'm a Kubernetes operator and Stellar (your assistant peer) just flagged a critical event. Diagnose and fix it.

Cluster: %s
Namespace: %s
Resource: %s/%s
Reason: %s
Message: %s
Suspected root cause: %s

Please:
1. Pull the pod logs and 'describe' output for the affected resource.
2. Identify the root cause from those signals.
3. Apply the safest single action to fix it (rollout restart, scale, env/configmap edit, or rollback).
4. Verify the fix landed by re-checking pod status after ~15 seconds.
5. Report what you did, the outcome, and any follow-up I should know about.

Don't ask me first — act. If you genuinely can't fix it safely, tell me what's blocking you.`,
		safeEventCluster, safeEventNamespace, safeEventKind, safeEventName, safeEventReason, safeEventMessage, safeRootCauseHeadline)
}

func buildManualMissionPrompt(notif *store.StellarNotification, resourceName string) string {
	safeNotifCluster := renderUntrustedPromptData("stellar-notification-cluster", notif.Cluster)
	safeNotifNamespace := renderUntrustedPromptData("stellar-notification-namespace", notif.Namespace)
	safeResourceName := renderUntrustedPromptData("stellar-notification-resource", resourceName)
	safeNotifTitle := renderUntrustedPromptData("stellar-notification-title", notif.Title)
	safeNotifBody := renderUntrustedPromptData("stellar-notification-body", notif.Body)

	return fmt.Sprintf(`Diagnose and fix this Kubernetes issue end-to-end.

Cluster: %s
Namespace: %s
Resource: %s
Title: %s
Notification: %s

Please:
1. Pull pod logs and 'describe' output.
2. Identify root cause.
3. Apply the safest single action to fix it.
4. Verify the fix landed after ~15 seconds.
5. Report what you did and the outcome.

Don't ask me first — act. I trust you.`,
		safeNotifCluster, safeNotifNamespace, safeResourceName, safeNotifTitle, safeNotifBody)
}
