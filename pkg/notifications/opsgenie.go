package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	opsgenieAlertsURL   = "https://api.opsgenie.com/v2/alerts"
	opsgenieHTTPTimeout = 10 * time.Second
)

// OpsGenieNotifier handles OpsGenie Alert API notifications
type OpsGenieNotifier struct {
	APIKey     string
	HTTPClient *http.Client
}

// NewOpsGenieNotifier creates a new OpsGenie notifier
func NewOpsGenieNotifier(apiKey string) *OpsGenieNotifier {
	return &OpsGenieNotifier{
		APIKey:     apiKey,
		HTTPClient: &http.Client{Timeout: opsgenieHTTPTimeout},
	}
}

// opsgenieAlert represents an OpsGenie create alert payload
type opsgenieAlert struct {
	Message     string            `json:"message"`
	Alias       string            `json:"alias"`
	Description string            `json:"description,omitempty"`
	Priority    string            `json:"priority"`
	Tags        []string          `json:"tags,omitempty"`
	Details     map[string]string `json:"details,omitempty"`
	Entity      string            `json:"entity,omitempty"`
	Source      string            `json:"source"`
}

// Send sends an alert notification to OpsGenie
func (o *OpsGenieNotifier) Send(alert Alert) error {
	if o.APIKey == "" {
		return fmt.Errorf("opsgenie API key not configured")
	}

	// Build a dedup alias that includes the alert ID when RuleID or Cluster
	// is empty, preventing unrelated alerts from sharing the same alias and
	// causing incorrect deduplication or resolving the wrong incident (#7536).
	alias := alert.RuleID + "::" + alert.Cluster
	if alert.RuleID == "" || alert.Cluster == "" {
		alias = alert.ID + "::" + alert.RuleID + "::" + alert.Cluster
	}

	if alert.Status == "resolved" {
		return o.closeAlert(alias)
	}

	return o.createAlert(alert, alias)
}

func (o *OpsGenieNotifier) createAlert(alert Alert, alias string) error {
	// Truncate message to OpsGenie's 130 char limit
	message := alert.RuleName
	if len(message) > 130 {
		message = message[:127] + "..."
	}

	tags := []string{"kubestellar"}
	if alert.Cluster != "" {
		tags = append(tags, alert.Cluster)
	}
	if alert.Namespace != "" {
		tags = append(tags, alert.Namespace)
	}

	details := map[string]string{
		"severity":     string(alert.Severity),
		"status":       alert.Status,
		"cluster":      alert.Cluster,
		"namespace":    alert.Namespace,
		"resource":     alert.Resource,
		"resourceKind": alert.ResourceKind,
	}

	ogAlert := opsgenieAlert{
		Message:     message,
		Alias:       alias,
		Description: alert.Message,
		Priority:    o.mapPriority(alert.Severity),
		Tags:        tags,
		Details:     details,
		Entity:      alert.Resource,
		Source:      "KubeStellar Console",
	}

	payload, err := json.Marshal(ogAlert)
	if err != nil {
		return fmt.Errorf("failed to marshal opsgenie alert: %w", err)
	}

	req, err := http.NewRequest("POST", opsgenieAlertsURL, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create opsgenie request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "GenieKey "+o.APIKey)

	resp, err := o.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send opsgenie notification: %w", err)
	}
	defer func() {
		// Drain the body so the underlying TCP connection can be reused.
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("opsgenie API returned status %d", resp.StatusCode)
	}

	return nil
}

func (o *OpsGenieNotifier) closeAlert(alias string) error {
	// #6639: the alias is concatenated from user-controlled fields (rule ID
	// and cluster name) and may contain characters that are reserved in URL
	// paths (spaces, '/', '?', '#'). PathEscape avoids targeting the wrong
	// endpoint or producing a malformed request. Also reject obviously
	// hostile content (newlines / null bytes) that would corrupt the
	// outbound HTTP request.
	if strings.ContainsAny(alias, "\x00\n\r") {
		return fmt.Errorf("opsgenie alias contains invalid characters")
	}
	// url.PathEscape leaves '/' unencoded because the stdlib treats it as a
	// path separator. For a single path segment that must NOT span into a
	// new segment we also replace '/' ourselves — otherwise an alias like
	// "rule/1::cluster" would corrupt the URL path.
	escapedAlias := strings.ReplaceAll(url.PathEscape(alias), "/", "%2F")
	closeURL := fmt.Sprintf("%s/%s/close?identifierType=alias", opsgenieAlertsURL, escapedAlias)

	body := map[string]string{
		"source": "KubeStellar Console",
		"note":   "Alert resolved automatically",
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal opsgenie close: %w", err)
	}

	req, err := http.NewRequest("POST", closeURL, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create opsgenie close request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "GenieKey "+o.APIKey)

	resp, err := o.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send opsgenie close: %w", err)
	}
	defer func() {
		// Drain the body so the underlying TCP connection can be reused.
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("opsgenie close API returned status %d", resp.StatusCode)
	}

	return nil
}

// Test sends a test notification to verify configuration
func (o *OpsGenieNotifier) Test() error {
	testAlias := "kubestellar-console-test-" + fmt.Sprintf("%d", time.Now().UnixMilli())

	testAlert := Alert{
		ID:       "test-alert",
		RuleID:   "test-rule",
		RuleName: "KubeStellar Console Test Alert",
		Severity: SeverityInfo,
		Status:   "test",
		Message:  "This is a test notification from KubeStellar Console",
		FiredAt:  time.Now(),
	}

	if err := o.createAlert(testAlert, testAlias); err != nil {
		return err
	}

	return o.closeAlert(testAlias)
}

// mapPriority maps console severity to OpsGenie priority
func (o *OpsGenieNotifier) mapPriority(severity AlertSeverity) string {
	switch severity {
	case SeverityCritical:
		return "P1"
	case SeverityWarning:
		return "P3"
	case SeverityInfo:
		return "P5"
	default:
		return "P5"
	}
}
