#!/bin/bash
# scripts/__tests__/kb-query-gap-tracker.test.sh
#
# Shell regression tests for scripts/kb-query-gap-tracker.sh
#
# The script had no test coverage at all, and its PREFLIGHT_TS path
# (web/src/lib/missions/checks/types.ts) was previously wrong after the
# checks/ split tracked by #15790 — the bug silently rendered the preflight
# coverage table empty until it was caught and fixed in #24935. These tests
# guard both the happy path and that specific regression.
#
# These tests verify:
#   1. Repo accessible → mission/operation counts and preflight table render
#   2. PreflightErrorCode values are correctly read from
#      web/src/lib/missions/checks/types.ts (regression guard for #24935)
#   3. KB repo API 404 → report falls back to "N/A (repo not accessible)"
#      rows instead of crashing, and exits 0 when no critical gaps apply
#   4. Missing PREFLIGHT_TS file → preflight section is skipped gracefully
#   5. All COMMON_OPS missing → CRITICAL_GAPS counted and script exits 1
#
# Usage:
#   bash scripts/__tests__/kb-query-gap-tracker.test.sh
#
# Requirements: bash 4+, jq, curl (fake curl is injected via PATH)
# No external test framework needed — uses a minimal built-in harness.

set -uo pipefail

# ============================================================================
# Test harness
# ============================================================================

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
  FAILURES="${FAILURES}\n  ✗ $1: $2"
  echo "  ✗ $1"
  echo "    → $2"
}

summary() {
  echo ""
  echo "──────────────────────────────────────────"
  echo "  ${TESTS_PASSED} passed, ${TESTS_FAILED} failed (${TESTS_RUN} total)"
  if [ "$TESTS_FAILED" -gt 0 ]; then
    echo ""
    echo "  Failed tests:"
    echo -e "$FAILURES"
  fi
  echo "──────────────────────────────────────────"
  [ "$TESTS_FAILED" -eq 0 ]
}

# ============================================================================
# Locate SUT using absolute path
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUT="${SCRIPT_DIR}/kb-query-gap-tracker.sh"

# ============================================================================
# Fake GitHub `curl` — installed on PATH ahead of the real curl so the SUT's
# github_api_get() calls are answered from fixtures instead of the network.
#
# Controlled via env vars read from the sandbox:
#   FAKE_REPO_STATUS   HTTP status for `repos/<KB_REPO>`           (default 200)
#   FAKE_REPO_BODY     JSON body for `repos/<KB_REPO>`
#   FAKE_TREE_STATUS   HTTP status for the recursive tree fetch    (default 200)
#   FAKE_TREE_BODY     JSON body for the recursive tree fetch
# ============================================================================

install_fake_curl() {
  local bindir="$1"
  mkdir -p "$bindir"
  cat > "$bindir/curl" <<'FAKECURL'
#!/usr/bin/env bash
url=""
args=("$@")
i=0
n=${#args[@]}
while [[ $i -lt $n ]]; do
  a="${args[$i]}"
  case "$a" in
    --max-time|-H|-w) ((i++)) ;;
    http*://*) url="$a" ;;
    *) ;;
  esac
  ((i++))
done

empty_json='{}'
if [[ "$url" == *"/git/trees/"* ]]; then
  printf '%s\n%s' "${FAKE_TREE_BODY:-$empty_json}" "${FAKE_TREE_STATUS:-200}"
elif [[ "$url" == *"/repos/"* ]]; then
  printf '%s\n%s' "${FAKE_REPO_BODY:-$empty_json}" "${FAKE_REPO_STATUS:-200}"
else
  printf '%s\n%s' "$empty_json" '404'
fi
FAKECURL
  chmod +x "$bindir/curl"
}

run_in_sandbox() {
  local tmpdir
  tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/kb-gap-test-XXXXXX")
  install_fake_curl "$tmpdir/bin"
  local body
  body=$(cat)

  OUTPUT=$(
    cd "$tmpdir" || exit 99
    PATH="$tmpdir/bin:$PATH"
    export PATH
    eval "$body"
  ) 2>&1
  SANDBOX_EXIT=$?
  rm -rf "$tmpdir"
}

