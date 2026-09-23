package handlers

import (
	"regexp"
	"strings"

	"github.com/kubestellar/console/pkg/api/handlers/internal/httputil"
)

// cronFieldCount is the number of fields in a standard cron expression.
const cronFieldCount = 5

// cronFieldPattern matches a single cron field (digits, *, /, -, comma).
var cronFieldPattern = regexp.MustCompile(`^[\d\*,/\-]+$`)

// k8sNamePattern aliases httputil.K8sNamePattern (moved in epic #23685).
var k8sNamePattern = httputil.K8sNamePattern

// k8sVersionPattern matches Kubernetes API versions (e.g. "v1", "v1beta1", "v2alpha1").
var k8sVersionPattern = regexp.MustCompile(`^v[0-9]+([a-z]+[0-9]+)?$`)

// maxCronFieldLen is the maximum length of a single cron field to prevent abuse.
const maxCronFieldLen = 64

// isValidCronSchedule validates a 5-field cron expression.
// It does not validate semantic correctness (e.g. day 32), only structural format.
func isValidCronSchedule(schedule string) bool {
	fields := strings.Fields(schedule)
	if len(fields) != cronFieldCount {
		return false
	}
	for _, f := range fields {
		if len(f) > maxCronFieldLen {
			return false
		}
		if !cronFieldPattern.MatchString(f) {
			return false
		}
	}
	return true
}

// MaxK8sNameLen is the maximum length for a Kubernetes resource name (DNS-1123 subdomain).
const MaxK8sNameLen = httputil.MaxK8sNameLen

// IsValidK8sName delegates to httputil.IsValidK8sName (moved in epic #23685).
func IsValidK8sName(name string) bool {
	return httputil.IsValidK8sName(name)
}

// isValidK8sVersion validates a Kubernetes API version string.
func IsValidK8sVersion(version string) bool {
	if len(version) > MaxK8sNameLen {
		return false
	}
	return k8sVersionPattern.MatchString(version)
}

// validateK8sName delegates to httputil.ValidateK8sName (moved in epic #23685).
func validateK8sName(param, value string) error {
	return httputil.ValidateK8sName(param, value)
}

// validateClusterAndNamespace delegates to httputil.ValidateClusterAndNamespace.
func validateClusterAndNamespace(cluster, namespace string) error {
	return httputil.ValidateClusterAndNamespace(cluster, namespace)
}
