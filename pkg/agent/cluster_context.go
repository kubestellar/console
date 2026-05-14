package agent

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

const (
	providerClusterContextTimeout      = 10 * time.Second
	providerClusterContextClusterLimit = 5
	providerClusterContextIssueLimit   = 8
	providerClusterContextEventLimit   = 5
	providerClusterContextMessageLimit = 160
)

var providerClusterContextState struct {
	mu        sync.RWMutex
	bridge    *mcp.Bridge
	k8sClient *k8s.MultiClusterClient
}

// SetClusterContextProviders wires live cluster data sources into AI providers.
func SetClusterContextProviders(bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient) {
	providerClusterContextState.mu.Lock()
	defer providerClusterContextState.mu.Unlock()
	providerClusterContextState.bridge = bridge
	providerClusterContextState.k8sClient = k8sClient
}

func buildLiveClusterContext(ctx context.Context, req *ChatRequest) string {
	if req == nil {
		return ""
	}

	providerClusterContextState.mu.RLock()
	bridge := providerClusterContextState.bridge
	k8sClient := providerClusterContextState.k8sClient
	providerClusterContextState.mu.RUnlock()

	if bridge == nil && k8sClient == nil {
		return ""
	}

	ctxWithTimeout, cancel := context.WithTimeout(ctx, providerClusterContextTimeout)
	defer cancel()

	namespace := resolveScopedNamespace(req)
	clusters := resolveScopedClusters(req)
	if len(clusters) == 0 {
		clusters = listScopedClusters(ctxWithTimeout, bridge, k8sClient)
	}
	if len(clusters) == 0 {
		return ""
	}

	truncatedClusters := 0
	if len(clusters) > providerClusterContextClusterLimit {
		truncatedClusters = len(clusters) - providerClusterContextClusterLimit
		clusters = clusters[:providerClusterContextClusterLimit]
	}

	var sb strings.Builder
	sb.WriteString("LIVE KUBERNETES CONTEXT — use this live cluster state when answering.\n")
	sb.WriteString("<cluster-data>\n")
	if namespace != "" {
		sb.WriteString(fmt.Sprintf("Scoped namespace: %s\n", namespace))
	}

	for _, cluster := range clusters {
		sb.WriteString(fmt.Sprintf("\nCluster: %s\n", cluster))
		appendClusterHealth(&sb, ctxWithTimeout, bridge, k8sClient, cluster)
		appendPodIssues(&sb, ctxWithTimeout, bridge, k8sClient, cluster, namespace)
		appendWarningEvents(&sb, ctxWithTimeout, bridge, k8sClient, cluster, namespace)
	}

	if truncatedClusters > 0 {
		sb.WriteString(fmt.Sprintf("\nAdditional clusters omitted from context: %d\n", truncatedClusters))
	}

	sb.WriteString("</cluster-data>")
	return sb.String()
}

func resolveScopedClusters(req *ChatRequest) []string {
	if req == nil || req.Context == nil {
		return nil
	}

	var names []string
	for _, key := range []string{"clusterContext", "cluster", "clusters"} {
		value := strings.TrimSpace(req.Context[key])
		if value == "" {
			continue
		}
		for _, part := range strings.Split(value, ",") {
			part = strings.TrimSpace(part)
			if part != "" {
				names = append(names, part)
			}
		}
	}

	return uniqueSortedStrings(names)
}

func resolveScopedNamespace(req *ChatRequest) string {
	if req == nil || req.Context == nil {
		return ""
	}
	return strings.TrimSpace(req.Context["namespace"])
}

func listScopedClusters(ctx context.Context, bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient) []string {
	if bridge != nil {
		clusters, err := bridge.ListClusters(ctx)
		if err == nil {
			names := make([]string, 0, len(clusters))
			for _, cluster := range clusters {
				if cluster.Name != "" {
					names = append(names, cluster.Name)
				}
			}
			return uniqueSortedStrings(names)
		}
	}

	if k8sClient != nil {
		clusters, err := k8sClient.DeduplicatedClusters(ctx)
		if err == nil {
			names := make([]string, 0, len(clusters))
			for _, cluster := range clusters {
				if cluster.Name != "" {
					names = append(names, cluster.Name)
				}
			}
			return uniqueSortedStrings(names)
		}
	}

	return nil
}

func appendClusterHealth(sb *strings.Builder, ctx context.Context, bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient, cluster string) {
	if bridge != nil {
		health, err := bridge.GetClusterHealth(ctx, cluster)
		if err == nil && health != nil {
			sb.WriteString(fmt.Sprintf("Health: healthy=%t reachable=%t nodes=%d readyNodes=%d pods=%d cpuCores=%d memoryGB=%.1f\n",
				health.Healthy, health.Reachable, health.NodeCount, health.ReadyNodes, health.PodCount, health.CpuCores, health.MemoryGB))
			if len(health.Issues) > 0 {
				sb.WriteString(fmt.Sprintf("Health issues: %s\n", strings.Join(health.Issues, "; ")))
			}
			return
		}
	}

	if k8sClient != nil {
		health, err := k8sClient.GetClusterHealth(ctx, cluster)
		if err == nil && health != nil {
			sb.WriteString(fmt.Sprintf("Health: healthy=%t reachable=%t nodes=%d readyNodes=%d pods=%d cpuCores=%d memoryGB=%.1f\n",
				health.Healthy, health.Reachable, health.NodeCount, health.ReadyNodes, health.PodCount, health.CpuCores, health.MemoryGB))
			if len(health.Issues) > 0 {
				sb.WriteString(fmt.Sprintf("Health issues: %s\n", strings.Join(health.Issues, "; ")))
			}
			return
		}
	}

	sb.WriteString("Health: unavailable\n")
}

