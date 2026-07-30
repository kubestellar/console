// Package handlers — input validation helpers shared by RBAC and namespace
// handlers. Added for #6627: the RBAC/namespace request structs previously had
// no field-level validation, so empty or malformed payloads silently relied on
// downstream Kubernetes API checks. These helpers centralise the rules so every
// handler rejects bad input at the HTTP boundary with a specific 400 error.
package handlers

import (
	"fmt"
	"regexp"
	"strings"
)

// Kubernetes name length limits. Per RFC 1123:
//   - a DNS label (used for most resources like Pods, ServiceAccounts,
//     Namespaces, RoleBindings) is at most 63 characters.
//   - a DNS subdomain (used for things like object names in some APIs)
//     is at most 253 characters.
// We pick the stricter 63-char limit for Kubernetes object names since every
// struct validated here creates a namespaced or cluster-scoped RBAC object.
const (
	// maxK8sDNSLabelLen is the maximum length of an RFC 1123 DNS label.
	maxK8sDNSLabelLen = 63
	// maxK8sDNSSubdomainLen is the maximum length of an RFC 1123 DNS subdomain.
	maxK8sDNSSubdomainLen = 253
	// maxRoleNameLen bounds the length of a Kubernetes Role/ClusterRole
	// reference. The apiserver allows up to a DNS subdomain; we mirror that.
	maxRoleNameLen = maxK8sDNSSubdomainLen
)

// dnsLabelRegex matches a valid RFC 1123 DNS label: lowercase alphanumerics
// and dashes, starting and ending with an alphanumeric. This is the pattern
// used by Kubernetes for most object names (validated server-side as well,
// but we reject client-side to return specific 400s).
var dnsLabelRegex = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`)

// dnsSubdomainRegex matches an RFC 1123 DNS subdomain — a series of DNS
// labels joined by dots. Used for hostnames/domains. Role names may also
// contain ':' (e.g. "system:controller:job-controller") but this regex
// does NOT accept ':' — role-specific validation uses roleNameRegex below.
var dnsSubdomainRegex = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$`)

// roleNameRegex accepts a DNS subdomain OR a system-prefixed role name
// with one or more ':' separators. Built-in Kubernetes ClusterRoles like
// "system:controller:job-controller" have multiple ':' segments, so the
// previous single-segment pattern incorrectly rejected valid role names.
// #6675 Copilot followup: allow any number of `:label` segments.
var roleNameRegex = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?(:[a-z0-9]([-a-z0-9]*[a-z0-9])?)*(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$`)

// validateDNSLabel checks that s is a non-empty RFC 1123 DNS label suitable
// for a Kubernetes object name (ServiceAccount, Namespace, RoleBinding, etc).
// Returns a user-facing error that names the field.
func validateDNSLabel(field, s string) error {
	if s == "" {
		return fmt.Errorf("%s is required", field)
	}
	if len(s) > maxK8sDNSLabelLen {
		return fmt.Errorf("%s must be at most %d characters", field, maxK8sDNSLabelLen)
	}
	if !dnsLabelRegex.MatchString(s) {
		return fmt.Errorf("%s must be a valid DNS label (lowercase alphanumerics and '-', starting and ending with alphanumeric)", field)
	}
	return nil
}

// validateDNSSubdomain checks that s is a non-empty RFC 1123 DNS subdomain.
// Used for fields that may legitimately contain dots (not currently used,
// kept for future extensibility when we validate e.g. hostnames).
func validateDNSSubdomain(field, s string) error {
	if s == "" {
		return fmt.Errorf("%s is required", field)
	}
	if len(s) > maxK8sDNSSubdomainLen {
		return fmt.Errorf("%s must be at most %d characters", field, maxK8sDNSSubdomainLen)
	}
	if !dnsSubdomainRegex.MatchString(s) {
		return fmt.Errorf("%s must be a valid DNS subdomain", field)
	}
	return nil
}

// validateClusterName is a looser validator for cluster IDs. Cluster names
// in this codebase come from kubeconfig contexts and may contain dots,
// dashes, slashes, and digits. We only enforce non-empty and length.
func validateClusterName(field, s string) error {
	if s == "" {
		return fmt.Errorf("%s is required", field)
	}
	if len(s) > maxK8sDNSSubdomainLen {
		return fmt.Errorf("%s must be at most %d characters", field, maxK8sDNSSubdomainLen)
	}
	if strings.ContainsAny(s, "\x00\n\r\t") {
		return fmt.Errorf("%s contains invalid characters", field)
	}
	return nil
}

// validateRoleName accepts a Kubernetes Role/ClusterRole name. These may
// contain a system: prefix and optional dots.
func validateRoleName(field, s string) error {
	if s == "" {
		return fmt.Errorf("%s is required", field)
	}
	if len(s) > maxRoleNameLen {
		return fmt.Errorf("%s must be at most %d characters", field, maxRoleNameLen)
	}
	if !roleNameRegex.MatchString(s) {
		return fmt.Errorf("%s must be a valid Kubernetes role name", field)
	}
	return nil
}

// validateEnum checks that s is one of allowed (case-sensitive). Used for
// fields like subjectKind, roleKind, and the namespace-access role shortcuts.
func validateEnum(field, s string, allowed []string) error {
	if s == "" {
		return fmt.Errorf("%s is required", field)
	}
	for _, a := range allowed {
		if s == a {
			return nil
		}
	}
	return fmt.Errorf("%s must be one of %s", field, strings.Join(allowed, ", "))
}
