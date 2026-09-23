package httputil

import (
	"fmt"
	"regexp"

	"github.com/gofiber/fiber/v2"
)

// K8sNamePattern matches valid Kubernetes DNS subdomain names and plural resource names.
// Allows lowercase alphanumeric, dots, and hyphens (e.g. "apps", "keda.sh", "v1beta1").
var K8sNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.\-]*[a-z0-9]$|^[a-z0-9]$`)

// MaxK8sNameLen is the maximum length for a Kubernetes resource name (DNS-1123 subdomain).
const MaxK8sNameLen = 253

// IsValidK8sName validates a Kubernetes-style DNS name (group or resource).
func IsValidK8sName(name string) bool {
	if len(name) > MaxK8sNameLen {
		return false
	}
	return K8sNamePattern.MatchString(name)
}

// ValidateK8sName checks that a non-empty string is a valid Kubernetes resource name.
// Empty values are allowed (they mean "all" in query param context). Returns a
// 400 fiber error with the parameter name in the message when invalid.
func ValidateK8sName(param, value string) error {
	if value == "" {
		return nil
	}
	if !IsValidK8sName(value) {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("invalid %s: must be a valid Kubernetes resource name (lowercase alphanumeric, '-', '.')", param))
	}
	return nil
}

// ValidateClusterAndNamespace is a convenience helper that validates both the
// cluster and namespace query parameters in a single call.
func ValidateClusterAndNamespace(cluster, namespace string) error {
	if err := ValidateK8sName("cluster", cluster); err != nil {
		return err
	}
	return ValidateK8sName("namespace", namespace)
}

// NoClusterAccessMsg is the unified error message returned by every handler
// when the Kubernetes client is unavailable (e.g., no kubeconfig loaded, or
// the kc-agent websocket is disconnected) (#9830).
const NoClusterAccessMsg = "No cluster access"

// ErrNoClusterAccess writes the standard 503 response for missing cluster access.
func ErrNoClusterAccess(c *fiber.Ctx) error {
	return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": NoClusterAccessMsg})
}
