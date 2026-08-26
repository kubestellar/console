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
- **Pre-PR gate:** Do not run `npm run build` or `npm run lint` locally; CI validates both on the PR.
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

When you finish a task, summarize what changed and note that build/lint are validated by CI on the PR. Do not push or open PRs unless explicitly asked.

## File-split refactor rules (oversized files — MANDATORY)

Splitting an oversized source or test file trips CI in predictable ways. Every
split PR must follow these rules (learned from ten red split-PRs on 2026-08-26):

1. **Test-file naming:** split parts of `name.test.ts(x)` MUST be named
   `name.<part>.test.ts(x)` — the `.test.` suffix must stay LAST. A file named
   `name.test.<part>.ts` escapes the tsconfig test exclude and gets compiled by
   the strict app build (`noUnusedLocals`), producing hundreds of tsc errors.
2. **Per-file import hygiene:** never copy the original import block wholesale.
   Each split file imports ONLY what it uses. Unused imports/consts count as
   NEW violations under the lint-baseline ratchet (`npm run lint:check`) even
   though the original file was baselined — the baseline is keyed by file path.
3. **JSX needs `.tsx`:** any split part containing JSX must be a `.tsx` file.
4. **Completeness check:** after splitting, verify each part is self-contained —
   shared `beforeEach`/helpers/mocks either move to a setup module that each
   part imports, or are duplicated per part. Diff the concatenation of the
   parts against the original: no test, helper, or trailing block may be
   truncated, and every file must be brace-balanced.
5. **Moved baselined violations:** code moved verbatim that carried a baselined
   violation (e.g. `no-restricted-syntax` raw elements, `no-this-alias`) shows
   up as NEW in the new path. Fix it properly if trivial; otherwise add a
   justified `// eslint-disable-next-line <rule>` comment noting the code was
   moved verbatim — do not silently regress the ratchet.
6. **If your split PR goes red, fix THAT PR:** `gh pr checkout <N>`, read the
   build-gate job's "New lint violations" / tsc error list, push repair commits
   to the same branch. Never open a replacement PR.
