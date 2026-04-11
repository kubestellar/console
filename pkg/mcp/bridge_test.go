package mcp

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

// newFakeClient returns a bare Client with the minimum state needed for
// lifecycle (Stop) and ID-routing tests. It has no backing process, no
// stdin/stdout, and no stderr — only the pending map, done channel, and
// stopOnce are populated.
func newFakeClient(name string) *Client {
	return &Client{
		name:    name,
		pending: make(map[string]chan *Response),
		done:    make(chan struct{}),
	}
}

// TestIDKey_JSONRoundTrip verifies that a request ID (int64) survives a
// json.Marshal/Unmarshal round trip and still matches the pending-map key
// it was stored under. Without the fix from #6622, the outgoing int64 ID
// was stored as `interface{}` keyed by int64 while the decoded response ID
// came back as float64, causing every call() to block until the context
// deadline fired.
func TestIDKey_JSONRoundTrip(t *testing.T) {
	const wantID int64 = 42

	req := Request{JSONRPC: "2.0", ID: wantID, Method: "ping"}
	data, err := json.Marshal(req)
	require.NoError(t, err)

	// Build a response with the same numeric ID and marshal → unmarshal it
	// the way readResponses does.
	respWire := []byte(`{"jsonrpc":"2.0","id":42,"result":{}}`)
	var resp Response
	require.NoError(t, json.Unmarshal(respWire, &resp))

	// resp.ID is interface{} — after default json.Unmarshal of a JSON
	// number into an interface{}, Go returns float64, not int64.
	if _, ok := resp.ID.(float64); !ok {
		t.Logf("note: default decoder returned %T for numeric JSON ID", resp.ID)
	}

	sentKey := idKey(wantID)
	recvKey := idKey(resp.ID)
	require.Equal(t, sentKey, recvKey,
		"sent and received ID keys must match after JSON round trip; "+
			"got sent=%q recv=%q (req bytes=%s)", sentKey, recvKey, data)

	// And the pending-map round trip: store a channel under the sent key
	// and look it up under the received key.
	pending := map[string]chan *Response{sentKey: make(chan *Response, 1)}
	_, ok := pending[recvKey]
	require.True(t, ok, "pending map lookup via received key must succeed")
}

// TestClient_Stop_Idempotent verifies Stop can be called multiple times
// without panicking on the close(c.done) channel (#6623).
func TestClient_Stop_Idempotent(t *testing.T) {
	c := newFakeClient("test")

	require.NotPanics(t, func() {
		_ = c.Stop()
	}, "first Stop should not panic")

	require.NotPanics(t, func() {
		_ = c.Stop()
	}, "second Stop must not panic on already-closed done channel")

	require.NotPanics(t, func() {
		_ = c.Stop()
	}, "third Stop must still not panic")
}

// TestBridge_Stop_StopsAssignedClients validates the tail of Bridge.Start's
// rollback path (#6624): once a client has been assigned to the bridge, a
// subsequent Stop must call Stop on every assigned client and must be safe
// to invoke repeatedly.
//
// #6655: this test was previously named and commented as if it exercised
// Bridge.Start directly and asserted that the rollback nils out the client
// pointers. Neither claim was accurate — we can't spawn real MCP binaries
// in unit tests, Bridge.Stop does not nil client pointers (see bridge.go
// Stop), and this test never invoked Start. The name and comment have been
// corrected to describe what is actually asserted: that Stop is Start's
// rollback primitive, that it tears down every assigned client, and that
// it is idempotent.
func TestBridge_Stop_StopsAssignedClients(t *testing.T) {
	bridge := NewBridge(BridgeConfig{})

	// Simulate two successfully started clients.
	opsC := newFakeClient("ops")
	deployC := newFakeClient("deploy")
	bridge.opsClient = opsC
	bridge.deployClient = deployC

	// Invoke Stop directly to confirm it handles fake clients without
	// panicking — this is the path the Start rollback takes.
	require.NotPanics(t, func() {
		_ = bridge.Stop()
	}, "Bridge.Stop on fake clients must not panic")

	// After Stop, both fake clients' done channels should be closed (the
	// observable side effect of Client.Stop). We detect this via a
	// non-blocking receive on the channel.
	select {
	case <-opsC.done:
	default:
		t.Fatal("opsClient.done was not closed by bridge.Stop — Stop did not run")
	}
	select {
	case <-deployC.done:
	default:
		t.Fatal("deployClient.done was not closed by bridge.Stop — Stop did not run")
	}

	// Second Stop must still not panic (idempotence at bridge level relies
	// on Client.Stop being idempotent).
	require.NotPanics(t, func() {
		_ = bridge.Stop()
	}, "second Bridge.Stop must not panic")
}

