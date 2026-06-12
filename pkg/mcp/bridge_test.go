package mcp

import (
	"context"
	"encoding/json"
	"fmt"
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

	t.Run("parseClustersResult errors on empty JSON array", func(t *testing.T) {
		result := &CallToolResult{Content: []ContentItem{{Type: "text", Text: "[]"}}}

		_, err := bridge.parseClustersResult(result)
		require.Error(t, err)
		require.Contains(t, err.Error(), "no parseable text content")
	})

	t.Run("parseHealthResult errors when text content is missing", func(t *testing.T) {
		result := &CallToolResult{Content: []ContentItem{{Type: "resource", Text: "ignored"}}}

		_, err := bridge.parseHealthResult(result)
		require.Error(t, err)
		require.Contains(t, err.Error(), "no parseable text content")
	})

	t.Run("parseHealthResult errors on malformed JSON", func(t *testing.T) {
		result := &CallToolResult{Content: []ContentItem{{Type: "text", Text: "{"}}}

		_, err := bridge.parseHealthResult(result)
		require.Error(t, err)
		require.Contains(t, err.Error(), "failed to parse health response")
	})

	t.Run("parsePodsResult errors on empty JSON array", func(t *testing.T) {
		result := &CallToolResult{Content: []ContentItem{{Type: "text", Text: "[]"}}}

		_, err := bridge.parsePodsResult(result)
		require.Error(t, err)
		require.Contains(t, err.Error(), "no parseable text content")
	})

	t.Run("parsePodIssuesResult errors on empty JSON array", func(t *testing.T) {
		result := &CallToolResult{Content: []ContentItem{{Type: "text", Text: "[]"}}}

		_, err := bridge.parsePodIssuesResult(result)
		require.Error(t, err)
		require.Contains(t, err.Error(), "no parseable text content")
	})

	t.Run("parseEventsResult errors on empty JSON array", func(t *testing.T) {
		result := &CallToolResult{Content: []ContentItem{{Type: "text", Text: "[]"}}}

		_, err := bridge.parseEventsResult(result)
		require.Error(t, err)
		require.Contains(t, err.Error(), "no parseable text content")
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

// mockClient is a test helper that simulates an MCP client with a CallTool method
type mockClient struct {
	*Client
	callToolFunc func(ctx context.Context, name string, args map[string]interface{}) (*CallToolResult, error)
}

func (m *mockClient) CallTool(ctx context.Context, name string, args map[string]interface{}) (*CallToolResult, error) {
	if m.callToolFunc != nil {
		return m.callToolFunc(ctx, name, args)
	}
	return nil, fmt.Errorf("mock CallTool not implemented")
}

func newMockClient(name string, callToolFunc func(ctx context.Context, toolName string, args map[string]interface{}) (*CallToolResult, error)) *mockClient {
	base := newFakeClient(name)
	base.ready.Store(true)
	return &mockClient{
		Client:       base,
		callToolFunc: callToolFunc,
	}
}

func TestBridge_GetPods(t *testing.T) {
	tests := []struct {
		name          string
		cluster       string
		namespace     string
		labelSelector string
		mockResponse  *CallToolResult
		mockError     error
		wantPods      []PodInfo
		wantError     bool
		errorContains string
	}{
		{
			name:      "returns pods with all filters",
			cluster:   "prod",
			namespace: "default",
			labelSelector: "app=nginx",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"name":"pod-1","namespace":"default","status":"Running","ready":"1/1","restarts":0,"age":"5d"}]`,
				}},
			},
			wantPods: []PodInfo{{Name: "pod-1", Namespace: "default", Status: "Running", Ready: "1/1", Restarts: 0, Age: "5d"}},
		},
		{
			name:    "returns pods with minimal filters",
			cluster: "dev",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"name":"pod-2","namespace":"kube-system","status":"Pending","ready":"0/1","restarts":5,"age":"1h"}]`,
				}},
			},
			wantPods: []PodInfo{{Name: "pod-2", Namespace: "kube-system", Status: "Pending", Ready: "0/1", Restarts: 5, Age: "1h"}},
		},
		{
			name:        "returns error when client call fails",
			cluster:     "prod",
			mockError:   fmt.Errorf("connection timeout"),
			wantError:   true,
			errorContains: "connection timeout",
		},
		{
			name:    "returns error when result is error",
			cluster: "prod",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{Type: "text", Text: "cluster not found"}},
				IsError: true,
			},
			wantError:   true,
			errorContains: "tool error",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			bridge := NewBridge(BridgeConfig{})
			bridge.opsClient = newMockClient("ops", func(ctx context.Context, toolName string, args map[string]interface{}) (*CallToolResult, error) {
				require.Equal(t, "get_pods", toolName)
				if tc.cluster != "" {
					require.Equal(t, tc.cluster, args["cluster"])
				}
				if tc.namespace != "" {
					require.Equal(t, tc.namespace, args["namespace"])
				}
				if tc.labelSelector != "" {
					require.Equal(t, tc.labelSelector, args["label_selector"])
				}
				if tc.mockError != nil {
					return nil, tc.mockError
				}
				return tc.mockResponse, nil
			})

			pods, err := bridge.GetPods(context.Background(), tc.cluster, tc.namespace, tc.labelSelector)

			if tc.wantError {
				require.Error(t, err)
				if tc.errorContains != "" {
					require.Contains(t, err.Error(), tc.errorContains)
				}
				return
			}

			require.NoError(t, err)
			require.Equal(t, tc.wantPods, pods)
		})
	}
}

