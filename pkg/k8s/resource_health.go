package k8s

import (
	"context"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
)

// ResourceHealthStatus represents the health of a Kubernetes resource
type ResourceHealthStatus string

const (
	HealthStatusHealthy   ResourceHealthStatus = "healthy"
	HealthStatusDegraded  ResourceHealthStatus = "degraded"
	HealthStatusUnhealthy ResourceHealthStatus = "unhealthy"
	HealthStatusUnknown   ResourceHealthStatus = "unknown"
	HealthStatusMissing   ResourceHealthStatus = "missing"
)

// ResourceCategory classifies resources for grouping in the UI
type ResourceCategory string

const (
	CategoryWorkload  ResourceCategory = "workload"
	CategoryRBAC      ResourceCategory = "rbac"
	CategoryConfig    ResourceCategory = "config"
	CategoryNetworking ResourceCategory = "networking"
	CategoryScaling   ResourceCategory = "scaling"
	CategoryStorage   ResourceCategory = "storage"
	CategoryCRD       ResourceCategory = "crd"
	CategoryAdmission ResourceCategory = "admission"
	CategoryOther     ResourceCategory = "other"
)

// MonitoredResource is a dependency with health status information
type MonitoredResource struct {
	ID          string               `json:"id"`
	Kind        string               `json:"kind"`
	Name        string               `json:"name"`
	Namespace   string               `json:"namespace"`
	Cluster     string               `json:"cluster"`
	Status      ResourceHealthStatus `json:"status"`
	Category    ResourceCategory     `json:"category"`
	Message     string               `json:"message,omitempty"`
	LastChecked string               `json:"lastChecked"`
	Optional    bool                 `json:"optional"`
	Order       int                  `json:"order"`
}

// MonitorIssue represents a detected problem with a resource
type MonitorIssue struct {
	ID          string            `json:"id"`
	Resource    MonitoredResource `json:"resource"`
	Severity    string            `json:"severity"` // "critical", "warning", "info"
	Title       string            `json:"title"`
	Description string            `json:"description"`
	DetectedAt  string            `json:"detectedAt"`
}

// WorkloadMonitorResult is the full response for the monitor endpoint
type WorkloadMonitorResult struct {
	Workload  string              `json:"workload"`
	Kind      string              `json:"kind"`
	Namespace string              `json:"namespace"`
	Cluster   string              `json:"cluster"`
	Status    ResourceHealthStatus `json:"status"`
	Resources []MonitoredResource `json:"resources"`
	Issues    []MonitorIssue      `json:"issues"`
	Warnings  []string            `json:"warnings"`
}

// kindToCategory maps a dependency kind to its category
func kindToCategory(kind DependencyKind) ResourceCategory {
	switch kind {
	case DepServiceAccount, DepRole, DepRoleBinding, DepClusterRole, DepClusterRoleBinding:
		return CategoryRBAC
	case DepConfigMap, DepSecret:
		return CategoryConfig
	case DepService, DepIngress, DepNetworkPolicy:
		return CategoryNetworking
	case DepHPA, DepPDB:
		return CategoryScaling
	case DepPVC:
		return CategoryStorage
	case DepCRD:
		return CategoryCRD
	case DepValidatingWebhook, DepMutatingWebhook:
		return CategoryAdmission
	default:
		return CategoryOther
	}
}

// CheckResourceHealth determines the health status of a fetched resource
func CheckResourceHealth(kind string, obj *unstructured.Unstructured) (ResourceHealthStatus, string) {
	if obj == nil {
		return HealthStatusMissing, "Resource not found"
	}

	switch kind {
	case "Deployment":
		return checkDeploymentHealth(obj)
	case "StatefulSet":
		return checkStatefulSetHealth(obj)
	case "DaemonSet":
		return checkDaemonSetHealth(obj)
	case "Service":
		return checkServiceHealth(obj)
	case "PersistentVolumeClaim":
		return checkPVCHealth(obj)
	case "HorizontalPodAutoscaler":
		return checkHPAHealth(obj)
	default:
		// For existence-only resources (ConfigMap, Secret, RBAC, etc.),
		// existence = healthy
		return HealthStatusHealthy, ""
	}
}

