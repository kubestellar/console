package k8s

import (
	"context"
	"fmt"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// DeploymentIssue represents a deployment with issues
type DeploymentIssue struct {
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	Cluster       string `json:"cluster,omitempty"`
	Replicas      int32  `json:"replicas"`
	ReadyReplicas int32  `json:"readyReplicas"`
	Reason        string `json:"reason,omitempty"`
	Message       string `json:"message,omitempty"`
}

// Deployment represents a Kubernetes deployment with rollout status
type Deployment struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Cluster           string            `json:"cluster,omitempty"`
	Status            string            `json:"status"` // running, deploying, failed
	Replicas          int32             `json:"replicas"`
	ReadyReplicas     int32             `json:"readyReplicas"`
	UpdatedReplicas   int32             `json:"updatedReplicas"`
	AvailableReplicas int32             `json:"availableReplicas"`
	Progress          int               `json:"progress"` // 0-100
	Image             string            `json:"image,omitempty"`
	Age               string            `json:"age,omitempty"`
	Labels            map[string]string `json:"labels,omitempty"`
	Annotations       map[string]string `json:"annotations,omitempty"`
}

// Job represents a Kubernetes job
type Job struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	Status      string            `json:"status"` // Running, Complete, Failed
	Completions string            `json:"completions"`
	Duration    string            `json:"duration,omitempty"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

// HPA represents a Horizontal Pod Autoscaler
type HPA struct {
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace"`
	Cluster         string            `json:"cluster,omitempty"`
	Reference       string            `json:"reference"` // Target deployment/statefulset
	MinReplicas     int32             `json:"minReplicas"`
	MaxReplicas     int32             `json:"maxReplicas"`
	CurrentReplicas int32             `json:"currentReplicas"`
	TargetCPU       string            `json:"targetCPU,omitempty"`
	CurrentCPU      string            `json:"currentCPU,omitempty"`
	Age             string            `json:"age,omitempty"`
	Labels          map[string]string `json:"labels,omitempty"`
	Annotations     map[string]string `json:"annotations,omitempty"`
}

// ReplicaSet represents a Kubernetes ReplicaSet
type ReplicaSet struct {
	Name          string            `json:"name"`
	Namespace     string            `json:"namespace"`
	Cluster       string            `json:"cluster,omitempty"`
	Replicas      int32             `json:"replicas"`
	ReadyReplicas int32             `json:"readyReplicas"`
	OwnerName     string            `json:"ownerName,omitempty"`
	OwnerKind     string            `json:"ownerKind,omitempty"`
	Age           string            `json:"age,omitempty"`
	Labels        map[string]string `json:"labels,omitempty"`
}

// StatefulSet represents a Kubernetes StatefulSet
type StatefulSet struct {
	Name          string            `json:"name"`
	Namespace     string            `json:"namespace"`
	Cluster       string            `json:"cluster,omitempty"`
	Replicas      int32             `json:"replicas"`
	ReadyReplicas int32             `json:"readyReplicas"`
	Status        string            `json:"status"`
	Image         string            `json:"image,omitempty"`
	Age           string            `json:"age,omitempty"`
	Labels        map[string]string `json:"labels,omitempty"`
}

// DaemonSet represents a Kubernetes DaemonSet
type DaemonSet struct {
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	Cluster          string            `json:"cluster,omitempty"`
	DesiredScheduled int32             `json:"desiredScheduled"`
	CurrentScheduled int32             `json:"currentScheduled"`
	Ready            int32             `json:"ready"`
	Status           string            `json:"status"`
	Age              string            `json:"age,omitempty"`
	Labels           map[string]string `json:"labels,omitempty"`
}

