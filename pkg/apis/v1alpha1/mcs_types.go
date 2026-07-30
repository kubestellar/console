// Package v1alpha1 contains API type definitions for KubeStellar Console CRDs
package v1alpha1

import (
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

// MCS API Group Version Resources
var (
	// ServiceExportGVR is the GroupVersionResource for MCS ServiceExport
	ServiceExportGVR = schema.GroupVersionResource{
		Group:    "multicluster.x-k8s.io",
		Version:  "v1alpha1",
		Resource: "serviceexports",
	}

	// ServiceImportGVR is the GroupVersionResource for MCS ServiceImport
	ServiceImportGVR = schema.GroupVersionResource{
		Group:    "multicluster.x-k8s.io",
		Version:  "v1alpha1",
		Resource: "serviceimports",
	}
)

// ServiceExportStatus represents the status of a ServiceExport
type ServiceExportStatus string

const (
	ServiceExportStatusReady    ServiceExportStatus = "Ready"
	ServiceExportStatusPending  ServiceExportStatus = "Pending"
	ServiceExportStatusFailed   ServiceExportStatus = "Failed"
	ServiceExportStatusUnknown  ServiceExportStatus = "Unknown"
)

// ServiceExport represents a service exported for multi-cluster discovery
type ServiceExport struct {
	Name           string              `json:"name"`
	Namespace      string              `json:"namespace"`
	Cluster        string              `json:"cluster"`
	ServiceName    string              `json:"serviceName,omitempty"`
	Status         ServiceExportStatus `json:"status"`
	Message        string              `json:"message,omitempty"`
	TargetClusters []string            `json:"targetClusters,omitempty"`
	CreatedAt      time.Time           `json:"createdAt"`
	Conditions     []Condition         `json:"conditions,omitempty"`
}

// ServiceImportType represents the type of ServiceImport
type ServiceImportType string

const (
	ServiceImportTypeClusterSetIP ServiceImportType = "ClusterSetIP"
	ServiceImportTypeHeadless     ServiceImportType = "Headless"
)

// ServiceImport represents an imported service from another cluster
type ServiceImport struct {
	Name          string            `json:"name"`
	Namespace     string            `json:"namespace"`
	Cluster       string            `json:"cluster"`
	SourceCluster string            `json:"sourceCluster,omitempty"`
	Type          ServiceImportType `json:"type"`
	DNSName       string            `json:"dnsName,omitempty"`
	ClusterSetIPs []string          `json:"clusterSetIPs,omitempty"`
	Ports         []ServicePort     `json:"ports,omitempty"`
	Endpoints     int               `json:"endpoints"`
	CreatedAt     time.Time         `json:"createdAt"`
	Conditions    []Condition       `json:"conditions,omitempty"`
}

// ServicePort represents a port exposed by a service
type ServicePort struct {
	Name        string `json:"name,omitempty"`
	Protocol    string `json:"protocol"`
	Port        int32  `json:"port"`
	AppProtocol string `json:"appProtocol,omitempty"`
}

// Condition represents a status condition
type Condition struct {
	Type               string    `json:"type"`
	Status             string    `json:"status"`
	Reason             string    `json:"reason,omitempty"`
	Message            string    `json:"message,omitempty"`
	LastTransitionTime time.Time `json:"lastTransitionTime,omitempty"`
}

// MCSClusterError records a per-cluster failure during a multi-cluster
// ServiceExport/ServiceImport aggregation. Mirrors the handler-level
// ClusterError type used for the /api/service-exports endpoint (#6483),
// and is reported in-band so callers can distinguish "no exports" from
// "cluster could not be queried" (#6547).
type MCSClusterError struct {
	Cluster   string `json:"cluster"`
	ErrorType string `json:"errorType,omitempty"`
	Message   string `json:"message"`
}

// ServiceExportList is a list of ServiceExports
type ServiceExportList struct {
	Items         []ServiceExport   `json:"items"`
	TotalCount    int               `json:"totalCount"`
	ClusterErrors []MCSClusterError `json:"clusterErrors,omitempty"`
}

// ServiceImportList is a list of ServiceImports
type ServiceImportList struct {
	Items         []ServiceImport   `json:"items"`
	TotalCount    int               `json:"totalCount"`
	ClusterErrors []MCSClusterError `json:"clusterErrors,omitempty"`
}

// ClusterServiceSummary provides a per-cluster summary of MCS resources
type ClusterServiceSummary struct {
	Cluster      string `json:"cluster"`
	ExportCount  int    `json:"exportCount"`
	ImportCount  int    `json:"importCount"`
	HealthyCount int    `json:"healthyCount"`
	FailedCount  int    `json:"failedCount"`
}
