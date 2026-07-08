package feedback

import (
	"bytes"
	"errors"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestWebhook_NoSecretConfigured_Returns503 verifies that the webhook handler
// rejects requests with 503 when GITHUB_WEBHOOK_SECRET is not configured.
// This prevents silent unauthenticated webhook acceptance.
func TestWebhook_NoSecretConfigured_Returns503(t *testing.T) {
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app := fiber.New()
	handler := NewFeedbackHandler(stubStore, FeedbackConfig{
		WebhookSecret: "", // intentionally empty
	})
	app.Post("/webhook", handler.HandleGitHubWebhook)

	payload := requireMarshalJSON(t, map[string]interface{}{"action": "opened"})
	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", "issues")
	req.Header.Set("X-Hub-Signature-256", "sha256=anything")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

// TestWebhook_OversizedPayload_Returns413 verifies that the webhook handler
// rejects payloads larger than 1MB with 413.
func TestWebhook_OversizedPayload_Returns413(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// 1MB + 1 byte exceeds webhookMaxBodyBytes
	oversized := make([]byte, 1<<20+1)
	for i := range oversized {
		oversized[i] = 'A'
	}

	sig := signWebhookPayload(oversized, testWebhookSecret)
	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(oversized))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", "issues")
	req.Header.Set("X-Hub-Signature-256", sig)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
}

// TestWebhook_UnknownEvent_ReturnsIgnored verifies that unrecognised event types
// return 200 with a JSON body containing "status": "ignored".
func TestWebhook_UnknownEvent_ReturnsIgnored(t *testing.T) {
	app, _ := setupWebhookTest(t)

	payload := requireMarshalJSON(t, map[string]interface{}{"action": "created"})
	resp := sendWebhook(t, app, "check_run", payload)
	body := readBody(t, resp)

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, body, "ignored")
	assert.Contains(t, body, "check_run")
}

