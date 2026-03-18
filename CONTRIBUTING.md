# Contributing to KubeStellar Console

## Issues Are Welcome

The best way to contribute is by opening an issue. Bug reports, feature requests, UX feedback, and questions all help shape the project.

The fastest way to file an issue or feature request is by navigating to [`/issue`](http://localhost:8080/issue) in your running console (requires GitHub OAuth). You can also use [GitHub Issues](https://github.com/kubestellar/console/issues) directly. Programmatic issue creation from the console additionally requires `FEEDBACK_GITHUB_TOKEN` in `.env` — see [README.md](README.md#github-oauth) for setup.

## How Development Works

Most code in this repo is written by coding agents — Claude Opus 4.5/4.6, Gemini, and Codex. PRs are generated, reviewed, and iterated on by these agents with human oversight.

**Manual coding PRs are discouraged.** They take significantly longer to complete and review compared to agent-generated code. PRs that miss required patterns (isDemoData wiring, useCardLoadingState, locale strings, marketplace vs console) will be sent back — these are things coding agents catch automatically.

If you want to contribute code, use one of the supported agents:

- **Claude Code** (Claude Opus 4.5 or 4.6) — **strongly recommended**. Knows the full codebase, all CLAUDE.md rules, isDemoData wiring, card loading state patterns, and locale requirements. Install: `npm install -g @anthropic-ai/claude-code`
- **GitHub Copilot** — used for automated PR fixes
- **Google Gemini** — supported for code generation
- **OpenAI Codex** — supported for code generation

## New CNCF Project Cards

New monitoring cards for CNCF projects (Karmada, Falco, KEDA, etc.) belong in [**kubestellar/console-marketplace**](https://github.com/kubestellar/console-marketplace), **not** in this repo. The marketplace loads cards on-demand so they don't bloat the core bundle for users who don't need them.

PRs that add new card components to `web/src/components/cards/` will be redirected to console-marketplace.

## Test PRs Are Favored

The most valuable code contributions are **tests** — Playwright E2E tests, unit tests, or integration tests submitted as PRs. Tests shape how automated code generation works by defining expected behavior. A failing test PR is more useful than a code PR, because it tells the agents exactly what to build.

See the [`scripts/`](scripts/) directory for 30+ existing test scripts (API contract, security, helm lint, consistency, card registry integrity, and more). Run any of them directly:

```bash
bash scripts/api-contract-test.sh
bash scripts/consistency-test.sh
cd web && npx playwright test --grep "your-test"
```

## Getting Started Locally

Prerequisites: Go 1.24+, Node.js 20+

```bash
git clone https://github.com/kubestellar/console.git
cd console
./start-dev.sh
```

Starts backend on `:8080` and frontend on `:5174` with a mock `dev-user` account. See [CLAUDE.md](CLAUDE.md) for development conventions and card development rules.

## Commit Conventions

- Sign all commits with DCO: `git commit -s`
- Emoji prefix: `✨` feature | `🐛` bug fix | `📖` docs | `⚠️` breaking | `🌱` other

## Getting Help

- [Documentation](https://console-docs.kubestellar.io)
- [Slack - #kubestellar-dev](https://cloud-native.slack.com/archives/C097094RZ3M)
- [GitHub Issues](https://github.com/kubestellar/console/issues)
