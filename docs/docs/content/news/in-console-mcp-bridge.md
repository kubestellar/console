# In-Console MCP Bridge: Native Model Context Protocol for Kubernetes

> *Closes [#18768](https://github.com/kubestellar/console/issues/18768) — June 2026*

---

**MCP is now built into the KubeStellar Console. No extra deployment. No separate auth. Just query your clusters in natural language.**

The Model Context Protocol (MCP) has become the standard for giving AI models structured access to external tools and data sources. With [PR #18101](https://github.com/kubestellar/console/pull/18101) and [PR #18154](https://github.com/kubestellar/console/pull/18154), KubeStellar Console ships a **native MCP server running in-process** — giving any MCP-compatible AI client direct access to your Kubernetes clusters through the console's existing authentication and multi-cluster routing.

---

## What Shipped

### PR #18101 — In-Process MCP Server

Introduces a native MCP server that starts alongside the console backend. The server exposes Kubernetes cluster data through the MCP protocol, running in the same process as the console API server and reusing its connection pool, auth middleware, and cluster routing.

Key implementation details:
- Runs on the same port as the console API (`/mcp` prefix)
- Reuses the console's JWT session for authentication — no separate MCP credentials
- Kubernetes tools are registered at startup from the console's existing handler inventory
- Supports SSE and WebSocket transports

### PR #18154 — MCP Tool Registration for Multi-Cluster

Extends the in-process MCP server with tool definitions covering the full multi-cluster query surface:

- `list_clusters` — enumerate all connected clusters with health status
- `get_cluster_health` — detailed health for a specific cluster
- `list_namespaces` — namespaces across one or all clusters
- `list_pods` — pods with filtering by namespace, label, and status
- `get_pod_logs` — log streaming with tail and since parameters
- `list_nodes` — node status, capacity, and allocatable resources
- `apply_manifest` — apply a YAML manifest to a specific cluster
- `run_mission` — execute a console-kb mission against target clusters
- `list_missions` — browse available missions by category

---

## Features

### Runs In-Process

The MCP server shares memory and connections with the console backend. There is no separate process to start, no port to expose, and no additional Kubernetes service account to configure. If the console is running, MCP is running.

### No Extra Deployment

Traditional Kubernetes MCP setups require deploying a separate MCP gateway or proxy alongside your cluster tooling. The in-console bridge eliminates this — the console's existing Helm chart or binary deployment is all that's needed.

### Uses Console Auth

MCP clients authenticate using the same JWT session token as the console UI. Any AI client that can log in to the console can use MCP. Permissions are enforced through the console's existing RBAC layer — an MCP client can only access clusters and namespaces the logged-in user is permitted to see.

---

## Comparison: Standalone vs. In-Console

| Feature | Standalone `kubestellar-mcp` | In-Console MCP Bridge |
|---------|-----------------------------|-----------------------|
| Deployment | Separate binary / Helm chart | Built into console — no extra deploy |
| Authentication | Separate kubeconfig / service account | Console JWT session (same auth as UI) |
| Multi-cluster routing | Manual cluster context switching | Automatic — routes to any connected cluster |
| Tool count | Core Kubernetes tools | Core + console-specific tools (missions, dashboards) |
| Mission execution | Not supported | `run_mission` tool available |
| Demo mode | Not supported | Full demo data when no cluster connected |
| Upgrade path | Separate release cadence | Upgraded with the console |
| Observability | Separate logging | Integrated with console audit log |

The standalone `kubestellar-mcp` remains available for use cases that need MCP without the full console — edge deployments, CI pipelines, and toolchains that don't need a UI. The in-console bridge is the right choice for teams already running the console.

---

## Example Use Cases

### Natural Language Cluster Queries

Ask your AI assistant about cluster state without switching tools:

> "Which pods in the `payments` namespace are not in Running state across all my clusters?"

The MCP client sends this to Claude (or GPT-4, Gemini), which calls the `list_pods` tool with `namespace=payments` and `status!=Running`, receives the structured response, and renders a summary — without the operator needing to know the exact `kubectl` incantation.

### Cross-Cluster Comparison

> "Compare the cert-manager version running in production-east and production-west."

The AI calls `list_pods` twice (once per cluster), compares the image tags in the response, and reports back — identifying drift that would require multiple terminal windows and context switches manually.

### Mission Execution via Chat

> "Run the certificate rotation runbook on production-east."

The AI calls `run_mission` with `mission=certificate-rotation` and `cluster=production-east`. The console executes the mission and streams progress events back through the MCP tool result, which the AI surfaces as a narrative summary.

---

## Example Session

```
User: List all clusters and their health status.

Claude (via MCP list_clusters):
  - production-east  ✓ Healthy  (Kubernetes 1.30.2)
  - production-west  ✓ Healthy  (Kubernetes 1.30.2)
  - staging          ✓ Healthy  (Kubernetes 1.30.4)
  - dev-1            ⚠ Degraded (1 node NotReady)

User: What's wrong with dev-1?

Claude (via MCP get_cluster_health + list_nodes):
  Node dev-1-worker-3 is NotReady.
  Last condition: KubeletNotReady — runtime network not ready:
  NetworkPlugin kubelet cni config not ready: no networks found in /etc/cni/net.d

  This looks like a CNI plugin issue. Would you like me to run the
  Cilium diagnostic mission on dev-1?

User: Yes, go ahead.

Claude (via MCP run_mission):
  Running mission: cilium-cni-diagnosis on cluster: dev-1
  Step 1/5: Checking Cilium pod status... ✓ 2/3 pods Running
  Step 2/5: Inspecting failed pod logs... ✓ CNI binary missing from /opt/cni/bin
  Step 3/5: Reinstalling CNI binaries... ✓ Complete
  Step 4/5: Restarting Cilium DaemonSet... ✓ 3/3 pods Running
  Step 5/5: Verifying node Ready... ✓ dev-1-worker-3 is now Ready

  dev-1 is now fully healthy.
```

---

## Why MCP for Multi-Cluster

Managing Kubernetes at scale means context-switching constantly — between terminals, cluster contexts, dashboards, and runbooks. Every context switch is cognitive overhead and an opportunity for error.

MCP gives AI models **structured, grounded access** to your infrastructure, which means:

- The AI doesn't hallucinate cluster state — it reads it directly
- Queries are grounded in real data, not training-set approximations
- The operator stays in one tool (their AI client) and describes intent, not commands

For multi-cluster environments specifically, the MCP bridge handles cluster routing transparently. The AI doesn't need to know about kubeconfig contexts or cluster endpoints — it asks `list_clusters`, picks the right one, and routes subsequent calls there automatically.

---

## How to Use

### Prerequisites

- KubeStellar Console v0.23.0 or later
- A running console instance with at least one connected cluster
- Any MCP-compatible AI client (Claude Desktop, Cursor, Cline, Continue, or a custom client)

### Configuration

Add the console as an MCP server in your client's config:

**Claude Desktop (`claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "kubestellar": {
      "url": "http://localhost:8080/mcp",
      "transport": "sse",
      "headers": {
        "Authorization": "******"
      }
    }
  }
}
```

**Cursor / VS Code (`.cursor/mcp.json`):**

```json
{
  "servers": {
    "kubestellar": {
      "url": "http://localhost:8080/mcp",
      "transport": "sse"
    }
  }
}
```

Obtain a session token from the console UI under **Settings → API Tokens**, or use the OAuth flow to get a JWT directly.

### Verify the Connection

```bash
curl http://localhost:8080/mcp/tools/list \
  -H "Authorization: ******" | jq '.tools[].name'
```

Expected output:
```
"list_clusters"
"get_cluster_health"
"list_namespaces"
"list_pods"
"get_pod_logs"
"list_nodes"
"apply_manifest"
"run_mission"
"list_missions"
```

---

## Comparison with Other Kubernetes MCP Servers

| Server | Auth model | Multi-cluster | Missions | Demo mode | Maintained by |
|--------|-----------|--------------|---------|----------|--------------|
| In-Console MCP Bridge | Console JWT | ✅ Automatic | ✅ Native | ✅ Yes | KubeStellar |
| kubestellar-mcp (standalone) | kubeconfig | ✅ Manual | ❌ No | ❌ No | KubeStellar |
| mcp-kubernetes | kubeconfig | ❌ Single cluster | ❌ No | ❌ No | Community |
| kubectl-mcp-server | kubeconfig | ❌ Single cluster | ❌ No | ❌ No | Community |

The in-console bridge is the most capable option for teams already running KubeStellar Console, offering native multi-cluster routing and console-kb mission execution that standalone servers cannot match.

---

## Links and Contribution

- [PR #18101 — In-Process MCP Server](https://github.com/kubestellar/console/pull/18101)
- [PR #18154 — MCP Tool Registration](https://github.com/kubestellar/console/pull/18154)
- [MCP Protocol specification](https://spec.modelcontextprotocol.io)
- [KubeStellar Console MCP docs](https://github.com/kubestellar/console/blob/main/docs/integrations/)
- [Console-KB missions for MCP use cases](https://github.com/kubestellar/console-kb)

To contribute new MCP tools, see the tool registration pattern in `pkg/mcp/tools.go` and open an issue or PR in the [console repository](https://github.com/kubestellar/console).

---

*— The KubeStellar Team*

*KubeStellar Console is open source under Apache 2.0 and part of the [KubeStellar](https://kubestellar.io) CNCF Sandbox project.*
