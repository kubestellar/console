# Bug Discovery Infrastructure

Scripts for systematic AI-driven bug discovery in the KubeStellar Console.
Part of **LFX Mentorship: AI-Driven Bug Discovery & Remediation Architect** ([#4190](https://github.com/kubestellar/console/issues/4190)).

---

## Quick Start

```bash
# Run the full anti-pattern scan (prints markdown to stdout)
./scripts/bug-discovery.sh

# Write findings to a report file
./scripts/bug-discovery.sh --report

# Scan only one category
./scripts/bug-discovery.sh --category array-safety

# Generate a bug triage report (requires `gh` CLI)
./scripts/bug-triage-report.sh

# Write triage report to file with 14-day lookback
./scripts/bug-triage-report.sh --report --days 14
```

---

## Scripts

### `bug-discovery.sh` — Static Anti-Pattern Scanner

Scans `web/src/` for common bug patterns documented in the project's coding standards (see `CLAUDE.md`).

| Category | What It Detects |
|----------|-----------------|
| `array-safety` | `.map()`, `.filter()`, `.join()`, `.forEach()`, `for...of` without `\|\| []` guard |
| `magic-numbers` | Numeric literals not assigned to named constants (excludes 0, 1, type defs) |
| `demo-data` | Card components using `useCached*` without destructuring `isDemoData` |
| `any-types` | Explicit `any` type annotations in TypeScript |
| `raw-strings` | JSX string literals that appear to be English text not wrapped in `t()` |

**Output:** Markdown report with file:line references and per-category counts.

**Options:**
- `--report` — write output to `scripts/bug-discovery-report.md`
- `--category <name>` — scan only one category (`all` is default)

### `bug-triage-report.sh` — Bug Triage Summary

Combines GitHub issue data with static analysis results into one report.

**Sections:**
1. **Open bugs by label** — counts from `gh issue list` with `bug`/`kind/bug` labels
2. **Recently closed bugs** — issues closed within the lookback window
3. **Static analysis summary** — pattern frequency table from `bug-discovery.sh`

**Options:**
- `--report` — write output to `scripts/bug-triage-report.md`
- `--days <N>` — lookback window in days (default: 30)

**Prerequisites:**
- [`gh` CLI](https://cli.github.com/) installed and authenticated
- Run from the repo root

---

## Mentee Workflow

### 1. Initial Assessment

Run both scripts to get a baseline:

```bash
./scripts/bug-discovery.sh --report
./scripts/bug-triage-report.sh --report
```

Review the reports to understand the current state of the codebase.

### 2. Prioritize Findings

Focus on findings that are most likely to cause real bugs:

1. **Array safety** — missing `|| []` guards cause runtime crashes when APIs return `undefined`
2. **Missing `isDemoData`** — cards render demo data without visual indicators
3. **`any` types** — reduce TypeScript's ability to catch errors at compile time
4. **Magic numbers** — make code harder to understand and maintain
5. **Raw strings** — break internationalization for non-English users

### 3. Fix and Validate

For each finding:

1. Verify it's a real issue (heuristic scanners produce false positives)
2. Create a fix on a feature branch
3. Run `cd web && npm run build && npm run lint` to validate
4. Open a PR referencing the original issue

### 4. Track Progress

Re-run the scanner periodically to measure progress:

```bash
# Compare before/after
./scripts/bug-discovery.sh 2>/dev/null | grep 'Total findings'
```

### 5. Extend the Scanner

Add new categories to `bug-discovery.sh` as you discover patterns:

1. Add a new `scan_<name>()` function following the existing pattern
2. Register it in the `case` statement at the bottom
3. Document it in this README

---

## Integration with AI Agents

These scripts are designed to be consumed by AI coding agents:

- **Output is markdown** — easily parsed by LLMs
- **File:line references** — agents can navigate directly to findings
- **Category flags** — agents can focus on specific anti-pattern types
- **Exit code 0** — scripts always succeed so they can be chained in pipelines

Example agent prompt:
> Run `./scripts/bug-discovery.sh --category array-safety` and fix the top 5 findings,
> ensuring each `.map()` / `.filter()` call has an `|| []` guard on the data source.

---

## Related Documentation

- [`CLAUDE.md`](../CLAUDE.md) — Canonical project conventions and rules
- [`AGENTS.md`](../AGENTS.md) — AI agent guide
- [Issue #4190](https://github.com/kubestellar/console/issues/4190) — LFX Mentorship tracking issue
