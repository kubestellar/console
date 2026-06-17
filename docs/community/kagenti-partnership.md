# Kagenti Partnership: AI Agent Control Plane

> Bridging KubeStellar Console's MCP bridge with Kagenti's A2A+MCP agent control plane.

## Partnership Overview

[Kagenti](https://github.com/kagenti/kagenti) is an AI agent control plane that implements both A2A (Agent-to-Agent) and MCP (Model Context Protocol) standards. KubeStellar Console already ships a production MCP bridge (`cmd/kc-agent/`) that exposes Kubernetes operations as MCP tools. This partnership creates a natural integration path.

## Integration Points

### 1. Console → Kagenti (Agent Orchestration)

The console's Stellar runtime can delegate complex multi-step missions to Kagenti-managed agents:

```
Console Mission → Stellar Executor → Kagenti A2A → Specialized Agent
                                                    ├── Security Agent
                                                    ├── Cost Agent
                                                    └── Compliance Agent
```

### 2. Kagenti → Console (Kubernetes Operations)

Kagenti agents can use the console's MCP bridge as a tool provider:

```
Kagenti Agent → MCP Client → Console MCP Bridge → Kubernetes API
                                                   ├── kubectl operations
                                                   ├── Helm management
                                                   └── Multi-cluster queries
```

### 3. Shared Tool Registry

Both projects define tools in MCP format. The console's existing tools (`docs/kagenti-tools.md`) are directly compatible with Kagenti's tool binding system.

## Community Value

| Benefit | For KubeStellar | For Kagenti |
|---------|----------------|-------------|
| Distribution | Kagenti users discover console via tool registry | Console users discover Kagenti for agent orchestration |
| Validation | Real-world MCP tool usage at scale | Production K8s tool provider |
| Standards | A2A adoption in K8s ecosystem | MCP bridge reference implementation |

## Action Items

- [ ] Joint blog post: "AI Agents Meet Kubernetes: MCP + A2A in Production"
- [ ] Cross-link documentation (console → kagenti, kagenti → console)
- [ ] Kagenti tool binding example using console MCP bridge
- [ ] Conference talk proposal (KubeCon co-presentation)
- [ ] Integration test: Kagenti agent using console MCP tools

## Related

- [Console MCP Bridge](../../README.md) — shipped in v0.3
- [Kagenti Tool Integration](../../integrations/kagenti-tool-integration.md)
- [Kagenti Deployment Guide](../../kagenti-deployment-guide.md)
