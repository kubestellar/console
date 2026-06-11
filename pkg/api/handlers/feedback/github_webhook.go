package feedback

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"

	"github.com/gofiber/fiber/v2"
)

func (h *FeedbackHandler) HandleGitHubWebhook(c *fiber.Ctx) error {
	// Reject webhooks if no secret is configured — signature verification is mandatory
	if h.webhookSecret == "" {
		slog.Info("[Webhook] Rejected: GITHUB_WEBHOOK_SECRET not configured")
		return fiber.NewError(fiber.StatusServiceUnavailable, "Webhook signature verification not configured")
	}

	// Reject oversized payloads early (defense-in-depth beyond Fiber's default limit)
	const webhookMaxBodyBytes = 1 << 20 // 1 MB
	if len(c.Body()) > webhookMaxBodyBytes {
		return fiber.NewError(fiber.StatusRequestEntityTooLarge, "Webhook payload too large")
	}

	signature := c.Get("X-Hub-Signature-256")
	if !h.verifyWebhookSignature(c.Body(), signature) {
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid webhook signature")
	}

	eventType := c.Get("X-GitHub-Event")
	var payload map[string]interface{}
	if err := json.Unmarshal(c.Body(), &payload); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid JSON payload")
	}

	switch eventType {
	case "issues":
		return h.handleIssueEvent(c.UserContext(), payload)
	case "pull_request":
		return h.handlePREvent(c.UserContext(), payload)
	case "deployment_status":
		return h.handleDeploymentStatus(c.UserContext(), payload)
	default:
		// Ignore other events
		return c.JSON(fiber.Map{"status": "ignored", "event": eventType})
	}
}

func (h *FeedbackHandler) verifyWebhookSignature(payload []byte, signature string) bool {
	if signature == "" || len(signature) < 7 {
		return false
	}

	mac := hmac.New(sha256.New, []byte(h.webhookSecret))
	mac.Write(payload)
	expectedSignature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}