func appendPodIssues(sb *strings.Builder, ctx context.Context, bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient, cluster, namespace string) {
	if bridge != nil {
		issues, err := bridge.FindPodIssues(ctx, cluster, namespace)
		if err == nil {
			appendFormattedBridgePodIssues(sb, issues)
			return
		}
	}

	if k8sClient != nil {
		issues, err := k8sClient.FindPodIssues(ctx, cluster, namespace)
		if err == nil {
			appendFormattedPodIssues(sb, issues)
			return
		}
	}

	sb.WriteString("Pod issues: unavailable\n")
}

func appendFormattedBridgePodIssues(sb *strings.Builder, issues []mcp.PodIssue) {
	if len(issues) == 0 {
		sb.WriteString("Pod issues: none detected\n")
		return
	}

	if len(issues) > providerClusterContextIssueLimit {
		issues = issues[:providerClusterContextIssueLimit]
	}

	sb.WriteString("Pod issues:\n")
	for _, issue := range issues {
		line := fmt.Sprintf("- %s/%s status=%s restarts=%d", issue.Namespace, issue.Name, issue.Status, issue.Restarts)
		if issue.Reason != "" {
			line += fmt.Sprintf(" reason=%s", issue.Reason)
		}
		if len(issue.Issues) > 0 {
			line += fmt.Sprintf(" issues=%s", strings.Join(issue.Issues, "; "))
		}
		sb.WriteString(line + "\n")
	}
}

func appendFormattedPodIssues(sb *strings.Builder, issues []k8s.PodIssue) {
	if len(issues) == 0 {
		sb.WriteString("Pod issues: none detected\n")
		return
	}

	if len(issues) > providerClusterContextIssueLimit {
		issues = issues[:providerClusterContextIssueLimit]
	}

	sb.WriteString("Pod issues:\n")
	for _, issue := range issues {
		line := fmt.Sprintf("- %s/%s status=%s restarts=%d", issue.Namespace, issue.Name, issue.Status, issue.Restarts)
		if issue.Reason != "" {
			line += fmt.Sprintf(" reason=%s", issue.Reason)
		}
		if len(issue.Issues) > 0 {
			line += fmt.Sprintf(" issues=%s", strings.Join(issue.Issues, "; "))
		}
		sb.WriteString(line + "\n")
	}
}

func appendWarningEvents(sb *strings.Builder, ctx context.Context, bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient, cluster, namespace string) {
	if bridge != nil {
		events, err := bridge.GetWarningEvents(ctx, cluster, namespace, providerClusterContextEventLimit)
		if err == nil {
			appendFormattedBridgeWarningEvents(sb, events)
			return
		}
	}

	if k8sClient != nil {
		events, err := k8sClient.GetWarningEvents(ctx, cluster, namespace, providerClusterContextEventLimit)
		if err == nil {
			appendFormattedWarningEvents(sb, events)
			return
		}
	}

	sb.WriteString("Recent warning events: unavailable\n")
}

func appendFormattedBridgeWarningEvents(sb *strings.Builder, events []mcp.Event) {
	if len(events) == 0 {
		sb.WriteString("Recent warning events: none\n")
		return
	}

	sb.WriteString("Recent warning events:\n")
	for _, event := range events {
		message := strings.TrimSpace(event.Message)
		if len(message) > providerClusterContextMessageLimit {
			message = message[:providerClusterContextMessageLimit-3] + "..."
		}
		line := fmt.Sprintf("- %s %s/%s x%d: %s", event.Reason, event.Namespace, event.Object, event.Count, message)
		sb.WriteString(line + "\n")
	}
}

func appendFormattedWarningEvents(sb *strings.Builder, events []k8s.Event) {
	if len(events) == 0 {
		sb.WriteString("Recent warning events: none\n")
		return
	}

	sb.WriteString("Recent warning events:\n")
	for _, event := range events {
		message := strings.TrimSpace(event.Message)
		if len(message) > providerClusterContextMessageLimit {
			message = message[:providerClusterContextMessageLimit-3] + "..."
		}
		line := fmt.Sprintf("- %s %s/%s x%d: %s", event.Reason, event.Namespace, event.Object, event.Count, message)
		sb.WriteString(line + "\n")
	}
}

func uniqueSortedStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	sort.Strings(unique)
	return unique
}
