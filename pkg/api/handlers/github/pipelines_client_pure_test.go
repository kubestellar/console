package github

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestGhpNormalizeJob_CopiesAllFields(t *testing.T) {
	success := "success"
	failed := "failure"
	started := "2026-06-01T00:00:00Z"
	completed := "2026-06-01T00:05:00Z"

	raw := ghpJobRaw{
		ID:          9001,
		Name:        "build",
		Status:      "completed",
		Conclusion:  &success,
		StartedAt:   &started,
		CompletedAt: &completed,
		HTMLURL:     "https://github.com/o/r/jobs/9001",
		Steps: []ghpStepRaw{
			{Name: "checkout", Status: "completed", Conclusion: &success, Number: 1, StartedAt: "s1", CompletedAt: "c1"},
			{Name: "test", Status: "completed", Conclusion: &failed, Number: 2, StartedAt: "s2", CompletedAt: "c2"},
		},
	}

	got := ghpNormalizeJob(raw)

	if got.ID != 9001 || got.Name != "build" || got.Status != "completed" || got.HTMLURL != raw.HTMLURL {
		t.Fatalf("basic fields mismatch: %+v", got)
	}
	if got.Conclusion == nil || *got.Conclusion != "success" {
		t.Fatalf("conclusion mismatch: %+v", got.Conclusion)
	}
	if got.StartedAt == nil || *got.StartedAt != started || got.CompletedAt == nil || *got.CompletedAt != completed {
		t.Fatalf("timestamp pointers mismatch")
	}
	if len(got.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(got.Steps))
	}
	if got.Steps[0].Name != "checkout" || got.Steps[0].Number != 1 {
		t.Fatalf("step[0] mismatch: %+v", got.Steps[0])
	}
	if got.Steps[1].Conclusion == nil || *got.Steps[1].Conclusion != "failure" {
		t.Fatalf("step[1] conclusion mismatch")
	}
}

func TestGhpNormalizeJob_NilOptionalFields(t *testing.T) {
	got := ghpNormalizeJob(ghpJobRaw{ID: 1, Name: "n", Status: "queued"})
	if got.Conclusion != nil || got.StartedAt != nil || got.CompletedAt != nil {
		t.Fatalf("optional pointers should stay nil, got %+v", got)
	}
	if got.Steps == nil {
		t.Fatalf("Steps slice should be non-nil (empty), got nil")
	}
	if len(got.Steps) != 0 {
		t.Fatalf("expected zero steps, got %d", len(got.Steps))
	}
}

func TestGhpGitHubResponseError_FormatsStatusAndBody(t *testing.T) {
	res := &http.Response{
		StatusCode: 502,
		Body:       io.NopCloser(strings.NewReader(`{"message":"bad gateway"}`)),
	}
	err := ghpGitHubResponseError(res)
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	msg := err.Error()
	if !strings.Contains(msg, "502") {
		t.Errorf("expected status 502 in error message, got %q", msg)
	}
	if !strings.Contains(msg, "bad gateway") {
		t.Errorf("expected body in error message, got %q", msg)
	}
}

func TestGhpGitHubResponseError_LimitsBodySize(t *testing.T) {
	// Body larger than ghpMaxErrorBodyBytes should be truncated, not cause OOM.
	big := strings.Repeat("A", ghpMaxErrorBodyBytes*4)
	res := &http.Response{
		StatusCode: 500,
		Body:       io.NopCloser(strings.NewReader(big)),
	}
	err := ghpGitHubResponseError(res)
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	// The message includes a "github %d: " prefix (~11 chars) plus the truncated body.
	if len(err.Error()) > ghpMaxErrorBodyBytes+64 {
		t.Fatalf("error message not truncated: len=%d, limit=%d", len(err.Error()), ghpMaxErrorBodyBytes)
	}
}

func TestGhpDecodeWorkflowRuns_Success(t *testing.T) {
	body := `{"workflow_runs":[{"id":1,"name":"CI","status":"completed","conclusion":"success"},{"id":2,"name":"CI","status":"in_progress"}]}`
	res := &http.Response{
		StatusCode: 200,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
	runs, done, err := ghpDecodeWorkflowRuns(context.Background(), res)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if done {
		t.Fatal("done should be false on 200")
	}
	if len(runs) != 2 {
		t.Fatalf("expected 2 runs, got %d", len(runs))
	}
	if runs[0].ID != 1 || runs[1].ID != 2 {
		t.Fatalf("run IDs mismatch: %+v", runs)
	}
}

func TestGhpDecodeWorkflowRuns_NotFoundSignalsDone(t *testing.T) {
	res := &http.Response{
		StatusCode: http.StatusNotFound,
		Body:       io.NopCloser(strings.NewReader("")),
		Header:     make(http.Header),
	}
	runs, done, err := ghpDecodeWorkflowRuns(context.Background(), res)
	if err != nil {
		t.Fatalf("404 should not return error, got %v", err)
	}
	if !done {
		t.Fatal("done should be true on 404")
	}
	if runs != nil {
		t.Fatalf("expected nil runs on 404, got %+v", runs)
	}
}

func TestGhpDecodeWorkflowRuns_ServerErrorReturnsError(t *testing.T) {
	res := &http.Response{
		StatusCode: 500,
		Body:       io.NopCloser(strings.NewReader(`server error`)),
		Header:     make(http.Header),
	}
	runs, done, err := ghpDecodeWorkflowRuns(context.Background(), res)
	if err == nil {
		t.Fatal("expected non-nil error on 500")
	}
	if done {
		t.Fatal("done should be false on 5xx")
	}
	if runs != nil {
		t.Fatalf("expected nil runs on error, got %+v", runs)
	}
}

func TestGhpDecodeWorkflowRuns_MalformedJSON(t *testing.T) {
	res := &http.Response{
		StatusCode: 200,
		Body:       io.NopCloser(strings.NewReader(`{"workflow_runs":`)), // truncated
		Header:     make(http.Header),
	}
	_, _, err := ghpDecodeWorkflowRuns(context.Background(), res)
	if err == nil {
		t.Fatal("expected error on malformed JSON")
	}
}
