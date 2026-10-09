package gitops

import (
	"fmt"
	"strings"
)

// maxK8sNameLen is the maximum allowed length for Kubernetes resource names (RFC 1123)
const maxK8sNameLen = 253

// validateK8sName validates a Kubernetes-style name (cluster, namespace, release, pod).
// SECURITY: Prevents flag injection and shell metacharacters in CLI args.
func validateK8sName(name, field string) error {
	if name == "" {
		return nil // Empty is OK — callers handle required-field checks separately
	}
	if len(name) > maxK8sNameLen {
		return fmt.Errorf("%s exceeds maximum length of %d", field, maxK8sNameLen)
	}
	if strings.HasPrefix(name, "-") {
		return fmt.Errorf("%s must not start with '-'", field)
	}
	for _, ch := range name {
		if !((ch >= 'a' && ch <= 'z') ||
			(ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '-' || ch == '_' || ch == '.') {
			return fmt.Errorf("%s contains invalid character: %c", field, ch)
		}
	}
	return nil
}