// TestWebhook_EmptySignatureHeader_Returns401 verifies that an absent
// X-Hub-Signature-256 header is rejected with 401.
func TestWebhook_EmptySignatureHeader_Returns401(t *testing.T) {
	app, _ := setupWebhookTest(t)

	payload := requireMarshalJSON(t, map[string]interface{}{"action": "opened"})

	// No signature header at all
	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", "issues")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// TestWebhook_ShortSignatureHeader_Returns401 verifies that a signature shorter
// than 7 characters (i.e., shorter than "sha256=") is rejected with 401.
func TestWebhook_ShortSignatureHeader_Returns401(t *testing.T) {
	app, _ := setupWebhookTest(t)

	payload := requireMarshalJSON(t, map[string]interface{}{"action": "opened"})
	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", "issues")
	req.Header.Set("X-Hub-Signature-256", "short")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// --- verifyWebhookSignature unit tests ---

// TestVerifyWebhookSignature_CorrectHMAC verifies a correct HMAC-SHA256
// signature is accepted.
func TestVerifyWebhookSignature_CorrectHMAC(t *testing.T) {
	h := &FeedbackHandler{webhookSecret: "my-secret"}
	payload := []byte(`{"action":"opened"}`)
	sig := signWebhookPayload(payload, "my-secret")
	assert.True(t, h.verifyWebhookSignature(payload, sig),
		"correctly-signed payload should be accepted")
}

// TestVerifyWebhookSignature_WrongSecret verifies that a signature produced
// with a different secret is rejected.
func TestVerifyWebhookSignature_WrongSecret(t *testing.T) {
	h := &FeedbackHandler{webhookSecret: "my-secret"}
	payload := []byte(`{"action":"opened"}`)
	sig := signWebhookPayload(payload, "wrong-secret")
	assert.False(t, h.verifyWebhookSignature(payload, sig),
		"payload signed with wrong secret should be rejected")
}

// TestVerifyWebhookSignature_EmptySignature verifies that an empty signature
// string is rejected.
func TestVerifyWebhookSignature_EmptySignature(t *testing.T) {
	h := &FeedbackHandler{webhookSecret: "my-secret"}
	assert.False(t, h.verifyWebhookSignature([]byte("payload"), ""),
		"empty signature should be rejected")
}

// TestVerifyWebhookSignature_ShortSignature verifies that a signature string
// shorter than 7 characters is rejected without panicking.
func TestVerifyWebhookSignature_ShortSignature(t *testing.T) {
	h := &FeedbackHandler{webhookSecret: "my-secret"}
	assert.False(t, h.verifyWebhookSignature([]byte("payload"), "sha25"),
		"signature shorter than 7 chars should be rejected")
}

// TestVerifyWebhookSignature_TamperedPayload verifies that modifying the payload
// after signing causes the verification to fail.
func TestVerifyWebhookSignature_TamperedPayload(t *testing.T) {
	h := &FeedbackHandler{webhookSecret: "my-secret"}
	payload := []byte(`{"action":"opened"}`)
	sig := signWebhookPayload(payload, "my-secret")
	tampered := []byte(`{"action":"deleted"}`)
	assert.False(t, h.verifyWebhookSignature(tampered, sig),
		"tampered payload should fail signature verification")
}

// --- isLabelPermissionError unit tests ---

func TestIsLabelPermissionError_NilError_Webhook(t *testing.T) {
	assert.False(t, isLabelPermissionError(nil))
}

func TestIsLabelPermissionError_403WithLabel(t *testing.T) {
	err := errors.New("github: 403 label resource not accessible")
	assert.True(t, isLabelPermissionError(err))
}

func TestIsLabelPermissionError_403WithoutLabel(t *testing.T) {
	err := errors.New("github: 403 rate limit exceeded")
	assert.False(t, isLabelPermissionError(err),
		"403 without 'label' should not match")
}

func TestIsLabelPermissionError_LabelWithout403(t *testing.T) {
	err := errors.New("label creation failed: server error")
	assert.False(t, isLabelPermissionError(err),
		"'label' mention without 403 should not match")
}

// --- isInsufficientIssuePermissionError unit tests ---

func TestIsInsufficientIssuePermissionError_EmptyString_Webhook(t *testing.T) {
	assert.False(t, isInsufficientIssuePermissionError(""))
}

func TestIsInsufficientIssuePermissionError_PAT(t *testing.T) {
	msg := `{"message":"Resource not accessible by personal access token","documentation_url":"..."}`
	assert.True(t, isInsufficientIssuePermissionError(msg))
}

func TestIsInsufficientIssuePermissionError_Insufficient(t *testing.T) {
	assert.True(t, isInsufficientIssuePermissionError("insufficient permission for this operation"))
}

func TestIsInsufficientIssuePermissionError_OtherError(t *testing.T) {
	assert.False(t, isInsufficientIssuePermissionError("not found"))
}

// --- pipelineLabels coverage ---

// TestPipelineLabels_KnownLabels verifies that the static pipelineLabels map
// contains the canonical AI-processing pipeline labels with non-empty status.
func TestPipelineLabels_KnownLabels(t *testing.T) {
	known := []string{
		"triage/accepted",
		"ai-processing",
		"ai-pr-draft",
		"ai-pr-ready",
		"ai-processing-complete",
	}
	for _, label := range known {
		entry, ok := pipelineLabels[label]
		assert.True(t, ok, "expected label %q in pipelineLabels", label)
		assert.NotEmpty(t, entry.status, "label %q should have a non-empty status", label)
		assert.NotEmpty(t, entry.message, "label %q should have a non-empty message", label)
	}
}

// TestPipelineLabels_UnknownLabel verifies that a label not in the map
// returns the zero value (not present).
func TestPipelineLabels_UnknownLabel(t *testing.T) {
	_, ok := pipelineLabels["does-not-exist"]
	assert.False(t, ok, "unknown label should not be in pipelineLabels")
}

// TestWebhook_DeploymentStatus_MissingDeployment verifies that a
// deployment_status event missing the deployment object is handled gracefully.
func TestWebhook_DeploymentStatus_MissingDeployment(t *testing.T) {
	app, _ := setupWebhookTest(t)

	payload := requireMarshalJSON(t, map[string]interface{}{
		"deployment_status": map[string]interface{}{
			"state":      "success",
			"target_url": "https://deploy-preview-123.netlify.app",
		},
		// "deployment" key intentionally absent
	})

	resp := sendWebhook(t, app, "deployment_status", payload)
	body := readBody(t, resp)

	// Should return 200 (nil return from handleDeploymentStatus)
	assert.Equal(t, http.StatusOK, resp.StatusCode, "missing deployment object should be handled gracefully: %s", body)
}

// TestWebhook_DeploymentStatus_NonSuccessState verifies that non-success
// deployment states are silently ignored.
func TestWebhook_DeploymentStatus_NonSuccessState(t *testing.T) {
	app, _ := setupWebhookTest(t)

	for _, state := range []string{"pending", "in_progress", "failure", "error"} {
		payload := requireMarshalJSON(t, map[string]interface{}{
			"deployment_status": map[string]interface{}{
				"state":      state,
				"target_url": "https://deploy-preview-123.netlify.app",
			},
			"deployment": map[string]interface{}{
				"ref": "pull/123/head",
			},
		})

		resp := sendWebhook(t, app, "deployment_status", payload)
		body := readBody(t, resp)
		assert.Equal(t, http.StatusOK, resp.StatusCode,
			"non-success state %q should return 200: %s", state, body)
	}
}

// --- extractLinkedIssueNumbers tests ---

func TestExtractLinkedIssueNumbers_FixesPattern(t *testing.T) {
	cases := []struct {
		body     string
		expected []int
	}{
		{"Fixes #123", []int{123}},
		{"closes #456", []int{456}},
		{"Resolves #789", []int{789}},
		{"Fix #100 and closes #200", []int{100, 200}},
		{"fixes org/repo#300", []int{300}},
		{"no issue references here", nil},
		{"Fixes #0", nil}, // issue number 0 is invalid
	}

	for _, tc := range cases {
		got := extractLinkedIssueNumbers(tc.body)
		if len(tc.expected) == 0 {
			assert.Empty(t, got, "body %q: expected no issue numbers", tc.body)
		} else {
			assert.Equal(t, tc.expected, got, "body %q", tc.body)
		}
	}
}

func TestExtractLinkedIssueNumbers_NoDuplicates(t *testing.T) {
	body := "Fixes #42\nCloses #42\nResolves #42"
	got := extractLinkedIssueNumbers(body)
	assert.Equal(t, []int{42}, got, "duplicate issue numbers should be deduplicated")
}
