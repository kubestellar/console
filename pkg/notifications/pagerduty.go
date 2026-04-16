package notifications

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	pagerdutyEventsURL  = "https://events.pagerduty.com/v2/enqueue"
	pagerdutyHTTPTimeout = 10 * time.Second
	// dedupHashHexLen truncates the SHA-256 hex digest used as a fallback
	// dedup key when ID, RuleID, and Cluster are all empty. 16 hex chars = 64
	// bits of entropy, plenty to avoid accidental collisions between distinct
	// alerts while keeping the key short in PagerDuty / OpsGenie UIs (#8389, #8390).
	dedupHashHexLen = 16
)

// PagerDutyNotifier handles PagerDuty Events API v2 notifications
type PagerDutyNotifier struct {
	RoutingKey string
	HTTPClient *http.Client
}

// NewPagerDutyNotifier creates a new PagerDuty notifier
func NewPagerDutyNotifier(routingKey string) *PagerDutyNotifier {
	return &PagerDutyNotifier{
		RoutingKey: routingKey,
		HTTPClient: &http.Client{Timeout: pagerdutyHTTPTimeout},
	}
}

// pagerdutyEvent represents a PagerDuty Events API v2 payload
type pagerdutyEvent struct {
	RoutingKey  string              `json:"routing_key"`
	EventAction string              `json:"event_action"`
	DedupKey    string              `json:"dedup_key"`
	Payload     *pagerdutyPayload   `json:"payload,omitempty"`
}

type pagerdutyPayload struct {
	Summary       string                 `json:"summary"`
	Severity      string                 `json:"severity"`
	Source        string                 `json:"source"`
	Component     string                 `json:"component,omitempty"`
	Group         string                 `json:"group,omitempty"`
	Class         string                 `json:"class,omitempty"`
	CustomDetails map[string]interface{} `json:"custom_details,omitempty"`
	Timestamp     string                 `json:"timestamp,omitempty"`
}

// Send sends an alert notification to PagerDuty
func (p *PagerDutyNotifier) Send(alert Alert) error {
	if p.RoutingKey == "" {
		return fmt.Errorf("pagerduty routing key not configured")
	}

	// Build a dedup key that includes the alert ID when RuleID or Cluster
	// is empty, preventing unrelated alerts from colliding (#7378).
	dedupKey := alert.RuleID + "::" + alert.Cluster
	if alert.RuleID == "" || alert.Cluster == "" {
		dedupKey = alert.ID + "::" + alert.RuleID + "::" + alert.Cluster
	}
	// #8389: if ID, RuleID, and Cluster are ALL empty the key degenerates to
	// "::::", a constant that would collapse every such alert into a single
	// PagerDuty incident. Fall back to a stable hash of the alert message +
	// fired timestamp so identical alerts fired very close together still
	// dedupe, but distinct alerts get distinct keys.
	if alert.ID == "" && alert.RuleID == "" && alert.Cluster == "" {
		dedupKey = fallbackDedupKey(alert)
	}

	event := pagerdutyEvent{
		RoutingKey: p.RoutingKey,
		DedupKey:   dedupKey,
	}

	if alert.Status == "resolved" {
		event.EventAction = "resolve"
	} else {
		event.EventAction = "trigger"
		event.Payload = &pagerdutyPayload{
			Summary:   fmt.Sprintf("[%s] %s — %s", alert.Severity, alert.RuleName, alert.Message),
			Severity:  p.mapSeverity(alert.Severity),
			Source:    alert.Cluster,
			Component: alert.Resource,
			Group:     alert.Namespace,
			Class:     alert.ResourceKind,
			CustomDetails: alert.Details,
			Timestamp: alert.FiredAt.Format(time.RFC3339),
		}
	}

	return p.sendEvent(event)
}

// Test sends a test notification to verify configuration
func (p *PagerDutyNotifier) Test() error {
	testDedupKey := "kubestellar-console-test-" + fmt.Sprintf("%d", time.Now().UnixMilli())

	// Trigger a test event
	triggerEvent := pagerdutyEvent{
		RoutingKey:  p.RoutingKey,
		EventAction: "trigger",
		DedupKey:    testDedupKey,
		Payload: &pagerdutyPayload{
			Summary:  "KubeStellar Console — test notification",
			Severity: "info",
			Source:   "kubestellar-console",
		},
	}

	if err := p.sendEvent(triggerEvent); err != nil {
		return err
	}

	// Immediately resolve it
	resolveEvent := pagerdutyEvent{
		RoutingKey:  p.RoutingKey,
		EventAction: "resolve",
		DedupKey:    testDedupKey,
	}

	return p.sendEvent(resolveEvent)
}

func (p *PagerDutyNotifier) sendEvent(event pagerdutyEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal pagerduty event: %w", err)
	}

	req, err := http.NewRequest("POST", pagerdutyEventsURL, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create pagerduty request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := p.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send pagerduty notification: %w", err)
	}
	defer func() {
		// Drain the body so the underlying TCP connection can be reused.
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("pagerduty API returned status %d", resp.StatusCode)
	}

	return nil
}

// fallbackDedupKey returns a stable short hash used as the dedup key when all
// three identity fields on the alert (ID, RuleID, Cluster) are empty. Without
// this, PagerDuty (#8389) and OpsGenie (#8390) would collapse unrelated alerts
// into a single incident because the composed key degenerates to a constant
// ("::::"). The hash covers Message + FiredAt timestamp so identical alerts
// fired at the same instant still dedupe, but distinct alerts get distinct
// keys. Truncated to dedupHashHexLen hex chars (64 bits) — collision-safe for
// this use case.
func fallbackDedupKey(alert Alert) string {
	h := sha256.Sum256([]byte(alert.Message + "::" + alert.FiredAt.String()))
	return "fallback-" + hex.EncodeToString(h[:])[:dedupHashHexLen]
}

// mapSeverity maps console severity to PagerDuty severity
func (p *PagerDutyNotifier) mapSeverity(severity AlertSeverity) string {
	switch severity {
	case SeverityCritical:
		return "critical"
	case SeverityWarning:
		return "warning"
	case SeverityInfo:
		return "info"
	default:
		return "info"
	}
}