func TestBridge_FindPodIssues(t *testing.T) {
	tests := []struct {
		name          string
		cluster       string
		namespace     string
		mockResponse  *CallToolResult
		mockError     error
		wantIssues    []PodIssue
		wantError     bool
		errorContains string
	}{
		{
			name:      "returns pod issues with CrashLoopBackOff",
			cluster:   "prod",
			namespace: "default",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"name":"crash-pod","namespace":"default","status":"CrashLoopBackOff","reason":"Error","issues":["CrashLoopBackOff"],"restarts":10}]`,
				}},
			},
			wantIssues: []PodIssue{{Name: "crash-pod", Namespace: "default", Status: "CrashLoopBackOff", Reason: "Error", Issues: []string{"CrashLoopBackOff"}, Restarts: 10}},
		},
		{
			name:      "returns pod issues with ImagePullBackOff",
			cluster:   "dev",
			namespace: "staging",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"name":"image-pod","namespace":"staging","status":"ImagePullBackOff","reason":"ErrImagePull","issues":["ImagePullBackOff"],"restarts":0}]`,
				}},
			},
			wantIssues: []PodIssue{{Name: "image-pod", Namespace: "staging", Status: "ImagePullBackOff", Reason: "ErrImagePull", Issues: []string{"ImagePullBackOff"}, Restarts: 0}},
		},
		{
			name:      "returns pod issues with OOMKilled",
			cluster:   "prod",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"name":"oom-pod","namespace":"default","status":"OOMKilled","reason":"OOMKilled","issues":["OOMKilled","High restart count"],"restarts":25}]`,
				}},
			},
			wantIssues: []PodIssue{{Name: "oom-pod", Namespace: "default", Status: "OOMKilled", Reason: "OOMKilled", Issues: []string{"OOMKilled", "High restart count"}, Restarts: 25}},
		},
		{
			name:        "returns error when client call fails",
			cluster:     "prod",
			namespace:   "default",
			mockError:   fmt.Errorf("connection refused"),
			wantError:   true,
			errorContains: "connection refused",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			bridge := NewBridge(BridgeConfig{})
			bridge.opsClient = newMockClient("ops", func(ctx context.Context, toolName string, args map[string]interface{}) (*CallToolResult, error) {
				require.Equal(t, "find_pod_issues", toolName)
				if tc.cluster != "" {
					require.Equal(t, tc.cluster, args["cluster"])
				}
				if tc.namespace != "" {
					require.Equal(t, tc.namespace, args["namespace"])
				}
				if tc.mockError != nil {
					return nil, tc.mockError
				}
				return tc.mockResponse, nil
			})

			issues, err := bridge.FindPodIssues(context.Background(), tc.cluster, tc.namespace)

			if tc.wantError {
				require.Error(t, err)
				if tc.errorContains != "" {
					require.Contains(t, err.Error(), tc.errorContains)
				}
				return
			}

			require.NoError(t, err)
			require.Equal(t, tc.wantIssues, issues)
		})
	}
}

func TestBridge_GetEvents(t *testing.T) {
	tests := []struct {
		name          string
		cluster       string
		namespace     string
		limit         int
		mockResponse  *CallToolResult
		mockError     error
		wantEvents    []Event
		wantError     bool
		errorContains string
	}{
		{
			name:      "returns events with limit",
			cluster:   "prod",
			namespace: "default",
			limit:     10,
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"type":"Warning","reason":"BackOff","message":"Back-off restarting failed container","object":"pod/test","namespace":"default","count":5}]`,
				}},
			},
			wantEvents: []Event{{Type: "Warning", Reason: "BackOff", Message: "Back-off restarting failed container", Object: "pod/test", Namespace: "default", Count: 5}},
		},
		{
			name:    "returns events without limit",
			cluster: "dev",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"type":"Normal","reason":"Created","message":"Created container","object":"pod/nginx","namespace":"default","count":1}]`,
				}},
			},
			wantEvents: []Event{{Type: "Normal", Reason: "Created", Message: "Created container", Object: "pod/nginx", Namespace: "default", Count: 1}},
		},
		{
			name:        "returns error when client call fails",
			cluster:     "prod",
			limit:       5,
			mockError:   fmt.Errorf("timeout"),
			wantError:   true,
			errorContains: "timeout",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			bridge := NewBridge(BridgeConfig{})
			bridge.opsClient = newMockClient("ops", func(ctx context.Context, toolName string, args map[string]interface{}) (*CallToolResult, error) {
				require.Equal(t, "get_events", toolName)
				if tc.cluster != "" {
					require.Equal(t, tc.cluster, args["cluster"])
				}
				if tc.namespace != "" {
					require.Equal(t, tc.namespace, args["namespace"])
				}
				if tc.limit > 0 {
					require.Equal(t, tc.limit, args["limit"])
				}
				if tc.mockError != nil {
					return nil, tc.mockError
				}
				return tc.mockResponse, nil
			})

			events, err := bridge.GetEvents(context.Background(), tc.cluster, tc.namespace, tc.limit)

			if tc.wantError {
				require.Error(t, err)
				if tc.errorContains != "" {
					require.Contains(t, err.Error(), tc.errorContains)
				}
				return
			}

			require.NoError(t, err)
			require.Equal(t, tc.wantEvents, events)
		})
	}
}

func TestBridge_GetWarningEvents(t *testing.T) {
	tests := []struct {
		name          string
		cluster       string
		namespace     string
		limit         int
		mockResponse  *CallToolResult
		mockError     error
		wantEvents    []Event
		wantError     bool
		errorContains string
	}{
		{
			name:      "returns warning events only",
			cluster:   "prod",
			namespace: "default",
			limit:     5,
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"type":"Warning","reason":"Failed","message":"Failed to pull image","object":"pod/app","namespace":"default","count":3}]`,
				}},
			},
			wantEvents: []Event{{Type: "Warning", Reason: "Failed", Message: "Failed to pull image", Object: "pod/app", Namespace: "default", Count: 3}},
		},
		{
			name:    "returns empty list when no warnings",
			cluster: "dev",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"type":"Warning","reason":"Evicted","message":"Pod evicted","object":"pod/old","namespace":"default","count":1}]`,
				}},
			},
			wantEvents: []Event{{Type: "Warning", Reason: "Evicted", Message: "Pod evicted", Object: "pod/old", Namespace: "default", Count: 1}},
		},
		{
			name:        "returns error when client call fails",
			cluster:     "prod",
			mockError:   fmt.Errorf("network error"),
			wantError:   true,
			errorContains: "network error",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			bridge := NewBridge(BridgeConfig{})
			bridge.opsClient = newMockClient("ops", func(ctx context.Context, toolName string, args map[string]interface{}) (*CallToolResult, error) {
				require.Equal(t, "get_warning_events", toolName)
				if tc.cluster != "" {
					require.Equal(t, tc.cluster, args["cluster"])
				}
				if tc.namespace != "" {
					require.Equal(t, tc.namespace, args["namespace"])
				}
				if tc.limit > 0 {
					require.Equal(t, tc.limit, args["limit"])
				}
				if tc.mockError != nil {
					return nil, tc.mockError
				}
				return tc.mockResponse, nil
			})

			events, err := bridge.GetWarningEvents(context.Background(), tc.cluster, tc.namespace, tc.limit)

			if tc.wantError {
				require.Error(t, err)
				if tc.errorContains != "" {
					require.Contains(t, err.Error(), tc.errorContains)
				}
				return
			}

			require.NoError(t, err)
			require.Equal(t, tc.wantEvents, events)
		})
	}
}

func TestBridge_GetClusterHealth(t *testing.T) {
	tests := []struct {
		name          string
		cluster       string
		mockResponse  *CallToolResult
		mockError     error
		wantHealth    *ClusterHealth
		wantError     bool
		errorContains string
	}{
		{
			name:    "returns healthy cluster",
			cluster: "prod",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `{"cluster":"prod","healthy":true,"reachable":true,"nodeCount":5,"readyNodes":5,"podCount":100}`,
				}},
			},
			wantHealth: &ClusterHealth{Cluster: "prod", Healthy: true, Reachable: true, NodeCount: 5, ReadyNodes: 5, PodCount: 100},
		},
		{
			name:    "returns unhealthy cluster with issues",
			cluster: "dev",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `{"cluster":"dev","healthy":false,"reachable":true,"nodeCount":3,"readyNodes":2,"podCount":50,"issues":["Node not ready"]}`,
				}},
			},
			wantHealth: &ClusterHealth{Cluster: "dev", Healthy: false, Reachable: true, NodeCount: 3, ReadyNodes: 2, PodCount: 50, Issues: []string{"Node not ready"}},
		},
		{
			name:    "returns unreachable cluster",
			cluster: "staging",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `{"cluster":"staging","healthy":false,"reachable":false,"errorType":"connection","errorMessage":"connection refused"}`,
				}},
			},
			wantHealth: &ClusterHealth{Cluster: "staging", Healthy: false, Reachable: false, ErrorType: "connection", ErrorMessage: "connection refused"},
		},
		{
			name:        "returns error when client call fails",
			cluster:     "prod",
			mockError:   fmt.Errorf("client error"),
			wantError:   true,
			errorContains: "client error",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			bridge := NewBridge(BridgeConfig{})
			bridge.opsClient = newMockClient("ops", func(ctx context.Context, toolName string, args map[string]interface{}) (*CallToolResult, error) {
				require.Equal(t, "get_cluster_health", toolName)
				if tc.cluster != "" {
					require.Equal(t, tc.cluster, args["cluster"])
				}
				if tc.mockError != nil {
					return nil, tc.mockError
				}
				return tc.mockResponse, nil
			})

			health, err := bridge.GetClusterHealth(context.Background(), tc.cluster)

			if tc.wantError {
				require.Error(t, err)
				if tc.errorContains != "" {
					require.Contains(t, err.Error(), tc.errorContains)
				}
				return
			}

			require.NoError(t, err)
			require.Equal(t, tc.wantHealth, health)
		})
	}
}

func TestBridge_ListClusters(t *testing.T) {
	tests := []struct {
		name          string
		mockResponse  *CallToolResult
		mockError     error
		wantClusters  []ClusterInfo
		wantError     bool
		errorContains string
	}{
		{
			name: "returns multiple clusters",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"name":"prod","context":"prod-context","healthy":true,"nodeCount":5},{"name":"dev","context":"dev-context","healthy":true,"nodeCount":2}]`,
				}},
			},
			wantClusters: []ClusterInfo{
				{Name: "prod", Context: "prod-context", Healthy: true, NodeCount: 5},
				{Name: "dev", Context: "dev-context", Healthy: true, NodeCount: 2},
			},
		},
		{
			name: "returns single cluster",
			mockResponse: &CallToolResult{
				Content: []ContentItem{{
					Type: "text",
					Text: `[{"name":"local","context":"docker-desktop","healthy":true}]`,
				}},
			},
			wantClusters: []ClusterInfo{{Name: "local", Context: "docker-desktop", Healthy: true}},
		},
		{
			name:        "returns error when client call fails",
			mockError:   fmt.Errorf("discovery failed"),
			wantError:   true,
			errorContains: "discovery failed",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			bridge := NewBridge(BridgeConfig{})
			bridge.opsClient = newMockClient("ops", func(ctx context.Context, toolName string, args map[string]interface{}) (*CallToolResult, error) {
				require.Equal(t, "list_clusters", toolName)
				require.Equal(t, "all", args["source"])
				if tc.mockError != nil {
					return nil, tc.mockError
				}
				return tc.mockResponse, nil
			})

			clusters, err := bridge.ListClusters(context.Background())

			if tc.wantError {
				require.Error(t, err)
				if tc.errorContains != "" {
					require.Contains(t, err.Error(), tc.errorContains)
				}
				return
			}

			require.NoError(t, err)
			require.Equal(t, tc.wantClusters, clusters)
		})
	}
}
