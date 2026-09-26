#!/bin/bash
# scripts/__tests__/resolve-build-sheriff.test.sh
#
# Shell regression tests for scripts/resolve-build-sheriff.py
# (Issue #23616, Part of #23534)
#
# These tests verify:
#   1. Empty rotation → falls back to `fallback` list, exits 0
#   2. Weekly rotation cycles and wraps around by ISO week since epoch
#   3. Any day within a week resolves to that week's sheriff
#   4. Date before epoch → falls back
#   5. Override for a week wins over the computed rotation
#   6. --mentions prints "@login" mentions on one line
#   7. Missing schedule file → exits 1
#   8. Malformed YAML → exits 1
#   9. No rotation and no fallback → exits 2
#  10. The committed .github/on-call-schedule.yml resolves to someone
#
# Usage:
#   bash scripts/__tests__/resolve-build-sheriff.test.sh
#
# Requirements: python3 with PyYAML

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESOLVER="$REPO_ROOT/scripts/resolve-build-sheriff.py"

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILURES=""

pass() {
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo "  ✓ $1"
}

fail() {
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_FAILED=$((TESTS_FAILED + 1))
  FAILURES="${FAILURES}\n  ✗ $1"
  echo "  ✗ $1"
  if [ -n "${2:-}" ]; then echo "    $2"; fi
}

assert_eq() {
  local expected="$1" actual="$2" name="$3"
  if [ "$expected" = "$actual" ]; then pass "$name"; else fail "$name" "expected '$expected', got '$actual'"; fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ROTATING="$TMP/rotating.yml"
cat > "$ROTATING" <<'EOF'
epoch: 2026-09-28
rotation: [alice, bob, carol]
overrides:
  - week_start: 2026-10-12
    sheriff: dave
fallback: [maint]
EOF

echo "resolve-build-sheriff.py"

# 1. Empty rotation → fallback
printf 'rotation: []\nfallback: [m1, m2]\n' > "$TMP/empty.yml"
OUT="$(python3 "$RESOLVER" --schedule "$TMP/empty.yml" --date 2026-10-01 | tr '\n' ' ')"
assert_eq "m1 m2 " "$OUT" "empty rotation falls back to fallback list"

# 2. Rotation cycles and wraps
assert_eq "alice" "$(python3 "$RESOLVER" --schedule "$ROTATING" --date 2026-09-28)" "epoch week → rotation[0]"
assert_eq "bob"   "$(python3 "$RESOLVER" --schedule "$ROTATING" --date 2026-10-05)" "week 1 → rotation[1]"
assert_eq "alice" "$(python3 "$RESOLVER" --schedule "$ROTATING" --date 2026-10-19)" "week 3 wraps to rotation[0]"

# 3. Any day within the week
assert_eq "bob" "$(python3 "$RESOLVER" --schedule "$ROTATING" --date 2026-10-11)" "Sunday resolves to that week's sheriff"

# 4. Before epoch → fallback
assert_eq "maint" "$(python3 "$RESOLVER" --schedule "$ROTATING" --date 2026-09-20)" "date before epoch falls back"

# 5. Override wins
assert_eq "dave" "$(python3 "$RESOLVER" --schedule "$ROTATING" --date 2026-10-14)" "override week beats computed rotation"

# 6. --mentions
assert_eq "@m1 @m2" "$(python3 "$RESOLVER" --schedule "$TMP/empty.yml" --date 2026-10-01 --mentions)" "--mentions prints @logins"

# 7. Missing file → exit 1
python3 "$RESOLVER" --schedule "$TMP/nope.yml" >/dev/null 2>&1
assert_eq "1" "$?" "missing schedule exits 1"

# 8. Malformed YAML → exit 1
printf 'rotation: [unclosed\n' > "$TMP/bad.yml"
python3 "$RESOLVER" --schedule "$TMP/bad.yml" >/dev/null 2>&1
assert_eq "1" "$?" "malformed YAML exits 1"

# 9. Nothing resolvable → exit 2
printf 'rotation: []\n' > "$TMP/none.yml"
python3 "$RESOLVER" --schedule "$TMP/none.yml" >/dev/null 2>&1
assert_eq "2" "$?" "no rotation and no fallback exits 2"

# 10. Committed schedule resolves
OUT="$(cd "$REPO_ROOT" && python3 "$RESOLVER")"
if [ -n "$OUT" ]; then pass "committed .github/on-call-schedule.yml resolves a sheriff"; else fail "committed schedule resolves nobody"; fi

echo
echo "Tests: $TESTS_RUN, Passed: $TESTS_PASSED, Failed: $TESTS_FAILED"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "Failures:$FAILURES"
  exit 1
fi
