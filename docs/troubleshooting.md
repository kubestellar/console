# Troubleshooting

## OAuth / Authentication errors

**Symptoms:** Login redirects back with an auth error, GitHub OAuth never completes, or the backend logs missing GitHub credentials.
**Fix:** Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` before starting the console, and make sure the GitHub OAuth app callback URL exactly matches your local or deployed `/auth/github/callback` endpoint.

## AI provider errors

**Symptoms:** AI chat returns provider authentication failures, model not found errors, or startup logs mention invalid provider configuration.
**Fix:** Re-check the provider API keys in your environment, confirm the selected provider is enabled, and verify any model name env var matches a model that provider actually serves.

## kc-agent failures

**Symptoms:** `kc-agent` exits immediately, cannot connect to the console, or logs a WebSocket/authentication failure.
**Fix:** Confirm port `8585` is free before starting the agent, then restart both sides so the console and `kc-agent` are using the same fresh token or session state.

## Port conflicts

**Symptoms:** Startup scripts fail with `address already in use`, or the UI/API never comes up on the expected port.
**Fix:** Stop the process already using backend port `8080`, frontend port `5174`, or agent port `8585`, then rerun the startup script so all services bind to the standard ports.

## Build failures

**Symptoms:** `go build` fails with unsupported language features, frontend install/build errors mention the Node version, or dependency resolution is inconsistent.
**Fix:** Use Go `1.22+` and Node `20+`. Prefer `npm ci` when installing from a clean checkout or CI-style environment, and use `npm install` only when you intentionally need to update `package-lock.json`.

## WSL2 cross-environment networking

If your Kubernetes cluster runs inside WSL2 but the console or `kc-agent` runs in Windows PowerShell, kubeconfigs that point at `127.0.0.1` or `localhost` can fail because WSL2 loopback does not automatically bridge into the Windows network namespace.

### Symptoms

- `kc-agent` logs `Failed to connect to Kubernetes API at 127.0.0.1:<port>` during startup
- Cluster health shows the cluster as unreachable
- The console falls back to demo data or shows connectivity warnings

### Recommended fixes

1. Run the cluster, `kc-agent`, and the console in the same environment (all in WSL2, or all in Windows).
2. If you must keep a hybrid setup, update the kubeconfig server address to a hostname or IP that is reachable from the environment where `kc-agent` runs.
3. Re-test connectivity from the same shell that starts `kc-agent`, for example:

```bash
kubectl --context <context-name> cluster-info
curl -k https://<api-server-host>:<port>/version
```

If those commands fail from the `kc-agent` host, the agent will not be able to reach the cluster either.
