package audit

// SIEM Export — Issue #9643 / #9887
//
// Exports Kubernetes audit events to SIEM destinations:
// Splunk HEC, Elastic SIEM, generic Webhook, and RFC 5424 Syslog.
//
// This file currently ships the Webhook destination as the first concrete
// adapter. Splunk, Elastic, and Syslog remain stubs that return a structured
// "destination not yet supported" error (tracked by #9643) rather than
// silently pretending the send succeeded.
//
// TODO (#9643): Remaining work for the full export engine —
//   - Kubernetes API server audit webhook backend
//   - Splunk HEC, Elastic bulk, and RFC 5424 Syslog adapters
//   - Configurable event filters and batch sizes via ConfigMap
//   - Per-destination TLS client certificate management
//   - Circuit breaker and retry with exponential back-off for degraded destinations
//   - Prometheus metrics: events_exported_total, export_errors_total, export_lag_seconds

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// DestinationProvider identifies the SIEM platform type.
type DestinationProvider string

const (
	ProviderSplunk  DestinationProvider = "splunk"
	ProviderElastic DestinationProvider = "elastic"
	ProviderWebhook DestinationProvider = "webhook"
	ProviderSyslog  DestinationProvider = "syslog"
)

// DestinationStatus represents the health of a SIEM export pipeline.
type DestinationStatus string

const (
	StatusActive   DestinationStatus = "active"
	StatusDegraded DestinationStatus = "degraded"
	StatusDown     DestinationStatus = "down"
	StatusDisabled DestinationStatus = "disabled"
)

// ExportDestination configures and tracks a single SIEM output target.
type ExportDestination struct {
	ID              string              `json:"id"`
	Name            string              `json:"name"`
	Provider        DestinationProvider `json:"provider"`
	Endpoint        string              `json:"endpoint"`
	Status          DestinationStatus   `json:"status"`
	EventsPerMinute int                 `json:"events_per_minute"`
	TotalEvents     int64               `json:"total_events"`
	LastEventAt     *time.Time          `json:"last_event_at"`
	ErrorCount      int                 `json:"error_count"`
	LastError       *string             `json:"last_error"`
	Filters         []string            `json:"filters"`
	TLSEnabled      bool                `json:"tls_enabled"`
	BatchSize       int                 `json:"batch_size"`
}

// PipelineEvent represents an audit event routed through the export pipeline.
type PipelineEvent struct {
	ID               string    `json:"id"`
	Cluster          string    `json:"cluster"`
	EventType        string    `json:"event_type"`
	Resource         string    `json:"resource"`
	User             string    `json:"user"`
	Timestamp        time.Time `json:"timestamp"`
	DestinationCount int       `json:"destination_count"`
}

// ExportSummary aggregates SIEM export pipeline health metrics.
type ExportSummary struct {
	TotalDestinations  int       `json:"total_destinations"`
	ActiveDestinations int       `json:"active_destinations"`
	EventsPerMinute    int       `json:"events_per_minute"`
	TotalEvents24h     int64     `json:"total_events_24h"`
	ErrorRate          float64   `json:"error_rate"`
	EvaluatedAt        time.Time `json:"evaluated_at"`
}

// -----------------------------------------------------------------------------
// Destination adapter interface + Webhook implementation (#9887)
// -----------------------------------------------------------------------------

// ErrDestinationUnsupported is returned by stub adapters for providers that do
// not yet have a live implementation. Tracked by issue #9643.
var ErrDestinationUnsupported = errors.New("destination not yet supported")

// Destination is the pluggable adapter contract for a SIEM target. Send must
// be safe to call concurrently and must honour ctx cancellation.
type Destination interface {
	Send(ctx context.Context, events []PipelineEvent) error
	Provider() DestinationProvider
}

// siemWebhookTimeout bounds every outbound Webhook POST. Chosen to cover the
// worst-case batch upload without tying up callers if the SIEM is degraded.
const siemWebhookTimeout = 30 * time.Second

// webhookPayloadVersion tags the JSON envelope so receivers can evolve the
// shape without breaking older integrations.
const webhookPayloadVersion = 1

