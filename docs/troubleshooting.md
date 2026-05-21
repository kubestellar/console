# Troubleshooting

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