func TestNewBridge(t *testing.T) {
	t.Run("returns non-nil bridge with config", func(t *testing.T) {
		cfg := BridgeConfig{
			KubestellarOpsPath:    "kubestellar-ops",
			KubestellarDeployPath: "kubestellar-deploy",
			InspektorGadgetPath:   "ig-mcp-server",
			Kubeconfig:            "/tmp/kubeconfig",
		}
		bridge := NewBridge(cfg)
		require.NotNil(t, bridge)
		require.Equal(t, cfg.KubestellarOpsPath, bridge.config.KubestellarOpsPath)
		require.Equal(t, cfg.Kubeconfig, bridge.config.Kubeconfig)
	})

	t.Run("returns non-nil bridge with empty config", func(t *testing.T) {
		bridge := NewBridge(BridgeConfig{})
		require.NotNil(t, bridge)
	})
}

func TestBridge_Start_MissingBinaries(t *testing.T) {
	// When binary paths point to nonexistent executables, Start should
	// gracefully skip them (log a warning) rather than returning an error.
	cfg := BridgeConfig{
		KubestellarOpsPath:    "nonexistent-binary-ops-xyz",
		KubestellarDeployPath: "nonexistent-binary-deploy-xyz",
		InspektorGadgetPath:   "nonexistent-binary-gadget-xyz",
	}
	bridge := NewBridge(cfg)
	ctx := context.Background()

	err := bridge.Start(ctx)
	require.NoError(t, err, "Start should not error when binaries are missing from PATH")
}

func TestBridge_Start_EmptyPaths(t *testing.T) {
	// Empty paths should be skipped entirely with no errors
	cfg := BridgeConfig{}
	bridge := NewBridge(cfg)
	ctx := context.Background()

	err := bridge.Start(ctx)
	require.NoError(t, err)
}

func TestBridge_NilClientMethods(t *testing.T) {
	// When clients are nil (not started), methods should return appropriate errors/nils
	bridge := NewBridge(BridgeConfig{})
	ctx := context.Background()

	t.Run("GetOpsTools returns nil when ops client is nil", func(t *testing.T) {
		tools := bridge.GetOpsTools()
		require.Nil(t, tools)
	})

	t.Run("GetDeployTools returns nil when deploy client is nil", func(t *testing.T) {
		tools := bridge.GetDeployTools()
		require.Nil(t, tools)
	})

	t.Run("GetGadgetTools returns nil when gadget client is nil", func(t *testing.T) {
		tools := bridge.GetGadgetTools()
		require.Nil(t, tools)
	})

	t.Run("ListClusters returns error when ops client is nil", func(t *testing.T) {
		_, err := bridge.ListClusters(ctx)
		require.Error(t, err)
		require.Contains(t, err.Error(), "ops client not available")
	})

	t.Run("GetClusterHealth returns error when ops client is nil", func(t *testing.T) {
		_, err := bridge.GetClusterHealth(ctx, "any-cluster")
		require.Error(t, err)
		require.Contains(t, err.Error(), "ops client not available")
	})

	t.Run("GetPods returns error when ops client is nil", func(t *testing.T) {
		_, err := bridge.GetPods(ctx, "cluster", "namespace", "")
		require.Error(t, err)
		require.Contains(t, err.Error(), "ops client not available")
	})

	t.Run("FindPodIssues returns error when ops client is nil", func(t *testing.T) {
		_, err := bridge.FindPodIssues(ctx, "cluster", "namespace")
		require.Error(t, err)
		require.Contains(t, err.Error(), "ops client not available")
	})

	t.Run("GetEvents returns error when ops client is nil", func(t *testing.T) {
		_, err := bridge.GetEvents(ctx, "cluster", "", 10)
		require.Error(t, err)
		require.Contains(t, err.Error(), "ops client not available")
	})

	t.Run("GetWarningEvents returns error when ops client is nil", func(t *testing.T) {
		_, err := bridge.GetWarningEvents(ctx, "", "", 10)
		require.Error(t, err)
		require.Contains(t, err.Error(), "ops client not available")
	})

	t.Run("CallOpsTool returns error when ops client is nil", func(t *testing.T) {
		_, err := bridge.CallOpsTool(ctx, "any-tool", nil)
		require.Error(t, err)
		require.Contains(t, err.Error(), "ops client not available")
	})

	t.Run("CallDeployTool returns error when deploy client is nil", func(t *testing.T) {
		_, err := bridge.CallDeployTool(ctx, "any-tool", nil)
		require.Error(t, err)
		require.Contains(t, err.Error(), "deploy client not available")
	})

	t.Run("CallGadgetTool returns error when gadget client is nil", func(t *testing.T) {
		_, err := bridge.CallGadgetTool(ctx, "any-tool", nil)
		require.Error(t, err)
		require.Contains(t, err.Error(), "gadget client not available")
	})
}

func TestBridge_Stop_NilClients(t *testing.T) {
	// Stop should succeed even when no clients were started
	bridge := NewBridge(BridgeConfig{})
	err := bridge.Stop()
	require.NoError(t, err)
}

