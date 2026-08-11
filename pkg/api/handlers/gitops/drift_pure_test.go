package gitops

import (
	"errors"
	"testing"
)

func TestExtractYAMLParseError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{"nil error", nil, ""},
		{"non-yaml error", errors.New("connection refused"), ""},
		{"yaml line marker", errors.New("yaml: line 5: bad indent"), "yaml: line 5: bad indent"},
		{"error parsing marker", errors.New("Error parsing pod.yaml"), "Error parsing pod.yaml"},
		{"unmarshal marker", errors.New("yaml: unmarshal errors:\n  field"), "yaml: unmarshal errors:\n  field"},
		{"converting yaml marker", errors.New("error converting YAML to JSON"), "error converting YAML to JSON"},
		{"validating data marker", errors.New("error validating data: unknown field"), "error validating data: unknown field"},
		{"mapping values marker", errors.New("mapping values are not allowed in this context"), "mapping values are not allowed in this context"},
		{"did not find expected", errors.New("did not find expected key"), "did not find expected key"},
		{"could not find expected", errors.New("could not find expected ':'"), "could not find expected ':'"},
		{"unrecognized char", errors.New("found character that cannot start any token"), "found character that cannot start any token"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractYAMLParseError(tc.err)
			if got != tc.want {
				t.Errorf("extractYAMLParseError(%v) = %q, want %q", tc.err, got, tc.want)
			}
		})
	}
}

func TestDetectKubectlErrors(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want int
	}{
		{"empty", "", 0},
		{"no errors", "pod/foo created\nservice/bar created\n", 0},
		{"error keyword", "Error from server: not found", 1},
		{"forbidden", "pods is forbidden: User cannot list resource", 1},
		{"multiple errors", "Error: bad\nunauthorized access\nok line", 2},
		{"case-insensitive", "ERROR from server", 1},
		{"admission webhook", "admission webhook \"vpol\" denied the request", 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := detectKubectlErrors(tc.in)
			if len(got) != tc.want {
				t.Errorf("detectKubectlErrors(%q) returned %d errs (%v), want %d", tc.in, len(got), got, tc.want)
			}
		})
	}
}

func TestGetString(t *testing.T) {
	m := map[string]interface{}{
		"a": "hello",
		"b": 42,
		"c": nil,
		"d": "",
	}
	tests := []struct {
		key  string
		want string
	}{
		{"a", "hello"},
		{"b", ""},
		{"c", ""},
		{"d", ""},
		{"missing", ""},
	}
	for _, tc := range tests {
		t.Run(tc.key, func(t *testing.T) {
			got := getString(m, tc.key)
			if got != tc.want {
				t.Errorf("getString(m, %q) = %q, want %q", tc.key, got, tc.want)
			}
		})
	}
}

func TestValidateHelmVersion(t *testing.T) {
	tests := []struct {
		name    string
		version string
		wantErr bool
	}{
		{"empty is ok", "", false},
		{"semver", "1.2.3", false},
		{"v-prefix", "v1.2.3", false},
		{"prerelease", "1.2.3-alpha.1", false},
		{"build metadata", "1.2.3+build.7", false},
		{"leading dash rejected", "-1.2.3", true},
		{"space rejected", "1.2 .3", true},
		{"shell metacharacter", "1.2.3;rm", true},
		{"path traversal char", "1/2", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateHelmVersion(tc.version)
			if (err != nil) != tc.wantErr {
				t.Errorf("validateHelmVersion(%q) err=%v, wantErr=%v", tc.version, err, tc.wantErr)
			}
		})
	}
}

func TestValidateBranchName(t *testing.T) {
	tests := []struct {
		name    string
		branch  string
		wantErr bool
	}{
		{"empty is ok", "", false},
		{"simple", "main", false},
		{"slash", "feature/foo", false},
		{"dot", "release-1.0", false},
		{"leading dash", "-main", true},
		{"double dot", "foo..bar", true},
		{"space", "foo bar", true},
		{"shell metacharacter", "foo;ls", true},
		{"tilde", "foo~1", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBranchName(tc.branch)
			if (err != nil) != tc.wantErr {
				t.Errorf("validateBranchName(%q) err=%v, wantErr=%v", tc.branch, err, tc.wantErr)
			}
		})
	}
}
