package handlers

import (
	"regexp"
	"strings"
)

// cronFieldCount is the number of fields in a standard cron expression.
const cronFieldCount = 5

// cronFieldPattern matches a single cron field (digits, *, /, -, comma).
var cronFieldPattern = regexp.MustCompile(`^[\d\*,/\-]+$`)

// k8sNamePattern matches valid Kubernetes DNS subdomain names and plural resource names.
// Allows lowercase alphanumeric, dots, and hyphens (e.g. "apps", "keda.sh", "v1beta1").
var k8sNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.\-]*[a-z0-9]$|^[a-z0-9]$`)

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

// isValidK8sName validates a Kubernetes-style DNS name (group or resource).
// Uses maxK8sNameLen (253) defined in gitops.go.
func isValidK8sName(name string) bool {
	if len(name) > maxK8sNameLen {
		return false
	}
	return k8sNamePattern.MatchString(name)
}

// isValidK8sVersion validates a Kubernetes API version string.
func isValidK8sVersion(version string) bool {
	if len(version) > maxK8sNameLen {
		return false
	}
	return k8sVersionPattern.MatchString(version)
}
