# AGENTS.md — KubeStellar Console

Tool-neutral entry point for AI coding agents (Claude Code, GitHub Copilot, Cursor, Codex, Aider, Continue, etc.) working on this repo.

## Source of truth

All project conventions, architecture notes, critical rules, and testing requirements live in **[`CLAUDE.md`](./CLAUDE.md)**. That file is the canonical guide — read it first, and follow it regardless of which AI tool you are using.

Tool-specific overrides (if any):

- GitHub Copilot: [`.github/copilot-instructions.md`](./.github/copilot-instructions.md)

If a tool-specific file conflicts with `CLAUDE.md`, `CLAUDE.md` wins.

## Quick orientation

- **Start the console:** `./startup-oauth.sh` (requires `.env` with GitHub OAuth) or `./start-dev.sh` (mock user, no OAuth).
- **Ports:** backend `8080`, frontend `5174`, kc-agent WebSocket `8585`.
- **Pre-PR gate:** `cd web && npm run build && npm run lint`.
- **Testing is mandatory** for UI and API work — see the "MANDATORY Testing Requirements" section in `CLAUDE.md`.

## Non-negotiable rules (excerpt — full list in `CLAUDE.md`)

- No magic numbers — use named constants.
- No hardcoded secrets — use env vars only.
- Array safety — guard with `(data || [])` before `.map`/`.filter`/`.join`/`for...of`.
- Use `DeduplicatedClusters()` when iterating clusters.
- All card data fetching goes through `useCache` / `useCached*` hooks.
- User-facing strings use `t()` from `react-i18next` — never raw strings.
- Netlify Functions (`web/netlify/functions/*.mts`) must be updated alongside Go API handlers, since production (console.kubestellar.io) runs on Netlify, not the Go backend.

## Reporting back

When you finish a task, summarize what changed and confirm the pre-PR gate (`npm run build && npm run lint`) passed. Do not push or open PRs unless explicitly asked.