write_types_ts() {
  local file="$1"
  mkdir -p "$(dirname "$file")"
  cat > "$file" <<'TYPES_EOF'
export type PreflightErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'EXPIRED_CREDENTIALS'
  | 'RBAC_DENIED'
  | 'CONTEXT_NOT_FOUND'
  | 'CLUSTER_UNREACHABLE'
  | 'MISSING_TOOLS'
  | 'UNKNOWN_EXECUTION_FAILURE'
TYPES_EOF
}
# Serialize write_types_ts once so each sandbox heredoc (which runs in a
# subshell via `eval`, not this process) can redefine and call it.
WRITE_TYPES_TS_FN="$(declare -f write_types_ts)"

TREE_WITH_ALL_OPS='{"tree":[
  {"path":"fixes/install-foo.json"},
  {"path":"fixes/upgrade-foo.json"},
  {"path":"fixes/rollback-foo.json"},
  {"path":"fixes/troubleshoot-foo.json"},
  {"path":"fixes/monitor-foo.json"},
  {"path":"fixes/backup-foo.json"},
  {"path":"fixes/restore-foo.json"},
  {"path":"fixes/disaster-recovery-foo.json"},
  {"path":"fixes/certificate-rotation-foo.json"},
  {"path":"fixes/etcd-backup-foo.json"},
  {"path":"fixes/node-drain-foo.json"},
  {"path":"fixes/cluster-upgrade-foo.json"},
  {"path":"fixes/storage-migration-foo.json"},
  {"path":"fixes/network-policy-foo.json"},
  {"path":"fixes/rbac-audit-foo.json"},
  {"path":"runbooks/kubeconfig-credentials-setup.json"},
  {"path":"runbooks/certificate-rotation-renewal.json"},
  {"path":"runbooks/rbac-permissions-rolebinding-clusterrole.json"}
]}'

TREE_WITH_NO_COMMON_OPS='{"tree":[
  {"path":"fixes/install-foo.json"}
]}'

REPO_BODY='{"default_branch":"master"}'

echo ""
echo "kb-query-gap-tracker.sh"
echo ""

# ---------- Test 1: Repo accessible → report renders mission/operation counts ----------

run_in_sandbox <<BODY
${WRITE_TYPES_TS_FN}
write_types_ts "web/src/lib/missions/checks/types.ts"
export FAKE_REPO_STATUS=200
export FAKE_REPO_BODY='${REPO_BODY}'
export FAKE_TREE_STATUS=200
export FAKE_TREE_BODY='${TREE_WITH_ALL_OPS}'
bash "$SUT" out.md
cat out.md
BODY

if [[ "$OUTPUT" == *"Total missions in console-kb (master): 18"* ]]; then
  pass "repo-accessible: mission count computed from tree"
else
  fail "repo-accessible: mission count computed from tree" "$OUTPUT"
fi

if [[ "$OUTPUT" == *"| install | 1 |"* ]]; then
  pass "repo-accessible: operation coverage table populated"
else
  fail "repo-accessible: operation coverage table populated" "$OUTPUT"
fi

if [[ "$OUTPUT" == *"✅ disaster-recovery"* ]]; then
  pass "repo-accessible: common-ops gaps resolved when missions exist"
else
  fail "repo-accessible: common-ops gaps resolved when missions exist" "$OUTPUT"
fi

# ---------- Test 2: PreflightErrorCode values read from checks/types.ts (regression: #24935) ----------

if [[ "$OUTPUT" == *'`RBAC_DENIED`'*'✅'* ]]; then
  pass "preflight: codes extracted from web/src/lib/missions/checks/types.ts"
else
  fail "preflight: codes extracted from web/src/lib/missions/checks/types.ts" "$OUTPUT"
fi

if [[ $SANDBOX_EXIT -eq 0 ]]; then
  pass "repo-accessible: exits 0 when no critical gaps"
else
  fail "repo-accessible: exits 0 when no critical gaps" "exit=$SANDBOX_EXIT"
fi

# ---------- Test 2b: a preflight code with no matching mission → ❌ none ----------

