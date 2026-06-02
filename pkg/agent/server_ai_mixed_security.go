package agent

import (
	"fmt"
	"strings"
)

// mixedModeRejectedCommand records an LLM-generated command that failed
// validation before execution.
type mixedModeRejectedCommand struct {
	Command          string
	Reason           string
	RequiresApproval bool
}

type mixedModeCommandValidation struct {
	Approved []string
	Rejected []mixedModeRejectedCommand
}

var mixedModeReadOnlyHelmVerbs = map[string]bool{
	"history": true,
	"list":    true,
	"status":  true,
	"version": true,
}

var mixedModeApprovalRequiredHelmVerbs = map[string]bool{
	"dependency": true,
	"get":        true,
	"install":    true,
	"package":    true,
	"pull":       true,
	"repo":       true,
	"rollback":   true,
	"search":     true,
	"show":       true,
	"template":   true,
	"test":       true,
	"uninstall":  true,
	"upgrade":    true,
}

var mixedModeApprovalRequiredKubectlVerbs = map[string]bool{
	"annotate": true,
	"apply":    true,
	"attach":   true,
	"cordon":   true,
	"cp":       true,
	"create":   true,
	"delete":   true,
	"drain":    true,
	"edit":     true,
	"exec":     true,
	"label":    true,
	"patch":    true,
	"replace":  true,
	"run":      true,
	"scale":    true,
	"taint":    true,
	"uncordon": true,
}

var mixedModeConfigReadOnlySubcommands = map[string]bool{
	"current-context": true,
	"get-contexts":    true,
	"view":            true,
}

var mixedModeSensitiveKubectlResources = map[string]bool{
	"secret":  true,
	"secrets": true,
}

var mixedModeDisallowedKubectlOutputFormats = map[string]bool{
	"custom-columns": true,
	"go-template":    true,
	"json":           true,
	"jsonpath":       true,
	"yaml":           true,
}

var mixedModeFlagsWithValues = map[string]bool{
	"--field-selector": true,
	"--namespace":      true,
	"--output":         true,
	"--selector":       true,
	"-l":               true,
	"-n":               true,
	"-o":               true,
}

var mixedModeBlockedStreamingFlags = map[string]bool{
	"--follow": true,
	"--watch":  true,
	"-f":       true,
	"-w":       true,
}

func validateMixedModeCommands(commands []string) mixedModeCommandValidation {
	validation := mixedModeCommandValidation{
		Approved: make([]string, 0, len(commands)),
		Rejected: make([]mixedModeRejectedCommand, 0),
	}

	for _, command := range commands {
		trimmed := strings.TrimSpace(command)
		if trimmed == "" {
			continue
		}
		requiresApproval, reason := validateMixedModeCommand(trimmed)
		if reason == "" {
			validation.Approved = append(validation.Approved, trimmed)
			continue
		}
		validation.Rejected = append(validation.Rejected, mixedModeRejectedCommand{
			Command:          trimmed,
			Reason:           reason,
			RequiresApproval: requiresApproval,
		})
	}

	return validation
}

func validateMixedModeCommand(command string) (bool, string) {
	if strings.ContainsAny(command, ";|&<>`$") || strings.Contains(command, "$(") {
		return false, "shell chaining, redirects, and subshell syntax are blocked"
	}

	tokens := strings.Fields(command)
	if len(tokens) == 0 {
		return false, "command is empty"
	}

	commandName := strings.ToLower(tokens[0])
	args := tokens[1:]
	if hasMixedModeContextOverride(args) {
		return false, "cluster context overrides are blocked in mixed mode"
	}
	if hasMixedModeStreamingFlag(args) {
		return false, "streaming or watch flags are blocked in mixed mode"
	}

	switch commandName {
	case "kubectl", "oc":
		return validateMixedModeKubectlCommand(args)
	case "helm":
		return validateMixedModeHelmCommand(args)
	default:
		return false, "only kubectl, oc, and helm commands are allowed"
	}
}

func validateMixedModeKubectlCommand(args []string) (bool, string) {
	if len(args) == 0 {
		return false, "missing kubectl verb"
	}

	verb := strings.ToLower(args[0])
	if !validateKubectlArgs(args) {
		if verb == "config" {
			return false, "kubectl config mutations are blocked in mixed mode"
		}
		if mixedModeApprovalRequiredKubectlVerbs[verb] {
			return true, fmt.Sprintf("kubectl %s requires explicit user approval", verb)
		}
		if verb == "rollout" {
			return true, "kubectl rollout mutations require explicit user approval"
		}
		return false, fmt.Sprintf("kubectl %s is not allowlisted for mixed mode", verb)
	}

	if !isMixedModeSafeKubectlCommand(args) {
		if mixedModeApprovalRequiredKubectlVerbs[verb] {
			return true, fmt.Sprintf("kubectl %s requires explicit user approval", verb)
		}
		return false, fmt.Sprintf("kubectl %s is not allowlisted for mixed mode", verb)
	}

	if touchesMixedModeSensitiveKubectlResource(args) {
		return true, "sensitive resources such as Secrets require explicit user approval"
	}
	if hasMixedModeSensitiveKubectlOutput(args) {
		return true, "structured output flags that can exfiltrate bulk data require explicit user approval"
	}

	return false, ""
}

