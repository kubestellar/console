package handlers

import (
	"github.com/kubestellar/console/pkg/api/handlers/internal/httputil"
)

// MaxK8sNameLen is the maximum length for a Kubernetes resource name (DNS-1123 subdomain).
const MaxK8sNameLen = httputil.MaxK8sNameLen

// IsValidK8sName delegates to httputil.IsValidK8sName (moved in epic #23685).
func IsValidK8sName(name string) bool {
	return httputil.IsValidK8sName(name)
}

// IsValidK8sVersion delegates to httputil.IsValidK8sVersion (moved in epic #23685).
func IsValidK8sVersion(version string) bool {
	return httputil.IsValidK8sVersion(version)
}