// WebhookDestination POSTs batches of audit events as JSON to a configurable
// URL. It is the first concrete adapter for #9643; see ErrDestinationUnsupported
// for the other providers.
type WebhookDestination struct {
	url    string
	client *http.Client
}

// WebhookPayload is the JSON envelope POSTed to the webhook URL. Receivers can
// key on Version to evolve the shape safely.
type WebhookPayload struct {
	Version int             `json:"version"`
	SentAt  time.Time       `json:"sent_at"`
	Events  []PipelineEvent `json:"events"`
}

// NewWebhookDestination builds a WebhookDestination. The URL must be non-empty;
// an optional *http.Client may be supplied (primarily for tests) — when nil a
// default client with siemWebhookTimeout is created.
func NewWebhookDestination(url string, client *http.Client) (*WebhookDestination, error) {
	if url == "" {
		return nil, errors.New("webhook destination: url is required")
	}
	if client == nil {
		client = &http.Client{Timeout: siemWebhookTimeout}
	}
	return &WebhookDestination{url: url, client: client}, nil
}

// Provider identifies this adapter as a webhook destination.
func (w *WebhookDestination) Provider() DestinationProvider { return ProviderWebhook }

// Send POSTs a JSON envelope containing the events to the configured URL. A
// non-2xx response is treated as a delivery error so the caller can retry.
func (w *WebhookDestination) Send(ctx context.Context, events []PipelineEvent) error {
	if len(events) == 0 {
		return nil
	}
	body, err := json.Marshal(WebhookPayload{
		Version: webhookPayloadVersion,
		SentAt:  time.Now().UTC(),
		Events:  events,
	})
	if err != nil {
		return fmt.Errorf("webhook destination: encode payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("webhook destination: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "kubestellar-console-siem/1")

	resp, err := w.client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook destination: POST %s: %w", w.url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("webhook destination: POST %s returned status %d", w.url, resp.StatusCode)
	}
	return nil
}

// stubDestination represents an adapter that is not yet implemented. It always
// returns ErrDestinationUnsupported rather than silently dropping events.
// TODO (#9643): Replace with real Splunk / Elastic / Syslog adapters.
type stubDestination struct{ provider DestinationProvider }

// Provider returns the SIEM provider this stub represents.
func (s stubDestination) Provider() DestinationProvider { return s.provider }

// Send always fails with ErrDestinationUnsupported wrapped with the provider.
func (s stubDestination) Send(_ context.Context, _ []PipelineEvent) error {
	return fmt.Errorf("%s: %w", s.provider, ErrDestinationUnsupported)
}

// -----------------------------------------------------------------------------
// Destination registry + in-memory event buffer
// -----------------------------------------------------------------------------

// maxBufferedEvents caps the in-memory ring buffer used to aggregate the
// /api/siem/summary metrics while the full pipeline is still being built
// (#9643). Kept small on purpose — this is not a durable queue.
const maxBufferedEvents = 256

// registry holds the currently-configured destinations plus the in-memory
// event buffer. A package-level singleton keeps the wiring simple until the
// full pipeline lands (#9643).
type registry struct {
	mu           sync.RWMutex
	destinations []ExportDestination
	adapters     map[string]Destination // keyed by ExportDestination.ID
	buffer       []PipelineEvent
}

var defaultRegistry = &registry{adapters: map[string]Destination{}}

// DestinationConfig is the minimal user-supplied shape for configuring a
// destination. Richer fields (filters, TLS, batch size) live on
// ExportDestination itself once the full UI lands.
type DestinationConfig struct {
	ID       string              `json:"id"`
	Name     string              `json:"name"`
	Provider DestinationProvider `json:"provider"`
	URL      string              `json:"url"`
}

