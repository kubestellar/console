# pkg/kagent

HTTP client for the standalone kc-agent binary.

## Purpose

This package provides an HTTP client for communicating with the **kc-agent** binary, which runs as a standalone process (typically on the developer's local machine) to bridge the browser-based console with local kubeconfig contexts and MCP (Model Context Protocol) services.

## Responsibility

- **A2A Protocol Client**: Implements the Agent-to-Agent protocol for discovering and invoking the standalone kc-agent
- **Agent Discovery**: Discovers available agents via the kc-agent platform endpoint
- **Agent Card Fetching**: Retrieves agent capabilities and metadata via `/.well-known/agent.json`
- **HTTP Transport**: Provides low-level HTTP transport for A2A requests

## Architecture

The client is designed to be stateless and focused solely on HTTP communication:

- `KagentClient`: Main client struct with methods for agent discovery and invocation
- `AgentInfo`: Struct representing discovered agents
- `AgentCard`: Struct representing agent capability cards

## Deployment Context

The kc-agent binary runs **locally** (e.g., `cmd/kc-agent/`) and listens on a WebSocket port (default 8585). This package provides the HTTP client that the console backend uses to communicate with that local process.

## Related Packages

- `pkg/agent`: Parent orchestration package that uses this client via provider implementations
- `pkg/kagentiprovider`: Sister package for in-cluster kagenti deployments (different deployment model)
- `cmd/kc-agent`: The standalone binary that this client communicates with

## Usage

```go
import "github.com/kubestellar/console/pkg/kagent"

client := kagent.NewKagentClient("http://localhost:8585")
agents, err := client.ListAgents(ctx)
```
