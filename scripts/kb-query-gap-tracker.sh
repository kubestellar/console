#!/usr/bin/env bash
# KB Query Gap Tracker
# Identifies common user queries that return poor or no results from the knowledge base.
# Usage: ./scripts/kb-query-gap-tracker.sh [--output report.md]
set -euo pipefail

OUTPUT="${1:-kb-gap-report.md}"
KB_REPO="kubestellar/console-kb"
KB_API_ROOT="https://api.github.com"
KB_DEFAULT_REF="master"
KB_REPO_PATH_FILTER='startswith("fixes/cncf-install/") or startswith("fixes/platform-install/")'
KB_REPO_ACCESSIBLE=false
KB_REF=""
KB_TREE_JSON=""
KB_ACCESS_NOTE=""
KB_ACCESS_DETAILS=""
KB_LAST_STATUS=""
KB_LAST_BODY=""
KB_API_RESPONSE=""

declare -A SEARCH_TERMS=(
  [MISSING_CREDENTIALS]="kubeconfig credentials setup"
  [EXPIRED_CREDENTIALS]="certificate rotation renewal"
  [RBAC_DENIED]="rbac permissions rolebinding clusterrole"
  [CONTEXT_NOT_FOUND]="kubeconfig context cluster"
  [CLUSTER_UNREACHABLE]="cluster connectivity network troubleshoot"
  [MISSING_TOOLS]="kubectl helm tool prerequisites install"
  [UNKNOWN_EXECUTION_FAILURE]="troubleshoot debug error recovery"
)

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: '$cmd' is required but not installed." >&2
    exit 2
  fi
done

github_api_get() {
  local path="$1"
  local response status body
  local -a curl_args=(
    -sS -L --max-time 20
    -H "Accept: application/vnd.github+json"
    -H "X-GitHub-Api-Version: 2022-11-28"
  )

  if [[ -n "${GH_TOKEN:-}" ]]; then
    curl_args+=(-H "Authorization: Bearer ${GH_TOKEN}")
  fi

  response=$(curl "${curl_args[@]}" "${KB_API_ROOT}/${path}" -w $'\n%{http_code}') || {
    KB_LAST_STATUS="000"
    KB_LAST_BODY=""
    KB_API_RESPONSE=""
    return 1
  }

  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  KB_LAST_STATUS="$status"
  KB_LAST_BODY="$body"
  KB_API_RESPONSE="$body"

  [[ "$status" =~ ^2 ]]
}

mark_kb_repo_unavailable() {
  local status="$1"
  local body="$2"
  local message=""

  message=$(jq -r '.message // empty' <<<"$body" 2>/dev/null || true)

  if [[ "$status" == "404" ]]; then
    KB_ACCESS_NOTE="N/A (repo not accessible)"
    KB_ACCESS_DETAILS="GitHub API returned 404${message:+ ($message)} for ${KB_REPO}. The repo, branch, or token access may be wrong. Configure the KB_REPO_TOKEN workflow secret with contents:read access to ${KB_REPO} when cross-repo authentication is required."
  else
    KB_ACCESS_NOTE="N/A (GitHub API error ${status:-unknown})"
    KB_ACCESS_DETAILS="GitHub API request for ${KB_REPO} failed${message:+: $message}. Configure the KB_REPO_TOKEN workflow secret with contents:read access if this repository requires cross-repo authentication."
  fi

  echo "WARNING: ${KB_ACCESS_DETAILS}" >&2
}

