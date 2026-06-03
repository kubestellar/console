# Stellar Guide

> **Alpha feature**: Stellar is an in-progress subsystem. The UI, REST APIs, background workers, and CRD design are present in this repository, but operators should treat the feature as experimental until the project declares a stable release.

Stellar is the console's **persistent AI runtime** for self-hosted environments. Instead of only answering one prompt at a time, Stellar keeps state across sessions and turns cluster signals into durable operator workflows:

- a dedicated UI at `/stellar`
- persistent notifications, tasks, watches, actions, missions, memory, solves, and audit history
- server-side background loops for reminders, stale approval review, and daily digests
- provider routing across local and cloud models
- SSE updates for live activity, notifications, and solve progress

## What Stellar does today

The current implementation is split across the Go API, SQLite-backed storage, and the React UI:

- **Operational state**: `/api/stellar/state`, `/api/stellar/digest`, `/api/stellar/health`
- **Interactive assistant**: `/api/stellar/ask` with provider/model selection
- **Persistent workflow objects**: missions, executions, actions, tasks, watches, notifications, memory, observations, solves, and audit entries
- **Autonomous handling**: event ingestion, watch management, auto-solve progress, and digest notifications
- **Live UI surfaces**: overview, events, chat, activity, tasks, watches, suggested tasks, and audit sections on the `/stellar` page

Key code locations:

- `pkg/api/handlers/stellar*.go` — REST handlers, SSE, workers, solve orchestration
- `pkg/store/*stellar*` — persistence for Stellar entities in SQLite
- `pkg/stellar/` — provider routing, schedulers, watchers, prompts, and solver logic
- `web/src/components/stellar/` — Stellar UI
- `web/src/services/stellar.ts` and `web/src/types/stellar.ts` — frontend API client and data contracts

## Runtime model

Stellar extends the console with a long-lived operator loop:

1. **Observe** cluster events, watches, notifications, and mission triggers.
2. **Persist** context in SQLite-backed records instead of ephemeral chat state.
3. **Reason** over provider output plus rule-based fallbacks.
4. **Act** through queued or approved actions, mission execution, and follow-up tasks.
5. **Report** progress in the Stellar UI through REST polling and SSE updates.

This is why the codebase refers to Stellar as a persistent AI runtime rather than just a chat assistant.

## How to enable Stellar

Stellar is intended for the **self-hosted** console. The hosted demo is useful for UI exploration, but persistent runtime features depend on backend state and your chosen AI/provider setup.

### 1. Run a self-hosted console

Use one of the normal self-hosted entry points:

- `./startup-oauth.sh` for local development with GitHub OAuth
- `./start-dev.sh` for local development with the mock user flow
- `./deploy.sh` for cluster deployments

### 2. Configure providers

Stellar's provider registry can route to local or cloud providers. Useful variables include:

| Variable | Purpose |
| --- | --- |
| `STELLAR_DEFAULT_PROVIDER` | Chooses the default provider for asks and digest generation. |
| `STELLAR_DEFAULT_MODEL` | Overrides the default model used with the selected provider. |
| `STELLAR_FALLBACK_PROVIDER` | Names a fallback provider when the preferred one is unavailable. |
| `OLLAMA_BASE_URL` | Points Stellar at a local Ollama server. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `TOGETHER_API_KEY` | Enable backend/Stellar HTTP providers when those integrations are configured. |
| `STELLAR_OLLAMA_ALLOWED_CIDRS` | Restricts which Ollama host IPs are accepted for local-provider URLs. |

The provider registry defaults to an explicitly configured Stellar provider first, then configured cloud providers, and finally Ollama.

### 3. Protect stored provider credentials

If operators save user-specific provider credentials through the Stellar API, set:

- `STELLAR_ENCRYPTION_KEY` — **base64-encoded 32-byte key** used to encrypt stored provider keys

Without this key, provider secrets cannot be encrypted for persistent storage.

### 4. Tune background behavior

| Variable | Purpose |
| --- | --- |
| `STELLAR_QUIET_START` / `STELLAR_QUIET_END` | Quiet-hours window for suppressing non-urgent notifications. |
| `STELLAR_DIGEST_HOUR` | UTC hour when the daily digest worker emits recap notifications. |

## Using Stellar in the UI

After the console is running:

1. Open **`/stellar`**.
2. Review the top-level health, unread count, and batch controls.
3. Use **Events** to inspect incoming alerts and solve progress.
4. Use **Chat** to ask for operational help and create follow-up tasks.
5. Use **Tasks** and **Watches** to track work that persists across sessions.
6. Use **Activity** and **Audit** to review what Stellar did and why.

## Data Stellar persists

Stellar persistence is backed by the console store and currently includes:

- preferences and provider defaults
- missions and mission executions
- queued, approved, rejected, and completed actions
- notifications and digest markers
- tasks and overdue reminders
- watches on specific resources
- memory entries and dedupe keys
- observations, solve attempts, and activity log entries
- audit log entries for sensitive actions

## Related docs

- [Stellar architecture](architecture.md)
- [Stellar v1alpha1 CRDs](crds-v1alpha1.yaml)
- [Security model](../security/SECURITY-MODEL.md)
- [AI security checklist](../security/SECURITY-AI.md)
