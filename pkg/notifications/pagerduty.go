package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	pagerdutyEventsURL  = "https://events.pagerduty.com/v2/enqueue"
	pagerdutyHTTPTimeout = 10 * time.Second
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

	dedupKey := alert.RuleID + "::" + alert.Cluster

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
