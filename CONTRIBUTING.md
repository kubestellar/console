# Contributing to KubeStellar Console

## Issues Are Welcome

The best way to contribute is by opening an issue. Bug reports, feature requests, UX feedback, and questions all help shape the project. Use [GitHub Issues](https://github.com/kubestellar/console/issues).

## How Development Works

Most code in this repo is written by coding agents — Claude Opus 4.5/4.6, Gemini, and Codex. PRs are generated, reviewed, and iterated on by these agents with human oversight.

**Manual coding PRs are discouraged.** They take significantly longer to complete and review compared to agent-generated code. If you want to contribute code, use one of the supported agents:

- **Claude Code** (Claude Opus 4.5 or 4.6) — primary development tool
- **GitHub Copilot** — used for automated PR fixes
- **Google Gemini** — supported for code generation
- **OpenAI Codex** — supported for code generation

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
