# Contributing to KubeStellar Console

## Issues Are Welcome

The best way to contribute is by opening an issue. Bug reports, feature requests, UX feedback, and questions all help shape the project.

The fastest way to file an issue or feature request is by navigating to [`/issue`](http://localhost:8080/issue) in your running console (requires GitHub OAuth). You can also use [GitHub Issues](https://github.com/kubestellar/console/issues) directly. Programmatic issue creation from the console additionally requires `FEEDBACK_GITHUB_TOKEN` in `.env` — see [README.md](README.md#github-oauth) for setup.

## How Development Works

This project uses both human and AI-assisted development. All PRs — regardless of origin — must pass the same quality gates before merge. See [docs/AI-QUALITY-ASSURANCE.md](docs/AI-QUALITY-ASSURANCE.md) for the full list of CI gates, quality checks, and our regression response model.

> **Note for AI coding agents:** If you're an AI agent (Claude Code, Copilot, etc.), see [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) for agent-specific development conventions and patterns.

## New CNCF Project Cards

New monitoring cards for CNCF projects (Karmada, Falco, KEDA, etc.) belong in [**kubestellar/console-marketplace**](https://github.com/kubestellar/console-marketplace), **not** in this repo. The marketplace loads cards on-demand so they don't bloat the core bundle for users who don't need them.

PRs that add new card components to `web/src/components/cards/` will be redirected to console-marketplace.

## Repo Inventory Files

The repo-root [`INVENTORY.md`](INVENTORY.md) tracks the component, route, modal, and drill-down inventory that the Auto-QA workflow cross-checks against the source tree.

- **What it tracks:** repo inventory metadata used for consistency checks, especially entries that should stay aligned with files under `web/src/`.
- **How it is generated:** there is currently no single regeneration command; maintain `INVENTORY.md` manually when inventory-covered items change.
- **Whether CI enforces it:** yes. The Auto-QA workflow in [`.github/workflows/auto-qa.yml`](.github/workflows/auto-qa.yml) validates INVENTORY.md references against component files, routes, card types, and drill-downs.

## Test Contributions Are Welcome

One of the most valuable contributions you can make is **tests** — Playwright E2E tests, unit tests, or integration tests. Tests define expected behavior and help prevent regressions.

See the [`scripts/`](scripts/) directory for 30+ existing test scripts (API contract, security, helm lint, consistency, card registry integrity, and more). Run any of them directly:

```bash
bash scripts/api-contract-test.sh
bash scripts/consistency-test.sh
cd web && npx playwright test --grep "your-test"
```

## Getting Started Locally

Prerequisites: Go 1.26.4+, Node.js 20+

**macOS / Linux:**

```bash
git clone https://github.com/kubestellar/console.git
cd console
./start-dev.sh
```

**Windows (WSL2):**

Native Windows is not supported. Install [WSL2 with Ubuntu](https://learn.microsoft.com/windows/wsl/install) and run everything from the WSL shell:

```powershell
# In PowerShell — one-time setup
wsl --install -d Ubuntu
```

Then from inside the Ubuntu/WSL shell:

```bash
sudo apt-get update && sudo apt-get install -y curl git
git clone https://github.com/kubestellar/console.git
cd console
./start-dev.sh
```

See the [Windows (WSL2) section in README.md](README.md#windows-wsl2) for additional details on `curl` gotchas and building from source.

Starts backend on `:8080` and frontend on `:5174` with a mock `dev-user` account.

## Submitting a Pull Request

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/console.git
   cd console
   ```
3. **Create a feature branch** from `main`:
   ```bash
   git checkout -b fix/issue-name
   ```
4. **Make your changes** and commit with DCO sign-off:
   ```bash
   git commit -s -m "Fix: describe your change"
   ```
5. **Push to your fork**:
   ```bash
   git push origin fix/issue-name
   ```
6. **Open a PR** on GitHub targeting the `main` branch
7. **Wait for CI** to run — all 9 quality gates must pass before merge
8. **Address review feedback** if needed

### Code Standards

- All commits must be signed with DCO (`-s` flag)
- Follow existing code patterns in the file you're editing
- Add tests for new features or bug fixes
- Update documentation when changing behavior
- Keep PRs focused on a single concern

### Netlify Functions parity for API changes

If your PR changes shared API behavior, update both sides of the production architecture:

- The hosted site at `console.kubestellar.io` runs on **Netlify**, so supported `/api/*` routes in production are served by `web/netlify/functions/*.mts`, not only by the Go backend.
- When you change Go handlers, request/response shapes, or shared route behavior under paths such as `pkg/api/`, `cmd/console/`, or related API models, update the matching Netlify Function at the same time.
- Reviewers should be able to verify route parity from the diff before merge.

For the full dual-deployment explanation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#production-deployment-architecture).

### Testing Requirements

Before submitting your PR, verify your changes work:

```bash
# Run specific test scripts
bash scripts/api-contract-test.sh
bash scripts/consistency-test.sh

# Run frontend tests
cd web && npx playwright test
cd web && npm test
cd web && npm test -- src/components/MyComponent.test.tsx
```

CI will run the full test suite on your PR. See [docs/AI-QUALITY-ASSURANCE.md](docs/AI-QUALITY-ASSURANCE.md) for details on all quality gates.

## Commit Conventions

All commits must be signed with the Developer Certificate of Origin (DCO):

```bash
git commit -s -m "Your commit message"
```

The `-s` flag adds a `Signed-off-by` line to your commit message, certifying that you have the right to submit the code under the project's license.

**Commit message guidelines:**
- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Reference issue numbers when applicable ("Fixes #123")
- Keep the first line under 72 characters

## Change Tiers

Every PR gets automatically labeled with exactly one `tier/*` label when it opens. The tier classifies how much review scrutiny the change needs based on which files it touches. Rules live in [`.github/tier-classifier-rules.yml`](.github/tier-classifier-rules.yml); logic runs in [`.github/workflows/tier-classifier.yml`](.github/workflows/tier-classifier.yml).

| Label | Meaning | What it covers |
|---|---|---|
| `tier/0-automatic` | Safe — safe to fast-track | Lockfiles, `go.sum`, docs-only, `*.md`, i18n files, snapshots, generated artifacts |
| `tier/1-lightweight` | Single-concern, low risk | Test-only changes, editor config (`.editorconfig`, `.prettierrc`, etc.) |
| `tier/2-standard` | Default — standard review | Everything not matched by another tier |
| `tier/3-restricted` | Touches security-sensitive paths | `CODEOWNERS`, `.github/workflows/**`, `pkg/auth/**`, `pkg/api/middleware/**`, `docs/security/**`, Helm RBAC templates, GoReleaser config |

**Classification rules.** A PR is tier 3 if *any* of its files match a tier-3 path. Otherwise it's tier 0 only if *every* file is a tier-0 match; tier 1 only if every file is a tier-0 or tier-1 match; otherwise tier 2.

**Today:** labels are informational. Reviewers can use them to prioritize their queue.

**Future (separate PR):** `tier/0-automatic` PRs with CI green will auto-merge via admin squash. Rolling out after a week of label-only observation to confirm the rules don't produce false positives.

This system is adapted from fullsend-ai/fullsend's tier-based change classification — see [`SECURITY-AI.md`](docs/security/SECURITY-AI.md) for the broader context.

## Non-Code Contributions

Not every useful contribution requires writing product code. Documentation, translations, UX feedback, and community support all help the project move faster.

### Documentation PRs

Docs updates are always welcome — README improvements, setup fixes, walkthroughs, screenshots, and clarifications in `docs/` or other `*.md` files all count.

- Submit docs PRs the same way you would any other change: fork the repo, branch from `main`, keep the diff focused, and open a PR describing what improved.
- Docs-only PRs fall under `tier/0-automatic` because they touch only markdown files. Today that label is informational, but it does mean reviewers can usually fast-track the change once CI is green.
- In practice, small docs PRs are usually among the quickest reviews in the queue. Expect a relatively fast turnaround when the change is scoped, accurate, and easy to verify.

### Translations

We manage UI translations through [Crowdin](https://crowdin.com/). The repo's [`crowdin.yml`](crowdin.yml) syncs source strings from `web/src/locales/en/*.json` into the per-language locale files under `web/src/locales/`.

- If you want to translate existing strings, start with the English source files in `web/src/locales/en/common.json`, `web/src/locales/en/cards.json`, `web/src/locales/en/errors.json`, and `web/src/locales/en/status.json`.
- Use Crowdin to translate strings for your language rather than editing generated locale files by hand.
- If you find missing, unclear, or outdated English source text, open an issue or PR against the relevant `locales/en/*.json` file so translators have a clean source string to work from.

### Design and UX Contributions

Design feedback is valuable, especially when it improves usability, onboarding, or accessibility.

- File UX or accessibility issues through [`/issue`](http://localhost:8080/issue) in a local console session or directly in [GitHub Issues](https://github.com/kubestellar/console/issues).
- Include screenshots, screen recordings, reproduction steps, and the user impact when possible. Accessibility reports are especially helpful when they reference the affected page, component, keyboard flow, or WCAG criterion.
- If you want to review current accessibility work before filing an issue, start with [`docs/ACCESSIBILITY-AUDIT.md`](docs/ACCESSIBILITY-AUDIT.md).

### Community Contributions

You can also help without opening a PR:

- Triage issues by reproducing bugs, confirming whether they still happen on `main`, and adding concrete repro steps.
- Help other contributors by answering questions in [GitHub Issues](https://github.com/kubestellar/console/issues) or [Slack - #kubestellar-dev](https://cloud-native.slack.com/archives/C097094RZ3M).
- Point people to existing docs, related issues, or prior discussions so maintainers can spend more time shipping fixes.

## Getting Help

- [Documentation](https://kubestellar.io/docs/console/overview/)
- [Slack - #kubestellar-dev](https://cloud-native.slack.com/archives/C097094RZ3M)
- [GitHub Issues](https://github.com/kubestellar/console/issues)
