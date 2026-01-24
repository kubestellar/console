// Package v1alpha1 contains API type definitions for KubeStellar Console CRDs
package v1alpha1

import (
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

// KubeStellar Control Cluster GVRs
var (
	// BindingPolicyGVR for KubeStellar BindingPolicy (also defined in workload_types.go)
	// Note: Already defined, this is for reference
	// BindingPolicyGVR = schema.GroupVersionResource{...}

	// ClusterRegistrationGVR for KubeStellar ClusterInventory/Registration
	ClusterRegistrationGVR = schema.GroupVersionResource{
		Group:    "control.kubestellar.io",
		Version:  "v1alpha1",
		Resource: "clusterregistrations",
	}

	// SyncerConfigGVR for KubeStellar Syncer configuration
	SyncerConfigGVR = schema.GroupVersionResource{
		Group:    "edge.kubestellar.io",
		Version:  "v1alpha1",
		Resource: "syncerconfigs",
	}

	// PlacementGVR for KubeStellar Placement decisions
	PlacementGVR = schema.GroupVersionResource{
		Group:    "control.kubestellar.io",
		Version:  "v1alpha1",
		Resource: "placements",
	}
)

// ClusterRegistrationStatus represents the status of a registered cluster
type ClusterRegistrationStatus string

const (
	ClusterRegistrationStatusReady     ClusterRegistrationStatus = "Ready"
	ClusterRegistrationStatusPending   ClusterRegistrationStatus = "Pending"
	ClusterRegistrationStatusSyncing   ClusterRegistrationStatus = "Syncing"
	ClusterRegistrationStatusDegraded  ClusterRegistrationStatus = "Degraded"
	ClusterRegistrationStatusOffline   ClusterRegistrationStatus = "Offline"
	ClusterRegistrationStatusUnknown   ClusterRegistrationStatus = "Unknown"
)

// ClusterType identifies the type of cluster in KubeStellar topology
type ClusterType string

const (
	ClusterTypeControl   ClusterType = "Control"    // KubeStellar control plane
	ClusterTypeWorkload  ClusterType = "Workload"   // Workload Execution Cluster (WEC)
	ClusterTypeInventory ClusterType = "Inventory"  // Inventory and Transport Space (ITS)
	ClusterTypeUnknown   ClusterType = "Unknown"
)

// ClusterRegistration represents a cluster registered with KubeStellar
type ClusterRegistration struct {
	Name             string                    `json:"name"`
	ClusterType      ClusterType               `json:"clusterType"`
	Status           ClusterRegistrationStatus `json:"status"`
	KubernetesVersion string                   `json:"kubernetesVersion,omitempty"`
	Platform         string                    `json:"platform,omitempty"` // e.g., EKS, GKE, OpenShift
	Region           string                    `json:"region,omitempty"`
	Labels           map[string]string         `json:"labels,omitempty"`
	Annotations      map[string]string         `json:"annotations,omitempty"`
	SyncerStatus     *SyncerStatus             `json:"syncerStatus,omitempty"`
	LastHeartbeat    time.Time                 `json:"lastHeartbeat,omitempty"`
	RegisteredAt     time.Time                 `json:"registeredAt"`
}

// SyncerStatus represents the status of the KubeStellar syncer on a workload cluster
type SyncerStatus struct {
	Running        bool      `json:"running"`
	Version        string    `json:"version,omitempty"`
	LastSyncTime   time.Time `json:"lastSyncTime,omitempty"`
	SyncedObjects  int       `json:"syncedObjects"`
	PendingObjects int       `json:"pendingObjects"`
	ErrorCount     int       `json:"errorCount"`
	LastError      string    `json:"lastError,omitempty"`
}

// ClusterRegistrationList is a list of registered clusters
type ClusterRegistrationList struct {
	Items      []ClusterRegistration `json:"items"`
	TotalCount int                   `json:"totalCount"`
}

// ControlClusterInfo represents information about the KubeStellar control cluster
type ControlClusterInfo struct {
	Name               string                     `json:"name"`
	IsControlCluster   bool                       `json:"isControlCluster"`
	KubeStellarVersion string                     `json:"kubeStellarVersion,omitempty"`
	ControllerStatus   map[string]ControllerState `json:"controllerStatus,omitempty"`
	ManagedClusters    int                        `json:"managedClusters"`
	TotalBindings      int                        `json:"totalBindings"`
	ActivePlacements   int                        `json:"activePlacements"`
	LastUpdated        time.Time                  `json:"lastUpdated"`
}

// ControllerState represents the state of a KubeStellar controller
type ControllerState struct {
	Ready     bool      `json:"ready"`
	Replicas  int       `json:"replicas,omitempty"`
	Available int       `json:"available,omitempty"`
	Message   string    `json:"message,omitempty"`
	LastSeen  time.Time `json:"lastSeen,omitempty"`
}

// PropagationStatus tracks workload propagation to clusters
type PropagationStatus struct {
	WorkloadName    string                 `json:"workloadName"`
	Namespace       string                 `json:"namespace"`
	SourceCluster   string                 `json:"sourceCluster"`
	TargetClusters  []ClusterPropagation   `json:"targetClusters"`
	BindingPolicy   string                 `json:"bindingPolicy,omitempty"`
	TotalTargets    int                    `json:"totalTargets"`
	SyncedTargets   int                    `json:"syncedTargets"`
	LastUpdated     time.Time              `json:"lastUpdated"`
}

// ClusterPropagation represents propagation status to a single cluster
type ClusterPropagation struct {
	Cluster        string              `json:"cluster"`
	Status         PropagationState    `json:"status"`
	SyncedAt       time.Time           `json:"syncedAt,omitempty"`
	AppliedVersion string              `json:"appliedVersion,omitempty"`
	Message        string              `json:"message,omitempty"`
}

// PropagationState represents the propagation state to a cluster
type PropagationState string

const (
	PropagationStatePending     PropagationState = "Pending"
	PropagationStateSyncing     PropagationState = "Syncing"
	PropagationStateSynced      PropagationState = "Synced"
	PropagationStateFailed      PropagationState = "Failed"
	PropagationStateOutOfSync   PropagationState = "OutOfSync"
)

// PropagationStatusList is a list of propagation statuses
type PropagationStatusList struct {
	Items      []PropagationStatus `json:"items"`
	TotalCount int                 `json:"totalCount"`
}

// Placement represents a KubeStellar placement decision
type Placement struct {
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace,omitempty"`
	ClusterSelector map[string]string `json:"clusterSelector,omitempty"`
	MatchedClusters []string          `json:"matchedClusters,omitempty"`
	Status          string            `json:"status"`
	CreatedAt       time.Time         `json:"createdAt"`
}

// PlacementList is a list of Placements
type PlacementList struct {
	Items      []Placement `json:"items"`
	TotalCount int         `json:"totalCount"`
}
