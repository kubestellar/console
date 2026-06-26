# Homebrew Support for KubeStellar Console

## Current Status

**The KubeStellar Console itself does NOT have a Homebrew formula** and installation via `brew install kubestellar-console` is not supported.

## Why No Homebrew Formula?

The console is designed to run as a **web service**, not as a CLI tool. The recommended installation methods are:

1. **Hosted Demo** (no install) — https://console.kubestellar.io
2. **Local self-host** via `curl | bash` — See [README.md](../README.md#local-install-self-host)
3. **Kubernetes deployment** via Helm — See [deploy/helm/](../deploy/helm/)
4. **Source build** — Clone and run `./start-dev.sh`

Homebrew formulas are optimized for **CLI binaries**, not long-running services with web UIs, databases, and OAuth flows.

## What IS Available via Homebrew?

The **kc-agent** (Kubernetes cluster agent that bridges the console to your kubeconfig) IS available via Homebrew:

```bash
brew tap kubestellar/tap
brew install kc-agent
```

This is the recommended way to install `kc-agent` on macOS and Linux.

## Future Plans

There are **no plans** to create a Homebrew formula for `kubestellar-console` itself. The install script (`start.sh`) already handles:

- Platform detection (macOS, Linux, WSL2)
- Dependency checks (Go, curl)
- Automatic download and launch of pre-built binaries
- Background process management
- Configuration setup

This provides a better user experience than a Homebrew formula would for a multi-component web application.

## Related Issues

- Original request: kubestellar/homebrew-tap#46
- Tracking issue: kubestellar/console#16351

## Need Help?

See the [README.md](../README.md) for installation instructions or open an issue at https://github.com/kubestellar/console/issues.
