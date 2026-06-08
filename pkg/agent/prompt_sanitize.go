package agent

import (
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/sanitize"
)

// sanitizeK8sStringForPrompt delegates to the shared sanitize package.
func sanitizeK8sStringForPrompt(input string) string {
	return sanitize.PromptString(input)
}

// SanitizeK8sStringForPrompt neutralizes prompt-sensitive user-controlled input
// before it is interpolated into downstream LLM prompts.
//
// Deprecated: Use sanitize.PromptString directly. This wrapper is retained
// for backward compatibility during migration.
func SanitizeK8sStringForPrompt(input string) string {
	return sanitize.PromptString(input)
}

// SanitizePromptString keeps a generic alias for non-Kubernetes prompt fields.
//
// Deprecated: Use sanitize.PromptString directly.
func SanitizePromptString(input string) string {
	return sanitize.PromptString(input)
}

func sanitizeK8sStringsForPrompt(values []string) []string {
	return sanitize.PromptStrings(values)
}

func sanitizeClusterHealthForPrompt(health *k8s.ClusterHealth) *k8s.ClusterHealth {
	if health == nil {
		return nil
	}

	sanitized := *health
	sanitized.Cluster = sanitize.PromptString(health.Cluster)
	sanitized.ErrorType = sanitize.PromptString(health.ErrorType)
	sanitized.ErrorMessage = sanitize.PromptString(health.ErrorMessage)
	sanitized.APIServer = sanitize.PromptString(health.APIServer)
	sanitized.Issues = sanitize.PromptStrings(health.Issues)
	return &sanitized
}

func sanitizePodIssuesForPrompt(issues []k8s.PodIssue) []k8s.PodIssue {
	if len(issues) == 0 {
		return nil
	}

	sanitized := make([]k8s.PodIssue, 0, len(issues))
	for _, issue := range issues {
		sanitized = append(sanitized, k8s.PodIssue{
			Name:      sanitize.PromptString(issue.Name),
			Namespace: sanitize.PromptString(issue.Namespace),
			Cluster:   sanitize.PromptString(issue.Cluster),
			Status:    sanitize.PromptString(issue.Status),
			Reason:    sanitize.PromptString(issue.Reason),
			Issues:    sanitize.PromptStrings(issue.Issues),
			Restarts:  issue.Restarts,
		})
	}
	return sanitized
}

func sanitizeWarningEventsForPrompt(events []k8s.Event) []k8s.Event {
	if len(events) == 0 {
		return nil
	}

	sanitized := make([]k8s.Event, 0, len(events))
	for _, event := range events {
		sanitized = append(sanitized, k8s.Event{
			Type:      sanitize.PromptString(event.Type),
			Reason:    sanitize.PromptString(event.Reason),
			Message:   sanitize.PromptString(event.Message),
			Object:    sanitize.PromptString(event.Object),
			Namespace: sanitize.PromptString(event.Namespace),
			Cluster:   sanitize.PromptString(event.Cluster),
			Count:     event.Count,
			Age:       sanitize.PromptString(event.Age),
			FirstSeen: sanitize.PromptString(event.FirstSeen),
			LastSeen:  sanitize.PromptString(event.LastSeen),
		})
	}
	return sanitized
}
