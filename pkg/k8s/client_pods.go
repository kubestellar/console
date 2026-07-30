package k8s

import (
	"context"
	"fmt"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// PodInfo represents pod information
type PodInfo struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	Status      string            `json:"status"`
	Ready       string            `json:"ready"`
	Restarts    int               `json:"restarts"`
	Age         string            `json:"age"`
	Node        string            `json:"node,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	Containers  []ContainerInfo   `json:"containers,omitempty"`
}

// ContainerInfo represents container information
type ContainerInfo struct {
	Name         string `json:"name"`
	Image        string `json:"image"`
	Ready        bool   `json:"ready"`
	State        string `json:"state"` // running, waiting, terminated
	Reason       string `json:"reason,omitempty"`
	Message      string `json:"message,omitempty"`
	GPURequested int    `json:"gpuRequested,omitempty"` // Number of GPUs requested by this container
}

// PodIssue represents a pod with issues
type PodIssue struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Cluster   string   `json:"cluster,omitempty"`
	Status    string   `json:"status"`
	Reason    string   `json:"reason,omitempty"`
	Issues    []string `json:"issues"`
	Restarts  int      `json:"restarts"`
}

var podPrimaryReasonPriority = []string{
	"Init:OOMKilled",
	"OOMKilled",
	"Init:CrashLoopBackOff",
	"CrashLoopBackOff",
	"ImagePullBackOff",
	"ErrImagePull",
	"CreateContainerConfigError",
	"InvalidImageName",
	"CreateContainerError",
	"RunContainerError",
	"PostStartHookError",
	"Unschedulable",
	"Failed",
	"Terminating",
}

func appendUniquePodIssue(issues []string, issue string) []string {
	if issue == "" {
		return issues
	}
	for _, existing := range issues {
		if existing == issue {
			return issues
		}
	}
	return append(issues, issue)
}

func normalizePodIssues(issues []string) []string {
	hasOOM := false
	for _, issue := range issues {
		if issue == "OOMKilled" || issue == "Init:OOMKilled" {
			hasOOM = true
			break
		}
	}
	if !hasOOM {
		return issues
	}

	normalized := make([]string, 0, len(issues))
	for _, issue := range issues {
		if issue == "OOMKilled" || issue == "Init:OOMKilled" || issue == "CrashLoopBackOff" || issue == "Init:CrashLoopBackOff" || strings.HasPrefix(issue, "High restarts") {
			normalized = append(normalized, issue)
		}
	}
	if len(normalized) == 0 {
		return issues
	}
	return normalized
}

func getPrimaryPodIssue(issues []string, fallback string) string {
	for _, candidate := range podPrimaryReasonPriority {
		candidateLower := strings.ToLower(candidate)
		for _, issue := range issues {
			issueLower := strings.ToLower(issue)
			if issue == candidate || strings.HasPrefix(issue, candidate+":") || strings.Contains(issueLower, candidateLower) {
				return candidate
			}
		}
	}
	return fallback
}

func (m *MultiClusterClient) GetPods(ctx context.Context, contextName, namespace string) ([]PodInfo, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PodInfo
	for _, pod := range pods.Items {
		ready := 0
		total := len(pod.Spec.Containers)
		restarts := 0

		// Build container status map
		statusMap := make(map[string]corev1.ContainerStatus)
		for _, cs := range pod.Status.ContainerStatuses {
			statusMap[cs.Name] = cs
			if cs.Ready {
				ready++
			}
			restarts += int(cs.RestartCount)
		}

		// Build container info
		var containers []ContainerInfo
		for _, c := range pod.Spec.Containers {
			ci := ContainerInfo{
				Name:  c.Name,
				Image: c.Image,
			}
			if cs, ok := statusMap[c.Name]; ok {
				ci.Ready = cs.Ready
				if cs.State.Running != nil {
					ci.State = "running"
				} else if cs.State.Waiting != nil {
					ci.State = "waiting"
					ci.Reason = cs.State.Waiting.Reason
					ci.Message = cs.State.Waiting.Message
				} else if cs.State.Terminated != nil {
					ci.State = "terminated"
					ci.Reason = cs.State.Terminated.Reason
					ci.Message = cs.State.Terminated.Message
				}
			}
			// Check for GPU / accelerator resource requests using the shared
			// SumGPURequested helper (pkg/k8s/gpu_resources.go). Sums across ALL
			// known GPU resource names so containers requesting more than one
			// accelerator type (e.g., nvidia.com/gpu=1 + habana.ai/gaudi=2) are
			// counted correctly. Previously each matching name overwrote the
			// previous, so the final value depended on map iteration order
			// (flagged on PR Issue 9204 follow-up review).
			ci.GPURequested = SumGPURequested(c.Resources.Requests)
			if ci.GPURequested == 0 {
				ci.GPURequested = SumGPURequested(c.Resources.Limits)
			}
			containers = append(containers, ci)
		}

		result = append(result, PodInfo{
			Name:        pod.Name,
			Namespace:   pod.Namespace,
			Cluster:     contextName,
			Status:      string(pod.Status.Phase),
			Ready:       fmt.Sprintf("%d/%d", ready, total),
			Restarts:    restarts,
			Age:         formatDuration(time.Since(pod.CreationTimestamp.Time)),
			Node:        pod.Spec.NodeName,
			Labels:      pod.Labels,
			Annotations: pod.Annotations,
			Containers:  containers,
		})
	}

	return result, nil
}

// FindPodIssues returns pods with issues
func (m *MultiClusterClient) FindPodIssues(ctx context.Context, contextName, namespace string) ([]PodIssue, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Waiting reasons that indicate a problem
	problemWaitingReasons := map[string]bool{
		"CrashLoopBackOff":           true,
		"ImagePullBackOff":           true,
		"ErrImagePull":               true,
		"CreateContainerConfigError": true,
		"InvalidImageName":           true,
		"CreateContainerError":       true,
		"RunContainerError":          true,
		"PostStartHookError":         true,
	}

	now := time.Now()

	var issues []PodIssue
	for _, pod := range pods.Items {
		// Skip completed/succeeded pods (e.g. finished Jobs)
		if pod.Status.Phase == corev1.PodSucceeded {
			continue
		}

		var podIssues []string
		restarts := 0
		effectiveStatus := string(pod.Status.Phase)

		for i, cs := range pod.Status.InitContainerStatuses {
			restarts += int(cs.RestartCount)

			if cs.LastTerminationState.Terminated != nil && cs.LastTerminationState.Terminated.Reason == "OOMKilled" {
				podIssues = appendUniquePodIssue(podIssues, "Init:OOMKilled")
			}
			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				if problemWaitingReasons[cs.State.Waiting.Reason] {
					podIssues = appendUniquePodIssue(podIssues, fmt.Sprintf("Init:%s", cs.State.Waiting.Reason))
				}
			}
			if cs.State.Terminated != nil && cs.State.Terminated.ExitCode != 0 {
				podIssues = appendUniquePodIssue(podIssues, fmt.Sprintf("Init container %d failed (exit %d)", i, cs.State.Terminated.ExitCode))
			}
		}

		for _, cs := range pod.Status.ContainerStatuses {
			restarts += int(cs.RestartCount)

			if cs.LastTerminationState.Terminated != nil && cs.LastTerminationState.Terminated.Reason == "OOMKilled" {
				podIssues = appendUniquePodIssue(podIssues, "OOMKilled")
			}
			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				reason := cs.State.Waiting.Reason
				if problemWaitingReasons[reason] {
					podIssues = appendUniquePodIssue(podIssues, reason)
				}
			}
			if cs.State.Terminated != nil && cs.State.Terminated.ExitCode != 0 {
				podIssues = appendUniquePodIssue(podIssues, fmt.Sprintf("Exit code %d", cs.State.Terminated.ExitCode))
				if cs.State.Terminated.Reason != "" && effectiveStatus == string(pod.Status.Phase) {
					effectiveStatus = cs.State.Terminated.Reason
				}
			}

			if cs.State.Running != nil && !cs.Ready {
				age := now.Sub(cs.State.Running.StartedAt.Time)
				if age > podIssueAgeThreshold {
					podIssues = appendUniquePodIssue(podIssues, "Not ready")
				}
			}

			if cs.RestartCount > 5 {
				podIssues = appendUniquePodIssue(podIssues, fmt.Sprintf("High restarts (%d)", cs.RestartCount))
			}
		}

		for _, cond := range pod.Status.Conditions {
			if cond.Type == corev1.PodScheduled && cond.Status == corev1.ConditionFalse {
				msg := cond.Reason
				if cond.Message != "" {
					msg = cond.Message
				}
				podIssues = appendUniquePodIssue(podIssues, fmt.Sprintf("Unschedulable: %s", msg))
			}
		}

		if pod.Status.Phase == corev1.PodPending {
			if len(podIssues) == 0 && pod.CreationTimestamp.Time.Before(now.Add(-podPendingAgeThreshold)) {
				podIssues = appendUniquePodIssue(podIssues, "Pending")
			}
		}
		if pod.Status.Phase == corev1.PodFailed {
			reason := "Failed"
			if pod.Status.Reason != "" {
				reason = pod.Status.Reason
			}
			podIssues = appendUniquePodIssue(podIssues, reason)
		}

		if pod.DeletionTimestamp != nil {
			age := now.Sub(pod.DeletionTimestamp.Time)
			if age > podIssueAgeThreshold {
				podIssues = appendUniquePodIssue(podIssues, fmt.Sprintf("Stuck terminating (%dm)", int(age.Minutes())))
			}
		}

		normalizedIssues := normalizePodIssues(podIssues)
		fallbackStatus := effectiveStatus
		if pod.Status.Reason != "" {
			fallbackStatus = pod.Status.Reason
		}
		primaryReason := getPrimaryPodIssue(normalizedIssues, fallbackStatus)
		if primaryReason != "" {
			effectiveStatus = primaryReason
		}

		if len(normalizedIssues) > 0 {
			issues = append(issues, PodIssue{
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Cluster:   contextName,
				Status:    effectiveStatus,
				Reason:    effectiveStatus,
				Restarts:  restarts,
				Issues:    normalizedIssues,
			})
		}
	}

	return issues, nil
}

// GetPodLogs returns logs from a pod
func (m *MultiClusterClient) GetPodLogs(ctx context.Context, contextName, namespace, podName, container string, tailLines int64) (string, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return "", err
	}

	opts := &corev1.PodLogOptions{}
	if tailLines > 0 {
		opts.TailLines = &tailLines
	}
	if container != "" {
		opts.Container = container
	}

	req := client.CoreV1().Pods(namespace).GetLogs(podName, opts)
	logs, err := req.DoRaw(ctx)
	if err != nil {
		return "", err
	}

	return string(logs), nil
}

// formatAge formats a time.Time as a human-readable age string