func TestBridge_Status(t *testing.T) {
	t.Run("status with no clients shows all unavailable", func(t *testing.T) {
		bridge := NewBridge(BridgeConfig{})
		status := bridge.Status()

		require.NotNil(t, status)
		require.Contains(t, status, "opsClient")
		require.Contains(t, status, "deployClient")
		require.Contains(t, status, "gadgetClient")

		opsStatus, ok := status["opsClient"].(map[string]interface{})
		require.True(t, ok)
		require.Equal(t, false, opsStatus["available"])
		require.Equal(t, 0, opsStatus["toolCount"])
	})
}

func TestBridge_ParseResults(t *testing.T) {
	bridge := NewBridge(BridgeConfig{})

	t.Run("parseClustersResult with valid JSON", func(t *testing.T) {
		clusters := []ClusterInfo{
			{Name: "cluster-1", Context: "ctx-1", Healthy: true},
			{Name: "cluster-2", Context: "ctx-2", Healthy: false},
		}
		data, err := json.Marshal(clusters)
		require.NoError(t, err)

		result := &CallToolResult{
			Content: []ContentItem{{Type: "text", Text: string(data)}},
			IsError: false,
		}

		parsed, err := bridge.parseClustersResult(result)
		require.NoError(t, err)
		require.Len(t, parsed, 2)
		require.Equal(t, "cluster-1", parsed[0].Name)
		require.True(t, parsed[0].Healthy)
	})

	t.Run("parseClustersResult with error result", func(t *testing.T) {
		result := &CallToolResult{
			Content: []ContentItem{{Type: "text", Text: "something went wrong"}},
			IsError: true,
		}

		_, err := bridge.parseClustersResult(result)
		require.Error(t, err)
		require.Contains(t, err.Error(), "tool error")
	})

	t.Run("parseHealthResult with valid JSON", func(t *testing.T) {
		health := ClusterHealth{
			Cluster:   "prod",
			Healthy:   true,
			Reachable: true,
			NodeCount: 5,
		}
		data, err := json.Marshal(health)
		require.NoError(t, err)

		result := &CallToolResult{
			Content: []ContentItem{{Type: "text", Text: string(data)}},
		}

		parsed, err := bridge.parseHealthResult(result)
		require.NoError(t, err)
		require.True(t, parsed.Healthy)
		require.Equal(t, 5, parsed.NodeCount)
	})

	t.Run("parsePodsResult with valid JSON", func(t *testing.T) {
		pods := []PodInfo{
			{Name: "pod-1", Namespace: "default", Status: "Running"},
		}
		data, err := json.Marshal(pods)
		require.NoError(t, err)

		result := &CallToolResult{
			Content: []ContentItem{{Type: "text", Text: string(data)}},
		}

		parsed, err := bridge.parsePodsResult(result)
		require.NoError(t, err)
		require.Len(t, parsed, 1)
		require.Equal(t, "pod-1", parsed[0].Name)
	})

	t.Run("parseEventsResult with valid JSON", func(t *testing.T) {
		events := []Event{
			{Type: "Warning", Reason: "BackOff", Message: "Back-off restarting failed container"},
		}
		data, err := json.Marshal(events)
		require.NoError(t, err)

		result := &CallToolResult{
			Content: []ContentItem{{Type: "text", Text: string(data)}},
		}

		parsed, err := bridge.parseEventsResult(result)
		require.NoError(t, err)
		require.Len(t, parsed, 1)
		require.Equal(t, "BackOff", parsed[0].Reason)
	})

	t.Run("parsePodIssuesResult with valid JSON", func(t *testing.T) {
		issues := []PodIssue{
			{Name: "bad-pod", Namespace: "default", Issues: []string{"CrashLoopBackOff"}},
		}
		data, err := json.Marshal(issues)
		require.NoError(t, err)

		result := &CallToolResult{
			Content: []ContentItem{{Type: "text", Text: string(data)}},
		}

		parsed, err := bridge.parsePodIssuesResult(result)
		require.NoError(t, err)
		require.Len(t, parsed, 1)
		require.Contains(t, parsed[0].Issues, "CrashLoopBackOff")
	})

	t.Run("parseClustersFromText returns empty slice for non-JSON", func(t *testing.T) {
		result := bridge.parseClustersFromText("some plain text output")
		require.Empty(t, result)
	})
}

func TestBridge_DefaultBridgeConfig(t *testing.T) {
	cfg := DefaultBridgeConfig()
	require.Equal(t, "kubestellar-ops", cfg.KubestellarOpsPath)
	require.Equal(t, "kubestellar-deploy", cfg.KubestellarDeployPath)
	require.Equal(t, "ig-mcp-server", cfg.InspektorGadgetPath)
}

func TestGetEnvOrDefault(t *testing.T) {
	tests := []struct {
		name       string
		key        string
		defaultVal string
		want       string
	}{
		{
			name:       "unset env var returns default",
			key:        "MCP_TEST_NONEXISTENT_XYZ",
			defaultVal: "fallback",
			want:       "fallback",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := getEnvOrDefault(tc.key, tc.defaultVal)
			require.Equal(t, tc.want, got)
		})
	}
}
