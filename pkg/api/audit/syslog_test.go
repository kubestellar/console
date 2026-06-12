//go:build !windows

package audit

import (
	"bufio"
	"context"
	"encoding/json"
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

func TestSyslogDestination_SendMultipleEvents(t *testing.T) {
	orig := syslogHostValidator
	syslogHostValidator = func(_ string) error { return nil }
	t.Cleanup(func() { syslogHostValidator = orig })

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
		{ID: "syslog-1", Cluster: "prod", EventType: "create", Timestamp: time.Now().UTC()},
		{ID: "syslog-2", Cluster: "stage", EventType: "update", Timestamp: time.Now().UTC()},
		{ID: "syslog-3", Cluster: "dev", EventType: "delete", Timestamp: time.Now().UTC()},
	}

	err = dest.Send(context.Background(), events)
	assert.NoError(t, err)

	require.NoError(t, dest.Close())
	<-done

	require.Len(t, received, 3)
	for i, line := range received {
		assert.Contains(t, line, events[i].ID)
		assert.Contains(t, line, events[i].Cluster)
	}
}

func TestSyslogDestination_EmptyEventsNoOp(t *testing.T) {
	orig := syslogHostValidator
	syslogHostValidator = func(_ string) error { return nil }
	t.Cleanup(func() { syslogHostValidator = orig })

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	addr := ln.Addr().String()
	dest, err := NewSyslogDestination("tcp", addr, "empty-test")
	require.NoError(t, err)
	defer dest.Close()

	err = dest.Send(context.Background(), nil)
	assert.NoError(t, err)

	err = dest.Send(context.Background(), []PipelineEvent{})
	assert.NoError(t, err)
}

func TestSyslogDestination_ContextCancellation(t *testing.T) {
	orig := syslogHostValidator
	syslogHostValidator = func(_ string) error { return nil }
	t.Cleanup(func() { syslogHostValidator = orig })

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	addr := ln.Addr().String()
	dest, err := NewSyslogDestination("tcp", addr, "cancel-test")
	require.NoError(t, err)
	defer dest.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	events := make([]PipelineEvent, 100)
	for i := range events {
		events[i] = PipelineEvent{
			ID:        "evt-" + string(rune(i)),
			Cluster:   "test",
			Timestamp: time.Now().UTC(),
		}
	}

	err = dest.Send(ctx, events)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "context canceled")
}

func TestSyslogDestination_ClosedWriter(t *testing.T) {
	orig := syslogHostValidator
	syslogHostValidator = func(_ string) error { return nil }
	t.Cleanup(func() { syslogHostValidator = orig })

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	addr := ln.Addr().String()
	dest, err := NewSyslogDestination("tcp", addr, "closed-test")
	require.NoError(t, err)

	require.NoError(t, dest.Close())

	events := []PipelineEvent{{ID: "evt-after-close", Timestamp: time.Now().UTC()}}
	err = dest.Send(context.Background(), events)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "writer is closed")

	err = dest.Close()
	assert.NoError(t, err)
}
