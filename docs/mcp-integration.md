# MCP Integration with KubeStellar Console

## Cross-Repository Integration

KubeStellar Console provides native integration with the [kubestellar-mcp](https://github.com/kubestellar/kubestellar-mcp) kubectl plugin.

## What is kubestellar-mcp?

`kubestellar-mcp` is a Model Context Protocol (MCP) server that bridges Kubernetes clusters to your local kubeconfig context. It enables:

- **Local cluster access** from your terminal via kubectl
- **Agent-driven operations** using the KubeStellar agent framework
- **Smart filtering** across multi-cluster Kubernetes environments
- **Policy enforcement** at the cluster boundary

## Using kubestellar-mcp with KubeStellar Console

### Installation

```bash
# Install kubestellar-mcp
go install github.com/kubestellar/kubestellar-mcp@latest

# Or via Homebrew
brew install kubestellar/tap/kubestellar-mcp
```

### Configuration

The console automatically bridges to kubestellar-mcp when available:

```bash
# Start the console with kubestellar-mcp
./startup-oauth.sh

# The kc-agent service (port 8585) will connect to kubestellar-mcp
# and make cluster operations available in-console
```

### Using in the Console

Once configured, kubestellar-mcp enables:

1. **In-console kubectl operations** via the agent
2. **Cluster context switching** without kubeconfig file edits
3. **MCP-aware policy enforcement** for operations

### Demo Mode

The console includes demo/mock data even without kubestellar-mcp installed:

```bash
# Start in demo mode (no kubestellar-mcp required)
./start-dev.sh
```

Demo mode provides:
- Full dashboard functionality
- Sample cluster data (pods, nodes, deployments)
- Card visualizations
- Navigation and drill-downs

## MCP Handler Implementation

KubeStellar Console's MCP bridge lives in:

```
pkg/mcp/                  # MCP server implementation
pkg/api/handlers/mcp/     # HTTP/WebSocket handlers for MCP operations
```

Key operations:
- `POST /api/agent/mcp/exec` — Execute MCP calls
- `WebSocket /ws/mcp` — MCP stream communication

## Cross-Discovery

- 🔗 [kubestellar-mcp GitHub](https://github.com/kubestellar/kubestellar-mcp)
- 🔗 [KubeStellar Console GitHub](https://github.com/kubestellar/console)
- 📖 [CONTRIBUTING.md](../CONTRIBUTING.md)

## For kubestellar-mcp Users

If you're using kubestellar-mcp and want to integrate with KubeStellar Console:

1. Install KubeStellar Console (this repo)
2. Configure kubestellar-mcp as your kubectl plugin
3. The console will automatically discover and use kubestellar-mcp
4. Access advanced Kubernetes operations directly from the dashboard

## For Console Contributors

If you're working on console features that use Kubernetes operations:

1. Ensure your code uses the MCP bridge in `pkg/mcp/`
2. Write tests that mock kubestellar-mcp responses
3. Verify demo mode works for UX testing
4. Reference kubestellar-mcp capabilities in docs

## Troubleshooting

### kubestellar-mcp not detected

```bash
# Verify kubestellar-mcp is installed and in PATH
which kubestellar-mcp

# Check kc-agent logs
# The agent (port 8585) should show MCP connection
curl -s http://localhost:8585/health | jq
```

### MCP operations failing in console

- Verify kubestellar-mcp has permission to access your kubeconfig
- Check cluster connectivity from your terminal: `kubectl get nodes`
- Review console logs for MCP handler errors

## Related Documentation

- [Agent Integration](../agent/)
- [API Handlers](../api/)
- [Contributing to Console](../CONTRIBUTING.md)
