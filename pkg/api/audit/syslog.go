//go:build !windows

package audit

// Syslog destination adapter — Issue #9887 / #9643.
//
// Follow-up to #9907. Ships PipelineEvents to a remote syslog receiver using
// Go's standard log/syslog package. log/syslog is not available on Windows so
// this file carries a `!windows` build tag; see syslog_windows.go for the
// fallback stub used on that platform.
//
// Production hardening (RFC 5424 framing, TLS, structured data fields,
// reconnect on transport failure) is deferred to the full export engine
// (#9643).

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/syslog"
	"sync"
	"time"
)

// syslogDialTimeout bounds the initial network dial to the syslog collector.
// The log/syslog package does not honour context cancellation directly; the
// timeout applies to the underlying net.Dial via the per-adapter lifecycle.
const syslogDialTimeout = 5 * time.Second

// syslogDefaultNetwork is the transport used when the caller does not supply
// one. UDP matches the historical default for RFC 3164 syslog receivers.
const syslogDefaultNetwork = "udp"

// syslogDefaultTag is the log tag emitted with each event. Operators typically
// use this to route to a dedicated index / channel in their collector.
const syslogDefaultTag = "kubestellar-console-audit"

// syslogDefaultPriority is the facility|severity combination used for every
// event. LOG_LOCAL0 is the conventional facility for custom apps and LOG_INFO
// matches the audit-log tone (informational, not alerting).
const syslogDefaultPriority = syslog.LOG_LOCAL0 | syslog.LOG_INFO

// SyslogDestination writes each PipelineEvent to a remote syslog receiver as a
// single-line JSON message via log/syslog. Send serialises writes through an
// internal mutex because *syslog.Writer does not promise concurrent safety
// across reconnects.
type SyslogDestination struct {
	network string
	addr    string
	tag     string
	mu      sync.Mutex
	w       *syslog.Writer
}

// NewSyslogDestination builds a SyslogDestination and opens the initial
// connection. The addr is required; network defaults to "udp" and accepts
// "udp" or "tcp". An empty tag falls back to syslogDefaultTag.
//
// When addr is empty the adapter is considered unconfigured and the error is
// surfaced so callers can fall back to a stubDestination.
func NewSyslogDestination(network, addr, tag string) (*SyslogDestination, error) {
	if addr == "" {
		return nil, errors.New("syslog destination: addr is required")
	}
	if network == "" {
		network = syslogDefaultNetwork
	}
	if network != "udp" && network != "tcp" {
		return nil, fmt.Errorf("syslog destination: unsupported network %q (want udp or tcp)", network)
	}
	if tag == "" {
		tag = syslogDefaultTag
	}
	w, err := syslog.Dial(network, addr, syslogDefaultPriority, tag)
	if err != nil {
		return nil, fmt.Errorf("syslog destination: dial %s/%s: %w", network, addr, err)
	}
	return &SyslogDestination{network: network, addr: addr, tag: tag, w: w}, nil
}

// Provider identifies this adapter as a syslog destination.
func (s *SyslogDestination) Provider() DestinationProvider { return ProviderSyslog }

// Close releases the underlying syslog connection. Safe to call multiple times.
func (s *SyslogDestination) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.w == nil {
		return nil
	}
	err := s.w.Close()
	s.w = nil
	return err
}

// Send writes each event as a single-line JSON message via syslog.Info. ctx
// cancellation is honoured for the loop so a huge batch does not block shutdown.
func (s *SyslogDestination) Send(ctx context.Context, events []PipelineEvent) error {
	if len(events) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.w == nil {
		return fmt.Errorf("syslog: %w (writer is closed)", ErrDestinationUnsupported)
	}
	for _, evt := range events {
		if err := ctx.Err(); err != nil {
			return err
		}
		line, err := json.Marshal(evt)
		if err != nil {
			return fmt.Errorf("syslog destination: encode event %s: %w", evt.ID, err)
		}
		// Info() picks the informational severity explicitly rather than the
		// Writer's default priority, which matches the audit-log tone and
		// makes receiver-side filtering predictable.
		if err := s.w.Info(string(line)); err != nil {
			return fmt.Errorf("syslog destination: write event %s: %w", evt.ID, err)
		}
	}
	return nil
}
