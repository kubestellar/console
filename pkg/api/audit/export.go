package audit

// SIEM Export — Issue #9643
//
// Exports Kubernetes audit events to SIEM destinations:
// Splunk HEC, Elastic SIEM, generic Webhook, and RFC 5424 Syslog.
//
// TODO (#9643): Full implementation — integrate with:
//   - Kubernetes API server audit webhook backend
//   - Pluggable destination adapters (Splunk, Elastic, Webhook, Syslog)
//   - Configurable event filters and batch sizes via ConfigMap
//   - Per-destination TLS client certificate management
//   - Circuit breaker and retry with exponential back-off for degraded destinations
//   - Prometheus metrics: events_exported_total, export_errors_total, export_lag_seconds

import "time"

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
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Provider         DestinationProvider `json:"provider"`
	Endpoint         string            `json:"endpoint"`
	Status           DestinationStatus `json:"status"`
	EventsPerMinute  int               `json:"events_per_minute"`
	TotalEvents      int64             `json:"total_events"`
	LastEventAt      *time.Time        `json:"last_event_at"`
	ErrorCount       int               `json:"error_count"`
	LastError        *string           `json:"last_error"`
	Filters          []string          `json:"filters"`
	TLSEnabled       bool              `json:"tls_enabled"`
	BatchSize        int               `json:"batch_size"`
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
