package agent

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/providers"
	"github.com/kubestellar/console/pkg/ai"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"
)

// mockStreamingHandshakeProvider extends MockProvider (registry_test.go) with
// the optional StreamChatWithProgress/Handshake methods, so wrapWithMetrics
// can be exercised across all four wrapper combinations.
type mockStreamingHandshakeProvider struct {
	MockProvider
	streamErr    error
	handshakeHit bool
}

func (m *mockStreamingHandshakeProvider) StreamChatWithProgress(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string), onProgress func(event ai.StreamEvent)) (*ai.ChatResponse, error) {
	if m.streamErr != nil {
		return nil, m.streamErr
	}
	return &ai.ChatResponse{Content: "ok"}, nil
}

func (m *mockStreamingHandshakeProvider) Handshake(ctx context.Context) *ai.HandshakeResult {
	m.handshakeHit = true
	return &ai.HandshakeResult{Ready: true}
}

// TestWrapWithMetricsPreservesOptionalInterfaces verifies that wrapping a
// provider implementing both ai.StreamingProvider and ai.HandshakeProvider
// keeps both type assertions working, as relied on by
// server_ai_chat_stream.go and server_health.go.
func TestWrapWithMetricsPreservesOptionalInterfaces(t *testing.T) {
	inner := &mockStreamingHandshakeProvider{MockProvider: MockProvider{name: "mock-full", available: true}}
	wrapped := wrapWithMetrics(inner)

	sp, ok := wrapped.(ai.StreamingProvider)
	require.True(t, ok, "wrapped provider should still satisfy ai.StreamingProvider")
	hp, ok := wrapped.(ai.HandshakeProvider)
	require.True(t, ok, "wrapped provider should still satisfy ai.HandshakeProvider")

	require.Equal(t, "mock-full", wrapped.Name())

	result := hp.Handshake(context.Background())
	require.True(t, result.Ready)
	require.True(t, inner.handshakeHit)

	_, err := sp.StreamChatWithProgress(context.Background(), &ai.ChatRequest{}, nil, nil)
	require.NoError(t, err)
}

// TestWrapWithMetricsPlainProvider verifies that a provider implementing
// only the base ai.Provider interface is not wrapped with the optional
// interfaces (i.e. wrapping doesn't fabricate capabilities the provider
// doesn't have).
func TestWrapWithMetricsPlainProvider(t *testing.T) {
	inner := &MockProvider{name: "mock-plain", available: true}
	wrapped := wrapWithMetrics(inner)

	_, isStreaming := wrapped.(ai.StreamingProvider)
	require.False(t, isStreaming)
	_, isHandshake := wrapped.(ai.HandshakeProvider)
	require.False(t, isHandshake)
}

// TestMeteredProviderRecordsCalls verifies that Chat/StreamChat calls made
// through a wrapped provider increment console_agent_provider_calls_total
// with the right provider/operation/result labels.
func TestMeteredProviderRecordsCalls(t *testing.T) {
	inner := &MockProvider{name: "mock-metrics", available: true}
	wrapped := wrapWithMetrics(inner)

	before := testutil.ToFloat64(providers.AgentProviderCallsTotal.WithLabelValues("mock-metrics", providers.OpChat, providers.ResultSuccess))
	_, err := wrapped.Chat(context.Background(), &ai.ChatRequest{})
	require.NoError(t, err)
	require.Equal(t, before+1, testutil.ToFloat64(providers.AgentProviderCallsTotal.WithLabelValues("mock-metrics", providers.OpChat, providers.ResultSuccess)))

	before = testutil.ToFloat64(providers.AgentProviderCallsTotal.WithLabelValues("mock-metrics", providers.OpStreamChat, providers.ResultSuccess))
	_, err = wrapped.StreamChat(context.Background(), &ai.ChatRequest{}, nil)
	require.NoError(t, err)
	require.Equal(t, before+1, testutil.ToFloat64(providers.AgentProviderCallsTotal.WithLabelValues("mock-metrics", providers.OpStreamChat, providers.ResultSuccess)))
}

// mockHandshakeOnlyProvider implements ai.HandshakeProvider but not
// ai.StreamingProvider, exercising wrapWithMetrics' handshake-only branch.
type mockHandshakeOnlyProvider struct {
	MockProvider
	handshakeHit bool
}

func (m *mockHandshakeOnlyProvider) Handshake(ctx context.Context) *ai.HandshakeResult {
	m.handshakeHit = true
	return &ai.HandshakeResult{Ready: true}
}

// TestWrapWithMetricsHandshakeOnlyProvider verifies a provider implementing
// only ai.HandshakeProvider (not ai.StreamingProvider) is wrapped so
// Handshake still works and StreamChatWithProgress is correctly unavailable.
func TestWrapWithMetricsHandshakeOnlyProvider(t *testing.T) {
	inner := &mockHandshakeOnlyProvider{MockProvider: MockProvider{name: "mock-handshake", available: true}}
	wrapped := wrapWithMetrics(inner)

	_, isStreaming := wrapped.(ai.StreamingProvider)
	require.False(t, isStreaming)

	hp, ok := wrapped.(ai.HandshakeProvider)
	require.True(t, ok)
	result := hp.Handshake(context.Background())
	require.True(t, result.Ready)
	require.True(t, inner.handshakeHit)
}

// TestRegistryRegisterWrapsProviders verifies providers registered through
// Registry.Register are retrievable and still satisfy the optional
// interfaces they implement — i.e. the registry's use of wrapWithMetrics
// (registry.go's Register) doesn't break Get/GetDefault callers.
func TestRegistryRegisterWrapsProviders(t *testing.T) {
	r := newTestRegistry()
	inner := &mockStreamingHandshakeProvider{MockProvider: MockProvider{name: "mock-registered", available: true}}
	require.NoError(t, r.Register(inner))

	got, err := r.Get("mock-registered")
	require.NoError(t, err)
	_, ok := got.(ai.StreamingProvider)
	require.True(t, ok)
}
