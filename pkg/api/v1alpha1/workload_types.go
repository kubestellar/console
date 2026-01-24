// Package v1alpha1 contains API type definitions for KubeStellar Console CRDs
package v1alpha1

import (
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Workload API Group Version Resources
var (
	// WorkloadGVR is the GroupVersionResource for KubeStellar Workload
	WorkloadGVR = schema.GroupVersionResource{
		Group:    "kubestellar.io",
		Version:  "v1alpha1",
		Resource: "workloads",
	}

	// BindingPolicyGVR is the GroupVersionResource for KubeStellar BindingPolicy
	BindingPolicyGVR = schema.GroupVersionResource{
		Group:    "control.kubestellar.io",
		Version:  "v1alpha1",
		Resource: "bindingpolicies",
	}
)

// WorkloadStatus represents the status of a Workload
type WorkloadStatus string

const (
	WorkloadStatusPending    WorkloadStatus = "Pending"
	WorkloadStatusDeploying  WorkloadStatus = "Deploying"
	WorkloadStatusRunning    WorkloadStatus = "Running"
	WorkloadStatusDegraded   WorkloadStatus = "Degraded"
	WorkloadStatusFailed     WorkloadStatus = "Failed"
	WorkloadStatusUnknown    WorkloadStatus = "Unknown"
)

// WorkloadType represents the type of workload
type WorkloadType string

const (
	WorkloadTypeDeployment  WorkloadType = "Deployment"
	WorkloadTypeStatefulSet WorkloadType = "StatefulSet"
	WorkloadTypeDaemonSet   WorkloadType = "DaemonSet"
	WorkloadTypeJob         WorkloadType = "Job"
	WorkloadTypeCronJob     WorkloadType = "CronJob"
	WorkloadTypeCustom      WorkloadType = "Custom"
)

// Workload represents a workload that can be deployed across clusters
type Workload struct {
	Name           string            `json:"name"`
	Namespace      string            `json:"namespace"`
	Type           WorkloadType      `json:"type"`
	Status         WorkloadStatus    `json:"status"`
	Replicas       int32             `json:"replicas,omitempty"`
	ReadyReplicas  int32             `json:"readyReplicas,omitempty"`
	Image          string            `json:"image,omitempty"`
	Labels         map[string]string `json:"labels,omitempty"`
	TargetClusters []string          `json:"targetClusters,omitempty"`
	Deployments    []ClusterDeployment `json:"deployments,omitempty"`
	CreatedAt      time.Time         `json:"createdAt"`
	UpdatedAt      time.Time         `json:"updatedAt,omitempty"`
}

// ClusterDeployment represents the deployment status of a workload in a specific cluster
type ClusterDeployment struct {
	Cluster       string         `json:"cluster"`
	Status        WorkloadStatus `json:"status"`
	Replicas      int32          `json:"replicas"`
	ReadyReplicas int32          `json:"readyReplicas"`
	Message       string         `json:"message,omitempty"`
	LastUpdated   time.Time      `json:"lastUpdated"`
}

// WorkloadList is a list of Workloads
type WorkloadList struct {
	Items      []Workload `json:"items"`
	TotalCount int        `json:"totalCount"`
}

// DeployRequest represents a request to deploy a workload to clusters
type DeployRequest struct {
	WorkloadName   string   `json:"workloadName"`
	Namespace      string   `json:"namespace"`
	TargetClusters []string `json:"targetClusters"`
	Replicas       int32    `json:"replicas,omitempty"`
}

// DeployResponse represents the response from a deploy request
type DeployResponse struct {
	Success        bool     `json:"success"`
	Message        string   `json:"message"`
	DeployedTo     []string `json:"deployedTo,omitempty"`
	FailedClusters []string `json:"failedClusters,omitempty"`
}

// BindingPolicy represents a KubeStellar BindingPolicy for workload placement
type BindingPolicy struct {
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace,omitempty"`
	ClusterSelector map[string]string `json:"clusterSelector,omitempty"`
	WorkloadRef     WorkloadRef       `json:"workloadRef,omitempty"`
	Status          string            `json:"status"`
	BoundClusters   []string          `json:"boundClusters,omitempty"`
	CreatedAt       time.Time         `json:"createdAt"`
}

// WorkloadRef references a workload for binding
type WorkloadRef struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

// BindingPolicyList is a list of BindingPolicies
type BindingPolicyList struct {
	Items      []BindingPolicy `json:"items"`
	TotalCount int             `json:"totalCount"`
}

// ClusterCapability describes what a cluster can run
type ClusterCapability struct {
	Cluster     string            `json:"cluster"`
	Labels      map[string]string `json:"labels,omitempty"`
	GPUCount    int               `json:"gpuCount"`
	GPUType     string            `json:"gpuType,omitempty"`
	CPUCapacity string            `json:"cpuCapacity"`
	MemCapacity string            `json:"memCapacity"`
	NodeCount   int               `json:"nodeCount"`
	Available   bool              `json:"available"`
}

// ClusterCapabilityList is a list of ClusterCapabilities
type ClusterCapabilityList struct {
	Items      []ClusterCapability `json:"items"`
	TotalCount int                 `json:"totalCount"`
}
