// Package v1alpha1 contains API types for console.kubestellar.io/v1alpha1
package v1alpha1

import (
	"encoding/json"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// API Group and Version
const (
	Group   = "console.kubestellar.io"
	Version = "v1alpha1"
)

// GroupVersion is the schema.GroupVersion for console resources
var GroupVersion = schema.GroupVersion{Group: Group, Version: Version}

// GVRs for console CRDs
var (
	ManagedWorkloadGVR = schema.GroupVersionResource{
		Group:    Group,
		Version:  Version,
		Resource: "managedworkloads",
	}
	ClusterGroupGVR = schema.GroupVersionResource{
		Group:    Group,
		Version:  Version,
		Resource: "clustergroups",
	}
	WorkloadDeploymentGVR = schema.GroupVersionResource{
		Group:    Group,
		Version:  Version,
		Resource: "workloaddeployments",
	}
)

// =============================================================================
// ManagedWorkload
// =============================================================================

// ManagedWorkload represents a workload to be deployed across clusters
type ManagedWorkload struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ManagedWorkloadSpec   `json:"spec,omitempty"`
	Status ManagedWorkloadStatus `json:"status,omitempty"`
}

// ManagedWorkloadSpec defines the desired state of ManagedWorkload
type ManagedWorkloadSpec struct {
	// SourceCluster is the cluster where the workload is defined
	SourceCluster string `json:"sourceCluster"`

	// SourceNamespace is the namespace in the source cluster
	SourceNamespace string `json:"sourceNamespace"`

	// WorkloadRef is the reference to the workload resource
	WorkloadRef WorkloadReference `json:"workloadRef"`

	// TargetClusters is a list of target clusters for deployment
	TargetClusters []string `json:"targetClusters,omitempty"`

	// TargetGroups is a list of ClusterGroup names to target
	TargetGroups []string `json:"targetGroups,omitempty"`

	// Replicas overrides the replica count for deployment
	Replicas *int32 `json:"replicas,omitempty"`

	// Overrides are field overrides to apply when deploying
	Overrides map[string]interface{} `json:"overrides,omitempty"`

	// Suspend suspends the workload deployment
	Suspend bool `json:"suspend,omitempty"`
}

// WorkloadReference identifies a workload resource
type WorkloadReference struct {
	// APIVersion of the workload (e.g., apps/v1)
	APIVersion string `json:"apiVersion,omitempty"`

	// Kind of workload (Deployment, StatefulSet, DaemonSet, etc.)
	Kind string `json:"kind"`

	// Name of the workload resource
	Name string `json:"name"`
}

// ManagedWorkloadStatus defines the observed state of ManagedWorkload
type ManagedWorkloadStatus struct {
	// Phase is the current phase of the managed workload
	Phase string `json:"phase,omitempty"`

	// ObservedGeneration is the generation observed by the controller
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`

	// LastSyncTime is the last time the workload was synced
	LastSyncTime *metav1.Time `json:"lastSyncTime,omitempty"`

	// DeployedClusters contains status of deployment in each target cluster
	DeployedClusters []ClusterDeploymentStatus `json:"deployedClusters,omitempty"`

	// Conditions are the current conditions of the managed workload
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// ClusterDeploymentStatus contains deployment status for a single cluster
type ClusterDeploymentStatus struct {
	// Cluster is the cluster name
	Cluster string `json:"cluster"`

	// Status is the deployment status (Pending, Running, Degraded, Failed)
	Status string `json:"status,omitempty"`

	// Replicas shows ready/desired replicas (e.g., "3/3")
	Replicas string `json:"replicas,omitempty"`

	// Message contains status message or error details
	Message string `json:"message,omitempty"`

	// LastUpdateTime is when this status was last updated
	LastUpdateTime *metav1.Time `json:"lastUpdateTime,omitempty"`
}

// =============================================================================
// ClusterGroup
// =============================================================================

// ClusterGroup represents a logical grouping of clusters for deployment targeting
type ClusterGroup struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ClusterGroupSpec   `json:"spec,omitempty"`
	Status ClusterGroupStatus `json:"status,omitempty"`
}

// ClusterGroupSpec defines the desired state of ClusterGroup
type ClusterGroupSpec struct {
	// Description is a human-readable description of this cluster group
	Description string `json:"description,omitempty"`

	// Color is the color for UI display (hex format, e.g., "#22c55e")
	Color string `json:"color,omitempty"`

	// Icon is the icon name for UI display
	Icon string `json:"icon,omitempty"`

	// StaticMembers is an explicit list of cluster names in this group
	StaticMembers []string `json:"staticMembers,omitempty"`

	// DynamicFilters are filters for dynamic cluster membership
	DynamicFilters []ClusterFilter `json:"dynamicFilters,omitempty"`

	// Priority for deployment ordering (higher = first)
	Priority int `json:"priority,omitempty"`
}

// ClusterFilter defines a filter condition for cluster membership
type ClusterFilter struct {
	// Field is the cluster field to filter on
	Field string `json:"field"`

	// Operator is the comparison operator
	Operator string `json:"operator"`

	// Value is the value to compare against
	Value string `json:"value"`

	// LabelKey is the label key when field is 'label'
	LabelKey string `json:"labelKey,omitempty"`
}

// ClusterGroupStatus defines the observed state of ClusterGroup
type ClusterGroupStatus struct {
	// MatchedClusters is the list of clusters currently matching this group
	MatchedClusters []string `json:"matchedClusters,omitempty"`

	// MatchedClusterCount is the number of matched clusters
	MatchedClusterCount int `json:"matchedClusterCount,omitempty"`

	// LastEvaluated is when the group membership was last evaluated
	LastEvaluated *metav1.Time `json:"lastEvaluated,omitempty"`

	// ObservedGeneration is the generation observed by the controller
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`

	// Conditions are the current conditions of the cluster group
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// =============================================================================
// WorkloadDeployment
// =============================================================================

// WorkloadDeployment represents an active deployment action
type WorkloadDeployment struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   WorkloadDeploymentSpec   `json:"spec,omitempty"`
	Status WorkloadDeploymentStatus `json:"status,omitempty"`
}