run_in_sandbox <<BODY
${WRITE_TYPES_TS_FN}
write_types_ts "web/src/lib/missions/checks/types.ts"
export FAKE_REPO_STATUS=200
export FAKE_REPO_BODY='${REPO_BODY}'
export FAKE_TREE_STATUS=200
export FAKE_TREE_BODY='{"tree":[{"path":"fixes/install-foo.json"}]}'
bash "$SUT" out.md
cat out.md
BODY

if [[ "$OUTPUT" == *'`RBAC_DENIED`'*'❌ none'* ]]; then
  pass "preflight: uncovered code reported as ❌ none"
else
  fail "preflight: uncovered code reported as ❌ none" "$OUTPUT"
fi

if [[ "$OUTPUT" == *"PREFLIGHT_UNCOVERED=6"* ]]; then
  pass "preflight: PREFLIGHT_UNCOVERED counts every unmatched code"
else
  fail "preflight: PREFLIGHT_UNCOVERED counts every unmatched code" "$OUTPUT"
fi

# ---------- Test 3: KB repo API 404 → graceful fallback, no crash ----------

run_in_sandbox <<BODY
${WRITE_TYPES_TS_FN}
write_types_ts "web/src/lib/missions/checks/types.ts"
export FAKE_REPO_STATUS=404
export FAKE_REPO_BODY='{"message":"Not Found"}'
bash "$SUT" out.md
echo "EXIT=\$?"
cat out.md
BODY

if [[ "$OUTPUT" == *"N/A (repo not accessible)"* ]]; then
  pass "repo-404: falls back to N/A rows instead of crashing"
else
  fail "repo-404: falls back to N/A rows instead of crashing" "$OUTPUT"
fi

if [[ "$OUTPUT" == *"EXIT=0"* ]]; then
  pass "repo-404: exits 0 (no critical gaps counted when skipped)"
else
  fail "repo-404: exits 0 (no critical gaps counted when skipped)" "$OUTPUT"
fi

# ---------- Test 4: Missing PREFLIGHT_TS file → preflight section skipped, no crash ----------

run_in_sandbox <<BODY
export FAKE_REPO_STATUS=200
export FAKE_REPO_BODY='${REPO_BODY}'
export FAKE_TREE_STATUS=200
export FAKE_TREE_BODY='${TREE_WITH_ALL_OPS}'
bash "$SUT" out.md
echo "EXIT=\$?"
cat out.md
BODY

if [[ "$OUTPUT" == *"Cannot find web/src/lib/missions/checks/types.ts"* ]]; then
  pass "missing-preflight-ts: section skipped with a warning, not a crash"
else
  fail "missing-preflight-ts: section skipped with a warning, not a crash" "$OUTPUT"
fi

if [[ "$OUTPUT" == *"EXIT=0"* ]]; then
  pass "missing-preflight-ts: exits 0 when no critical gaps"
else
  fail "missing-preflight-ts: exits 0 when no critical gaps" "$OUTPUT"
fi

# ---------- Test 5: All COMMON_OPS missing → CRITICAL_GAPS counted, exit 1 ----------

run_in_sandbox <<BODY
${WRITE_TYPES_TS_FN}
write_types_ts "web/src/lib/missions/checks/types.ts"
export FAKE_REPO_STATUS=200
export FAKE_REPO_BODY='${REPO_BODY}'
export FAKE_TREE_STATUS=200
export FAKE_TREE_BODY='${TREE_WITH_NO_COMMON_OPS}'
bash "$SUT" out.md
echo "EXIT=\$?"
cat out.md
BODY

if [[ "$OUTPUT" == *"CRITICAL_GAPS=8"* ]]; then
  pass "all-ops-missing: counts every COMMON_OPS gap"
else
  fail "all-ops-missing: counts every COMMON_OPS gap" "$OUTPUT"
fi

if [[ "$OUTPUT" == *"EXIT=1"* ]]; then
  pass "all-ops-missing: exits 1 when critical gaps exist"
else
  fail "all-ops-missing: exits 1 when critical gaps exist" "$OUTPUT"
fi

summary
exit $?
