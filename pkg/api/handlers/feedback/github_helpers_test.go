package feedback

import (
	"testing"
)

func TestIsLabelPermissionError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
		{
			name: "403 label error",
			err:  errorf("403 Forbidden: cannot set label"),
			want: true,
		},
		{
			name: "403 without label",
			err:  errorf("403 Forbidden: access denied"),
			want: false,
		},
		{
			name: "non-403 label error",
			err:  errorf("400 Bad Request: invalid label"),
			want: false,
		},
		{
			name: "unrelated error",
			err:  errorf("connection timeout"),
			want: false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isLabelPermissionError(tc.err)
			if got != tc.want {
				t.Errorf("isLabelPermissionError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestIsInsufficientIssuePermissionError(t *testing.T) {
	tests := []struct {
		name     string
		respBody string
		want     bool
	}{
		{
			name:     "personal access token error",
			respBody: `{"message":"Resource not accessible by personal access token"}`,
			want:     true,
		},
		{
			name:     "insufficient permission error",
			respBody: `{"message":"Insufficient permission to create issue"}`,
			want:     true,
		},
		{
			name:     "uppercase resource not accessible",
			respBody: `{"message":"RESOURCE NOT ACCESSIBLE BY PERSONAL ACCESS TOKEN"}`,
			want:     true,
		},
		{
			name:     "unrelated error body",
			respBody: `{"message":"Not Found"}`,
			want:     false,
		},
		{
			name:     "empty body",
			respBody: "",
			want:     false,
		},
		{
			name:     "partial match insufficient only",
			respBody: `insufficient data`,
			want:     false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isInsufficientIssuePermissionError(tc.respBody)
			if got != tc.want {
				t.Errorf("isInsufficientIssuePermissionError(%q) = %v, want %v", tc.respBody, got, tc.want)
			}
		})
	}
}

func TestVcsRevision(t *testing.T) {
	// vcsRevision should not panic and should return a string
	// (may be empty in test environments without git or build info)
	rev := vcsRevision()
	_ = rev // just verify no panic
}

func TestPipelineLabels_AllHaveNonEmptyFields(t *testing.T) {
	for label, config := range pipelineLabels {
		if config.status == "" {
			t.Errorf("pipelineLabels[%q].status is empty", label)
		}
		if config.notifType == "" {
			t.Errorf("pipelineLabels[%q].notifType is empty", label)
		}
		if config.message == "" {
			t.Errorf("pipelineLabels[%q].message is empty", label)
		}
	}
}

func TestPipelineLabels_KnownLabelsExist(t *testing.T) {
	expectedLabels := []string{
		"triage/accepted",
		"ai-processing",
		"ai-awaiting-fix",
		"ai-pr-draft",
		"ai-pr-ready",
		"ai-processing-complete",
	}
	for _, label := range expectedLabels {
		if _, ok := pipelineLabels[label]; !ok {
			t.Errorf("expected label %q not found in pipelineLabels", label)
		}
	}
}

// errorf creates a simple error for testing.
func errorf(msg string) error {
	return &simpleError{msg: msg}
}

type simpleError struct{ msg string }

func (e *simpleError) Error() string { return e.msg }