// WorkloadDeploymentSpec defines the desired state of WorkloadDeployment
type WorkloadDeploymentSpec struct {
	// WorkloadRef is a reference to the ManagedWorkload to deploy
	WorkloadRef ResourceReference `json:"workloadRef"`

	// TargetGroupRef is a reference to the ClusterGroup to deploy to
	TargetGroupRef *ResourceReference `json:"targetGroupRef,omitempty"`

	// TargetClusters is an explicit list of target clusters
	TargetClusters []string `json:"targetClusters,omitempty"`

	// Strategy is the deployment strategy (RollingUpdate, Recreate, BlueGreen, Canary)
	Strategy string `json:"strategy,omitempty"`

	// RolloutConfig is the configuration for rolling deployment
	RolloutConfig *RolloutConfig `json:"rolloutConfig,omitempty"`

	// CanaryConfig is the configuration for canary deployment
	CanaryConfig *CanaryConfig `json:"canaryConfig,omitempty"`

	// DryRun previews changes without applying
	DryRun bool `json:"dryRun,omitempty"`

	// AutoPromote automatically promotes after successful health checks
	AutoPromote bool `json:"autoPromote,omitempty"`

	// Suspend suspends the deployment
	Suspend bool `json:"suspend,omitempty"`
}

// ResourceReference identifies a resource
type ResourceReference struct {
	// Name of the resource
	Name string `json:"name"`

	// Namespace of the resource (defaults to same namespace)
	Namespace string `json:"namespace,omitempty"`
}

// RolloutConfig defines rolling deployment configuration
type RolloutConfig struct {
	// MaxUnavailable is the maximum unavailable clusters during rollout
	MaxUnavailable *int32 `json:"maxUnavailable,omitempty"`

	// MaxSurge is the maximum extra clusters during rollout
	MaxSurge *int32 `json:"maxSurge,omitempty"`

	// PauseBetweenClusters is the duration to pause between cluster deployments
	PauseBetweenClusters string `json:"pauseBetweenClusters,omitempty"`

	// HealthCheckTimeout is the timeout for health checks
	HealthCheckTimeout string `json:"healthCheckTimeout,omitempty"`
}

// CanaryConfig defines canary deployment configuration
type CanaryConfig struct {
	// InitialWeight is the initial traffic weight for canary (0-100)
	InitialWeight int `json:"initialWeight,omitempty"`

	// StepWeight is the traffic weight increment per step
	StepWeight int `json:"stepWeight,omitempty"`

	// StepInterval is the duration between steps
	StepInterval string `json:"stepInterval,omitempty"`

	// MaxWeight is the maximum weight before full promotion
	MaxWeight int `json:"maxWeight,omitempty"`
}

