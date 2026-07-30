# pkg/agent

Primary agent orchestration package for the KubeStellar Console.

## Purpose

This package provides the core agent infrastructure for integrating AI/LLM providers into the console. It handles:

- **Cluster Context Management**: Manages Kubernetes cluster contexts and connections
- **Provider Registration**: Registers and manages different AI provider implementations (Claude, OpenAI, Gemini, etc.)
- **Federation Layer**: Coordinates between multiple providers and cluster resources
- **Agent Lifecycle**: Handles agent initialization, configuration, and teardown

## Architecture

The package defines core interfaces and types:

- `AIProvider`: Base interface for LLM providers
- `StreamingProvider`: Interface for streaming chat completions
- `HandshakeProvider`: Interface for provider capability negotiation
- Provider implementations: `provider_*.go` files implement specific LLM integrations

## Related Packages

- `pkg/kagent`: HTTP client for the standalone kc-agent binary (local agent process)
- `pkg/kagentiprovider`: Client for in-cluster kagenti deployments (Kubernetes-native agent)

Both client packages provide specialized connectivity to different agent deployment modes, while this package provides the high-level orchestration and provider abstraction.

## Usage

See individual provider files (`provider_*.go`) for specific provider implementations.
