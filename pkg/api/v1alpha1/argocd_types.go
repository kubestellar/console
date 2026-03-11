// Package v1alpha1 contains API type definitions for KubeStellar Console CRDs
package v1alpha1

import (
	"fmt"
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

// ArgoCD Application CRD Group Version Resources
var (
	// ArgoApplicationGVR is the GroupVersionResource for ArgoCD Application (v1alpha1)
	ArgoApplicationGVR = schema.GroupVersionResource{
		Group:    "argoproj.io",
		Version:  "v1alpha1",
		Resource: "applications",
	}
)

// ArgoApplication represents an ArgoCD Application resource
type ArgoApplication struct {
	Name         string                `json:"name"`
	Namespace    string                `json:"namespace"`
	Cluster      string                `json:"cluster"`
	SyncStatus   string                `json:"syncStatus"`   // Synced, OutOfSync, Unknown
	HealthStatus string                `json:"healthStatus"` // Healthy, Degraded, Progressing, Missing, Unknown
	Source       ArgoApplicationSource `json:"source"`
	LastSynced   string                `json:"lastSynced,omitempty"`
}

// ArgoApplicationSource represents the source of an ArgoCD Application
type ArgoApplicationSource struct {
	RepoURL        string `json:"repoURL"`
	Path           string `json:"path"`
	TargetRevision string `json:"targetRevision"`
}

// ArgoApplicationList is a list of ArgoCD Applications
type ArgoApplicationList struct {
	Items      []ArgoApplication `json:"items"`
	TotalCount int               `json:"totalCount"`
}

// ArgoHealthSummary aggregates health status counts across applications
type ArgoHealthSummary struct {
	Healthy     int `json:"healthy"`
	Degraded    int `json:"degraded"`
	Progressing int `json:"progressing"`
	Missing     int `json:"missing"`
	Unknown     int `json:"unknown"`
}

// ArgoSyncSummary aggregates sync status counts across applications
type ArgoSyncSummary struct {
	Synced    int `json:"synced"`
	OutOfSync int `json:"outOfSync"`
	Unknown   int `json:"unknown"`
}

// ArgoSyncRequest is the request body for triggering an ArgoCD sync
type ArgoSyncRequest struct {
	AppName   string `json:"appName"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
}

// TimeSinceArgo returns a human-readable duration since the given time
func TimeSinceArgo(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	d := time.Since(t)
	const hoursPerDay = 24
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		mins := int(d.Minutes())
		if mins == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", mins)
	case d < hoursPerDay*time.Hour:
		hours := int(d.Hours())
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	default:
		days := int(d.Hours() / hoursPerDay)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	}
}