// RegisterDestination wires a configured destination into the registry. For
// ProviderWebhook it builds a live WebhookDestination; other providers get a
// stubDestination that returns ErrDestinationUnsupported. Returns an error if
// the config is invalid.
func RegisterDestination(cfg DestinationConfig) (Destination, error) {
	if cfg.ID == "" {
		return nil, errors.New("destination config: id is required")
	}
	var (
		adapter Destination
		err     error
	)
	switch cfg.Provider {
	case ProviderWebhook:
		adapter, err = NewWebhookDestination(cfg.URL, nil)
		if err != nil {
			return nil, err
		}
	case ProviderSplunk, ProviderElastic, ProviderSyslog:
		// TODO (#9643): real adapters for these providers.
		adapter = stubDestination{provider: cfg.Provider}
	default:
		return nil, fmt.Errorf("destination config: unknown provider %q", cfg.Provider)
	}

	defaultRegistry.mu.Lock()
	defer defaultRegistry.mu.Unlock()
	defaultRegistry.destinations = append(defaultRegistry.destinations, ExportDestination{
		ID:       cfg.ID,
		Name:     cfg.Name,
		Provider: cfg.Provider,
		Endpoint: cfg.URL,
		Status:   StatusActive,
	})
	defaultRegistry.adapters[cfg.ID] = adapter
	return adapter, nil
}

// ListDestinations returns a snapshot of the currently-configured destinations.
func ListDestinations() []ExportDestination {
	defaultRegistry.mu.RLock()
	defer defaultRegistry.mu.RUnlock()
	out := make([]ExportDestination, len(defaultRegistry.destinations))
	copy(out, defaultRegistry.destinations)
	return out
}

// RecordEvent pushes an event into the in-memory ring buffer used by the
// summary aggregator. Overflow drops the oldest entry — this is best-effort
// telemetry until the durable pipeline in #9643 is ready.
func RecordEvent(evt PipelineEvent) {
	defaultRegistry.mu.Lock()
	defer defaultRegistry.mu.Unlock()
	defaultRegistry.buffer = append(defaultRegistry.buffer, evt)
	if len(defaultRegistry.buffer) > maxBufferedEvents {
		// Drop oldest entries to keep the buffer bounded.
		overflow := len(defaultRegistry.buffer) - maxBufferedEvents
		defaultRegistry.buffer = defaultRegistry.buffer[overflow:]
	}
}

// RecentEvents returns a snapshot of the in-memory event buffer (newest last).
func RecentEvents() []PipelineEvent {
	defaultRegistry.mu.RLock()
	defer defaultRegistry.mu.RUnlock()
	out := make([]PipelineEvent, len(defaultRegistry.buffer))
	copy(out, defaultRegistry.buffer)
	return out
}

// summaryWindow24h is the rolling window used to compute the 24h event count
// shown on the SIEM summary card.
const summaryWindow24h = 24 * time.Hour

// summaryRateWindow is the trailing window used to estimate EventsPerMinute.
const summaryRateWindow = time.Minute

// BuildSummary aggregates counts from the in-memory buffer and registered
// destinations. This replaces the hard-coded demo numbers returned by the
// handler while the full live pipeline is still being built (#9643).
func BuildSummary(now time.Time) ExportSummary {
	defaultRegistry.mu.RLock()
	defer defaultRegistry.mu.RUnlock()

	active := 0
	for _, d := range defaultRegistry.destinations {
		if d.Status == StatusActive {
			active++
		}
	}

	var events24h int64
	var eventsLastMinute int
	cutoff24h := now.Add(-summaryWindow24h)
	cutoff1m := now.Add(-summaryRateWindow)
	for _, e := range defaultRegistry.buffer {
		if e.Timestamp.After(cutoff24h) {
			events24h++
		}
		if e.Timestamp.After(cutoff1m) {
			eventsLastMinute++
		}
	}

	return ExportSummary{
		TotalDestinations:  len(defaultRegistry.destinations),
		ActiveDestinations: active,
		EventsPerMinute:    eventsLastMinute,
		TotalEvents24h:     events24h,
		ErrorRate:          0,
		EvaluatedAt:        now,
	}
}

// ResetForTest clears the registry. Exported only for use by tests in other
// packages; production code has no reason to call it.
func ResetForTest() {
	defaultRegistry.mu.Lock()
	defer defaultRegistry.mu.Unlock()
	defaultRegistry.destinations = nil
	defaultRegistry.adapters = map[string]Destination{}
	defaultRegistry.buffer = nil
}
