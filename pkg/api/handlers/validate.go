package handlers

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
)

// ValidateK8sName checks that a non-empty string is a valid Kubernetes name.
// Empty values are allowed (they mean "all" in most contexts).
func ValidateK8sName(param, value string) error {
	if value == "" {
		return nil
	}
	if len(value) > MaxK8sNameLen {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("invalid %s: exceeds maximum length of %d characters", param, MaxK8sNameLen))
	}
	if !k8sNamePattern.MatchString(value) {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("invalid %s: must consist of lowercase alphanumeric characters, '-', or '.'", param))
	}
	return nil
}

// ValidateClusterAndNamespace validates both cluster and namespace parameters.
func ValidateClusterAndNamespace(cluster, namespace string) error {
	if err := ValidateK8sName("cluster", cluster); err != nil {
		return err
	}
	return ValidateK8sName("namespace", namespace)
}
