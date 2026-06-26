package handlers

import (
	"strings"
	"testing"
)

// TestValidateDNSLabel exercises the common table of inputs covering empty,
// too-long, invalid-char, leading/trailing dash, and valid cases. Each case
// is independent so failures are easy to attribute. #6627.
func TestValidateDNSLabel(t *testing.T) {
	cases := []struct {
		name    string
		value   string
		wantErr bool
		errHint string
	}{
		{"valid simple", "foo", false, ""},
		{"valid with dash", "foo-bar", false, ""},
		{"valid with digits", "foo-123", false, ""},
		{"empty", "", true, "required"},
		{"uppercase", "Foo", true, "DNS label"},
		{"underscore", "foo_bar", true, "DNS label"},
		{"leading dash", "-foo", true, "DNS label"},
		{"trailing dash", "foo-", true, "DNS label"},
		{"space", "foo bar", true, "DNS label"},
		{"too long", strings.Repeat("a", maxK8sDNSLabelLen+1), true, "at most"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateDNSLabel("field", tc.value)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.wantErr && !strings.Contains(err.Error(), tc.errHint) {
				t.Fatalf("error %q does not contain hint %q", err.Error(), tc.errHint)
			}
		})
	}
}

// TestValidateClusterName ensures we accept typical kubeconfig context
// names and reject obviously hostile content (control characters).
func TestValidateClusterName(t *testing.T) {
	cases := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{"simple", "prod", false},
		{"dotted", "prod.us-east-1.eks.amazonaws.com", false},
		{"with slash", "arn:aws:eks:us-east-1:1234/cluster", false},
		{"empty", "", true},
		{"newline", "prod\nhacked", true},
		{"tab", "prod\thacked", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateClusterName("cluster", tc.value)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected: %v", err)
			}
		})
	}
}

// TestValidateRoleName covers the system: prefix case plus the standard
// DNS-subdomain shape.
func TestValidateRoleName(t *testing.T) {
	cases := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{"cluster-admin", "cluster-admin", false},
		{"view", "view", false},
		{"system prefixed", "system:admin", false},
		{"dotted", "rbac.example.com", false},
		{"empty", "", true},
		{"uppercase", "Admin", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateRoleName("role", tc.value)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected: %v", err)
			}
		})
	}
}

// TestValidateEnum covers accept/reject and the empty-string required case.
func TestValidateEnum(t *testing.T) {
	allowed := []string{"User", "Group", "ServiceAccount"}
	if err := validateEnum("subjectKind", "User", allowed); err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if err := validateEnum("subjectKind", "pod", allowed); err == nil {
		t.Fatalf("expected error for disallowed value")
	}
	if err := validateEnum("subjectKind", "", allowed); err == nil {
		t.Fatalf("expected error for empty value")
	}
}
