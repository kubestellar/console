// Cron-expression and Kubernetes API-version validators. Moved here from the
// root handlers package in epic #23685 so domain subpackages can share them.
package httputil

import (
	"regexp"
	"strings"
)

// cronFieldCount is the number of fields in a standard cron expression.
const cronFieldCount = 5

// cronFieldPattern matches a single cron field (digits, *, /, -, comma).
var cronFieldPattern = regexp.MustCompile(`^[\d\*,/\-]+$`)

// K8sVersionPattern matches Kubernetes API versions (e.g. "v1", "v1beta1", "v2alpha1").
var K8sVersionPattern = regexp.MustCompile(`^v[0-9]+([a-z]+[0-9]+)?$`)

// maxCronFieldLen is the maximum length of a single cron field to prevent abuse.
const maxCronFieldLen = 64

// IsValidCronSchedule validates a 5-field cron expression.
// It does not validate semantic correctness (e.g. day 32), only structural format.
func IsValidCronSchedule(schedule string) bool {
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

// IsValidK8sVersion validates a Kubernetes API version string.
func IsValidK8sVersion(version string) bool {
	if len(version) > MaxK8sNameLen {
		return false
	}
	return K8sVersionPattern.MatchString(version)
}
