package handlers

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsLabelPermissionError_NilError(t *testing.T) {
	assert.False(t, isLabelPermissionError(nil))
}

func TestIsLabelPermissionError_Matching(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "403 with label keyword",
			err:  errors.New("HTTP 403: Resource not accessible - label"),
			want: true,
		},
		{
			name: "403 label in different context",
			err:  errors.New("received 403 when creating label on issue"),
			want: true,
		},
		{
			name: "403 without label",
			err:  errors.New("HTTP 403: Forbidden"),
			want: false,
		},
		{
			name: "label without 403",
			err:  errors.New("failed to set label: timeout"),
			want: false,
		},
		{
			name: "unrelated error",
			err:  errors.New("network timeout"),
			want: false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, isLabelPermissionError(tc.err))
		})
	}
}

func TestIsInsufficientIssuePermissionError(t *testing.T) {
	tests := []struct {
		name string
		body string
		want bool
	}{
		{
			name: "resource not accessible by PAT",
			body: `{"message":"Resource not accessible by personal access token"}`,
			want: true,
		},
		{
			name: "case insensitive match",
			body: `{"message":"RESOURCE NOT ACCESSIBLE BY PERSONAL ACCESS TOKEN"}`,
			want: true,
		},
		{
			name: "insufficient permission variant",
			body: `{"message":"Insufficient permission to create issue"}`,
			want: true,
		},
		{
			name: "insufficient alone without permission",
			body: `{"message":"Insufficient funds"}`,
			want: false,
		},
		{
			name: "permission alone without insufficient",
			body: `{"message":"Check your permission settings"}`,
			want: false,
		},
		{
			name: "empty body",
			body: "",
			want: false,
		},
		{
			name: "unrelated error",
			body: `{"message":"Not Found"}`,
			want: false,
		},
		{
			name: "rate limit error",
			body: `{"message":"API rate limit exceeded"}`,
			want: false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, isInsufficientIssuePermissionError(tc.body))
		})
	}
}

func TestPipelineLabels_ContainsExpectedEntries(t *testing.T) {
	expectedLabels := []string{
		"triage/accepted",
		"ai-processing",
		"ai-awaiting-fix",
		"ai-pr-draft",
		"ai-pr-ready",
		"ai-processing-complete",
	}
	for _, label := range expectedLabels {
		t.Run(label, func(t *testing.T) {
			entry, ok := pipelineLabels[label]
			assert.True(t, ok, "pipelineLabels should contain %q", label)
			assert.NotEmpty(t, entry.message, "label %q should have a notification message", label)
		})
	}
}

func TestVcsRevision_DoesNotPanic(t *testing.T) {
	// vcsRevision() should never panic regardless of environment
	rev := vcsRevision()
	// In test environment, it may or may not return a value
	// but it must not panic and should return a string
	_ = rev
}
