# KubeStellar Console

![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/clubanderson/b9a9ae8469f1897a22d5a40629bc1e82/raw/coverage-badge.json)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/kubestellar/console/badge)](https://securityscorecards.dev/viewer/?uri=github.com/kubestellar/console)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12343/badge?v=2)](https://www.bestpractices.dev/projects/12343)

AI-powered multi-cluster Kubernetes dashboard with guided install missions for 250+ CNCF projects.

[Contributing](CONTRIBUTING.md)

![KubeStellar Console](docs/images/console-screenshot.png)

## Try it now (no install)

The fastest way to evaluate the console is the **hosted version** — no Kubernetes cluster, no install, no configuration. Demo data is built in:

> 👉 **[console.kubestellar.io](https://console.kubestellar.io)**

Use the hosted demo to explore the UI, browse missions, and test cards without touching your machine. You only need to install anything below if you want to **connect your own clusters** or **self-host** the console (#6188).

## Which path do I need?

| I want to… | What to do | Need a cluster? | Need to install anything? |
|---|---|---|---|
| Explore the UI / evaluate the product | [console.kubestellar.io](https://console.kubestellar.io) | no | no |
| See the hosted console talk to **my own** clusters | Install [**kc-agent**](#kc-agent-connect-the-hosted-console-to-your-clusters) | yes | kc-agent only |
| Self-host the console (air-gapped, custom OAuth, etc.) | [**Local install**](#local-install-self-host) | optional | yes (Go + bash) |
| Run the console **inside** a cluster | [`deploy.sh`](deploy.sh) | yes | Helm-style script |

## kc-agent (connect the hosted console to your clusters)

`kc-agent` is a small local bridge — it forwards [console.kubestellar.io](https://console.kubestellar.io) requests to the kubeconfig contexts on your laptop. It is **only** required if you want the hosted console to read live data from clusters you control (#6189).

**You do not need kc-agent** if you only want to browse the UI / demo data — just use the hosted demo above.

**Prerequisites for kc-agent:**
- A kubeconfig that points at one or more reachable clusters (`kubectl get nodes` works locally)
- macOS, Linux, or Windows with WSL2 (see [Windows section](#windows-wsl2))

```bash
brew tap kubestellar/tap && brew install kc-agent   # macOS
go build -o bin/kc-agent ./cmd/kc-agent && ./bin/kc-agent  # Linux (Go 1.24+)
```

When `kc-agent` is running, open [console.kubestellar.io](https://console.kubestellar.io) and your local clusters appear in the cluster picker.

## Local install (self-host)

Only needed if you want to run the console on your own machine (air-gapped environments, custom OAuth, contributing to development). Most users can skip this and use the hosted demo + kc-agent above.

```bash
curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash
```

Opens at [localhost:8080](http://localhost:8080). Deploy into a cluster with [`deploy.sh`](deploy.sh) (`--openshift`, `--ingress <host>`, `--github-oauth`, `--uninstall`).

### Windows (WSL2)

The console install scripts and `kc-agent` are POSIX shell + Go, so they run unchanged inside WSL2. Native Windows (PowerShell / CMD) is not supported — install [WSL2 with Ubuntu](https://learn.microsoft.com/windows/wsl/install) and run everything from the WSL shell:

```powershell
# In PowerShell — one-time setup
wsl --install -d Ubuntu
```

Then from inside the Ubuntu/WSL shell:

```bash
# Prerequisites (Go 1.24+, curl, git)
sudo apt-get update && sudo apt-get install -y golang-go curl git

# Same install command as macOS / Linux
curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash

# kc-agent built from source (no Homebrew formula on WSL)
git clone https://github.com/kubestellar/console.git
cd console
go build -o bin/kc-agent ./cmd/kc-agent && ./bin/kc-agent
```

Open http://localhost:8080 in your **Windows** browser — WSL2 forwards `localhost` automatically. Tracked by [#6185](https://github.com/kubestellar/console/issues/6185).

## GitHub authentication

The console references three different GitHub credentials and they are **not interchangeable** (#6190). Most users need **none** of them — the hosted demo works without any GitHub auth at all. Use this table to pick what (if anything) applies to you:

| Credential | What it does | Where it lives | When you need it |
|---|---|---|---|
| **GitHub OAuth App** (`GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`) | Sign-in for the **self-hosted** console at `localhost:8080` | `.env` file at the repo root | Only if you self-host the console AND want user sign-in. Skip for the hosted demo. |
| **GitHub PAT in Settings UI** | Powers nightly E2E status, community activity, leaderboard widgets | Settings page → "GitHub Token" field (browser only, not on disk) | Optional. Adds GitHub-powered widgets to your dashboard. |
| **`FEEDBACK_GITHUB_TOKEN`** | Lets the `/issue` page open GitHub issues for you | `.env` file at the repo root | Optional. Only needed if you want users to file issues from inside the console. Without it, `/issue` returns `503 Issue submission is not available`. |

**Minimum to get started**: nothing — hit [console.kubestellar.io](https://console.kubestellar.io). Everything above is opt-in.

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

### `FEEDBACK_GITHUB_TOKEN` scopes

Add a [Personal Access Token](https://github.com/settings/tokens) to `.env`:

```
FEEDBACK_GITHUB_TOKEN=your-github-personal-access-token
```

The token needs a classic `repo` scope **or** a fine-grained token with **Issues: Read & Write**.

## AI configuration

The console can use AI for adaptive card suggestions and mission help. AI is **optional** — the UI, missions, and dashboards all work without any AI keys configured (#6191).

**How to add API keys:**

1. Make sure `kc-agent` is running locally (see [kc-agent](#kc-agent-connect-the-hosted-console-to-your-clusters))
2. Open the console → **Settings** → **API Keys** → **Manage Keys**
3. Paste a key from one of: [OpenAI](https://platform.openai.com/api-keys), [Anthropic Claude](https://console.anthropic.com/settings/keys), or [Google Gemini](https://aistudio.google.com/apikey)

Keys are sent only to your **local** `kc-agent` process and stored in its config file — they never reach the hosted backend, so BYOK is safe to use with [console.kubestellar.io](https://console.kubestellar.io). You can also pre-set keys via environment variables before launching `kc-agent`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Claude
export OPENAI_API_KEY=sk-...          # OpenAI
export GOOGLE_API_KEY=...             # Gemini
./bin/kc-agent
```

**If no key is configured**, AI-powered features fall back to deterministic / rule-based behavior. The card suggestions, missions, and dashboards remain fully usable.

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
