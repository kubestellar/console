//go:build windows

package audit

// Windows fallback for the syslog destination — Issue #9887.
//
// Go's log/syslog package does not build on Windows. Rather than failing the
// whole audit package to compile there, we ship a stub type with the same
// public surface that always reports ErrDestinationUnsupported. Operators on
// Windows should front the console with a unix-side log shipper (rsyslog,
// fluent-bit, vector, etc.) and point the Webhook destination at it instead.

import (
	"context"
	"errors"
	"fmt"
)

// SyslogDestination is a non-functional stub on Windows. Send always returns
// ErrDestinationUnsupported.
type SyslogDestination struct{}

// NewSyslogDestination always fails on Windows with a clear reason. The
// signature matches the unix build so callers compile cross-platform.
func NewSyslogDestination(_, _, _ string) (*SyslogDestination, error) {
	return nil, errors.New("syslog destination: not supported on Windows (use Webhook + external shipper)")
}

// Provider identifies this stub as a syslog destination.
func (s *SyslogDestination) Provider() DestinationProvider { return ProviderSyslog }

// Close is a no-op on Windows.
func (s *SyslogDestination) Close() error { return nil }

// Send always returns ErrDestinationUnsupported on Windows.
func (s *SyslogDestination) Send(_ context.Context, _ []PipelineEvent) error {
	return fmt.Errorf("syslog: %w (log/syslog unavailable on Windows)", ErrDestinationUnsupported)
}