func validateMixedModeHelmCommand(args []string) (bool, string) {
	if len(args) == 0 {
		return false, "missing helm verb"
	}

	verb := strings.ToLower(args[0])
	if mixedModeReadOnlyHelmVerbs[verb] {
		return false, ""
	}
	if mixedModeApprovalRequiredHelmVerbs[verb] {
		return true, fmt.Sprintf("helm %s requires explicit user approval", verb)
	}
	return false, fmt.Sprintf("helm %s is not allowlisted for mixed mode", verb)
}

func isMixedModeSafeKubectlCommand(args []string) bool {
	if len(args) == 0 {
		return false
	}
	if isReadOnlyKubectlCommand(args) {
		return true
	}

	switch strings.ToLower(args[0]) {
	case "config":
		subcommand := firstMixedModePositionalArg(args[1:])
		return mixedModeConfigReadOnlySubcommands[subcommand]
	case "rollout":
		subcommand := firstMixedModePositionalArg(args[1:])
		return allowedRolloutSubcommands[subcommand]
	default:
		return false
	}
}

func touchesMixedModeSensitiveKubectlResource(args []string) bool {
	if len(args) == 0 {
		return false
	}

	verb := strings.ToLower(args[0])
	if verb != "get" && verb != "describe" {
		return false
	}

	resourceToken := firstMixedModePositionalArg(args[1:])
	if resourceToken == "" {
		return false
	}

	for _, resource := range strings.Split(resourceToken, ",") {
		kind := strings.ToLower(resource)
		kind = strings.SplitN(kind, "/", 2)[0]
		kind = strings.SplitN(kind, ".", 2)[0]
		if mixedModeSensitiveKubectlResources[kind] {
			return true
		}
	}

	return false
}

func hasMixedModeSensitiveKubectlOutput(args []string) bool {
	for i := 0; i < len(args); i++ {
		arg := strings.ToLower(args[i])
		switch {
		case arg == "-o" || arg == "--output":
			if i+1 < len(args) && mixedModeDisallowedKubectlOutputFormats[normalizeMixedModeOutputFormat(args[i+1])] {
				return true
			}
			i++
		case strings.HasPrefix(arg, "--output="):
			if mixedModeDisallowedKubectlOutputFormats[normalizeMixedModeOutputFormat(strings.TrimPrefix(arg, "--output="))] {
				return true
			}
		case strings.HasPrefix(arg, "-o") && len(arg) > len("-o"):
			if mixedModeDisallowedKubectlOutputFormats[normalizeMixedModeOutputFormat(strings.TrimPrefix(arg, "-o"))] {
				return true
			}
		}
	}
	return false
}

func normalizeMixedModeOutputFormat(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = strings.TrimPrefix(normalized, "=")
	switch {
	case strings.HasPrefix(normalized, "jsonpath"):
		return "jsonpath"
	case strings.HasPrefix(normalized, "go-template"):
		return "go-template"
	case strings.HasPrefix(normalized, "custom-columns"):
		return "custom-columns"
	default:
		return normalized
	}
}

func hasMixedModeContextOverride(args []string) bool {
	for _, arg := range args {
		lower := strings.ToLower(arg)
		if lower == "--context" || lower == "--kube-context" || lower == "--kubeconfig" {
			return true
		}
		if strings.HasPrefix(lower, "--context=") || strings.HasPrefix(lower, "--kube-context=") || strings.HasPrefix(lower, "--kubeconfig=") {
			return true
		}
	}
	return false
}

func hasMixedModeStreamingFlag(args []string) bool {
	for _, arg := range args {
		lower := strings.ToLower(arg)
		if mixedModeBlockedStreamingFlags[lower] {
			return true
		}
	}
	return false
}

func firstMixedModePositionalArg(args []string) string {
	skipNext := false
	for _, arg := range args {
		lower := strings.ToLower(arg)
		if skipNext {
			skipNext = false
			continue
		}
		if mixedModeFlagsWithValues[lower] {
			skipNext = true
			continue
		}
		if strings.HasPrefix(lower, "--namespace=") ||
			strings.HasPrefix(lower, "--output=") ||
			strings.HasPrefix(lower, "--selector=") ||
			strings.HasPrefix(lower, "--field-selector=") {
			continue
		}
		if strings.HasPrefix(lower, "-") {
			continue
		}
		return lower
	}
	return ""
}

func formatMixedModeRejectedCommands(rejected []mixedModeRejectedCommand) string {
	if len(rejected) == 0 {
		return ""
	}

	var builder strings.Builder
	builder.WriteString("⚠️ Blocked LLM-generated commands before execution:\n")
	for _, rejectedCommand := range rejected {
		status := "blocked"
		if rejectedCommand.RequiresApproval {
			status = "approval required"
		}
		builder.WriteString(fmt.Sprintf("- `%s` — %s (%s)\n", rejectedCommand.Command, rejectedCommand.Reason, status))
	}
	builder.WriteString("Only prevalidated read-only commands are auto-executed in mixed mode.\n")
	return builder.String()
}
