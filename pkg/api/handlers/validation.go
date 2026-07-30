package handlers

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// cronFieldCount is the number of fields in a standard cron expression.
const cronFieldCount = 5

// maxK8sNameLen is the maximum allowed length for Kubernetes resource names (RFC 1123).
// This constant is used by both handlers and gitops packages.
const maxK8sNameLen = 253

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

// MaxK8sNameLen is the maximum length for a Kubernetes resource name (DNS-1123 subdomain).
const MaxK8sNameLen = 253

// isValidK8sName validates a Kubernetes-style DNS name (group or resource).
func IsValidK8sName(name string) bool {
	if len(name) > MaxK8sNameLen {
		return false
	}
	return k8sNamePattern.MatchString(name)
}

// isValidK8sVersion validates a Kubernetes API version string.
func IsValidK8sVersion(version string) bool {
	if len(version) > MaxK8sNameLen {
		return false
	}
	return k8sVersionPattern.MatchString(version)
}

// validateK8sName checks that a non-empty string is a valid Kubernetes resource name.
// Empty values are allowed (they mean "all" in query param context). Returns a
// 400 fiber error with the parameter name in the message when invalid.
func validateK8sName(param, value string) error {
	if value == "" {
		return nil
	}
	if !IsValidK8sName(value) {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("invalid %s: must be a valid Kubernetes resource name (lowercase alphanumeric, '-', '.')", param))
	}
	return nil
}

// validateClusterAndNamespace is a convenience helper that validates both the
// cluster and namespace query parameters in a single call.
func validateClusterAndNamespace(cluster, namespace string) error {
	if err := validateK8sName("cluster", cluster); err != nil {
		return err
	}
	return validateK8sName("namespace", namespace)
}
