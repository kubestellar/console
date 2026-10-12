package agent

import (
	"context"
	"time"

	"github.com/kubestellar/console/pkg/agent/providers"
	"github.com/kubestellar/console/pkg/ai"
)

// meteredProvider wraps every ai.Provider registered through Registry.Register
// so Chat/StreamChat calls are measured exactly once, regardless of which of
// the several call sites in server_ai_chat.go, server_ai_chat_stream.go,
// server_ai_mixed.go, and pkg/agent/workers invoke them. See
// pkg/agent/providers/metrics.go for the metric definitions.
//
// inner is a named (not embedded) field: ai.Provider declares its own
// Provider() string method, so embedding it anonymously would collide with
// the promoted field name and fail to satisfy the interface.
type meteredProvider struct {
	inner ai.Provider
}

func (p *meteredProvider) Name() string                        { return p.inner.Name() }
func (p *meteredProvider) DisplayName() string                 { return p.inner.DisplayName() }
func (p *meteredProvider) Description() string                 { return p.inner.Description() }
func (p *meteredProvider) Provider() string                    { return p.inner.Provider() }
func (p *meteredProvider) IsAvailable() bool                   { return p.inner.IsAvailable() }
func (p *meteredProvider) Capabilities() ai.ProviderCapability { return p.inner.Capabilities() }

func (p *meteredProvider) Chat(ctx context.Context, req *ai.ChatRequest) (*ai.ChatResponse, error) {
	start := time.Now()
	resp, err := p.inner.Chat(ctx, req)
	providers.ObserveProviderCall(p.inner.Name(), providers.OpChat, start, err)
	return resp, err
}

func (p *meteredProvider) StreamChat(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string)) (*ai.ChatResponse, error) {
	start := time.Now()
	resp, err := p.inner.StreamChat(ctx, req, onChunk)
	providers.ObserveProviderCall(p.inner.Name(), providers.OpStreamChat, start, err)
	return resp, err
}

// meteredStreamingProvider additionally meters StreamChatWithProgress for
// providers that implement ai.StreamingProvider. Kept as a distinct type
// (rather than a type assertion inside meteredProvider) so wrapping never
// changes whether provider.(ai.StreamingProvider) succeeds at call sites
// such as server_ai_chat_stream.go.
type meteredStreamingProvider struct {
	meteredProvider
	streaming ai.StreamingProvider
}

func (p *meteredStreamingProvider) StreamChatWithProgress(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string), onProgress func(event ai.StreamEvent)) (*ai.ChatResponse, error) {
	start := time.Now()
	resp, err := p.streaming.StreamChatWithProgress(ctx, req, onChunk, onProgress)
	providers.ObserveProviderCall(p.inner.Name(), providers.OpStreamChatProgress, start, err)
	return resp, err
}

// meteredHandshakeProvider passes Handshake through unmetered (readiness
// checks aren't a "call" in the metric's sense) while preserving the
// provider.(ai.HandshakeProvider) assertion used by server_health.go.
type meteredHandshakeProvider struct {
	meteredProvider
	handshake ai.HandshakeProvider
}

func (p *meteredHandshakeProvider) Handshake(ctx context.Context) *ai.HandshakeResult {
	return p.handshake.Handshake(ctx)
}

// meteredStreamingHandshakeProvider combines both optional interfaces for
// providers that implement both ai.StreamingProvider and ai.HandshakeProvider.
type meteredStreamingHandshakeProvider struct {
	meteredStreamingProvider
	handshake ai.HandshakeProvider
}

func (p *meteredStreamingHandshakeProvider) Handshake(ctx context.Context) *ai.HandshakeResult {
	return p.handshake.Handshake(ctx)
}

// wrapWithMetrics returns an ai.Provider that records Chat/StreamChat (and,
// where supported, StreamChatWithProgress) calls, preserving whichever
// optional interfaces (ai.StreamingProvider, ai.HandshakeProvider) the
// wrapped provider implements so downstream type assertions keep working.
func wrapWithMetrics(p ai.Provider) ai.Provider {
	base := meteredProvider{inner: p}
	sp, isStreaming := p.(ai.StreamingProvider)
	hp, isHandshake := p.(ai.HandshakeProvider)

	switch {
	case isStreaming && isHandshake:
		return &meteredStreamingHandshakeProvider{
			meteredStreamingProvider: meteredStreamingProvider{meteredProvider: base, streaming: sp},
			handshake:                hp,
		}
	case isStreaming:
		return &meteredStreamingProvider{meteredProvider: base, streaming: sp}
	case isHandshake:
		return &meteredHandshakeProvider{meteredProvider: base, handshake: hp}
	default:
		return &base
	}
}
