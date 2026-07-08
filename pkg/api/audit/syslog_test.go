//go:build !windows

package audit

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSyslogDestination_Send(t *testing.T) {
	// Bypass SSRF guard for the loopback test server — production code uses
	// ssrf.ValidateHost; this override is scoped to the test only.
	orig := syslogHostValidator
	syslogHostValidator = func(_ string) error { return nil }
	t.Cleanup(func() { syslogHostValidator = orig })

	// Start a local TCP server to act as the syslog receiver
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	done := make(chan struct{})
	var received []string
	go func() {
		defer close(done)
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		scanner := bufio.NewScanner(conn)
		for scanner.Scan() {
			received = append(received, scanner.Text())
		}
	}()

	addr := ln.Addr().String()
	dest, err := NewSyslogDestination("tcp", addr, "test-tag")
	require.NoError(t, err)
	defer dest.Close()

	events := []PipelineEvent{
		{
			ID:        "syslog-1",
			Cluster:   "prod",
			Timestamp: time.Now().UTC(),
		},
	}

	err = dest.Send(context.Background(), events)
	assert.NoError(t, err)

	// Close the writer to flush/close the connection and finish the listener goroutine
	require.NoError(t, dest.Close())
	<-done

	require.Len(t, received, 1)
	// Syslog messages from log/syslog usually look like: <PRI>DATE TAG[PID]: MESSAGE
	// Our message is JSON.
	assert.Contains(t, received[0], "syslog-1")
	assert.Contains(t, received[0], "prod")

	// Verify it's valid JSON (the message part)
	// We need to strip the syslog header which varies by implementation/OS.
	// But since we are looking for the JSON body:
	startIdx := 0
	for i, c := range received[0] {
		if c == '{' {
			startIdx = i
			break
		}
	}
	var got PipelineEvent
	err = json.Unmarshal([]byte(received[0][startIdx:]), &got)
	require.NoError(t, err)
	assert.Equal(t, "syslog-1", got.ID)
}

func TestSyslogDestination_RequiresAddr(t *testing.T) {
	_, err := NewSyslogDestination("tcp", "", "")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "addr is required")
}

func TestSyslogDestination_Provider(t *testing.T) {
	dest := &SyslogDestination{}
	assert.Equal(t, ProviderSyslog, dest.Provider())
}

func TestSyslogDestination_Defaults(t *testing.T) {
	orig := syslogHostValidator
	syslogHostValidator = func(_ string) error { return nil }
	t.Cleanup(func() { syslogHostValidator = orig })

	conn, err := net.ListenPacket("udp", "127.0.0.1:0")
	require.NoError(t, err)
	defer conn.Close()

	dest, err := NewSyslogDestination("", conn.LocalAddr().String(), "")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, dest.Close()) })

	assert.Equal(t, syslogDefaultNetwork, dest.network)
	assert.Equal(t, syslogDefaultTag, dest.tag)
}

func TestSyslogDestination_RejectsUnsupportedNetwork(t *testing.T) {
	_, err := NewSyslogDestination("http", "127.0.0.1:514", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported network")
}

func TestSyslogDestination_ValidationError(t *testing.T) {
	orig := syslogHostValidator
	syslogHostValidator = func(_ string) error { return errors.New("blocked host") }
	t.Cleanup(func() { syslogHostValidator = orig })

	_, err := NewSyslogDestination("tcp", "collector.example.com:514", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "blocked host")
}

func TestSyslogDestination_SendClosedWriter(t *testing.T) {
	dest := &SyslogDestination{}
	err := dest.Send(context.Background(), []PipelineEvent{{ID: "closed"}})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrDestinationUnsupported)
}

func TestSyslogDestination_SendCanceledContext(t *testing.T) {
	orig := syslogHostValidator
	syslogHostValidator = func(_ string) error { return nil }
	t.Cleanup(func() { syslogHostValidator = orig })

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	done := make(chan struct{})
	go func() {
		defer close(done)
		conn, acceptErr := ln.Accept()
		if acceptErr == nil {
			_ = conn.Close()
		}
	}()

	dest, err := NewSyslogDestination("tcp", ln.Addr().String(), "test-tag")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, dest.Close()) })

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err = dest.Send(ctx, []PipelineEvent{{ID: "syslog-cancelled", Timestamp: time.Now().UTC()}})
	require.ErrorIs(t, err, context.Canceled)
	<-done
}

func TestSyslogDestination_CloseIsIdempotent(t *testing.T) {
	dest := &SyslogDestination{}
	require.NoError(t, dest.Close())
}
