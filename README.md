# KubeStellar Console

![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/clubanderson/b9a9ae8469f1897a22d5a40629bc1e82/raw/coverage-badge.json)
[![ACMM](https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.kubestellar.io%2Fapi%2Facmm%2Fbadge%3Frepo%3Dkubestellar%252Fconsole%26v%3D3)](https://console.kubestellar.io/acmm?repo=kubestellar%2Fconsole)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/kubestellar/console/badge)](https://securityscorecards.dev/viewer/?uri=github.com/kubestellar/console)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12343/badge?v=2)](https://www.bestpractices.dev/projects/12343)
[![MTTR](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Fclubanderson%2F4ae525a9797e8f83231ac344fcb47226%2Fraw%2Fmedian-fix.json "Mean Time to Resolution — median time from issue filed to PR merged, updated every 5 minutes")](https://github.com/kubestellar/console/issues)

AI-powered multi-cluster Kubernetes dashboard with guided install missions for 250+ CNCF projects.

[Contributing](CONTRIBUTING.md)

![KubeStellar Console](docs/images/console-screenshot.png)

## Try it now (no install)

The fastest way to evaluate the console is the **hosted version** — no Kubernetes cluster, no install, no configuration. Demo data is built in:

> 👉 **[console.kubestellar.io](https://console.kubestellar.io)**

The hosted demo is a self-contained showcase: it serves canned demo data and intentionally **does not** talk to a local agent (`LOCAL_AGENT_HTTP_URL` is disabled in the Netlify build, so the browser cannot reach a kc-agent on your laptop). Use it to explore the UI, browse missions, and test cards without touching your machine. To work against your **own** clusters or use AI features with your own keys, you need to self-host the console — see the next section.

## Which path do I need?

| I want to… | What to do | Need a cluster? | Need to install anything? |
|---|---|---|---|
| Explore the UI / evaluate the product | [console.kubestellar.io](https://console.kubestellar.io) | no | no |
| Connect the console to **my own** clusters | [**Self-host**](#local-install-self-host) the console **and** install [**kc-agent**](#kc-agent-bridge-self-hosted-console-to-your-clusters) on the same machine | yes | yes (curl + kc-agent) |
| Self-host the console (air-gapped, custom OAuth, etc.) | [**Local install**](#local-install-self-host) | optional | yes |
| Run the console **inside** a cluster | [`deploy.sh`](deploy.sh) | yes | Helm-style script |

> **Note**: `kc-agent` is **not** consumed by the hosted demo at [console.kubestellar.io](https://console.kubestellar.io). It bridges your **self-hosted** console (running at `localhost:8080`) to your kubeconfig contexts and to AI providers. If you want the convenience of the hosted UI plus your real cluster data, you currently have to run the console locally.

## Local install (self-host)

The quickest path to a working console with your own data. `start.sh` downloads the pre-built console binary and a pre-built `kc-agent`, starts both, and opens [http://localhost:8080](http://localhost:8080):

```bash
curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash
```

Deploy into a cluster instead with [`deploy.sh`](deploy.sh) (`--openshift`, `--ingress <host>`, `--github-oauth`, `--uninstall`). For Helm chart installs that should talk to an in-cluster Kagenti backend, see [Connecting Kagenti](deploy/helm/kubestellar-console/README.md#connecting-kagenti).

## kc-agent (bridge self-hosted console to your clusters)

`kc-agent` is a small local HTTP/WS daemon that the **self-hosted** console talks to (default `http://127.0.0.1:8585`). It forwards requests from the browser to your kubeconfig contexts and to AI providers. The hosted demo at [console.kubestellar.io](https://console.kubestellar.io) cannot reach it (#6195) — kc-agent is only useful when you self-host.

**You do not need kc-agent** if you only want to browse the UI / demo data — just use the hosted demo. **`start.sh` already installs and launches a pre-built kc-agent for you**, so most users never need to install it manually. The instructions below are for development builds or platforms without a Homebrew formula:

**Prerequisites for kc-agent:**
- A kubeconfig that points at one or more reachable clusters (`kubectl get nodes` works locally)
- macOS, Linux, or Windows with WSL2 (see [Windows section](#windows-wsl2))

```bash
# macOS — Homebrew formula (pre-built)
brew tap kubestellar/tap && brew install kc-agent

# Linux / from source — requires Go 1.25+ (matches go.mod)
mkdir -p bin
go build -o bin/kc-agent ./cmd/kc-agent && ./bin/kc-agent
```

### kc-agent authentication (`KC_AGENT_TOKEN`)

`kc-agent` accepts a shared secret via `KC_AGENT_TOKEN`. When it is set, browser and WebSocket requests to the agent must present `Authorization: Bearer <token>` (or `?token=<token>` for a real WebSocket upgrade). This is recommended when you want an extra layer of protection against other local processes reaching `127.0.0.1:8585`.

- `start-dev.sh` and `startup-oauth.sh` auto-generate a random `KC_AGENT_TOKEN` for each session if you do not set one.
- Set `KC_AGENT_TOKEN` yourself if you want a stable secret across restarts or if you launch `kc-agent` manually.
- Generate one with `openssl rand -hex 32`.

```bash
export KC_AGENT_TOKEN="$(openssl rand -hex 32)"
./bin/kc-agent
```

When both the self-hosted console and `kc-agent` are running, open [http://localhost:8080](http://localhost:8080) and your local clusters appear in the cluster picker.

## Windows (WSL2)

The console install scripts and `kc-agent` are POSIX shell + Go, so they run unchanged inside WSL2. Native Windows (PowerShell / CMD) is not supported — install [WSL2 with Ubuntu](https://learn.microsoft.com/windows/wsl/install) and run everything from the WSL shell:

```powershell
# In PowerShell — one-time setup
wsl --install -d Ubuntu
```

Then from inside the Ubuntu/WSL shell. **`start.sh` only needs `curl`** — it downloads pre-built binaries, no Go toolchain required:

```bash
# Prerequisite: just curl
sudo apt-get update && sudo apt-get install -y curl

# Same install command as macOS / Linux
curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash
```

> **⚠️ Windows PowerShell `curl` gotcha:** In PowerShell, `curl` is an alias
> for `Invoke-WebRequest`, which behaves completely differently from the real
> curl. If you need to test endpoints from PowerShell (outside WSL), always
> use **`curl.exe`** instead of `curl`, or use the native PowerShell cmdlet:
>
> ```powershell
> # Option 1 — use curl.exe (the real curl shipped with Windows 10+)
> curl.exe -s http://localhost:8080/health
>
> # Option 2 — use PowerShell native cmdlet
> Invoke-RestMethod http://localhost:8080/health
> ```

**Building `kc-agent` from source is a separate path** — only needed if you want a development build of the agent rather than the prebuilt binary that `start.sh` already installs. It requires Go **1.25+** (the version pinned in `go.mod`) and `git`. Ubuntu's `golang-go` package usually lags the current release; use the [official Go install](https://go.dev/doc/install) or the `longsleep/golang-backports` PPA to get a recent version:

```bash
# add-apt-repository lives in software-properties-common — install it
# first on minimal Ubuntu/WSL images that don't ship with it.
sudo apt-get update && sudo apt-get install -y software-properties-common
sudo add-apt-repository -y ppa:longsleep/golang-backports
sudo apt-get update && sudo apt-get install -y golang-1.25 git
git clone https://github.com/kubestellar/console.git
cd console
mkdir -p bin
go build -o bin/kc-agent ./cmd/kc-agent && ./bin/kc-agent
```

Open http://localhost:8080 in your **Windows** browser — WSL2 forwards `localhost` automatically. Tracked by [#6185](https://github.com/kubestellar/console/issues/6185).

## GitHub authentication

The console uses **two** GitHub credentials (#6190). Most users need **neither** — the hosted demo works without any GitHub auth at all.

| Credential | What it does | When you need it |
|---|---|---|
| **GitHub OAuth App** (`GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`) | Sign-in for the **self-hosted** console at `localhost:8080` | Only if you self-host the console AND want user sign-in. Skip for the hosted demo. |
| **Consolidated GitHub PAT** (a.k.a. `FeedbackGitHubToken`) | Same single PAT powers everything: nightly E2E status, community activity, leaderboard widgets, and the `/issue` page that opens GitHub issues | Optional. Without it, `/issue` returns `503 Issue submission is not available` and the GitHub-powered dashboard widgets fall back to demo data. |

**Minimum to get started**: nothing — hit [console.kubestellar.io](https://console.kubestellar.io). Everything above is opt-in.

### Setting the consolidated PAT

There are two equivalent ways to supply this PAT — pick one. Both write to the same field (`FeedbackGitHubToken` in `pkg/api/handlers/feedback.go` and `pkg/api/handlers/github_proxy.go`), so you don't need to set both:

1. **`.env` file at the repo root** — set on startup, no UI step needed:
   ```
   FEEDBACK_GITHUB_TOKEN=ghp_…
   ```

2. **Settings UI** (self-hosted only, **admin role required**) — visit Settings → GitHub Token → paste. The UI POSTs to `/api/github/token`, which is gated on the console `admin` role and persisted to `~/.kc/settings.json` by the backend. On a fresh self-hosted install, the first authenticated user is auto-bootstrapped to admin so local instances are not locked out of settings.

The hosted Netlify demo cannot persist a PAT — it has no writable local backend — so Settings UI saves don't work there. Use the env-var path for self-hosting.

### Setting up GitHub OAuth (self-hosted only)

If you self-host the console and want sign-in:

1. **Create a [GitHub OAuth App](https://github.com/settings/developers)**
   - Homepage URL: `http://localhost:8080`
   - Callback URL: `http://localhost:8080/auth/github/callback`

2. **Clone the repo** (if you haven't already):
   ```bash
   git clone https://github.com/kubestellar/console.git
   cd console
   ```

3. **Create a `.env` file in the repo root** (`console/.env`):
   ```
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   ```

4. **Start the console**:
   ```bash
   ./startup-oauth.sh
   ```

Open http://localhost:8080 and sign in with GitHub. For Kubernetes deployments, pass `--github-oauth` to `deploy.sh` instead.

### Consolidated PAT scopes

Whichever path you used above (env var or Settings UI), the [Personal Access Token](https://github.com/settings/tokens) needs **either**:
- A **classic** PAT with the `repo` scope, **or**
- A **fine-grained** PAT with both **Issues: Read & Write** *and* **Contents: Read & Write** (verified against `pkg/api/handlers/feedback.go:71` — Contents is required, not just Issues).

## AI configuration

The console can use AI for adaptive card suggestions and mission help. AI is **optional** — the UI, missions, and dashboards all work without any AI keys configured (#6191).

**Important**: AI BYOK only works on the **self-hosted** console. The hosted demo at [console.kubestellar.io](https://console.kubestellar.io) explicitly disables `LOCAL_AGENT_HTTP_URL` (verified in `web/src/lib/constants/network.ts`), so the browser cannot reach a local agent there. To use your own AI keys, self-host the console first.

### Supported AI providers (CLI-based and local LLMs)

The console uses **local CLI providers** and **self-hosted LLMs** to maintain full control over cluster access and tooling capabilities. Direct API-key providers (like raw `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`) are **intentionally not supported** because they bypass the local CLI tooling model required for executing cluster commands (see `pkg/agent/registry.go:378` and [`docs/security/SECURITY-MODEL.md`](docs/security/SECURITY-MODEL.md#L175)).

**Recommended setup paths:**

1. **CLI-based agents** (with full tool execution capabilities):
   ```bash
   # Install Claude Desktop or claude CLI — https://claude.ai/download
   # Install Gemini CLI — follow official Google AI SDK instructions
   # Install GitHub Copilot CLI — gh extension install github/gh-copilot
   # Install other CLI agents: codex, antigravity, goose, bob
   
   # kc-agent will auto-detect installed CLI agents — no env vars needed
   ./bin/kc-agent
   ```

2. **Local/self-hosted LLM servers** (OpenAI-compatible endpoints):
   ```bash
   # Ollama (local)
   export OLLAMA_URL=http://127.0.0.1:11434
   export OLLAMA_MODEL=llama3.2
   
   # Open WebUI (self-hosted gateway)
   export OPEN_WEBUI_URL=https://your-openwebui.example.com
   export OPEN_WEBUI_API_KEY=your-key
   export OPEN_WEBUI_MODEL=gpt-4
   
   # Other supported: llama.cpp, LocalAI, vLLM, LM Studio, Red Hat AI Inference Server
   # See docs/security/SECURITY-MODEL.md for the full list
   
   ./bin/kc-agent
   ```

> **Why are direct API keys not supported?** The agent registry intentionally excludes upstream API-key providers (Anthropic API, OpenAI API, Google Gemini API) because they cannot execute cluster commands AND they route traffic to a specific vendor endpoint that the operator has no control over. The console's security model requires tool-capable agents that can run `kubectl`, `helm`, and other diagnostic commands locally. See `pkg/agent/registry.go:378-384` for the rationale.

> **A note on the Settings → API Keys modal**: The console UI exposes a "Manage Keys" button under **Settings → API Keys**. This modal is wired to the agent's `/settings/keys` endpoint, but in the current build that endpoint returns an empty providers list (`providers := []providerDef{}` in `pkg/agent/server_operations.go:288`) because API-key-driven agents are hidden. The modal is non-functional by design. **Use the CLI-based or local LLM setup paths above instead.**

**If no AI provider is configured**, AI-powered features fall back to deterministic / rule-based behavior. The card suggestions, missions, and dashboards remain fully usable.

**Security model, air-gapped deployments, and local / self-hosted LLMs** are covered in [`docs/security/SECURITY-MODEL.md`](docs/security/SECURITY-MODEL.md). That document explains the data flow between browser, Go backend, kc-agent, and AI providers; how to run the console with no external AI access; and the currently supported self-hosted path using kc-agent's CLI-based agents.

## How It Works

1. **Onboarding** — Sign in with GitHub, answer role questions, get a personalized dashboard
2. **Adaptive AI** — Tracks card interactions and suggests swaps when your focus shifts (Claude, OpenAI, or Gemini)
3. **MCP Bridge** — Queries cluster state (pods, deployments, events, drift, security) via `kubestellar-ops` and `kubestellar-deploy`
4. **Missions** — Step-by-step guided installs with pre-flight checks, validation, troubleshooting, and rollback
5. **Real-time** — WebSocket-powered live event streaming from all connected clusters

## Architecture

See the full [Architecture documentation](https://kubestellar.io/docs/console/overview/architecture) on the KubeStellar website.

### Related Repositories

- **[console-kb](https://github.com/kubestellar/console-kb)** — Knowledge base of guided installers for 250+ CNCF projects and solutions to common Kubernetes problems
- **[console-marketplace](https://github.com/kubestellar/console-marketplace)** — Community-contributed monitoring cards per CNCF project
- **[kc-agent](cmd/kc-agent/)** — Local agent bridging the browser to kubeconfig, coding agents (Codex, Copilot, Claude CLI), and MCP servers (`kubestellar-ops`, `kubestellar-deploy`)
- **[claude-plugins](https://github.com/kubestellar/claude-plugins)** — Claude Code marketplace plugins for Kubernetes
- **[homebrew-tap](https://github.com/kubestellar/homebrew-tap)** — Homebrew formulae for KubeStellar tools
- **[KubeStellar](https://kubestellar.io)** — Multi-cluster configuration management

## Quality Assurance

Console uses AI tools (GitHub Copilot, Claude Code) to accelerate development. Quality is maintained through **layered feedback loops** — every PR triggers the same automated checks regardless of author, and continuous monitoring catches what PR checks miss.

- **Before commit**: TypeScript build + Go build + 5 post-build safety checks + lint
- **Before merge**: nil-safety, ts-null-safety, array-safety, API contract, Playwright E2E, coverage gate, TTFI performance, CodeQL, Copilot code review, UI/UX standards scanner, visual regression
- **Visual regression**: 18 UI components documented as Storybook stories with theme support. Playwright captures screenshots and diffs against baselines on every PR that touches UI components.
- **After merge**: Targeted Playwright tests run against production (`console.kubestellar.io`); failures reopen the original issue
- **Continuous**: Hourly coverage (12 shards), 4x daily QA, nightly E2E, nightly security scanning, real-time GA4 error tracking, UI/UX standards nightly scan

When a regression class is identified, a maintainer adds an automated check to the earliest possible loop. See [docs/AI-QUALITY-ASSURANCE.md](docs/AI-QUALITY-ASSURANCE.md) for the full breakdown.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