func checkDeploymentHealth(obj *unstructured.Unstructured) (ResourceHealthStatus, string) {
	replicas, _, _ := unstructured.NestedInt64(obj.Object, "spec", "replicas")
	readyReplicas, _, _ := unstructured.NestedInt64(obj.Object, "status", "readyReplicas")
	availableReplicas, _, _ := unstructured.NestedInt64(obj.Object, "status", "availableReplicas")

	if replicas == 0 {
		return HealthStatusHealthy, "Scaled to 0"
	}
	if readyReplicas == replicas && availableReplicas == replicas {
		return HealthStatusHealthy, fmt.Sprintf("%d/%d ready", readyReplicas, replicas)
	}
	if readyReplicas > 0 {
		return HealthStatusDegraded, fmt.Sprintf("%d/%d ready", readyReplicas, replicas)
	}
	return HealthStatusUnhealthy, fmt.Sprintf("0/%d ready", replicas)
}

func checkStatefulSetHealth(obj *unstructured.Unstructured) (ResourceHealthStatus, string) {
	replicas, _, _ := unstructured.NestedInt64(obj.Object, "spec", "replicas")
	readyReplicas, _, _ := unstructured.NestedInt64(obj.Object, "status", "readyReplicas")

	if replicas == 0 {
		return HealthStatusHealthy, "Scaled to 0"
	}
	if readyReplicas == replicas {
		return HealthStatusHealthy, fmt.Sprintf("%d/%d ready", readyReplicas, replicas)
	}
	if readyReplicas > 0 {
		return HealthStatusDegraded, fmt.Sprintf("%d/%d ready", readyReplicas, replicas)
	}
	return HealthStatusUnhealthy, fmt.Sprintf("0/%d ready", replicas)
}

func checkDaemonSetHealth(obj *unstructured.Unstructured) (ResourceHealthStatus, string) {
	desired, _, _ := unstructured.NestedInt64(obj.Object, "status", "desiredNumberScheduled")
	ready, _, _ := unstructured.NestedInt64(obj.Object, "status", "numberReady")

	if desired == 0 {
		return HealthStatusHealthy, "No nodes scheduled"
	}
	if ready == desired {
		return HealthStatusHealthy, fmt.Sprintf("%d/%d ready", ready, desired)
	}
	if ready > 0 {
		return HealthStatusDegraded, fmt.Sprintf("%d/%d ready", ready, desired)
	}
	return HealthStatusUnhealthy, fmt.Sprintf("0/%d ready", desired)
}

func checkServiceHealth(obj *unstructured.Unstructured) (ResourceHealthStatus, string) {
	svcType, _, _ := unstructured.NestedString(obj.Object, "spec", "type")

	// ExternalName and headless services are always healthy if they exist
	if svcType == "ExternalName" {
		return HealthStatusHealthy, "ExternalName service"
	}

	clusterIP, _, _ := unstructured.NestedString(obj.Object, "spec", "clusterIP")
	if clusterIP == "None" {
		return HealthStatusHealthy, "Headless service"
	}

	// LoadBalancer: check for external IP
	if svcType == "LoadBalancer" {
		ingress, found, _ := unstructured.NestedSlice(obj.Object, "status", "loadBalancer", "ingress")
		if !found || len(ingress) == 0 {
			return HealthStatusDegraded, "No external IP assigned"
		}
		return HealthStatusHealthy, "External IP assigned"
	}

	// ClusterIP/NodePort: existence = healthy
	return HealthStatusHealthy, ""
}

func checkPVCHealth(obj *unstructured.Unstructured) (ResourceHealthStatus, string) {
	phase, _, _ := unstructured.NestedString(obj.Object, "status", "phase")
	switch phase {
	case "Bound":
		return HealthStatusHealthy, "Bound"
	case "Pending":
		return HealthStatusDegraded, "Pending — waiting for volume"
	case "Lost":
		return HealthStatusUnhealthy, "Lost — underlying volume deleted"
	default:
		return HealthStatusUnknown, fmt.Sprintf("Phase: %s", phase)
	}
}

func checkHPAHealth(obj *unstructured.Unstructured) (ResourceHealthStatus, string) {
	currentReplicas, _, _ := unstructured.NestedInt64(obj.Object, "status", "currentReplicas")
	desiredReplicas, _, _ := unstructured.NestedInt64(obj.Object, "status", "desiredReplicas")

	if currentReplicas == desiredReplicas {
		return HealthStatusHealthy, fmt.Sprintf("%d replicas (target met)", currentReplicas)
	}
	return HealthStatusDegraded, fmt.Sprintf("Scaling: %d current, %d desired", currentReplicas, desiredReplicas)
}

