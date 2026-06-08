package agent

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExtractResourceKind(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Deployment/my-app", "Deployment"},
		{"Pod/nginx-abc123", "Pod"},
		{"Service/frontend", "Service"},
		{"no-slash", ""},
		{"", ""},
		{"/leading-slash", ""},
		{"Multi/Part/Path", "Multi"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := extractResourceKind(tt.input)
			if got != tt.want {
				t.Errorf("extractResourceKind(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestExtractResourceName(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Deployment/my-app", "my-app"},
		{"Pod/nginx-abc123", "nginx-abc123"},
		{"Service/frontend", "frontend"},
		{"no-slash", "no-slash"},
		{"", ""},
		{"/leading-slash", "leading-slash"},
		{"Multi/Part/Path", "Part/Path"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := extractResourceName(tt.input)
			if got != tt.want {
				t.Errorf("extractResourceName(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestSSEWriteError(t *testing.T) {
	rec := httptest.NewRecorder()
	flusher, ok := rec.(http.Flusher)
	if !ok {
		t.Fatal("httptest.ResponseRecorder does not implement http.Flusher")
	}

	sseWriteError(rec, flusher, "something went wrong")

	body := rec.Body.String()
	if !strings.Contains(body, "event: error") {
		t.Errorf("expected SSE error event, got: %q", body)
	}
	if !strings.Contains(body, "something went wrong") {
		t.Errorf("expected error message in body, got: %q", body)
	}
}

func TestPtrInt64(t *testing.T) {
	var val int64 = 42
	p := ptrInt64(val)
	if p == nil {
		t.Fatal("ptrInt64 returned nil")
	}
	if *p != val {
		t.Errorf("ptrInt64(%d) = %d, want %d", val, *p, val)
	}
}
