package mcp

import (
	"context"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// TestBridge_Start_RollbackWhenBinaryFailsHandshake drives the biggest
// uncovered slice of Bridge.Start in pkg/mcp/bridge.go: the path where the
// binary path *is* on PATH (LookPath succeeds), safego.Go actually runs
// startBinaryClient, that call returns an error (because the binary is not
// a real MCP server), the error is queued on errCh, and the outer Start
// enters its rollback branch and returns a wrapped "failed to start MCP
// clients" error.
//
// Existing tests only exercise:
//   - empty binary paths (TestBridge_Start_EmptyPaths)
//   - LookPath-missing binaries (TestBridge_Start_MissingBinaries)
//   - direct rollback via Stop() with prewired fake clients
//     (TestBridge_Stop_StopsAssignedClients)
//
// None of them execute the LookPath-succeeds + startBinaryClient-fails path.
// This test uses /usr/bin/false — a real binary that resolves via LookPath
// and exits with status 1 immediately — so the MCP JSON-RPC initialize
// handshake fails and Start's rollback path fires.
func TestBridge_Start_RollbackWhenBinaryFailsHandshake(t *testing.T) {
	falsePath, err := exec.LookPath("false")
	if err != nil {
		t.Skipf("no `false` on PATH: %v", err)
	}

	// Only wire ops so the rollback message is deterministic and the
	// test finishes quickly. deploy/gadget are left empty so they are
	// skipped by the `binaryPath == ""` guard.
	cfg := BridgeConfig{
		KubestellarOpsPath: falsePath,
	}
	bridge := NewBridge(cfg)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	err = bridge.Start(ctx)
	require.Error(t, err, "Start must fail when the ops binary is not a real MCP server")
	require.Contains(t, err.Error(), "failed to start MCP clients",
		"outer wrapper from Bridge.Start's rollback branch")
	require.Contains(t, err.Error(), "ops client",
		"per-client error prefix from startConfiguredClient's errCh path")

	// Rollback should have run — no ops client should be assigned on
	// the bridge after a failed Start.
	if got := bridge.GetOpsTools(); got != nil {
		t.Errorf("expected GetOpsTools() = nil after failed Start, got %v", got)
	}

	// A second Stop must not panic — rollback already called Stop, so
	// this validates Bridge.Stop's idempotence after the rollback path.
	require.NotPanics(t, func() {
		_ = bridge.Stop()
	}, "Bridge.Stop after rollback must remain idempotent")
}

// TestBridge_Start_RollbackAggregatesMultipleErrors covers the errors.Join
// path in Bridge.Start: when more than one configured binary fails its
// handshake, the returned error must carry the per-client prefix for
// every failing client so operators can see which ones died. This nails
// the `errs = append(errs, err)` loop and the errors.Join wrapping —
// paths that the single-client test above does not exercise.
func TestBridge_Start_RollbackAggregatesMultipleErrors(t *testing.T) {
	falsePath, err := exec.LookPath("false")
	if err != nil {
		t.Skipf("no `false` on PATH: %v", err)
	}

	cfg := BridgeConfig{
		KubestellarOpsPath:    falsePath,
		KubestellarDeployPath: falsePath,
	}
	bridge := NewBridge(cfg)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	err = bridge.Start(ctx)
	require.Error(t, err)
	msg := err.Error()
	require.Contains(t, msg, "failed to start MCP clients")

	// Both per-client wrappers must appear — this is what proves the
	// errors.Join in Bridge.Start ran (rather than short-circuiting on
	// the first error).
	if !strings.Contains(msg, "ops client") || !strings.Contains(msg, "deploy client") {
		t.Errorf("expected both 'ops client' and 'deploy client' error prefixes, got: %s", msg)
	}
}
