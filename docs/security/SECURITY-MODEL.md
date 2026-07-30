# KubeStellar Console — Security, Air-Gapped Deployments, and Local LLMs

This document answers three related questions that come up often:

1. **What is the security model?** Where does each request go, what does each component see, and what leaves the cluster? (Closes [#8194](https://github.com/kubestellar/console/issues/8194).)
2. **Can I run this in an air-gapped or network-restricted environment?** Yes — AI is optional and the core Kubernetes UX works with no outbound internet. (Closes [#8195](https://github.com/kubestellar/console/issues/8195).)
3. **Can I use a local or self-hosted LLM instead of a public provider?** Yes, via the OpenAI-compatible providers (Groq, OpenRouter, Open WebUI) whose base URLs are overridable. (Closes [#8196](https://github.com/kubestellar/console/issues/8196).)

Everything below is grounded in the current source tree. File and line references are included so reviewers can verify claims. If you find a drift between this document and the code, the code is authoritative — please open an issue.

---

## 1. Architecture and Data Flow

### Component diagram

The three-process architecture: a browser, a Go backend (serves UI, bootstrap-only identity), and kc-agent running on the user's own laptop (identity is the user's kubeconfig). Every cluster mutation flows through kc-agent.

![Mermaid diagram 1](diagrams/diagram-1.svg)

Dashed lines are optional: AI provider calls only happen when a key is configured. Solid lines with arrows are mandatory for full cluster-management functionality.

### Who is who

| Component | Binds | Identity | Source |
|---|---|---|---|
| Go backend | `:8080` (or ingress) | Pod ServiceAccount **for bootstrap, GPU reservation, and self-upgrade only** | `pkg/api/server.go`, `pkg/api/handlers/self_upgrade.go` |
| kc-agent | `127.0.0.1:8585` (loopback only, by default) | The **user's kubeconfig** (`~/.kube/config`) | `pkg/agent/server.go:578` (`addr := fmt.Sprintf("127.0.0.1:%d", s.config.Port)`), `cmd/kc-agent/main.go:25` (`flag.Int("port", 8585, …)`) |
| Browser | n/a | GitHub OAuth (optional) | `pkg/api/handlers/auth.go` |

The kc-agent listen address is hardcoded to the loopback interface (`127.0.0.1`) — it is not reachable from other machines on the LAN without a user-configured port forward. This is intentional.

### The pod-SA rule (identity invariant)

The Go backend's pod ServiceAccount is **only** used for:

1. Serving the frontend and storing console-local state (settings, token history, metrics cache). None of this touches a managed cluster.
2. **GPU reservation**: creating a namespace and a `ResourceQuota` on it. Users typically do not have namespace-create RBAC; the console is the authorized policy layer here.
3. **Self-upgrade**: the console patches its own `Deployment` to roll out a new image (`pkg/api/handlers/self_upgrade.go`).

**Every other user-initiated Kubernetes action goes through kc-agent** on the user's own machine, using the user's own kubeconfig. Per-cluster RBAC is therefore enforced by the target cluster's apiserver against the user's real identity, not against the console's pod SA.

Consequences:

- A user who has no local kc-agent running gets **read-only / demo-mode** behavior. Destructive operations fail by design.
- The console running inside a cluster **cannot** escalate a user's privilege on a managed cluster by "impersonating" them. It does not try to.
- This is the rule that makes the hosted demo at [console.kubestellar.io](https://console.kubestellar.io) safe — that deployment has no trust relationship with your clusters at all.

### What each component sees

| Data | Browser | Go backend | kc-agent | AI provider |
|---|---|---|---|---|
| `~/.kube/config` | no | no | **yes** (read from local disk) | **never** |
| Cluster API credentials (tokens, client certs) | no | no | **yes** (extracted from kubeconfig contexts) | **never** |
| Pod logs, events, YAML manifests | yes (when viewing) | no (except the cluster it lives in) | **yes** (relayed from kubectl) | only if the user pastes them into a chat |
| AI chat prompts + conversation history | yes | no | **yes** (forwards to provider) | **yes** (the provider obviously sees what you send) |
| AI API keys | no (never sent to browser) | no | **yes** (in `~/.kc/config.yaml` or env) | used as `Authorization` header |
| GitHub OAuth client secret | no | **yes** (env var only) | no | no |

Key consequence: **the kubeconfig, raw secrets, and cluster credentials never cross the process boundary from kc-agent as direct credential uploads.** However, the data that can leave the machine depends on which kind of AI agent is configured:

- **CLI tool agents** (for example `claude-code`, `codex`, `gemini-cli`) run an external CLI locally. These agents can execute tools such as `kubectl` and `helm`, and the external CLI may send tool output or other cluster-derived context to its upstream LLM depending on the agent's behavior and the prompt. In the current build, `InitializeProviders` (`pkg/agent/registry.go:283`) registers **only** CLI-based tool-capable agents — `claude-code`, `bob`, `codex`, `gemini-cli`, `antigravity`, `goose`, and `copilot-cli`.
- **Direct HTTP providers** (for example OpenAI-compatible/API-key providers) construct an HTTP chat payload in `pkg/agent/provider_*.go`. For those providers, the outbound data is the request body built by the provider implementation (for example, system prompt + message history + current prompt; see `pkg/agent/provider_openai.go:207-238` for the OpenAI shape). **These API-only HTTP providers are intentionally not registered by `InitializeProviders` in the current build** (see the comment at `pkg/agent/registry.go:303-307`) and are therefore not selectable at runtime.

### What kc-agent does **not** send to AI providers

- It does not upload `~/.kube/config`.
- It does not upload cluster bearer tokens, client certificates, or any other credential material.
- It does not auto-attach arbitrary cluster objects on its own. For direct HTTP providers, the conversation context is whatever the user chose to type or paste, plus the system prompt defined in the provider implementation (`DefaultSystemPrompt`).
- For CLI tool agents, be aware that cluster data can still leave the machine indirectly if the agent runs commands (for example via `kubectl` or `helm`) and the external CLI includes that output in requests to the upstream model.

If you need to audit what leaves the machine, distinguish the two paths: for **direct HTTP providers**, inspect the outbound request construction and HTTP call sites in `pkg/agent/provider_*.go`; for **CLI tool agents**, audit the external CLI invocation plus whatever tool output and prompts that CLI may forward upstream. The `provider_*.go` call sites are therefore the AI egress points only for the direct HTTP provider path, not for every configured agent type.

### Authentication and transport

- **kc-agent → browser**: loopback HTTP/WS. An optional shared secret can be required by setting `KC_AGENT_TOKEN`; when unset, the agent auto-generates a per-session token, logs a warning with a docs pointer, and prints the generated value so local clients can authenticate (`pkg/agent/server.go`).
- **Browser → Go backend**: HTTP/WS on port 8080 (or through an ingress). GitHub OAuth is optional — if `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` are unset, the console runs with a mock `dev-user` identity (see `start-dev.sh`).
- **CORS / allowed origins**: the backend and kc-agent maintain an allow-list; additional origins can be added via `KC_ALLOWED_ORIGINS` (comma-separated) to `kc-agent` (`pkg/agent/server.go:191`).
- **CSP**: the backend's Content-Security-Policy explicitly includes `http://127.0.0.1:8585` and `http://localhost:8585` in `connect-src` so the browser can reach a local kc-agent (`pkg/api/server.go:429-432`).

![Mermaid diagram 2](diagrams/diagram-2.svg)

The loopback bind is the primary defense against network-level access. The CORS allow-list, DNS-rebinding guard, and optional token are layered defenses against local attackers — rogue browser tabs or other local processes that could reach `127.0.0.1:8585` if loopback alone were the only gate. Setting `KC_AGENT_TOKEN` adds the fourth layer, which is recommended when the user cannot assume that all local processes are trusted. Generate one with `openssl rand -hex 32`, then export it before starting `kc-agent` (or place it in `.env` when using `start-dev.sh` / `startup-oauth.sh`).

### What actually leaves the cluster (when self-hosted in-cluster)

If you deploy the console inside a cluster with `deploy.sh`, outbound traffic from the **backend pod** is limited to:

- GitHub API calls for OAuth exchange. These can be disabled by leaving `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` unset.
- Nothing else in the core install. No telemetry, no AI calls. AI calls originate from the user's **local** kc-agent, not from the pod.

Note on update checks: the GitHub update polling lives in `pkg/agent/update_checker.go` and runs inside the **local kc-agent** binary on the user's machine, not inside the in-cluster backend pod. An in-cluster backend deployment does not poll GitHub from the server pod for update checks.

---

## 2. Air-Gapped and Secure Deployments

The console is designed to work in three progressively stricter network postures.

### Posture A — fully online (default)

Everything enabled: GitHub OAuth, AI via a hosted provider, update checks, card proxies to third-party dashboards.

### Posture B — restricted egress (no AI provider)

All cluster-management features continue to work. **AI is optional.** In the current runtime, AI features are gated by the availability of a registered AI agent/provider, and the active registry is CLI-based. API-key-based providers are recognized in configuration, but they are not currently wired into the runtime provider registry/status path, so setting `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, or `OPEN_WEBUI_API_KEY` does **not** by itself enable AI features. When no supported CLI-backed AI agent/provider is available, AI-driven features fall back to deterministic / rule-based behavior.

To run without AI:

1. Do **not** configure or run any supported CLI-backed AI agent/provider for kc-agent.
2. Treat the Settings → API Keys modal and related `*_API_KEY` variables as non-operative for current runtime enablement; leaving them empty is fine, but their presence alone does not activate AI.
3. Optionally block outbound DNS/HTTP to known hosted AI endpoints such as `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `api.groq.com`, and `openrouter.ai` at your egress as defense in depth.

### Posture C — fully air-gapped

Core requirements:

- The cluster's own API server must still be reachable from kc-agent (that's the entire point of the tool).
- GitHub OAuth must be disabled (leave `GITHUB_CLIENT_ID` unset). The console will use the local dev-user identity, or you can front the console with any other authentication your cluster supports.
- AI is disabled as in Posture B, **or** routed to an in-cluster LLM (see [§3. Local / self-hosted LLMs](#3-local--self-hosted-llms)).
- GitHub update checks can be disabled by not setting `GITHUB_REPO` (see `pkg/agent/update_checker.go:46`) and by running a version that does not poll for updates.

Card proxies that call third-party APIs (ArgoCD, Prometheus, etc.) are only used by the specific cards that consume them. If you do not add those cards to your dashboard, no outbound calls are made.

### Posture comparison

![Mermaid diagram 3](diagrams/diagram-3.svg)

Dotted arrows are explicitly blocked at the egress (firewall or network policy). Every arrow that remains is an outbound call that must succeed for the feature on that arrow to work.

### What must exist inside your perimeter

| Requirement | Why |
|---|---|
| Container images for `kubestellar/console` and `kc-agent` | Pull into a local registry before install |
| `~/.kube/config` with reachable contexts | kc-agent uses this for all cluster ops |
| (Optional) Local LLM endpoint reachable from the machine running kc-agent | Only if you want AI features; see §3 |
| (Optional) Internal GitHub / GitLab OAuth provider | Only if you want user auth |

Nothing else is mandatory. The console does not phone home.

---

## 3. Local / Self-Hosted LLMs

The AI layer is a set of pluggable providers under `pkg/agent/provider_*.go`. Each provider maps to one API key env var (listed in `pkg/agent/config.go:277-314`) and, in some cases, a base-URL override.

### Important: current registration status

The provider implementations for **Groq**, **OpenRouter**, and **Open WebUI** (and the other API-key HTTP providers such as Claude API, OpenAI, and Gemini) exist in `pkg/agent/provider_*.go`, **but they are not registered by `InitializeProviders`** in the current build. They are explicitly excluded as "API-only agents" (see `pkg/agent/registry.go:303-307`) because the active runtime registry only registers CLI-based tool-capable agents (`claude-code`, `bob`, `codex`, `gemini-cli`, `antigravity`, `goose`, `copilot-cli`). As a result, **these HTTP providers cannot currently be selected via the runtime provider registry**, and their `*_BASE_URL` environment variables are parsed by the provider source files but are **not** wired into a selectable provider at runtime.

The currently supported self-hosted path is therefore the CLI tool-agent path: install one of the supported local CLIs (for example `claude-code`, `codex`, or `gemini-cli`) on the machine that runs kc-agent, and it will be picked up by `InitializeProviders`.

### Provider source files and env vars (reference)

The table below documents the provider implementations that exist in the source tree and the env vars they parse. Rows marked "Registered?" as **no** are not currently selectable at runtime.

| Provider | `provider` name | API key env var | Model env var | Base URL env var | Registered? | Source |
|---|---|---|---|---|---|---|
| Anthropic Claude (HTTP) | `claude` / `anthropic` | `ANTHROPIC_API_KEY` | `CLAUDE_MODEL` | — | no | `pkg/agent/provider_claude.go` |
| OpenAI (ChatGPT, HTTP) | `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` | — | no | `pkg/agent/provider_openai.go:15` |
| Google Gemini (HTTP) | `gemini` / `google` | `GOOGLE_API_KEY` | `GEMINI_MODEL` | — | no | `pkg/agent/provider_gemini.go:15` |
| Groq (OpenAI-compatible, HTTP) | `groq` | `GROQ_API_KEY` | `GROQ_MODEL` | `GROQ_BASE_URL` | **yes (chat only)** | `pkg/agent/provider_groq.go` |
| OpenRouter (OpenAI-compatible, HTTP) | `openrouter` | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `OPENROUTER_BASE_URL` | **yes (chat only)** | `pkg/agent/provider_openrouter.go` |
| Open WebUI (OpenAI-compatible, HTTP) | `open-webui` | `OPEN_WEBUI_API_KEY` | `OPEN_WEBUI_MODEL` | `OPEN_WEBUI_URL` | **yes (chat only)** | `pkg/agent/provider_openwebui.go` |
| Ollama (local, OpenAI-compatible) | `ollama` | `OLLAMA_API_KEY` (optional) | `OLLAMA_MODEL` | `OLLAMA_URL` (default `http://127.0.0.1:11434`) | **yes (chat only)** | `pkg/agent/provider_local_openai_compat.go` |
| llama.cpp server | `llamacpp` | `LLAMACPP_API_KEY` (optional) | `LLAMACPP_MODEL` | `LLAMACPP_URL` | **yes (chat only)** | `pkg/agent/provider_local_openai_compat.go` |
| LocalAI | `localai` | `LOCALAI_API_KEY` (optional) | `LOCALAI_MODEL` | `LOCALAI_URL` | **yes (chat only)** | `pkg/agent/provider_local_openai_compat.go` |
| vLLM | `vllm` | `VLLM_API_KEY` (optional) | `VLLM_MODEL` | `VLLM_URL` | **yes (chat only)** | `pkg/agent/provider_local_openai_compat.go` |
| LM Studio | `lm-studio` | `LM_STUDIO_API_KEY` (optional) | `LM_STUDIO_MODEL` | `LM_STUDIO_URL` (default `http://127.0.0.1:1234`) | **yes (chat only)** | `pkg/agent/provider_local_openai_compat.go` |
| Red Hat AI Inference Server | `rhaiis` | `RHAIIS_API_KEY` (optional) | `RHAIIS_MODEL` | `RHAIIS_URL` | **yes (chat only)** | `pkg/agent/provider_local_openai_compat.go` |

"Chat only" means the provider reports `CapabilityChat` but not `CapabilityToolExec`. AI missions that need to execute cluster commands (kubectl, helm) still route through the tool-capable CLI agents (`claude`, `codex`, `gemini-cli`, `antigravity`, `goose`, `copilot-cli`, `bob`); local LLM providers are selectable in the agent dropdown for analysis and chat workflows but do not drive missions. See `pkg/agent/registry.go:303` for the rationale comment and `promoteExecutingDefault()` which keeps a mission-capable agent as the default whenever one is available.

The upstream Anthropic, OpenAI, and Gemini HTTP providers remain intentionally unregistered — they cannot execute commands AND they route traffic to a specific vendor the operator has no say over, so they offer strictly less than the CLI agent equivalents. The `pkg/agent/provider_openai.go:15` hostname is still hard-coded.

### Local LLM strategy

The registered local LLM providers unlock a "chat stays inside the cluster" posture: when `OLLAMA_URL` (or any of the six runner-specific env vars) points at an in-cluster Service or a workstation-local server, user prompts and the model's responses never reach a public vendor. The `docs/security/SECURITY-MODEL.md` threat model still applies: kubeconfig files, bearer tokens, and cluster credentials are never put into the chat request body regardless of which provider is selected.

For a decision matrix on which runner fits which deployment profile, the install missions, and three topology diagrams, see the [Local LLM Strategy](https://docs.kubestellar.io/console/local-llm-strategy/) page on docs.kubestellar.io. Each runner has a companion install mission in `kubestellar/console-kb` (for example `install-ollama`, `install-llama-cpp`, `install-localai`, `install-vllm`, `install-rhaiis`, `install-lm-studio`, `install-open-webui`, `install-claude-desktop`), reachable from the agent selector dropdown when the runner is not yet configured.

### Working path today — point a local LLM at the dropdown

The examples below are **active recipes** as of this revision of the document — the providers they rely on are registered in `InitializeProviders` and the `Available` field in the agent dropdown honors these env vars.

#### Routing a local LLM through a dedicated provider slot

![Mermaid diagram 4](diagrams/diagram-4.svg)

Each local LLM runner has its own provider key and env var, so operators can point a single kc-agent at several runners simultaneously and switch between them from the dropdown. The request payload is the standard OpenAI wire format — any OpenAI-compatible local runner works without the console knowing or caring which one. When the env var is unset, the provider is listed in the dropdown as unavailable with a link to its install mission.

#### Local LLM as a security posture

Using a local / on-prem LLM is the strongest way to keep prompts and conversation history inside your trust boundary. When the base URL points at something running on your own cluster (or on your own workstation), the AI traffic never leaves your perimeter. This is the supported direction for operators in regulated, air-gapped, or high-sensitivity environments. Pair a local runner with the Console's existing "no AI" (Posture B) path as an explicit escalation: start with B, enable a local LLM when the operator needs it, and never route chat to a public vendor unless the policy explicitly allows it.

See `pkg/agent/provider_local_openai_compat.go` for the shared factory, and `pkg/agent/provider_groq.go`, `pkg/agent/provider_openrouter.go`, `pkg/agent/provider_openwebui.go` for the three previously-staged slots that are now also registered.

#### Ollama

[Ollama](https://ollama.com) exposes an OpenAI-compatible endpoint at `http://localhost:11434/v1`. kc-agent ships with Ollama as a registered provider; the env var defaults to the loopback endpoint so on a workstation with Ollama running, the provider becomes Available automatically:

```bash
export OLLAMA_URL=http://127.0.0.1:11434     # optional — this is also the default
export OLLAMA_MODEL=llama3.2
./bin/kc-agent
```

kc-agent calls `${OLLAMA_URL}/v1/chat/completions` (see `pkg/agent/provider_local_openai_compat.go` — the generic LocalOpenAICompatProvider factory). The dropdown lists "Ollama (Local)"; selecting it routes chat through Ollama.

#### llama.cpp / LocalAI / vLLM / RHAIIS

Each runner has the same shape. Set the runner's URL env var to the in-cluster Service URL (or loopback for a workstation install) and pick the provider from the dropdown:

```bash
export LLAMACPP_URL=http://llama-server.llamacpp.svc.cluster.local:8080
export LOCALAI_URL=http://local-ai.localai.svc.cluster.local:8080
export VLLM_URL=http://vllm.vllm.svc.cluster.local:8000
export RHAIIS_URL=http://rhaiis.rhaiis.svc.cluster.local:8000
./bin/kc-agent
```

For the corresponding install missions, use `install-llama-cpp`, `install-localai`, `install-vllm`, `install-rhaiis` from `kubestellar/console-kb`. The dropdown's install-mission link for each unavailable runner points at these directly.

#### LM Studio (workstation)

LM Studio runs on macOS, Windows, or Linux and exposes an OpenAI-compatible server on `127.0.0.1:1234` from the Developer tab. The `lm-studio` provider defaults to that endpoint, so on a laptop with LM Studio running it becomes Available automatically:

```bash
export LM_STUDIO_URL=http://127.0.0.1:1234   # optional — this is also the default
./bin/kc-agent
```

See `install-lm-studio` for the workstation setup walkthrough.

#### Groq / OpenRouter / Open WebUI gateways

If you already run a corporate LLM gateway that speaks the OpenAI API (Groq LPU for throughput, OpenRouter as a multi-model gateway, Open WebUI as a self-hosted frontend), point the corresponding base URL at it:

```bash
# Claude via LiteLLM proxy or other gateway
export ANTHROPIC_API_KEY=<your api key>
export ANTHROPIC_BASE_URL=https://your-litellm-proxy.example.com/v1
export CLAUDE_MODEL=aws/claude-opus-4-7
./bin/kc-agent

# Groq LPU gateway or an internal OpenAI-compatible gateway
export GROQ_API_KEY=<your key>
export GROQ_BASE_URL=https://llm-gateway.internal.example.com/v1
export GROQ_MODEL=llama-3.1-70b-versatile

# OpenRouter or an internal unified gateway
export OPENROUTER_API_KEY=<your key>
export OPENROUTER_BASE_URL=https://llm-gateway.internal.example.com/v1
export OPENROUTER_MODEL=mixtral-8x7b

# Open WebUI frontend
export OPEN_WEBUI_API_KEY=<token>
export OPEN_WEBUI_URL=http://open-webui.llm.svc:3000
export OPEN_WEBUI_MODEL=llama3.1
./bin/kc-agent
```

All three are registered as chat-capable providers and are honored by the runtime. See `pkg/agent/provider_groq.go`, `pkg/agent/provider_openrouter.go`, `pkg/agent/provider_openwebui.go` for the full field-by-field provider definitions.

### Config file vs env vars

kc-agent reads API keys from two places, in this order of precedence:

1. **Environment variables** (see `pkg/agent/config.go:130-135` — "Environment variable takes precedence").
2. **`~/.kc/config.yaml`** — written by the Settings → API Keys modal in the UI. File permissions are forced to `0600` on save (`pkg/agent/config.go:16`).

Base URLs (`ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `GROQ_BASE_URL`, etc.) are **environment-only** in the current build — there is no UI field for them. That is intentional for the moment: overriding a provider's base URL is an advanced, air-gap-flavored use case, and keeping it in env vars avoids a second place to audit.

### What never leaves the machine

Even with a public AI provider configured, the following are **never** included in the request body:

- The contents of `~/.kube/config`.
- Cluster bearer tokens or client certificates.
- GitHub OAuth secrets.
- Any file the user did not explicitly paste into the chat.

The provider request body is the system prompt, message history, and current prompt — see `buildMessages` in `pkg/agent/provider_openai.go:207-238` for the canonical example.

---

## 4. Quick reference

### Environment variables cheat sheet

| Variable | Consumer | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | kc-agent | Claude API key |
| `ANTHROPIC_BASE_URL` | kc-agent | Override for Claude endpoint (use for LiteLLM proxy or other gateways) |
| `OPENAI_API_KEY` | kc-agent | OpenAI API key |
| `OPENAI_BASE_URL` | kc-agent | Override for OpenAI endpoint |
| `GOOGLE_API_KEY` | kc-agent | Gemini API key (note: not `GEMINI_API_KEY`) |
| `GROQ_API_KEY` | kc-agent | Groq API key |
| `GROQ_BASE_URL` | kc-agent | Override for Groq endpoint (use for local OpenAI-compatible servers) |
| `OPENROUTER_API_KEY` | kc-agent | OpenRouter API key |
| `OPENROUTER_BASE_URL` | kc-agent | Override for OpenRouter endpoint |
| `OPEN_WEBUI_API_KEY` | kc-agent | Open WebUI token |
| `OPEN_WEBUI_URL` | kc-agent | Open WebUI base URL |
| `CLAUDE_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL` / `GROQ_MODEL` / `OPENROUTER_MODEL` / `OPEN_WEBUI_MODEL` | kc-agent | Model override per provider |
| `KC_AGENT_TOKEN` | kc-agent | Optional shared secret for browser→agent auth |
| `KC_ALLOWED_ORIGINS` | kc-agent | Extra allowed origins (comma-separated) |
| `DEV_MODE` | kc-agent | General kc-agent development/logging mode toggle |
| `KC_DEV_MODE` | kc-agent | Used for the backend-driven agent restart/dev path; not the general kc-agent dev-mode toggle |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Go backend | GitHub OAuth (optional) |
| `GITHUB_REPO` | kc-agent | Override update-check repo |

### Port and listen summary

| Port | Process | Default bind |
|---|---|---|
| 8080 | Go backend | `0.0.0.0:8080` (or ingress) |
| 8585 | kc-agent | `127.0.0.1:8585` (loopback only) |
| 5174 | Vite dev server | local dev only, not used by `start.sh` |

### Related documents

- [`SECURITY.md`](../../SECURITY.md) — vulnerability reporting
- [`docs/security/SECURITY-AI.md`](SECURITY-AI.md) — AI automation threat model (LLM-specific: prompt injection, supply chain, agent drift, token isolation)
- [`docs/security/SELF-ASSESSMENT.md`](SELF-ASSESSMENT.md) — CNCF security self-assessment
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — broader architecture overview
- [`README.md` § AI configuration](../../README.md#ai-configuration) — BYOK quick start

## 5. AI / Automation Surface

The runtime model above (backend, kc-agent, browser) is only part of the picture. The repo also runs LLM-backed GitHub workflows — Claude Code review on every PR, auto-qa and auto-qa-tuner on a cron, a GA4 → GitHub issue pipeline, and the kc-agent itself. These bring threat surfaces that don't look like classic web attacks (prompt injection, supply chain, agent drift, token isolation).

See **[`SECURITY-AI.md`](SECURITY-AI.md)** for the AI-specific threat model — six threat categories, current mitigations, and an audit checklist for adding new LLM-calling workflows.