load_kb_tree() {
  local repo_json candidate tree_json
  local -a refs_to_try=()

  if github_api_get "repos/${KB_REPO}"; then
    repo_json="$KB_API_RESPONSE"
  else
    mark_kb_repo_unavailable "$KB_LAST_STATUS" "$KB_LAST_BODY"
    return 1
  fi

  KB_REF=$(jq -r '.default_branch // empty' <<<"$repo_json")
  if [[ -z "$KB_REF" || "$KB_REF" == "null" ]]; then
    KB_REF="$KB_DEFAULT_REF"
  fi

  refs_to_try+=("$KB_REF")
  if [[ "$KB_REF" != "master" ]]; then
    refs_to_try+=("master")
  fi
  if [[ "$KB_REF" != "main" ]]; then
    refs_to_try+=("main")
  fi

  for candidate in "${refs_to_try[@]}"; do
    if ! github_api_get "repos/${KB_REPO}/git/trees/${candidate}?recursive=1"; then
      continue
    fi

    tree_json="$KB_API_RESPONSE"
    if jq -e '.tree | type == "array"' >/dev/null 2>&1 <<<"$tree_json"; then
      KB_REF="$candidate"
      KB_TREE_JSON="$tree_json"
      KB_REPO_ACCESSIBLE=true
      return 0
    fi
  done

  mark_kb_repo_unavailable "$KB_LAST_STATUS" "$KB_LAST_BODY"
  return 1
}

count_install_missions() {
  jq "[(.tree[]?.path // empty) | select((${KB_REPO_PATH_FILTER}) and endswith(\".json\"))] | length" <<<"$KB_TREE_JSON"
}

count_matching_paths() {
  local pattern="$1"
  jq --arg pattern "$pattern" "[(.tree[]?.path // empty) | select((${KB_REPO_PATH_FILTER}) and test(\$pattern; \"i\"))] | length" <<<"$KB_TREE_JSON"
}

append_repo_access_warning() {
  echo "> ${KB_ACCESS_DETAILS}" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
}

write_skipped_operation_rows() {
  for op in install upgrade rollback troubleshoot monitor backup restore; do
    echo "| $op | ${KB_ACCESS_NOTE} |" >> "$OUTPUT"
  done
}

write_preflight_rows_for_unavailable_repo() {
  local code terms fallback

  for code in "${TS_CODES[@]}"; do
    if [[ -n "${SEARCH_TERMS[$code]+x}" ]]; then
      terms="${SEARCH_TERMS[$code]}"
    else
      fallback=$(echo "$code" | tr '[:upper:]_' '[:lower:] ')
      terms="$fallback"
      echo "⚠️  No explicit search terms for $code — using fallback: $fallback" >&2
    fi
    echo "| \`$code\` | $terms | ${KB_ACCESS_NOTE} |" >> "$OUTPUT"
  done
}

echo "# KB Query Gap Report" > "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUTPUT"
echo "" >> "$OUTPUT"

load_kb_tree || true

# 1. Check mission coverage - which CNCF projects have install missions?
echo "## Mission Coverage" >> "$OUTPUT"
echo "" >> "$OUTPUT"
if [[ "$KB_REPO_ACCESSIBLE" == true ]]; then
  MISSIONS_COUNT=$(count_install_missions)
  echo "Total missions in console-kb (${KB_REF}): $MISSIONS_COUNT" >> "$OUTPUT"
else
  echo "Total missions in console-kb: $KB_ACCESS_NOTE" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  append_repo_access_warning
fi
echo "" >> "$OUTPUT"

# 2. Check for common operation types
echo "## Operation Type Coverage" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| Operation | Missions Available |" >> "$OUTPUT"
echo "|-----------|-------------------|" >> "$OUTPUT"
if [[ "$KB_REPO_ACCESSIBLE" == true ]]; then
  for op in install upgrade rollback troubleshoot monitor backup restore; do
    count=$(count_matching_paths "$op")
    echo "| $op | $count |" >> "$OUTPUT"
  done
else
  write_skipped_operation_rows
fi
echo "" >> "$OUTPUT"

# 3. Identify potential gaps
echo "## Potential Gaps" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Common Kubernetes operations without dedicated missions:" >> "$OUTPUT"
echo "" >> "$OUTPUT"

COMMON_OPS=("disaster-recovery" "certificate-rotation" "etcd-backup" "node-drain" "cluster-upgrade" "storage-migration" "network-policy" "rbac-audit")
CRITICAL_COUNT=0
if [[ "$KB_REPO_ACCESSIBLE" == true ]]; then
  for op in "${COMMON_OPS[@]}"; do
    exists=$(count_matching_paths "$op")
    if [[ "$exists" == "0" ]]; then
      echo "- ❌ $op — no mission found" >> "$OUTPUT"
      CRITICAL_COUNT=$((CRITICAL_COUNT + 1))
    else
      echo "- ✅ $op — $exists file(s)" >> "$OUTPUT"
    fi
  done
