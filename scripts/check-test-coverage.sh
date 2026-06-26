#!/bin/bash
# scripts/check-test-coverage.sh
#
# Finds newly added source files in web/src/hooks/ and web/src/components/
# that have no corresponding test file, then writes a markdown gap report.
#
# Usage:
#   ./scripts/check-test-coverage.sh          # uses origin/main as base ref
#   ./scripts/check-test-coverage.sh <BASE>   # custom base ref / SHA
#
# Output:
#   /tmp/test-coverage-gaps.md — markdown report (always written)
#   stdout                      — gap_count=N  (read by the workflow)
#   Exit code: 0 always — informational only, never blocks CI.
#
# Test detection rules:
#   Hooks:      web/src/hooks/useFoo.ts        → hooks/__tests__/useFoo*.test.{ts,tsx}
#   Components: web/src/components/X/Foo.tsx   → X/__tests__/Foo*.test.{ts,tsx}
#                                                 or X/Foo.test.{ts,tsx} (co-located)

set -euo pipefail

BASE_REF="${1:-origin/main}"
REPORT="/tmp/test-coverage-gaps.md"
REPO_ROOT="$(git rev-parse --show-toplevel)"

cd "$REPO_ROOT"

# ── Collect newly added (A) and renamed (R) source files in this PR ──────────

CHANGED=$(git diff --name-only --diff-filter=AR "${BASE_REF}...HEAD" 2>/dev/null \
  || git diff --name-only --diff-filter=AR "${BASE_REF}..HEAD" 2>/dev/null \
  || true)

# ── Helper: true when at least one test file exists for <base> in <dir> ──────
# Uses `find` rather than shell globs so this works correctly as a bash script.

has_test() {
  local dir="$1"
  local base="$2"
  # Check __tests__/ subdirectory first (primary convention in this repo)
  [ -n "$(find "${dir}/__tests__" -maxdepth 1 -name "${base}*.test.*" 2>/dev/null | head -1)" ] && return 0
  # Fall back to co-located test files (used by a few top-level components)
  [ -n "$(find "${dir}" -maxdepth 1 -name "${base}.test.*" 2>/dev/null | head -1)" ] && return 0
  return 1
}

# ── Helper: true for files we always skip (not worth flagging) ────────────────

should_skip_file() {
  local base="$1"
  case "$base" in
    index | types | constants | demoData | demo | mocks | fixtures | stories) return 0 ;;
  esac
  return 1
}

# ── Scan hooks ────────────────────────────────────────────────────────────────

HOOKS_DIR="web/src/hooks"
HOOK_GAPS=()

while IFS= read -r f; do
  [ -z "$f" ] && continue

  # Only direct children of web/src/hooks/ (no sub-directories)
  echo "$f" | grep -qE "^${HOOKS_DIR}/[^/]+\.(ts|tsx)$" || continue

  # Skip test files and spec files
  echo "$f" | grep -qE '\.(test|spec)\.' && continue

  base=$(basename "$f")
  base="${base%.tsx}"
  base="${base%.ts}"

  should_skip_file "$base" && continue

  dir="${REPO_ROOT}/${HOOKS_DIR}"

  if ! has_test "$dir" "$base"; then
    HOOK_GAPS+=("$f")
  fi
done <<< "$CHANGED"

# ── Scan components ───────────────────────────────────────────────────────────

COMPONENTS_DIR="web/src/components"
COMPONENT_GAPS=()

while IFS= read -r f; do
  [ -z "$f" ] && continue

  # Any .ts/.tsx under web/src/components/ at any depth
  echo "$f" | grep -qE "^${COMPONENTS_DIR}/.+\.(ts|tsx)$" || continue

  # Skip __tests__ directories, test/spec files
  echo "$f" | grep -qE '__tests__|node_modules|\.(test|spec)\.' && continue

  base=$(basename "$f")
  base="${base%.tsx}"
  base="${base%.ts}"

  should_skip_file "$base" && continue

  dir="${REPO_ROOT}/$(dirname "$f")"

  if ! has_test "$dir" "$base"; then
    COMPONENT_GAPS+=("$f")
  fi
done <<< "$CHANGED"

# ── Build markdown report ─────────────────────────────────────────────────────

TOTAL=$(( ${#HOOK_GAPS[@]} + ${#COMPONENT_GAPS[@]} ))

{
  if [ "$TOTAL" -eq 0 ]; then
    echo "## :white_check_mark: Test Coverage Check"
    echo ""
    echo "All new source files in this PR have corresponding test files."
    echo ""
    echo "_Checked \`web/src/hooks/\` and \`web/src/components/\` against \`${BASE_REF}\`._"
  else
    echo "## :warning: Test Coverage Gaps"
    echo ""
    echo "**${TOTAL} new file(s) have no matching test.** This is informational — it will not block merge."
    echo ""
    echo "> To add tests, see the [test patterns in CLAUDE.md](CLAUDE.md) and existing examples"
    echo "> in \`web/src/hooks/__tests__/\`."
    echo ""

    if [ "${#HOOK_GAPS[@]}" -gt 0 ]; then
      echo "### Hooks (${#HOOK_GAPS[@]} untested)"
      echo ""
      echo "| New file | Suggested test location |"
      echo "|----------|------------------------|"
      for f in "${HOOK_GAPS[@]}"; do
        base=$(basename "$f")
        base="${base%.tsx}"
        base="${base%.ts}"
        echo "| \`${f}\` | \`web/src/hooks/__tests__/${base}.test.ts\` |"
      done
      echo ""
      echo "<details><summary>Hook test template</summary>"
      echo ""
      echo '```ts'
      echo "// web/src/hooks/__tests__/<HookName>-pure.test.ts"
      echo "import { describe, it, expect, vi } from 'vitest'"
      echo "// Mock external deps, then:"
      echo "import { __testables } from '../<HookName>'"
      echo "const { myPureHelper } = __testables"
      echo ""
      echo "describe('myPureHelper', () => {"
      echo "  it('happy path', () => { expect(myPureHelper('input')).toBe('expected') })"
      echo "})"
      echo '```'
      echo ""
      echo "</details>"
      echo ""
    fi

    if [ "${#COMPONENT_GAPS[@]}" -gt 0 ]; then
      echo "### Components (${#COMPONENT_GAPS[@]} untested)"
      echo ""
      echo "| New file | Suggested test location |"
      echo "|----------|------------------------|"
      for f in "${COMPONENT_GAPS[@]}"; do
        dir=$(dirname "$f")
        base=$(basename "$f")
        base="${base%.tsx}"
        base="${base%.ts}"
        echo "| \`${f}\` | \`${dir}/__tests__/${base}.test.tsx\` |"
      done
      echo ""
    fi

    echo "---"
    echo "_Checked against \`${BASE_REF}\`. Remove the \`needs-tests\` label once tests are added._"
  fi
} > "$REPORT"

# Emit structured output for the workflow to consume
echo "gap_count=${TOTAL}"
exit 0
