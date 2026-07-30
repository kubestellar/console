# `deploy.sh` reference

`deploy.sh` installs, upgrades, or uninstalls KubeStellar Console on a Kubernetes cluster with Helm.

## Usage

```bash
bash deploy.sh [flags]
```

Default behavior:
- Uses the current `kubectl` context
- Installs into namespace `kubestellar-console`
- Uses Helm release name `kc`
- Pulls the latest chart version from `https://kubestellar.github.io/console`
- Exposes the console with `kubectl port-forward` instructions unless you enable OpenShift or Ingress

## Prerequisites

Required:
- `helm`
- `kubectl`
- A reachable Kubernetes context (either your current context or one passed with `--context`)

Optional:
- GitHub OAuth credentials if you want GitHub sign-in
- `CLAUDE_API_KEY` if you want Claude-backed AI features

## Flags

| Flag | Short | Required | Default | Notes |
|---|---|---|---|---|
| `--context <name>` | `-c` | Only if no current context is configured | current `kubectl` context | Passed to Helm as `--kube-context` and to `kubectl` as `--context` |
| `--namespace <name>` | `-n` | No | `kubestellar-console` | Target namespace |
| `--release <name>` | `-r` | No | `kc` | Helm release name |
| `--version <version>` | `-v` | No | latest chart version | If omitted, Helm resolves the latest chart from the repo |
| `--set <key=value>` | — | No | none | Repeatable; forwarded to Helm unchanged |
| `--openshift` | — | No | `false` | Enables `route.enabled=true` and prints the OpenShift Route URL when available |
| `--ingress <host>` | — | No | disabled | Enables ingress and sets `ingress.hosts[0]` to the supplied hostname |
| `--github-oauth` | — | No | `false` | Prompts for GitHub OAuth credentials if they are not already in the environment |
| `--uninstall` | — | No | `false` | Removes the Helm release and namespace, then exits |

## Environment variable overrides

| Variable | Required | Used when | Effect |
|---|---|---|---|
| `GITHUB_CLIENT_ID` | Required only for GitHub OAuth | `--github-oauth` is set or you want OAuth configured non-interactively | Sets `github.clientId` |
| `GITHUB_CLIENT_SECRET` | Required only for GitHub OAuth | `--github-oauth` is set or you want OAuth configured non-interactively | Sets `github.clientSecret` |
| `CLAUDE_API_KEY` | No | You want Claude AI features enabled | Sets `claude.apiKey` |

### Required vs optional inputs

- **No flags are required** for a basic install if your current `kubectl` context is valid.
- **`--context` becomes required** when you do not already have a current Kubernetes context.
- **GitHub OAuth requires both** `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
  - If both variables are already exported, `--github-oauth` uses them.
  - If either is missing and `--github-oauth` is set, the script prompts for both values.
- **`--ingress` requires a hostname value**.
- **`--set` requires a `key=value` pair** and can be repeated.

## Exit codes and error conditions

| Exit code | Meaning | Typical cause |
|---|---|---|
| `0` | Success | Install, upgrade, or uninstall completed |
| `1` | Script-level validation failure | Missing `helm`/`kubectl`, no current context, or selected context is unreachable |
| Other non-zero codes | Propagated tool failure | A `helm` or `kubectl` command failed during install, upgrade, or uninstall |

Known error conditions:
- `helm` is not installed
- `kubectl` is not installed
- No Kubernetes context is configured and `--context` was not provided
- The named context cannot reach a cluster
- Helm repo update, install, or upgrade fails
- Namespace deletion, route lookup, or other `kubectl` operations fail

Notes:
- `--uninstall` exits successfully even when the release or namespace is already absent.
- Unknown flags are currently ignored by the argument parser instead of causing an immediate error.

## Helm values set by the script

The script may append these Helm values automatically:
- `github.clientId`
- `github.clientSecret`
- `claude.apiKey`
- `route.enabled=true`
- `ingress.enabled=true`
- `ingress.hosts[0].host=<host>`
- `ingress.hosts[0].paths[0].path=/`
- `ingress.hosts[0].paths[0].pathType=Prefix`

Additional `--set key=value` pairs are appended after the built-in values.

## Example invocations

### Basic install

```bash
bash deploy.sh
```

### Install to a specific context, namespace, and release name

```bash
bash deploy.sh --context my-cluster --namespace kubestellar-console --release kc
```

### Install a pinned chart version

```bash
bash deploy.sh --version 0.3.7
```

### Expose with an OpenShift Route

```bash
bash deploy.sh --openshift
```

### Expose with Ingress

```bash
bash deploy.sh --ingress console.example.com
```

### Configure GitHub OAuth from environment variables

```bash
export GITHUB_CLIENT_ID=your-client-id
export GITHUB_CLIENT_SECRET=your-client-secret
bash deploy.sh --github-oauth
```

### Enable Claude AI and pass extra Helm values

```bash
export CLAUDE_API_KEY=your-claude-key
bash deploy.sh --set image.tag=latest --set service.type=ClusterIP
```

### Uninstall

```bash
bash deploy.sh --uninstall
```
