package agent

import (
	"html"
	"regexp"
	"strings"

	"github.com/kubestellar/console/pkg/k8s"
)

var promptUnsafeControlCharsRe = regexp.MustCompile(`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`)
var promptRoleMarkerRe = regexp.MustCompile(`(?i)\b(system|assistant|user|developer|tool)\s*:`)

var promptInjectionReplacer = strings.NewReplacer(
	"\n", " ",
	"\r", " ",
	"\t", " ",
	"```", "'''",
)

func sanitizeK8sStringForPrompt(input string) string {
	if input == "" {
		return ""
	}

	sanitized := promptInjectionReplacer.Replace(input)
	sanitized = promptUnsafeControlCharsRe.ReplaceAllString(sanitized, "")
	sanitized = html.EscapeString(sanitized)
	sanitized = promptRoleMarkerRe.ReplaceAllString(sanitized, "$1-")
	return strings.Join(strings.Fields(sanitized), " ")
}

func sanitizeK8sStringsForPrompt(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	sanitized := make([]string, 0, len(values))
	for _, value := range values {
		cleaned := sanitizeK8sStringForPrompt(value)
		if cleaned != "" {
			sanitized = append(sanitized, cleaned)
		}
	}
	return sanitized
}

func sanitizeClusterHealthForPrompt(health *k8s.ClusterHealth) *k8s.ClusterHealth {
	if health == nil {
		return nil
	}

	sanitized := *health
	sanitized.Cluster = sanitizeK8sStringForPrompt(health.Cluster)
	sanitized.ErrorType = sanitizeK8sStringForPrompt(health.ErrorType)
	sanitized.ErrorMessage = sanitizeK8sStringForPrompt(health.ErrorMessage)
	sanitized.APIServer = sanitizeK8sStringForPrompt(health.APIServer)
	sanitized.Issues = sanitizeK8sStringsForPrompt(health.Issues)
	return &sanitized
}

func sanitizePodIssuesForPrompt(issues []k8s.PodIssue) []k8s.PodIssue {
	if len(issues) == 0 {
		return nil
	}

	sanitized := make([]k8s.PodIssue, 0, len(issues))
	for _, issue := range issues {
		sanitized = append(sanitized, k8s.PodIssue{
			Name:      sanitizeK8sStringForPrompt(issue.Name),
			Namespace: sanitizeK8sStringForPrompt(issue.Namespace),
			Cluster:   sanitizeK8sStringForPrompt(issue.Cluster),
			Status:    sanitizeK8sStringForPrompt(issue.Status),
			Reason:    sanitizeK8sStringForPrompt(issue.Reason),
			Issues:    sanitizeK8sStringsForPrompt(issue.Issues),
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
			Type:      sanitizeK8sStringForPrompt(event.Type),
			Reason:    sanitizeK8sStringForPrompt(event.Reason),
			Message:   sanitizeK8sStringForPrompt(event.Message),
			Object:    sanitizeK8sStringForPrompt(event.Object),
			Namespace: sanitizeK8sStringForPrompt(event.Namespace),
			Cluster:   sanitizeK8sStringForPrompt(event.Cluster),
			Count:     event.Count,
			Age:       sanitizeK8sStringForPrompt(event.Age),
			FirstSeen: sanitizeK8sStringForPrompt(event.FirstSeen),
			LastSeen:  sanitizeK8sStringForPrompt(event.LastSeen),
		})
	}
	return sanitized
}
