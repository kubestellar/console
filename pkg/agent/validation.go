package agent

import (
	"fmt"
	"regexp"
)

// dns1123LabelRegex matches valid Kubernetes DNS-1123 label names:
// lowercase alphanumeric, may contain hyphens, 1-63 characters,
// must start and end with an alphanumeric character.
var dns1123LabelRegex = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

// validateDNS1123Label checks that name conforms to Kubernetes DNS-1123 label
// rules. Returns nil if valid, or an error describing the violation.
// This MUST be called on all user-supplied cluster names, namespace names,
// and similar identifiers before they are used in exec.Command arguments,
// URL path construction, or kubeconfig context lookups (#7171, #7175).
func validateDNS1123Label(field, value string) error {
	if value == "" {
		return fmt.Errorf("%s must not be empty", field)
	}
	if !dns1123LabelRegex.MatchString(value) {
		return fmt.Errorf("%s %q is not a valid DNS-1123 label (must match %s)", field, value, dns1123LabelRegex.String())
	}
	return nil
}

// dns1123SubdomainRegex matches valid Kubernetes DNS-1123 subdomain names:
// one or more DNS-1123 labels separated by dots, total max 253 characters.
// This is used for cluster context names which may contain dots.
var dns1123SubdomainRegex = regexp.MustCompile(`^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$`)

// validateKubeContext checks that a kubeconfig context name is safe for use
// in command arguments and URL paths. Context names follow DNS-1123 subdomain
// rules but may also contain colons, slashes, and underscores (common in
// kubeconfig contexts like "arn:aws:..." or "gke_project_zone_cluster").
// We reject path-traversal sequences and control characters.
var unsafeContextChars = regexp.MustCompile(`[^a-zA-Z0-9._:/@-]`)

func validateKubeContext(value string) error {
	if value == "" {
		return fmt.Errorf("context must not be empty")
	}
	if len(value) > 253 {
		return fmt.Errorf("context name exceeds 253 characters")
	}
	if unsafeContextChars.MatchString(value) {
		return fmt.Errorf("context %q contains invalid characters", value)
	}
	// Reject path traversal
	if containsPathTraversal(value) {
		return fmt.Errorf("context %q contains path traversal sequence", value)
	}
	return nil
}

// containsPathTraversal returns true if s contains ".." path traversal.
func containsPathTraversal(s string) bool {
	for i := 0; i < len(s)-1; i++ {
		if s[i] == '.' && s[i+1] == '.' {
			return true
		}
	}
	return false
}
