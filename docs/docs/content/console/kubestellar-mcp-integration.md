# KubeStellar MCP Integration

## Overview

The KubeStellar Console integrates natively with [kubestellar-mcp](https://github.com/kubestellar/kubestellar-mcp), a kubectl plugin that provides AI-powered multi-cluster Kubernetes tools for Claude Code, VS Code, Cursor, and other MCP-compatible editors.

This integration gives you **two ways** to work with your clusters:

1. **Visual dashboard** — KubeStellar Console web UI with cards, missions, and drill-downs
2. **AI-powered CLI** — kubestellar-mcp plugin for natural language cluster operations in your editor

Both use the same underlying architecture and complement each other.

---

## What is kubestellar-mcp?

`kubestellar-mcp` is a Model Context Protocol (MCP) server that provides AI agents with direct access to your Kubernetes clusters. It enables natural language interactions like:

- "List all pods with issues across my clusters"
- "Show me RBAC permissions for the admin service account"
- "Deploy nginx to clusters with GPUs"
- "Check for security misconfigurations"

The plugin ships two MCP servers:

| Binary | Purpose |
|--------|---------|
| **kubestellar-ops** | Read-only diagnostics, RBAC analysis, security checks |
| **kubestellar-deploy** | App-centric deployment, GitOps, Helm, kubectl operations |

---

## How Console and kubestellar-mcp Work Together

### Console MCP Bridge

The KubeStellar Console includes a built-in MCP bridge (at `pkg/api/handlers/mcp/`) that allows the console to communicate with kubestellar-mcp instances. This bridge:

- Proxies MCP tool requests from the browser to `kubestellar-ops` / `kubestellar-deploy` running on your machine
- Enables console cards to invoke kubestellar-mcp tools for advanced diagnostics
- Provides a unified authentication flow for both web UI and CLI

### Demo Mode

The console's demo mode works **without** kubestellar-mcp installed. Demo data is served directly from the console backend. When you switch to live mode (connecting to real clusters), the console uses kubestellar-mcp for cluster operations.

---

## Installation

### Install kubestellar-mcp

#### Homebrew (Recommended)

```bash
brew tap kubestellar/tap
brew install kubestellar-ops kubestellar-deploy
```

#### From Source

```bash
git clone https://github.com/kubestellar/kubestellar-mcp.git
cd kubestellar-mcp

go build -o bin/kubestellar-ops ./cmd/kubestellar-ops
go build -o bin/kubestellar-deploy ./cmd/kubestellar-deploy

sudo mv bin/kubestellar-* /usr/local/bin/
```

### Configure Console to Use kubestellar-mcp

The console automatically detects kubestellar-mcp binaries if they are on your PATH. No additional configuration is required.

If you want to use a custom path:

```bash
export KUBESTELLAR_OPS_PATH=/path/to/kubestellar-ops
export KUBESTELLAR_DEPLOY_PATH=/path/to/kubestellar-deploy
```

---

## Using kubestellar-mcp with AI Editors

### Claude Code

1. Add the KubeStellar marketplace:
   ```
   /plugin marketplace add kubestellar/claude-plugins
   ```

2. Install the plugins:
   ```
   /plugin install kubestellar-ops
   /plugin install kubestellar-deploy
   ```

3. Verify:
   ```
   /mcp
   ```
   You should see `plugin:kubestellar-ops:kubestellar-ops · ✓ connected`

### VS Code (GitHub Copilot)

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "kubestellar-ops": {
      "command": "kubestellar-ops",
      "args": ["--mcp-server"]
    }
  }
}
```

### Cursor

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kubestellar-ops": {
      "command": "kubestellar-ops",
      "args": ["--mcp-server"]
    }
  }
}
```

---

## Example Workflows

### Console → kubestellar-mcp

When you click "Diagnose" on a failing pod in the console, the console calls the kubestellar-mcp MCP bridge to run diagnostics and returns the results to the UI.

### Editor → kubestellar-mcp

In Claude Code, you can ask "What pods are CrashLooping?" and the AI will invoke kubestellar-mcp tools to query your clusters and summarize the results.

### Both Together

You can browse clusters in the console web UI, then switch to your editor to run advanced diagnostics with natural language queries. Changes made via kubestellar-mcp (deployments, label updates, etc.) are immediately reflected in the console.

---

## Kubernetes RBAC

kubestellar-mcp uses your active kubeconfig. Ensure your kubeconfig context has the necessary permissions:

| Tool | Typical Permissions |
|------|---------------------|
| **kubestellar-ops** | `get`, `list`, `watch` on namespaces, pods, services, deployments, roles, clusterroles, etc. |
| **kubestellar-deploy** | Everything above, plus `create`, `update`, `patch`, `delete` on managed resources |

See the [kubestellar-mcp README](https://github.com/kubestellar/kubestellar-mcp#kubernetes-rbac) for example ClusterRole YAML.

---

## Troubleshooting

### Console cannot find kubestellar-mcp

- Verify the binaries are on your PATH: `which kubestellar-ops`
- If using custom paths, ensure `KUBESTELLAR_OPS_PATH` and `KUBESTELLAR_DEPLOY_PATH` are set
- Restart the console after installing kubestellar-mcp

### kubestellar-mcp not working in editor

- Verify the plugin is installed: run `/mcp` in Claude Code or check your `.vscode/mcp.json` config
- Restart your editor after installing the binaries
- Check that `KUBECONFIG` points to a valid kubeconfig with active contexts

### Permission errors

- Run `kubectl auth can-i --list` to see your current permissions
- Compare with the RBAC requirements in the [kubestellar-mcp README](https://github.com/kubestellar/kubestellar-mcp#kubernetes-rbac)
- Update your Role or ClusterRole bindings as needed

---

## Learn More

- [kubestellar-mcp on GitHub](https://github.com/kubestellar/kubestellar-mcp)
- [kubestellar-mcp documentation](https://github.com/kubestellar/kubestellar-mcp/tree/main/docs)
- [Console MCP bridge source](https://github.com/kubestellar/console/tree/main/pkg/api/handlers/mcp)
- [Model Context Protocol specification](https://modelcontextprotocol.io)
