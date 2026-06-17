# KubeStellar Console MCP Bridge

The KubeStellar Console ships an MCP bridge today. It is not a planned or
"coming soon" feature.

## What is available now

- The web app fetches cluster data through the shipped MCP-backed `/api/mcp/*`
  routes.
- When a local `kc-agent` is available, hooks can call the agent directly for
  richer cluster access and live updates.
- The browser authenticates local agent requests through `/api/agent/token`,
  injects the token with `agentFetch()`, and subscribes to kubeconfig change
  notifications over WebSocket.

## How the bridge works

1. Read hooks call `agentFetch()` and `getLocalAgentURL()` when the local agent
   is available.
2. If the local agent is unavailable, the UI falls back to the console backend
   and its `/api/mcp/*` endpoints.
3. Demo mode remains available when neither live path is active.

Mutating workload actions are explicitly local-agent backed, and the UI surfaces
that requirement instead of pretending the feature is still pending.

## Implementation references

- `web/src/hooks/mcp/agentFetch.ts`
- `web/src/hooks/mcp/sharedImpl.connection.ts`
- `web/src/hooks/useMCP.ts`
- `web/src/hooks/useWorkloads.ts`

## Testing guidance

For browser and component tests, mock `/api/mcp/*` responses directly. Existing
examples live in:

- `web/PLAYWRIGHT.md`
- `web/docs/TEST_AUTHORING_GUIDE.md`
