package audit

// Splunk HEC destination adapter — Issue #9887 / #9643.
//
// Follow-up to #9907. Posts batches of PipelineEvents to a Splunk HTTP Event
// Collector endpoint. Production hardening (retries, TLS pinning, batch
// compression, token rotation) is deferred to the full export engine (#9643).

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// splunkTimeout bounds every outbound Splunk HEC POST. Chosen to cover the
// worst-case batch upload without tying up callers if the SIEM is degraded.
const splunkTimeout = 10 * time.Second

// splunkHECPath is the HEC event endpoint appended to the configured base URL
// when the caller supplies only the host portion.
const splunkHECPath = "/services/collector/event"

// splunkAuthPrefix is the Authorization header scheme used by Splunk HEC.
const splunkAuthPrefix = "Splunk "

// SplunkDestination POSTs events to a Splunk HTTP Event Collector. Send is safe
// for concurrent use.
type SplunkDestination struct {
	url    string
	token  string
	client *http.Client
}

// splunkEvent is the per-event envelope accepted by Splunk HEC. Splunk keys the
// payload on "event" and ignores unknown fields on ingest.
type splunkEvent struct {
	Time       int64         `json:"time"`
	Source     string        `json:"source"`
	Sourcetype string        `json:"sourcetype"`
	Event      PipelineEvent `json:"event"`
}

// splunkSource tags every event with its origin so operators can filter on it
// in Splunk searches.
const splunkSource = "kubestellar-console"

// splunkSourcetype advertises the payload shape so Splunk can apply the right
// field extractions.
const splunkSourcetype = "kubestellar:audit"

// NewSplunkDestination builds a SplunkDestination. Both url and token are
// required; an optional *http.Client may be supplied (primarily for tests) —
// when nil a default client with splunkTimeout is created.
//
// When either url or token is empty the adapter is considered unconfigured and
// Send will return ErrDestinationUnsupported with a clear reason, matching the
// stubDestination contract from #9907.
func NewSplunkDestination(url, token string, client *http.Client) (*SplunkDestination, error) {
	if url == "" {
		return nil, errors.New("splunk destination: url is required")
	}
	if token == "" {
		return nil, errors.New("splunk destination: token is required (HEC config)")
	}
	if client == nil {
		client = &http.Client{Timeout: splunkTimeout}
	}
	// Allow callers to pass either the host or the full HEC path. Appending
	// splunkHECPath when missing keeps configuration simple.
	if !strings.Contains(url, "/services/collector") {
		url = strings.TrimRight(url, "/") + splunkHECPath
	}
	return &SplunkDestination{url: url, token: token, client: client}, nil
}

// Provider identifies this adapter as a Splunk destination.
func (s *SplunkDestination) Provider() DestinationProvider { return ProviderSplunk }

// Send POSTs one HEC event per PipelineEvent, concatenated as newline-delimited
// JSON which is the form Splunk HEC accepts for batched sends.
func (s *SplunkDestination) Send(ctx context.Context, events []PipelineEvent) error {
	if len(events) == 0 {
		return nil
	}
	if s.token == "" || s.url == "" {
		return fmt.Errorf("splunk: %w (requires HEC config: url + token)", ErrDestinationUnsupported)
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for _, evt := range events {
		if err := enc.Encode(splunkEvent{
			Time:       evt.Timestamp.Unix(),
			Source:     splunkSource,
			Sourcetype: splunkSourcetype,
			Event:      evt,
		}); err != nil {
			return fmt.Errorf("splunk destination: encode event %s: %w", evt.ID, err)
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, &buf)
	if err != nil {
		return fmt.Errorf("splunk destination: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", splunkAuthPrefix+s.token)
	req.Header.Set("User-Agent", "kubestellar-console-siem/1")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("splunk destination: POST %s: %w", s.url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("splunk destination: POST %s returned status %d", s.url, resp.StatusCode)
	}
	return nil
}
