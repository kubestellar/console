package handlers

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// mcpNamePattern matches valid Kubernetes resource names (RFC 1123 DNS subdomain).
// Must be lowercase alphanumeric, may contain '-' and '.', max 253 characters.
var mcpNamePattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9.\-]*[a-z0-9])?$`)

// mcpMaxNameLen is the maximum length for a Kubernetes DNS subdomain name.
const mcpMaxNameLen = 253

// mcpMaxLabelSelectorLen is the maximum length allowed for a label selector string
// to prevent excessively large queries.
const mcpMaxLabelSelectorLen = 1024

// mcpMaxEventLimit is the maximum number of events a client may request.
const mcpMaxEventLimit = 1000

// mcpMaxTailLines is the maximum number of log tail lines a client may request.
const mcpMaxTailLines = 10000

// mcpAllowedWorkloadTypes enumerates the valid values for the "type" query parameter
// on the /api/mcp/workloads endpoint.
var mcpAllowedWorkloadTypes = map[string]bool{
	"":            true, // empty means "all types"
	"Deployment":  true,
	"StatefulSet": true,
	"DaemonSet":   true,
}

// mcpValidateName checks that a non-empty string is a valid Kubernetes name.
// Empty values are allowed (they mean "all" in most contexts). Returns an
// HTTP 400 fiber error with the parameter name in the message when invalid.
func mcpValidateName(param, value string) error {
	if value == "" {
		return nil
	}
	if len(value) > mcpMaxNameLen {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("invalid %s: exceeds maximum length of %d characters", param, mcpMaxNameLen))
	}
	if !mcpNamePattern.MatchString(value) {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("invalid %s: must consist of lowercase alphanumeric characters, '-', or '.'", param))
	}
	return nil
}

// mcpValidateLabelSelector checks that a label selector string is reasonably
// well-formed and not excessively long.
func mcpValidateLabelSelector(value string) error {
	if value == "" {
		return nil
	}
	if len(value) > mcpMaxLabelSelectorLen {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("invalid labelSelector: exceeds maximum length of %d characters", mcpMaxLabelSelectorLen))
	}
	// Reject obviously malicious characters (newlines, semicolons, backticks)
	if strings.ContainsAny(value, ";\n\r`") {
		return fiber.NewError(fiber.StatusBadRequest,
			"invalid labelSelector: contains disallowed characters")
	}
	return nil
}

// mcpValidatePositiveInt checks that an integer query parameter falls within
// [0, max]. Negative values are rejected. Zero is treated as "use default".
func mcpValidatePositiveInt(param string, value, max int) error {
	if value < 0 {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("invalid %s: must be a positive integer", param))
	}
	if value > max {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("invalid %s: exceeds maximum of %d", param, max))
	}
	return nil
}

// mcpValidateWorkloadType checks that a workload type filter is one of the
// recognised values ("Deployment", "StatefulSet", "DaemonSet", or empty).
func mcpValidateWorkloadType(value string) error {
	if !mcpAllowedWorkloadTypes[value] {
		return fiber.NewError(fiber.StatusBadRequest,
			"invalid type: must be one of Deployment, StatefulSet, DaemonSet")
	}
	return nil
}

// mcpValidateClusterAndNamespace is a convenience helper that validates both the
// cluster and namespace query parameters in a single call.
func mcpValidateClusterAndNamespace(cluster, namespace string) error {
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}
	return mcpValidateName("namespace", namespace)
}
