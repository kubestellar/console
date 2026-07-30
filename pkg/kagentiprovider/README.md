# pkg/kagentiprovider

Client and configuration management for in-cluster kagenti deployments.

## Purpose

This package provides a client and configuration layer for communicating with **kagenti** agents deployed **inside** Kubernetes clusters. Unlike the standalone kc-agent binary, kagenti runs as a Kubernetes Deployment and provides in-cluster AI agent capabilities.

## Responsibility

- **In-Cluster Discovery**: Discovers kagenti services and endpoints within Kubernetes namespaces
- **LLM Configuration Management**: Manages kagenti LLM provider configuration (Anthropic, Gemini, OpenAI)
- **Secret Management**: Handles API key storage and retrieval for kagenti LLM providers
- **Service Health Checking**: Verifies kagenti service availability
- **Deployment Lifecycle**: Manages kagenti deployment restarts and configuration updates

## Architecture

The package provides two main components:

### Client (`client.go`)
- `KagentiClient`: HTTP client for kagenti service endpoints
- Agent discovery and invocation via multiple endpoint patterns
- Support for both direct agent mode and controller-mediated mode
- Fallback logic for legacy endpoint paths

### Configuration Manager (`config.go`)
- `ConfigManager`: Interface for managing kagenti LLM configuration
- `K8sConfigManager`: Kubernetes-native implementation using Secrets and Deployments
- `ConfigStatus`: Struct representing current LLM configuration state
- `ConfigUpdate`: Struct for updating LLM provider and API keys

## Deployment Context

Kagenti runs as a **Kubernetes Deployment** (typically in `kagenti-system` namespace) and exposes a Service for agent access. This package provides the client and configuration tooling that the console uses to interact with that in-cluster deployment.

## Related Packages

- `pkg/agent`: Parent orchestration package that uses this client via `provider_kagenti.go`
- `pkg/kagent`: Sister package for standalone kc-agent binary (different deployment model)
- `pkg/api/handlers`: API handlers that expose kagenti configuration endpoints to the frontend

## Usage

```go
import "github.com/kubestellar/console/pkg/kagentiprovider"

// Client usage
client := kagentiprovider.NewKagentiClientFromEnv()
agents, err := client.ListAgents(ctx)

// Configuration management
mgr := kagentiprovider.NewK8sConfigManager(clientset)
status, err := mgr.GetStatus(ctx)
updated, err := mgr.UpdateConfig(ctx, kagentiprovider.ConfigUpdate{
    LLMProvider: "anthropic",
    APIKey:      "sk-ant-...",
})
```

## Migration Path

**Note**: This package was renamed from `pkg/kagenti_provider` to follow Go naming conventions (no underscores in package names). All imports have been updated accordingly.

Future improvements could include:
- Extracting shared types/interfaces into a common `pkg/agent/types` package
- Consolidating client packages under `pkg/agent/` (e.g., `pkg/agent/kcagentclient`, `pkg/agent/kagentiprovider`)
- Unifying endpoint discovery logic between kc-agent and kagenti clients
