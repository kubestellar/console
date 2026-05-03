package agent

import (
	"strings"
	"testing"
)

func TestValidateDNS1123Label(t *testing.T) {
	tests := []struct {
		name    string
		field   string
		value   string
		wantErr bool
	}{
		{"valid lowercase", "cluster", "my-cluster", false},
		{"valid alphanumeric", "namespace", "prod123", false},
		{"valid single char", "app", "a", false},
		{"valid single number", "app", "1", false},
		{"valid max length", "cluster", strings.Repeat("a", 63), false},
		{"invalid empty", "cluster", "", true},
		{"invalid uppercase", "cluster", "My-Cluster", true},
		{"invalid underscore", "cluster", "my_cluster", true},
		{"invalid dot", "cluster", "my.cluster", true},
		{"invalid start with hyphen", "cluster", "-mycluster", true},
		{"invalid end with hyphen", "cluster", "mycluster-", true},
		{"invalid length too long", "cluster", strings.Repeat("a", 64), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateDNS1123Label(tt.field, tt.value)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateDNS1123Label() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateKubeContext(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{"valid simple context", "my-context", false},
		{"valid aws context", "arn:aws:eks:us-east-1:123456789012:cluster/my-cluster", false},
		{"valid gke context", "gke_project-name_zone-name_cluster-name", false},
		{"valid user context", "user@cluster.local", false},
		{"valid with dot", "cluster.local", false},
		{"invalid empty", "", true},
		{"invalid path traversal", "my../cluster", true},
		{"invalid path traversal start", "../cluster", true},
		{"invalid path traversal end", "cluster/..", true},
		{"invalid space", "my cluster", true},
		{"invalid shell injection", "cluster;rm -rf /", true},
		{"invalid wildcard", "cluster*", true},
		{"invalid length too long", strings.Repeat("a", 254), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateKubeContext(tt.value)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateKubeContext() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestContainsPathTraversal(t *testing.T) {
	tests := []struct {
		name string
		s    string
		want bool
	}{
		{"no traversal", "my-cluster", false},
		{"single dot", "my.cluster.local", false},
		{"contains traversal", "my..cluster", true},
		{"starts with traversal", "../cluster", true},
		{"ends with traversal", "cluster/..", true},
		{"triple dot", "...", true},
		{"empty string", "", false},
		{"single character", ".", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := containsPathTraversal(tt.s); got != tt.want {
				t.Errorf("containsPathTraversal() = %v, want %v", got, tt.want)
			}
		})
	}
}