// WorkloadDeploymentStatus defines the observed state of WorkloadDeployment
type WorkloadDeploymentStatus struct {
	// Phase is the current phase of the deployment
	Phase string `json:"phase,omitempty"`

	// Progress is the overall progress (e.g., "3/5 clusters")
	Progress string `json:"progress,omitempty"`

	// ObservedGeneration is the generation observed by the controller
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`

	// StartedAt is when deployment started
	StartedAt *metav1.Time `json:"startedAt,omitempty"`

	// CompletedAt is when deployment completed
	CompletedAt *metav1.Time `json:"completedAt,omitempty"`

	// ClusterStatuses contains status of deployment in each target cluster
	ClusterStatuses []ClusterRolloutStatus `json:"clusterStatuses,omitempty"`

	// CanaryStatus is the status of canary deployment
	CanaryStatus *CanaryStatus `json:"canaryStatus,omitempty"`

	// Conditions are the current conditions of the deployment
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// History is the history of deployment attempts
	History []DeploymentHistoryEntry `json:"history,omitempty"`
}

// ClusterRolloutStatus contains rollout status for a single cluster
type ClusterRolloutStatus struct {
	// Cluster is the cluster name
	Cluster string `json:"cluster"`

	// Phase is the rollout phase (Pending, InProgress, Complete, Failed, Skipped)
	Phase string `json:"phase,omitempty"`

	// Progress is the progress percentage (e.g., "67%")
	Progress string `json:"progress,omitempty"`

	// StartedAt is when this cluster rollout started
	StartedAt *metav1.Time `json:"startedAt,omitempty"`

	// CompletedAt is when this cluster rollout completed
	CompletedAt *metav1.Time `json:"completedAt,omitempty"`

	// Message contains status message or error details
	Message string `json:"message,omitempty"`

	// RollbackAvailable indicates if rollback is available
	RollbackAvailable bool `json:"rollbackAvailable,omitempty"`
}

// CanaryStatus contains canary deployment status
type CanaryStatus struct {
	// CurrentWeight is the current traffic weight
	CurrentWeight int `json:"currentWeight,omitempty"`

	// CurrentStep is the current step number
	CurrentStep int `json:"currentStep,omitempty"`

	// TotalSteps is the total number of steps
	TotalSteps int `json:"totalSteps,omitempty"`

	// LastStepTime is when the last step was executed
	LastStepTime *metav1.Time `json:"lastStepTime,omitempty"`

	// Metrics are collected metrics for canary analysis
	Metrics map[string]interface{} `json:"metrics,omitempty"`
}

// DeploymentHistoryEntry contains a single history entry
type DeploymentHistoryEntry struct {
	// Revision is the revision number
	Revision int `json:"revision,omitempty"`

	// StartedAt is when this attempt started
	StartedAt *metav1.Time `json:"startedAt,omitempty"`

	// CompletedAt is when this attempt completed
	CompletedAt *metav1.Time `json:"completedAt,omitempty"`

	// Phase is the final phase of this attempt
	Phase string `json:"phase,omitempty"`

	// Message contains additional information
	Message string `json:"message,omitempty"`
}

// =============================================================================
// Conversion helpers
// =============================================================================

// ToUnstructured converts a ManagedWorkload to unstructured.Unstructured
func (mw *ManagedWorkload) ToUnstructured() (*unstructured.Unstructured, error) {
	data, err := json.Marshal(mw)
	if err != nil {
		return nil, err
	}

	u := &unstructured.Unstructured{}
	if err := json.Unmarshal(data, u); err != nil {
		return nil, err
	}

	u.SetAPIVersion(GroupVersion.String())
	u.SetKind("ManagedWorkload")
	return u, nil
}

// ManagedWorkloadFromUnstructured converts unstructured.Unstructured to ManagedWorkload
func ManagedWorkloadFromUnstructured(u *unstructured.Unstructured) (*ManagedWorkload, error) {
	data, err := json.Marshal(u.Object)
	if err != nil {
		return nil, err
	}

	mw := &ManagedWorkload{}
	if err := json.Unmarshal(data, mw); err != nil {
		return nil, err
	}
	return mw, nil
}

// ToUnstructured converts a ClusterGroup to unstructured.Unstructured
func (cg *ClusterGroup) ToUnstructured() (*unstructured.Unstructured, error) {
	data, err := json.Marshal(cg)
	if err != nil {
		return nil, err
	}

	u := &unstructured.Unstructured{}
	if err := json.Unmarshal(data, u); err != nil {
		return nil, err
	}

	u.SetAPIVersion(GroupVersion.String())
	u.SetKind("ClusterGroup")
	return u, nil
}

// ClusterGroupFromUnstructured converts unstructured.Unstructured to ClusterGroup
func ClusterGroupFromUnstructured(u *unstructured.Unstructured) (*ClusterGroup, error) {
	data, err := json.Marshal(u.Object)
	if err != nil {
		return nil, err
	}

	cg := &ClusterGroup{}
	if err := json.Unmarshal(data, cg); err != nil {
		return nil, err
	}
	return cg, nil
}

// ToUnstructured converts a WorkloadDeployment to unstructured.Unstructured
func (wd *WorkloadDeployment) ToUnstructured() (*unstructured.Unstructured, error) {
	data, err := json.Marshal(wd)
	if err != nil {
		return nil, err
	}

	u := &unstructured.Unstructured{}
	if err := json.Unmarshal(data, u); err != nil {
		return nil, err
	}

	u.SetAPIVersion(GroupVersion.String())
	u.SetKind("WorkloadDeployment")
	return u, nil
}

// WorkloadDeploymentFromUnstructured converts unstructured.Unstructured to WorkloadDeployment
func WorkloadDeploymentFromUnstructured(u *unstructured.Unstructured) (*WorkloadDeployment, error) {
	data, err := json.Marshal(u.Object)
	if err != nil {
		return nil, err
	}

	wd := &WorkloadDeployment{}
	if err := json.Unmarshal(data, wd); err != nil {
		return nil, err
	}
	return wd, nil
}
