package kube

import (
	"strings"
)

// AllowedKubectlCommands is a whitelist of safe kubectl commands.
// SECURITY: Mostly read-only commands, with controlled write operations.
var AllowedKubectlCommands = map[string]bool{
	// Read-only commands
	"get":           true,
	"describe":      true,
	"logs":          true,
	"top":           true,
	"explain":       true,
	"api-resources": true,
	"api-versions":  true,
	"version":       true,
	"cluster-info":  true,
	"config":        true, // Safe: view only works on local kubeconfig
	"auth":          true, // Safe: can-i and whoami are read-only
	"rollout":       true, // Allowed for deployments (status, history, restart)

	// Controlled write operations (validated further by resource type)
	"delete": true, // Allowed only for specific resources (see allowedDeleteResources)
	"scale":  true, // Allowed only for specific resources (see allowedScaleResources)
}

// allowedDeleteResources are resource types that can be deleted via the agent.
// SECURITY: Only allow deletion of user workload resources, not cluster-level resources.
var allowedDeleteResources = map[string]bool{
	"pod":  true,
	"pods": true,
	"po":   true,
}

// allowedScaleResources are resource types that can be scaled via the agent.
var allowedScaleResources = map[string]bool{
	"deployment":   true,
	"deployments":  true,
	"deploy":       true,
	"replicaset":   true,
	"replicasets":  true,
	"rs":           true,
	"statefulset":  true,
	"statefulsets": true,
	"sts":          true,
}

// allowedRolloutSubcommands restricts rollout to read-only operations (#7205).
var allowedRolloutSubcommands = map[string]bool{
	"status":  true,
	"history": true,
}

// allowedAuthSubcommands restricts auth to read-only operations (#7204).
var allowedAuthSubcommands = map[string]bool{
	"can-i":  true,
	"whoami": true,
}

// blockedConfigSubcommands are config subcommands that modify kubeconfig.
var blockedConfigSubcommands = map[string]bool{
	"set":             true,
	"set-cluster":     true,
	"set-context":     true,
	"set-credentials": true,
	"unset":           true,
	"delete-cluster":  true,
	"delete-context":  true,
	"delete-user":     true,
	"use-context":     true, // #16126: mutates current-context in kubeconfig
	"rename-context":  true, // handled via dedicated endpoint with validation
}

// ValidateKubectlArgs checks whether the given kubectl arguments are safe to execute.
func ValidateKubectlArgs(args []string) bool {
	if len(args) == 0 {
		return false
	}

	command := strings.ToLower(args[0])

	// Check if command is in allowlist
	allowed, exists := AllowedKubectlCommands[command]
	if !exists || !allowed {
		return false
	}

	// Special case: rollout command - only allow read-only subcommands (#7205)
	if command == "rollout" {
		if len(args) < 2 {
			return false // Need at least "rollout <subcommand>"
		}
		subcommand := strings.ToLower(args[1])
		if !allowedRolloutSubcommands[subcommand] {
			return false
		}
	}

	// Special case: auth command - only allow read-only subcommands (#7204)
	if command == "auth" {
		if len(args) < 2 {
			return false // Need at least "auth <subcommand>"
		}
		subcommand := strings.ToLower(args[1])
		if !allowedAuthSubcommands[subcommand] {
			return false
		}
	}

	// Special case: config command — block mutation subcommands.
	// Skip leading flags (--flag / -x) to find the real subcommand,
	// since kubectl accepts global flags before subcommands (#7261).
	if command == "config" && len(args) > 1 {
		for _, a := range args[1:] {
			token := strings.ToLower(a)
			if strings.HasPrefix(token, "-") {
				continue // skip flags
			}
			if blockedConfigSubcommands[token] {
				return false
			}
			break // first non-flag token is the subcommand
		}
	}

	// Special case: delete command - only allow for specific resource types
	if command == "delete" {
		if len(args) < 2 {
			return false // Need at least "delete <resource>"
		}
		resourceType := strings.ToLower(args[1])
		if !allowedDeleteResources[resourceType] {
			return false
		}
	}

	// Special case: scale command - only allow for specific resource types
	if command == "scale" {
		var firstPositional string
		for _, a := range args[1:] {
			if strings.HasPrefix(a, "-") {
				continue
			}
			firstPositional = strings.ToLower(a)
			break
		}
		if firstPositional == "" {
			return false // No resource type found
		}
		// Handle "scale deployment/myapp" format
		if strings.Contains(firstPositional, "/") {
			parts := strings.SplitN(firstPositional, "/", 2)
			if !allowedScaleResources[parts[0]] {
				return false
			}
		} else {
			// Handle "scale deployment myapp" format
			if !allowedScaleResources[firstPositional] {
				return false
			}
		}
	}

	// Block any args that might execute arbitrary commands
	for _, arg := range args {
		argLower := strings.ToLower(arg)
		if strings.Contains(argLower, "--exec") {
			return false
		}
		// Block shell metacharacters
		if strings.ContainsAny(arg, ";|&$`") {
			return false
		}
	}

	return true
}
