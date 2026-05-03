package audit

// Elasticsearch _bulk destination adapter — Issue #9887 / #9643.
//
// Follow-up to #9907. Streams PipelineEvents to an Elasticsearch cluster using
// the _bulk NDJSON API. Production hardening (index templates, ILM policies,
// auth via API keys or basic, request compression) is deferred to the full
// export engine (#9643).

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

// elasticBulkTimeout bounds every outbound _bulk POST. Bulk requests are
// generally slower than single-event sends so the timeout is a bit more
// generous than the Splunk adapter.
const elasticBulkTimeout = 15 * time.Second

// elasticBulkPath is the Elasticsearch bulk ingest endpoint appended to the
// configured base URL when only the host portion is supplied.
const elasticBulkPath = "/_bulk"

// elasticDefaultIndex is the index PipelineEvents are written to unless a
// caller supplies a different one. Using a stable name keeps the adapter
// trivially operable in a brand-new cluster.
const elasticDefaultIndex = "kubestellar-audit"

// ElasticDestination POSTs events to an Elasticsearch cluster _bulk endpoint
// as newline-delimited JSON. Send is safe for concurrent use.
type ElasticDestination struct {
	url    string
	index  string
	client *http.Client
}

// elasticBulkAction is the action-metadata line that precedes each document in
// the _bulk NDJSON stream. Only the "index" action is used — it is idempotent
// on doc _id and matches the append-only audit model.
type elasticBulkAction struct {
	Index elasticBulkIndexMeta `json:"index"`
}

// elasticBulkIndexMeta names the target index and document id for each line.
type elasticBulkIndexMeta struct {
	Index string `json:"_index"`
	ID    string `json:"_id,omitempty"`
}

// NewElasticDestination builds an ElasticDestination. The url is required; the
// index is optional and defaults to elasticDefaultIndex. An optional
// *http.Client may be supplied (primarily for tests) — when nil a default
// client with elasticBulkTimeout is created.
//
// When url is empty the adapter is considered unconfigured and Send will
// return ErrDestinationUnsupported with a clear reason.
func NewElasticDestination(url, index string, client *http.Client) (*ElasticDestination, error) {
	if url == "" {
		return nil, errors.New("elastic destination: url is required")
	}
	if index == "" {
		index = elasticDefaultIndex
	}
	if client == nil {
		client = &http.Client{Timeout: elasticBulkTimeout}
	}
	// Accept either the cluster host or the full _bulk URL, so operators can
	// paste what they already have in their Elastic stack config.
	if !strings.Contains(url, "/_bulk") {
		url = strings.TrimRight(url, "/") + elasticBulkPath
	}
	return &ElasticDestination{url: url, index: index, client: client}, nil
}

// Provider identifies this adapter as an Elastic destination.
func (e *ElasticDestination) Provider() DestinationProvider { return ProviderElastic }

// Send POSTs the events to the Elasticsearch _bulk endpoint as NDJSON. Each
// event emits one action line + one document line per the _bulk contract.
func (e *ElasticDestination) Send(ctx context.Context, events []PipelineEvent) error {
	if len(events) == 0 {
		return nil
	}
	if e.url == "" {
		return fmt.Errorf("elastic: %w (requires Elastic URL)", ErrDestinationUnsupported)
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for _, evt := range events {
		if err := enc.Encode(elasticBulkAction{
			Index: elasticBulkIndexMeta{Index: e.index, ID: evt.ID},
		}); err != nil {
			return fmt.Errorf("elastic destination: encode action for %s: %w", evt.ID, err)
		}
		if err := enc.Encode(evt); err != nil {
			return fmt.Errorf("elastic destination: encode doc %s: %w", evt.ID, err)
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.url, &buf)
	if err != nil {
		return fmt.Errorf("elastic destination: build request: %w", err)
	}
	// Elasticsearch requires the NDJSON content-type on _bulk.
	req.Header.Set("Content-Type", "application/x-ndjson")
	req.Header.Set("User-Agent", "kubestellar-console-siem/1")

	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("elastic destination: POST %s: %w", e.url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("elastic destination: POST %s returned status %d", e.url, resp.StatusCode)
	}
	return nil
}
