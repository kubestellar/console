// Package notifications — webhook notifier (#6633).
//
// Implements a generic JSON webhook notifier for the NotificationTypeWebhook
// channel type, which was previously declared in types.go but had no
// corresponding implementation. POSTs a compact JSON payload with the alert
// details to a configured URL.
package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	// webhookHTTPTimeout bounds the outbound HTTP call so a slow endpoint
	// cannot block the alert pipeline.
	webhookHTTPTimeout = 10 * time.Second
	// webhookAllowedHostsEnv names the env var used for a comma-separated
	// host allowlist. Empty (default) = no restriction (backwards compatible).
	// Operators can set this to a small list like "alerts.example.com" to
	// mitigate SSRF against internal endpoints (same pattern as #6416).
	webhookAllowedHostsEnv = "KC_WEBHOOK_ALLOWED_HOSTS"
)

// WebhookNotifier POSTs a JSON alert payload to a configured URL.
type WebhookNotifier struct {
	URL        string
	HTTPClient *http.Client
}

// webhookPayload is the JSON body sent on each alert.
type webhookPayload struct {
	Alert     string    `json:"alert"`
	Severity  string    `json:"severity"`
	Status    string    `json:"status"`
	Cluster   string    `json:"cluster,omitempty"`
	Namespace string    `json:"namespace,omitempty"`
	Resource  string    `json:"resource,omitempty"`
	Message   string    `json:"message,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	RuleID    string    `json:"ruleId,omitempty"`
	ID        string    `json:"id,omitempty"`
}

// NewWebhookNotifier validates the URL and returns a ready-to-use notifier.
// Fails fast on malformed URLs and on hosts outside the (optional) allowlist.
func NewWebhookNotifier(webhookURL string) (*WebhookNotifier, error) {
	if webhookURL == "" {
		return nil, fmt.Errorf("webhook URL is required")
	}
	u, err := url.Parse(webhookURL)
	if err != nil {
		return nil, fmt.Errorf("invalid webhook URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("webhook URL must be http or https")
	}
	if u.Host == "" {
		return nil, fmt.Errorf("webhook URL must have a host")
	}
	// #8392: reject plaintext http by default. Allow it only when the host
	// is a loopback address so local development and in-cluster testing
	// against sidecar receivers still work without TLS.
	if u.Scheme == "http" && !isLoopbackHost(u.Hostname()) {
		return nil, fmt.Errorf("webhook URL must use https (plaintext http allowed only for loopback hosts)")
	}
	if err := checkWebhookHostAllowed(u.Hostname()); err != nil {
		return nil, err
	}
	return &WebhookNotifier{
		URL: webhookURL,
		HTTPClient: &http.Client{
			Timeout: webhookHTTPTimeout,
			// #6675 Copilot followup: re-check the allowlist on every
			// redirect hop. Without this a permitted host could 30x to
			// an internal endpoint and the request would still be sent.
			CheckRedirect: func(req *http.Request, _ []*http.Request) error {
				return checkWebhookHostAllowed(req.URL.Hostname())
			},
		},
	}, nil
}

// isLoopbackHost returns true if host is a recognized loopback hostname or
// address. Used to carve out an exception to the HTTPS-only webhook rule for
// local development and in-cluster sidecar receivers (#8392).
func isLoopbackHost(host string) bool {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	if host == "" {
		return false
	}

	if strings.EqualFold(host, "localhost") || strings.EqualFold(host, "localhost.localdomain") {
		return true
	}

	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() {
		return true
	}

	if ipv4 := ip.To4(); ipv4 != nil {
		return ipv4[0] == 127
	}

	return false
}

// checkWebhookHostAllowed enforces the optional KC_WEBHOOK_ALLOWED_HOSTS
// env allowlist. Empty env = allow all (default). This keeps the change
// backwards compatible while giving operators a simple knob to block SSRF.
func checkWebhookHostAllowed(host string) error {
	raw := os.Getenv(webhookAllowedHostsEnv)
	if raw == "" {
		return nil
	}
	for _, allowed := range strings.Split(raw, ",") {
		allowed = strings.TrimSpace(allowed)
		if allowed == "" {
			continue
		}
		if strings.EqualFold(allowed, host) {
			return nil
		}
	}
	return fmt.Errorf("webhook host %q not in %s allowlist", host, webhookAllowedHostsEnv)
}

// Send POSTs the alert as JSON to the configured webhook URL.
func (w *WebhookNotifier) Send(alert Alert) error {
	if w == nil {
		return fmt.Errorf("nil webhook notifier")
	}
	payload := webhookPayload{
		Alert:     alert.RuleName,
		Severity:  string(alert.Severity),
		Status:    alert.Status,
		Cluster:   alert.Cluster,
		Namespace: alert.Namespace,
		Resource:  alert.Resource,
		Message:   alert.Message,
		Timestamp: alert.FiredAt,
		RuleID:    alert.RuleID,
		ID:        alert.ID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal webhook payload: %w", err)
	}

	req, err := http.NewRequest("POST", w.URL, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create webhook request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "KubeStellar-Console-Webhook/1.0")

	if w.HTTPClient == nil {
		return fmt.Errorf("webhook notifier HTTP client is not initialized")
	}
	resp, err := w.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send webhook: %w", err)
	}
	defer func() {
		// Drain body so the underlying TCP connection can be reused.
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()

	// Accept any 2xx response. Many webhook receivers return 200/202/204.
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook endpoint returned status %d", resp.StatusCode)
	}
	return nil
}

// Test sends a synthetic alert to verify configuration.
func (w *WebhookNotifier) Test() error {
	return w.Send(Alert{
		ID:       "test-alert",
		RuleID:   "test-rule",
		RuleName: "KubeStellar Console Test Alert",
		Severity: SeverityInfo,
		Status:   "test",
		Message:  "This is a test notification from KubeStellar Console",
		FiredAt:  time.Now(),
	})
}