// CronJob represents a Kubernetes CronJob
type CronJob struct {
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	Cluster      string            `json:"cluster,omitempty"`
	Schedule     string            `json:"schedule"`
	Suspend      bool              `json:"suspend"`
	Active       int               `json:"active"`
	LastSchedule string            `json:"lastSchedule,omitempty"`
	Age          string            `json:"age,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
}

// FindDeploymentIssues returns deployments with issues
func (m *MultiClusterClient) FindDeploymentIssues(ctx context.Context, contextName, namespace string) ([]DeploymentIssue, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	deployments, err := client.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var issues []DeploymentIssue
	for _, deploy := range deployments.Items {
		// Check for issues
		var reason, message string

		// Kubernetes defaults Replicas to 1 when unset
		desiredReplicas := int32(1)
		if deploy.Spec.Replicas != nil {
			desiredReplicas = *deploy.Spec.Replicas
		}

		// Check if not all replicas are ready
		if deploy.Status.ReadyReplicas < desiredReplicas {
			// Check conditions for more details. Progressing=False
			// (ProgressDeadlineExceeded) is the more severe/specific condition
			// and must take precedence over Available=False regardless of slice
			// order (#4470). Use a two-pass scan: look for Progressing=False
			// first, then fall back to Available=False.
			for _, condition := range deploy.Status.Conditions {
				if condition.Type == appsv1.DeploymentProgressing && condition.Status == corev1.ConditionFalse {
					reason = "ProgressDeadlineExceeded"
					message = condition.Message
					break
				}
			}
			if reason == "" {
				for _, condition := range deploy.Status.Conditions {
					if condition.Type == appsv1.DeploymentAvailable && condition.Status == corev1.ConditionFalse {
						reason = "Unavailable"
						message = condition.Message
						break
					}
				}
			}

			// If we found no condition, use generic
			if reason == "" {
				reason = "Unavailable"
				message = fmt.Sprintf("%d/%d replicas ready", deploy.Status.ReadyReplicas, desiredReplicas)
			}

			issues = append(issues, DeploymentIssue{
				Name:          deploy.Name,
				Namespace:     deploy.Namespace,
				Cluster:       contextName,
				Replicas:      desiredReplicas,
				ReadyReplicas: deploy.Status.ReadyReplicas,
				Reason:        reason,
				Message:       message,
			})
		}
	}

	return issues, nil
}

// GetDeployments returns all deployments with rollout status
func (m *MultiClusterClient) GetDeployments(ctx context.Context, contextName, namespace string) ([]Deployment, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	deployments, err := client.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Deployment
	for _, deploy := range deployments.Items {
		// Kubernetes defaults Replicas to 1 when unset
		desired := int32(1)
		if deploy.Spec.Replicas != nil {
			desired = *deploy.Spec.Replicas
		}

		// Determine status
		status := "running"
		if deploy.Status.ReadyReplicas < desired {
			status = "deploying"
			// Only mark as failed when Progressing=False (ProgressDeadlineExceeded).
			// Available=False alone is a transient state during normal rolling updates
			// and should remain "deploying", not "failed", to avoid false positives
			// that contradict live drilldown data (#4470).
			for _, condition := range deploy.Status.Conditions {
				if condition.Type == appsv1.DeploymentProgressing && condition.Status == corev1.ConditionFalse {
					status = "failed"
					break
				}
			}
		}

		// Calculate progress — desired already set above
		progress := 100
		if desired > 0 {
			progress = int((float64(deploy.Status.ReadyReplicas) / float64(desired)) * 100)
		}

		// Get primary container image
		image := ""
		if len(deploy.Spec.Template.Spec.Containers) > 0 {
			image = deploy.Spec.Template.Spec.Containers[0].Image
		}

		// Calculate age
		age := ""
		if !deploy.CreationTimestamp.IsZero() {
			duration := time.Since(deploy.CreationTimestamp.Time)
			if duration.Hours() > 24 {
				age = fmt.Sprintf("%dd", int(duration.Hours()/24))
			} else if duration.Hours() > 1 {
				age = fmt.Sprintf("%dh", int(duration.Hours()))
			} else {
				age = fmt.Sprintf("%dm", int(duration.Minutes()))
			}
		}

		result = append(result, Deployment{
			Name:              deploy.Name,
			Namespace:         deploy.Namespace,
			Cluster:           contextName,
			Status:            status,
			Replicas:          desired,
			ReadyReplicas:     deploy.Status.ReadyReplicas,
			UpdatedReplicas:   deploy.Status.UpdatedReplicas,
			AvailableReplicas: deploy.Status.AvailableReplicas,
			Progress:          progress,
			Image:             image,
			Age:               age,
			Labels:            deploy.Labels,
			Annotations:       deploy.Annotations,
		})
	}

	return result, nil
}

// GetJobs returns all jobs in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetJobs(ctx context.Context, contextName, namespace string) ([]Job, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	jobs, err := client.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Job
	for _, job := range jobs.Items {
		// Determine status
		status := "Running"
		if job.Status.Succeeded > 0 {
			status = "Complete"
		} else if job.Status.Failed > 0 {
			status = "Failed"
		}

		// Completions
		completions := "0/1"
		if job.Spec.Completions != nil {
			completions = fmt.Sprintf("%d/%d", job.Status.Succeeded, *job.Spec.Completions)
		}

		// Duration
		duration := ""
		if job.Status.StartTime != nil {
			endTime := time.Now()
			if job.Status.CompletionTime != nil {
				endTime = job.Status.CompletionTime.Time
			}
			dur := endTime.Sub(job.Status.StartTime.Time)
			if dur.Hours() > 1 {
				duration = fmt.Sprintf("%dh%dm", int(dur.Hours()), int(dur.Minutes())%60)
			} else if dur.Minutes() > 1 {
				duration = fmt.Sprintf("%dm%ds", int(dur.Minutes()), int(dur.Seconds())%60)
			} else {
				duration = fmt.Sprintf("%ds", int(dur.Seconds()))
			}
		}

		// Calculate age
		age := formatAge(job.CreationTimestamp.Time)

		result = append(result, Job{
			Name:        job.Name,
			Namespace:   job.Namespace,
			Cluster:     contextName,
			Status:      status,
			Completions: completions,
			Duration:    duration,
			Age:         age,
			Labels:      job.Labels,
			Annotations: job.Annotations,
		})
	}

	return result, nil
}

// GetHPAs returns all HPAs in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetHPAs(ctx context.Context, contextName, namespace string) ([]HPA, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	hpas, err := client.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []HPA
	for _, hpa := range hpas.Items {
		// Get target reference
		reference := fmt.Sprintf("%s/%s", hpa.Spec.ScaleTargetRef.Kind, hpa.Spec.ScaleTargetRef.Name)

		// Get min/max replicas
		minReplicas := int32(1)
		if hpa.Spec.MinReplicas != nil {
			minReplicas = *hpa.Spec.MinReplicas
		}

		// Get target/current CPU
		targetCPU := ""
		currentCPU := ""
		for _, metric := range hpa.Spec.Metrics {
			if metric.Type == "Resource" && metric.Resource != nil && metric.Resource.Name == "cpu" {
				if metric.Resource.Target.AverageUtilization != nil {
					targetCPU = fmt.Sprintf("%d%%", *metric.Resource.Target.AverageUtilization)
				}
			}
		}
		for _, condition := range hpa.Status.CurrentMetrics {
			if condition.Type == "Resource" && condition.Resource != nil && condition.Resource.Name == "cpu" {
				if condition.Resource.Current.AverageUtilization != nil {
					currentCPU = fmt.Sprintf("%d%%", *condition.Resource.Current.AverageUtilization)
				}
			}
		}

		// Calculate age
		age := formatAge(hpa.CreationTimestamp.Time)

		result = append(result, HPA{
			Name:            hpa.Name,
			Namespace:       hpa.Namespace,
			Cluster:         contextName,
			Reference:       reference,
			MinReplicas:     minReplicas,
			MaxReplicas:     hpa.Spec.MaxReplicas,
			CurrentReplicas: hpa.Status.CurrentReplicas,
			TargetCPU:       targetCPU,
			CurrentCPU:      currentCPU,
			Age:             age,
			Labels:          hpa.Labels,
			Annotations:     hpa.Annotations,
		})
	}

	return result, nil
}

// GetReplicaSets returns all ReplicaSets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetReplicaSets(ctx context.Context, contextName, namespace string) ([]ReplicaSet, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	rsList, err := client.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ReplicaSet
	for _, rs := range rsList.Items {
		replicas := int32(0)
		if rs.Spec.Replicas != nil {
			replicas = *rs.Spec.Replicas
		}
		ownerName, ownerKind := "", ""
		if len(rs.OwnerReferences) > 0 {
			ownerName = rs.OwnerReferences[0].Name
			ownerKind = rs.OwnerReferences[0].Kind
		}
		result = append(result, ReplicaSet{
			Name:          rs.Name,
			Namespace:     rs.Namespace,
			Cluster:       contextName,
			Replicas:      replicas,
			ReadyReplicas: rs.Status.ReadyReplicas,
			OwnerName:     ownerName,
			OwnerKind:     ownerKind,
			Age:           formatAge(rs.CreationTimestamp.Time),
			Labels:        rs.Labels,
		})
	}

	return result, nil
}

// GetStatefulSets returns all StatefulSets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetStatefulSets(ctx context.Context, contextName, namespace string) ([]StatefulSet, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	ssList, err := client.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []StatefulSet
	for _, ss := range ssList.Items {
		replicas := int32(0)
		if ss.Spec.Replicas != nil {
			replicas = *ss.Spec.Replicas
		}
		status := "running"
		if ss.Status.ReadyReplicas < replicas {
			status = "deploying"
		}
		if replicas > 0 && ss.Status.ReadyReplicas == 0 {
			status = "failed"
		}
		image := ""
		if len(ss.Spec.Template.Spec.Containers) > 0 {
			image = ss.Spec.Template.Spec.Containers[0].Image
		}
		result = append(result, StatefulSet{
			Name:          ss.Name,
			Namespace:     ss.Namespace,
			Cluster:       contextName,
			Replicas:      replicas,
			ReadyReplicas: ss.Status.ReadyReplicas,
			Status:        status,
			Image:         image,
			Age:           formatAge(ss.CreationTimestamp.Time),
			Labels:        ss.Labels,
		})
	}

	return result, nil
}

// GetDaemonSets returns all DaemonSets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetDaemonSets(ctx context.Context, contextName, namespace string) ([]DaemonSet, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	dsList, err := client.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []DaemonSet
	for _, ds := range dsList.Items {
		status := "running"
		if ds.Status.NumberReady < ds.Status.DesiredNumberScheduled {
			status = "degraded"
		}
		if ds.Status.DesiredNumberScheduled > 0 && ds.Status.NumberReady == 0 {
			status = "failed"
		}
		result = append(result, DaemonSet{
			Name:             ds.Name,
			Namespace:        ds.Namespace,
			Cluster:          contextName,
			DesiredScheduled: ds.Status.DesiredNumberScheduled,
			CurrentScheduled: ds.Status.CurrentNumberScheduled,
			Ready:            ds.Status.NumberReady,
			Status:           status,
			Age:              formatAge(ds.CreationTimestamp.Time),
			Labels:           ds.Labels,
		})
	}

	return result, nil
}

// GetCronJobs returns all CronJobs in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetCronJobs(ctx context.Context, contextName, namespace string) ([]CronJob, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	cronList, err := client.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []CronJob
	for _, cj := range cronList.Items {
		lastSchedule := ""
		if cj.Status.LastScheduleTime != nil {
			lastSchedule = formatAge(cj.Status.LastScheduleTime.Time) + " ago"
		}
		suspend := false
		if cj.Spec.Suspend != nil {
			suspend = *cj.Spec.Suspend
		}
		result = append(result, CronJob{
			Name:         cj.Name,
			Namespace:    cj.Namespace,
			Cluster:      contextName,
			Schedule:     cj.Spec.Schedule,
			Suspend:      suspend,
			Active:       len(cj.Status.Active),
			LastSchedule: lastSchedule,
			Age:          formatAge(cj.CreationTimestamp.Time),
			Labels:       cj.Labels,
		})
	}

	return result, nil
}
