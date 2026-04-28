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
		{
			name:    "valid lowercase alphanumeric",
			field:   "cluster",
			value:   "cluster1",
			wantErr: false,
		},
		{
			name:    "valid with hyphens",
			field:   "cluster",
			value:   "my-cluster-1",
			wantErr: false,
		},
		{
			name:    "empty value",
			field:   "cluster",
			value:   "",
			wantErr: true,
		},
		{
			name:    "uppercase not allowed",
			field:   "cluster",
			value:   "Cluster1",
			wantErr: true,
		},
		{
			name:    "starts with hyphen",
			field:   "cluster",
			value:   "-cluster",
			wantErr: true,
		},
		{
			name:    "ends with hyphen",
			field:   "cluster",
			value:   "cluster-",
			wantErr: true,
		},
		{
			name:    "too long",
			field:   "cluster",
			value:   strings.Repeat("a", 64),
			wantErr: true,
		},
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
		{
			name:    "valid simple context",
			value:   "minikube",
			wantErr: false,
		},
		{
			name:    "valid context with colon and slash",
			value:   "arn:aws:eks:region:account:cluster/name",
			wantErr: false,
		},
		{
			name:    "valid context with underscore",
			value:   "gke_project_zone_cluster",
			wantErr: false,
		},
		{
			name:    "valid context with dot and at sign",
			value:   "user@cluster.local",
			wantErr: false,
		},
		{
			name:    "empty value",
			value:   "",
			wantErr: true,
		},
		{
			name:    "contains space",
			value:   "my context",
			wantErr: true,
		},
		{
			name:    "contains shell control character",
			value:   "context;rm -rf /",
			wantErr: true,
		},
		{
			name:    "contains path traversal",
			value:   "../context",
			wantErr: true,
		},
		{
			name:    "too long",
			value:   strings.Repeat("a", 254),
			wantErr: true,
		},
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
		{
			name: "no traversal",
			s:    "path/to/file",
			want: false,
		},
		{
			name: "single dot",
			s:    "path/./file",
			want: false,
		},
		{
			name: "double dot traversal",
			s:    "path/../file",
			want: true,
		},
		{
			name: "double dot at start",
			s:    "../path/file",
			want: true,
		},
		{
			name: "double dot at end",
			s:    "path/file/..",
			want: true,
		},
		{
			name: "double dot standalone",
			s:    "..",
			want: true,
		},
		{
			name: "empty string",
			s:    "",
			want: false,
		},
		{
			name: "one char",
			s:    ".",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := containsPathTraversal(tt.s); got != tt.want {
				t.Errorf("containsPathTraversal() = %v, want %v", got, tt.want)
			}
		})
	}
}