// MonitorWorkload resolves a workload's dependencies, fetches each resource,
// checks its health status, and detects issues.
func (m *MultiClusterClient) MonitorWorkload(
	ctx context.Context,
	cluster, namespace, name string,
) (*WorkloadMonitorResult, error) {
	workloadKind, bundle, err := m.ResolveWorkloadDependencies(ctx, cluster, namespace, name)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result := &WorkloadMonitorResult{
		Workload:  name,
		Kind:      workloadKind,
		Namespace: namespace,
		Cluster:   cluster,
		Status:    HealthStatusHealthy,
		Resources: make([]MonitoredResource, 0, len(bundle.Dependencies)),
		Issues:    make([]MonitorIssue, 0),
		Warnings:  bundle.Warnings,
	}
	if result.Warnings == nil {
		result.Warnings = []string{}
	}

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return nil, fmt.Errorf("failed to get dynamic client for %s: %w", cluster, err)
	}

	// Check health of each dependency
	for _, dep := range bundle.Dependencies {
		mr := MonitoredResource{
			ID:          fmt.Sprintf("%s/%s/%s", dep.Kind, dep.Namespace, dep.Name),
			Kind:        string(dep.Kind),
			Name:        dep.Name,
			Namespace:   dep.Namespace,
			Cluster:     cluster,
			Category:    kindToCategory(dep.Kind),
			Optional:    dep.Optional,
			Order:       dep.Order,
			LastChecked: now,
		}

		// Try to fetch the actual resource and check its health
		obj := fetchResource(ctx, dynClient, dep)
		status, message := CheckResourceHealth(string(dep.Kind), obj)
		mr.Status = status
		mr.Message = message

		result.Resources = append(result.Resources, mr)

		// Generate issues for non-healthy resources
		if status != HealthStatusHealthy && status != HealthStatusUnknown {
			issue := createIssue(mr, now)
			result.Issues = append(result.Issues, issue)
		}
	}

	// Calculate overall status
	result.Status = calculateOverallStatus(result.Resources)

	return result, nil
}

// fetchResource tries to get a resource from the cluster
func fetchResource(ctx context.Context, dynClient dynamic.Interface, dep Dependency) *unstructured.Unstructured {
	var obj *unstructured.Unstructured
	var err error

	if dep.Namespace != "" {
		obj, err = dynClient.Resource(dep.GVR).Namespace(dep.Namespace).Get(ctx, dep.Name, metav1.GetOptions{})
	} else {
		obj, err = dynClient.Resource(dep.GVR).Get(ctx, dep.Name, metav1.GetOptions{})
	}

	if err != nil {
		return nil // Resource not found or error
	}
	return obj
}

// createIssue generates a MonitorIssue from a non-healthy resource
func createIssue(mr MonitoredResource, now string) MonitorIssue {
	severity := "warning"
	title := fmt.Sprintf("%s %s is %s", mr.Kind, mr.Name, mr.Status)

	if mr.Status == HealthStatusUnhealthy || mr.Status == HealthStatusMissing {
		severity = "critical"
	}

	description := mr.Message
	if mr.Status == HealthStatusMissing {
		title = fmt.Sprintf("%s %s is missing", mr.Kind, mr.Name)
		description = "Resource was not found in the cluster"
		if mr.Optional {
			severity = "info"
			description += " (optional dependency)"
		}
	}

	return MonitorIssue{
		ID:          fmt.Sprintf("issue-%s", mr.ID),
		Resource:    mr,
		Severity:    severity,
		Title:       title,
		Description: description,
		DetectedAt:  now,
	}
}

// calculateOverallStatus determines overall health from all resources
func calculateOverallStatus(resources []MonitoredResource) ResourceHealthStatus {
	hasUnhealthy := false
	hasDegraded := false

	for _, r := range resources {
		switch r.Status {
		case HealthStatusUnhealthy, HealthStatusMissing:
			if !r.Optional {
				hasUnhealthy = true
			}
		case HealthStatusDegraded:
			hasDegraded = true
		}
	}

	if hasUnhealthy {
		return HealthStatusUnhealthy
	}
	if hasDegraded {
		return HealthStatusDegraded
	}
	return HealthStatusHealthy
}
