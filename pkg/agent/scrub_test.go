package agent

import (
	"strings"
	"testing"
)

func TestScrubSecrets_Empty(t *testing.T) {
	if got := ScrubSecrets(""); got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestScrubSecrets_NoSecrets(t *testing.T) {
	input := "pod nginx-abc123 is running in namespace default"
	if got := ScrubSecrets(input); got != input {
		t.Errorf("expected unchanged input, got %q", got)
	}
}

func TestScrubSecrets_AnthropicKey(t *testing.T) {
	input := "API key is sk-ant-api03-abcdefghij1234567890abcdefghij"
	got := ScrubSecrets(input)
	if strings.Contains(got, "sk-ant-") {
		t.Errorf("expected Anthropic key to be scrubbed, got %q", got)
	}
	if !strings.Contains(got, redactedPlaceholder) {
		t.Errorf("expected redacted placeholder, got %q", got)
	}
}

func TestScrubSecrets_OpenAIKey(t *testing.T) {
	input := "key: sk-abcdefghij1234567890abcdefghij"
	got := ScrubSecrets(input)
	if strings.Contains(got, "sk-abcdefghij") {
		t.Errorf("expected OpenAI key to be scrubbed, got %q", got)
	}
}

func TestScrubSecrets_AWSAccessKey(t *testing.T) {
	input := "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
	got := ScrubSecrets(input)
	if strings.Contains(got, "AKIA") {
		t.Errorf("expected AWS key to be scrubbed, got %q", got)
	}
}

func TestScrubSecrets_GCPKey(t *testing.T) {
	input := "apikey=AIzaSyB1234567890abcdefghijklmnopqrstuv"
	got := ScrubSecrets(input)
	if strings.Contains(got, "AIza") {
		t.Errorf("expected GCP key to be scrubbed, got %q", got)
	}
}

func TestScrubSecrets_BearerToken(t *testing.T) {
	input := "Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.eyJpc3MiOiJ0ZXN0In0.signature"
	got := ScrubSecrets(input)
	if !strings.Contains(got, "Bearer") {
		t.Errorf("expected 'Bearer' prefix to remain, got %q", got)
	}
	if strings.Contains(got, "eyJhbGci") {
		t.Errorf("expected bearer token value to be scrubbed, got %q", got)
	}
}

func TestScrubSecrets_PasswordField(t *testing.T) {
	input := `password: supersecretvalue123`
	got := ScrubSecrets(input)
	if strings.Contains(got, "supersecret") {
		t.Errorf("expected password value to be scrubbed, got %q", got)
	}
}

func TestScrubSecrets_MultipleSecrets(t *testing.T) {
	input := `Found credentials:
  api_key: sk-abcdefghij1234567890abcdefghij
  aws_key: AKIAIOSFODNN7EXAMPLE
  password: mysecretpassword123`
	got := ScrubSecrets(input)
	if strings.Contains(got, "sk-abcdefghij") {
		t.Errorf("expected OpenAI key to be scrubbed")
	}
	if strings.Contains(got, "AKIA") {
		t.Errorf("expected AWS key to be scrubbed")
	}
	if strings.Contains(got, "mysecretpassword") {
		t.Errorf("expected password to be scrubbed")
	}
}

func TestScrubSecrets_PreservesNonSecrets(t *testing.T) {
	input := `Pod: nginx-deployment-abc123
Status: Running
Namespace: production
Image: nginx:1.21
Restarts: 3`
	got := ScrubSecrets(input)
	if got != input {
		t.Errorf("expected non-secret content to be preserved, got diff")
	}
}

func TestWrapUntrustedData_Empty(t *testing.T) {
	if got := WrapUntrustedData("pod-logs", ""); got != "" {
		t.Errorf("expected empty string for empty data, got %q", got)
	}
}

func TestWrapUntrustedData_WrapsContent(t *testing.T) {
	got := WrapUntrustedData("pod-logs", "error: OOMKilled")
	if !strings.Contains(got, `<cluster-data source="pod-logs" trust="untrusted">`) {
		t.Errorf("expected opening tag, got %q", got)
	}
	if !strings.Contains(got, `</cluster-data>`) {
		t.Errorf("expected closing tag, got %q", got)
	}
	if !strings.Contains(got, "error: OOMKilled") {
		t.Errorf("expected content to be preserved inside tags, got %q", got)
	}
}

func TestWrapUntrustedData_DifferentSources(t *testing.T) {
	sources := []string{"pod-logs", "events", "resource-spec", "insight-description"}
	for _, src := range sources {
		got := WrapUntrustedData(src, "test data")
		expected := `source="` + src + `"`
		if !strings.Contains(got, expected) {
			t.Errorf("source %q: expected %q in output, got %q", src, expected, got)
		}
	}
}
