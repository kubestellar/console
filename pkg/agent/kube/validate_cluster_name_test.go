package kube

import (
	"strings"
	"testing"
)

// validateClusterName is called from CreateCluster/DeleteCluster/... on the
// local-cluster path (kind, k3d, minikube). Regressions here would let
// malformed names reach `exec` invocations, risking flag injection or
// orphaned Docker containers (issue #7249). The function was previously
// only exercised indirectly via the create/delete paths, so the empty-name
// and invalid-format arms had no direct assertions.
func TestValidateClusterName(t *testing.T) {
	cases := []struct {
		name       string
		input      string
		wantErr    bool
		errFragmt  string // fragment expected in the error message
	}{
		{"valid simple", "my-cluster", false, ""},
		{"valid single char", "a", false, ""},
		{"valid alphanumeric", "cluster1", false, ""},
		{"valid max length (63)", strings.Repeat("a", 63), false, ""},
		{"valid with digits and hyphens", "kind-cluster-2", false, ""},

		{"empty string", "", true, "must not be empty"},
		{"leading hyphen", "-cluster", true, "not a valid DNS-1123 label"},
		{"trailing hyphen", "cluster-", true, "not a valid DNS-1123 label"},
		{"uppercase letters", "Cluster", true, "not a valid DNS-1123 label"},
		{"underscore", "my_cluster", true, "not a valid DNS-1123 label"},
		{"dot separator", "my.cluster", true, "not a valid DNS-1123 label"},
		{"space", "my cluster", true, "not a valid DNS-1123 label"},
		// The most important regression guard: shell/flag metacharacters
		// must NEVER be accepted, or the eventual exec call becomes
		// injection-prone.
		{"flag injection", "--evil", true, "not a valid DNS-1123 label"},
		{"shell metachar semicolon", "a;rm -rf /", true, "not a valid DNS-1123 label"},
		{"shell metachar backtick", "a`whoami`", true, "not a valid DNS-1123 label"},
		{"path traversal", "../etc", true, "not a valid DNS-1123 label"},
		{"too long (64 chars)", strings.Repeat("a", 64), true, "not a valid DNS-1123 label"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateClusterName(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("validateClusterName(%q) = nil, want error", tc.input)
				}
				if !strings.Contains(err.Error(), tc.errFragmt) {
					t.Errorf("validateClusterName(%q) error = %q, want to contain %q",
						tc.input, err.Error(), tc.errFragmt)
				}
			} else if err != nil {
				t.Errorf("validateClusterName(%q) = %v, want nil", tc.input, err)
			}
		})
	}
}

// The regex is package-private but its behaviour matters: the sole gate
// against exec-time injection. Pinning it explicitly makes silent
// regressions in the pattern visible in a diff.
func TestValidateClusterName_PinsDNS1123Regex(t *testing.T) {
	// Must accept ALL of these — canonical DNS-1123 labels used by real
	// installations.
	valid := []string{"a", "ab", "a1", "1a", "kubestellar", "kubestellar-1", "k3d-demo"}
	for _, v := range valid {
		if err := validateClusterName(v); err != nil {
			t.Errorf("valid name %q was rejected: %v", v, err)
		}
	}
	// Must reject ALL of these — anything that could turn into a distinct
	// exec argument.
	invalid := []string{
		"",         // empty
		"-a",       // leading hyphen
		"a-",       // trailing hyphen
		"A",        // uppercase
		"a_b",      // underscore
		"a b",      // space
		"a\tb",     // tab
		"a\nb",     // newline
		"a/b",      // slash
		"--flag",   // flag-shaped
		"a$b",      // dollar
		"a|b",      // pipe
		"a&b",      // ampersand
		"a>b",      // redirect
	}
	for _, v := range invalid {
		if err := validateClusterName(v); err == nil {
			t.Errorf("invalid name %q was accepted", v)
		}
	}
}
