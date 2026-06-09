package handlers

import (
	"bytes"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- verifyWebhookSignature unit tests (direct function, no HTTP) ---

func TestVerifyWebhookSignature_ValidSignature(t *testing.T) {
	handler := &FeedbackHandler{webhookSecret: testWebhookSecret}
	payload := []byte(`{"action":"opened"}`)
	sig := signWebhookPayload(payload, testWebhookSecret)

	assert.True(t, handler.verifyWebhookSignature(payload, sig))
}

func TestVerifyWebhookSignature_EmptySignature(t *testing.T) {
	handler := &FeedbackHandler{webhookSecret: testWebhookSecret}
	assert.False(t, handler.verifyWebhookSignature([]byte(`{}`), ""))
}

func TestVerifyWebhookSignature_TooShortSignature(t *testing.T) {
	handler := &FeedbackHandler{webhookSecret: testWebhookSecret}
	assert.False(t, handler.verifyWebhookSignature([]byte(`{}`), "sha2"))
}

func TestVerifyWebhookSignature_WrongSecret(t *testing.T) {
	handler := &FeedbackHandler{webhookSecret: testWebhookSecret}
	payload := []byte(`{"action":"opened"}`)
	sig := signWebhookPayload(payload, "wrong-secret")

	assert.False(t, handler.verifyWebhookSignature(payload, sig))
}

func TestVerifyWebhookSignature_TamperedPayload(t *testing.T) {
	handler := &FeedbackHandler{webhookSecret: testWebhookSecret}
	payload := []byte(`{"action":"opened"}`)
	sig := signWebhookPayload(payload, testWebhookSecret)

	tampered := []byte(`{"action":"opened","injected":true}`)
	assert.False(t, handler.verifyWebhookSignature(tampered, sig))
}

// --- HandleGitHubWebhook additional integration tests ---

func TestWebhook_NoSecretConfigured_Returns503(t *testing.T) {
	// Handler with empty webhook secret should reject all webhooks
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	handler := NewFeedbackHandler(stubStore, FeedbackConfig{
		WebhookSecret: "", // not configured
	})
	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	payload := []byte(`{"action":"opened"}`)
	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestWebhook_UnknownEventType_Returns200Ignored(t *testing.T) {
	app, _ := setupWebhookTest(t)

	payload := requireMarshalJSON(t, map[string]interface{}{
		"action":    "completed",
		"check_run": map[string]interface{}{},
	})

	resp := sendWebhook(t, app, "check_run", payload)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readBody(t, resp)
	assert.Contains(t, body, "ignored")
}

func TestWebhook_OversizedPayload_Returns413(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// Create payload > 1 MB (the webhook limit)
	bigPayload := make([]byte, (1<<20)+1)
	for i := range bigPayload {
		bigPayload[i] = 'A'
	}
	sig := signWebhookPayload(bigPayload, testWebhookSecret)

	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(bigPayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Hub-Signature-256", sig)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
}

func TestWebhook_ExactlyMaxPayload_NotRejectedBySize(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// Exactly 1 MB should NOT be rejected by the size check
	payload := []byte(`{"action":"ping"}`)
	padding := make([]byte, (1<<20)-len(payload))
	for i := range padding {
		padding[i] = ' '
	}
	fullPayload := append(payload[:len(payload)-1], padding...)
	fullPayload = append(fullPayload, '}')

	sig := signWebhookPayload(fullPayload, testWebhookSecret)

	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(fullPayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Hub-Signature-256", sig)
	req.Header.Set("X-GitHub-Event", "ping")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.NotEqual(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
}

func TestWebhook_MissingSignatureHeader_Returns401(t *testing.T) {
	app, _ := setupWebhookTest(t)

	payload := []byte(`{"action":"opened"}`)
	req, err := http.NewRequest(http.MethodPost, "/webhook", strings.NewReader(string(payload)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	// Deliberately omit X-Hub-Signature-256

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestWebhook_DeploymentStatusEvent_MissingFields_ReturnsOK(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// deployment_status event with minimal payload
	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "created",
	})

	resp := sendWebhook(t, app, "deployment_status", payload)
	defer resp.Body.Close()

	// handleDeploymentStatus should handle gracefully without crashing
	// (returns nil or error based on implementation)
	assert.Contains(t, []int{http.StatusOK, http.StatusBadRequest}, resp.StatusCode)
}