else
  echo "- ⚠️ Skipped: ${KB_ACCESS_NOTE}" >> "$OUTPUT"
fi

echo "" >> "$OUTPUT"
echo "## Recommendations" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "1. Prioritize creating missions for operations marked ❌ above" >> "$OUTPUT"
echo "2. Add troubleshooting guides for top-5 user-reported issues" >> "$OUTPUT"
echo "3. Validate all existing install missions against latest CNCF project versions" >> "$OUTPUT"

# 4. Preflight error KB coverage
# Cross-references every PreflightErrorCode from preflightCheck.ts against
# console-kb mission paths to find which error remediation paths have no KB coverage.
echo "" >> "$OUTPUT"
echo "## Preflight Error KB Coverage" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Maps each \`PreflightErrorCode\` from \`preflightCheck.ts\` to KB mission coverage." >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| Error Code | Search Terms | Missions Found |" >> "$OUTPUT"
echo "|------------|-------------|----------------|" >> "$OUTPUT"

# Auto-extract PreflightErrorCode values from the TypeScript source so new
# codes are picked up automatically without a manual sync step.
PREFLIGHT_TS="web/src/lib/missions/preflightCheck.ts"
if [[ ! -f "$PREFLIGHT_TS" ]]; then
  echo "⚠️  Cannot find $PREFLIGHT_TS — skipping preflight coverage check" >> "$OUTPUT"
  echo ""
  echo "Report written to: $OUTPUT"
  echo "CRITICAL_GAPS=$CRITICAL_COUNT"
  echo "PREFLIGHT_UNCOVERED=skip"
  if [[ "$CRITICAL_COUNT" -gt 0 ]]; then
    exit 1
  fi
  exit 0
fi

mapfile -t TS_CODES < <(
  grep -oP "'\K[A-Z_]+(?=')" "$PREFLIGHT_TS" | sort -u
)

PREFLIGHT_UNCOVERED=0
if [[ "$KB_REPO_ACCESSIBLE" == true ]]; then
  for code in "${TS_CODES[@]}"; do
    if [[ -n "${SEARCH_TERMS[$code]+x}" ]]; then
      terms="${SEARCH_TERMS[$code]}"
    else
      terms=$(echo "$code" | tr '[:upper:]_' '[:lower:] ')
      echo "⚠️  No explicit search terms for $code — using fallback: $terms" >&2
    fi

    jq_pattern=$(echo "$terms" | tr ' ' '|')
    count=$(count_matching_paths "$jq_pattern")
    if [[ "$count" == "0" ]]; then
      echo "| \`$code\` | $terms | ❌ none |" >> "$OUTPUT"
      PREFLIGHT_UNCOVERED=$((PREFLIGHT_UNCOVERED + 1))
    else
      echo "| \`$code\` | $terms | ✅ $count |" >> "$OUTPUT"
    fi
  done
else
  write_preflight_rows_for_unavailable_repo
fi

echo "" >> "$OUTPUT"
if [[ "$KB_REPO_ACCESSIBLE" == true && "$PREFLIGHT_UNCOVERED" -gt 0 ]]; then
  echo "⚠️  **$PREFLIGHT_UNCOVERED preflight error code(s) have no KB coverage.**" >> "$OUTPUT"
elif [[ "$KB_REPO_ACCESSIBLE" != true ]]; then
  echo "⚠️  **Preflight KB coverage skipped: ${KB_ACCESS_NOTE}.**" >> "$OUTPUT"
fi

echo ""
echo "Report written to: $OUTPUT"
echo "CRITICAL_GAPS=$CRITICAL_COUNT"
if [[ "$KB_REPO_ACCESSIBLE" == true ]]; then
  echo "PREFLIGHT_UNCOVERED=$PREFLIGHT_UNCOVERED"
else
  echo "PREFLIGHT_UNCOVERED=skip"
fi

if [[ "$CRITICAL_COUNT" -gt 0 ]]; then
  exit 1
fi
