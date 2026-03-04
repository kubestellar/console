#!/bin/bash
# Static analysis for code consistency — detect magic numbers, unguarded arrays,
# missing fetch timeouts, localStorage safety, and cache pattern adherence.
#
# Usage:
#   ./scripts/consistency-test.sh              # Run all 6 checks
#   ./scripts/consistency-test.sh --strict     # Treat warnings as errors
#   ./scripts/consistency-test.sh --fix        # Show remediation hints per violation
#
# Checks:
#   Phase 1: Magic numbers in setTimeout/setInterval
#   Phase 2: Unguarded for...of array iteration
#   Phase 3: Unguarded .join() calls
#   Phase 4: localStorage without try-catch
#   Phase 5: fetch() without timeout/signal
#   Phase 6: Cache pattern consistency
#
# Prerequisites:
#   - ripgrep (rg) installed: brew install ripgrep
#
# Output:
#   web/e2e/test-results/consistency-report.json  — full JSON data
#   web/e2e/test-results/consistency-summary.md   — human-readable summary
#
# Exit code:
#   0 — all checks pass (or only warnings in non-strict mode)
#   1 — one or more violations found

set -euo pipefail

cd "$(dirname "$0")/../web"

# ============================================================================
# Argument parsing
# ============================================================================

STRICT_MODE=""
FIX_MODE=""

for arg in "$@"; do
  case "$arg" in
    --strict) STRICT_MODE="1"; echo "Strict mode: warnings are errors" ;;
    --fix)    FIX_MODE="1"; echo "Fix mode: showing remediation hints" ;;
  esac
done

# ============================================================================
# Prerequisites
# ============================================================================

if ! command -v rg &> /dev/null; then
  echo "ERROR: ripgrep (rg) is required but not found. Install with: brew install ripgrep"
  exit 1
fi

# ============================================================================
# Constants & output setup
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

REPORT_DIR="e2e/test-results"
mkdir -p "$REPORT_DIR"
JSON_REPORT="$REPORT_DIR/consistency-report.json"
MD_SUMMARY="$REPORT_DIR/consistency-summary.md"

TMPDIR_CONSISTENCY=$(mktemp -d)
trap 'rm -rf "$TMPDIR_CONSISTENCY"' EXIT

# Per-phase counters (indexed 1-6)
declare -a PHASE_ERRORS=(0 0 0 0 0 0 0)
declare -a PHASE_WARNINGS=(0 0 0 0 0 0 0)

TOTAL_ERRORS=0
TOTAL_WARNINGS=0

# Common ripgrep exclusions for all phases
RG_EXCLUDES=(
  --glob '!**/*.test.*'
  --glob '!**/*.spec.*'
  --glob '!**/__tests__/**'
  --glob '!**/node_modules/**'
  --glob '!**/dist/**'
  --glob '!**/e2e/**'
  --glob '!**/test/**'
)

# Arcade/game files where animation-rate magic numbers are intentional
GAME_EXCLUDES=(
  --glob '!**/Checkers.tsx'
  --glob '!**/ContainerTetris.tsx'
  --glob '!**/FlappyPod.tsx'
  --glob '!**/Game2048.tsx'
  --glob '!**/KubeChess.tsx'
  --glob '!**/KubeCraft.tsx'
  --glob '!**/KubeCraft3D.tsx'
  --glob '!**/Kubedle.tsx'
  --glob '!**/KubeDoom.tsx'
  --glob '!**/KubeGalaga.tsx'
  --glob '!**/KubeKart.tsx'
  --glob '!**/KubeKong.tsx'
  --glob '!**/KubeMan.tsx'
  --glob '!**/KubePong.tsx'
  --glob '!**/KubeSnake.tsx'
  --glob '!**/MatchGame.tsx'
  --glob '!**/NodeInvaders.tsx'
  --glob '!**/PodCrosser.tsx'
  --glob '!**/PodPitfall.tsx'
  --glob '!**/PodSweeper.tsx'
  --glob '!**/Solitaire.tsx'
  --glob '!**/SudokuGame.tsx'
)

# ============================================================================
# Helpers
# ============================================================================

print_header() {
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  Code Consistency Test${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
  echo ""
}

print_phase_header() {
  local phase_num="$1"
  local phase_name="$2"
  echo -e "${BOLD}Phase ${phase_num}: ${phase_name}${NC}"
  echo "─────────────────────────────────────────────────"
}

# Print a violation line: file:line  trimmed-code
print_violation() {
  local mark="$1"
  local line="$2"
  local filepath
  filepath=$(echo "$line" | cut -d: -f1)
  local linenum
  linenum=$(echo "$line" | cut -d: -f2)
  local content
  content=$(echo "$line" | cut -d: -f3- | sed 's/^[[:space:]]*//')
  echo -e "  ${mark} ${DIM}${filepath}:${linenum}${NC}  ${content}"
}

# Print a fix hint for a phase
print_fix() {
  local phase="$1"
  local line="$2"
  [[ -z "$FIX_MODE" ]] && return

  local content
  content=$(echo "$line" | cut -d: -f3- | sed 's/^[[:space:]]*//')

  case $phase in
    1)
      local num
      num=$(echo "$content" | grep -oE ',\s*[0-9]+' | grep -oE '[0-9]+' | tail -1)
      local kind="TIMEOUT"
      echo "$content" | grep -q 'setInterval' && kind="INTERVAL"
      echo -e "    ${YELLOW}→ Extract to: const ${kind}_MS = ${num}${NC}"
      ;;
    2)
      local varname
      varname=$(echo "$content" | grep -oE 'of\s+[a-zA-Z_]\w*' | sed 's/of //' | head -1)
      echo -e "    ${YELLOW}→ Change to: for (const x of (${varname} || []))${NC}"
      ;;
    3) echo -e "    ${YELLOW}→ Guard with: (arr || []).join(...)${NC}" ;;
    4) echo -e "    ${YELLOW}→ Wrap in try { ... } catch { /* non-critical */ }${NC}" ;;
    5) echo -e "    ${YELLOW}→ Add: { signal: AbortSignal.timeout(TIMEOUT_MS) }${NC}" ;;
    6) echo -e "    ${YELLOW}→ Add named CACHE_KEY and CACHE_TTL_MS constants${NC}" ;;
  esac
}

# ============================================================================
# Phase 1: Magic numbers in setTimeout / setInterval
# ============================================================================

phase1() {
  local results_file="$TMPDIR_CONSISTENCY/phase1.txt"

  # Match setTimeout/setInterval with a bare numeric literal > 0 as the delay
  # The regex matches: setTimeout(anything, 123) or setInterval(anything, 456)
  rg -n 'set(Timeout|Interval)\(' \
    --glob '*.{ts,tsx}' \
    "${RG_EXCLUDES[@]}" \
    "${GAME_EXCLUDES[@]}" \
    src/ 2>/dev/null | \
    grep -E ',\s*[1-9][0-9]*\s*\)' | \
    grep -v '^\s*//' \
    > "$results_file" || true

  local count
  count=$(wc -l < "$results_file" | tr -d ' ')
  PHASE_ERRORS[1]=$count
  TOTAL_ERRORS=$((TOTAL_ERRORS + count))

  if [[ $count -gt 0 ]]; then
    while IFS= read -r line; do
      print_violation "${RED}❌${NC}" "$line"
      print_fix 1 "$line"
    done < "$results_file"
  fi

  if [[ $count -eq 0 ]]; then
    echo -e "  ${GREEN}✅ No violations${NC}"
  else
    echo -e "\n  Result: ${RED}${count} violations${NC}"
  fi
  echo ""
}

# ============================================================================
# Phase 2: Unguarded for...of iteration
# ============================================================================

phase2() {
  local raw_file="$TMPDIR_CONSISTENCY/phase2_raw.txt"
  local results_file="$TMPDIR_CONSISTENCY/phase2.txt"

  # Find for-of loops in hooks only (where API/hook data is most likely undefined)
  rg -n 'for\s*\((const|let)\s+\w+\s+of\s+' \
    --glob '*.{ts,tsx}' \
    "${RG_EXCLUDES[@]}" \
    src/hooks/ 2>/dev/null > "$raw_file" || true

  # Filter out safe patterns:
  # - Already guarded with || []) or ?? [])
  # - Iterating Object.keys/values/entries
  # - Iterating literal arrays [...]
  # - Iterating new Set/Map
  # - Iterating .entries() / .values() / .keys() (Map/Set methods)
  # - Iterating string methods (.split, .match)
  # - Comments
  grep -v -E '(\|\|\s*\[\]\)|\?\?\s*\[\]\)|Object\.(keys|values|entries)\(|of\s*\[|new\s+(Set|Map)|\.entries\(\)|\.values\(\)|\.keys\(\)|\.split\(|\.match\(|^\s*//)' \
    "$raw_file" > "$results_file" || true

  local count
  count=$(wc -l < "$results_file" | tr -d ' ')
  PHASE_WARNINGS[2]=$count
  TOTAL_WARNINGS=$((TOTAL_WARNINGS + count))

  if [[ $count -gt 0 ]]; then
    while IFS= read -r line; do
      print_violation "${YELLOW}⚠️ ${NC}" "$line"
      print_fix 2 "$line"
    done < "$results_file"
  fi

  if [[ $count -eq 0 ]]; then
    echo -e "  ${GREEN}✅ No warnings${NC}"
  else
    echo -e "\n  Result: ${YELLOW}${count} warnings${NC} (for...of without || [] guard)"
  fi
  echo ""
}

# ============================================================================
# Phase 3: Unguarded .join() calls
# ============================================================================

phase3() {
  local raw_file="$TMPDIR_CONSISTENCY/phase3_raw.txt"
  local results_file="$TMPDIR_CONSISTENCY/phase3.txt"

  # Find all .join() calls on bare variables (word.join)
  rg -n '[a-zA-Z_]\w*\.join\(' \
    --glob '*.{ts,tsx}' \
    "${RG_EXCLUDES[@]}" \
    src/hooks/ src/components/ 2>/dev/null > "$raw_file" || true

  # Filter out safe patterns:
  # - Chained from .map/.filter/.slice/.sort/.flat/.flatMap/.reduce/.concat
  # - Already guarded with || [])  or  ?? [])
  # - Object.keys/values/entries / Array.from / Array.isArray
  # - Comments
  # - Template literal .join
  # - Already guarded with .length check before .join
  # - Locally-constructed arrays (parts, lines, formatted, tooltipParts, details, problems, output, dataLines, etc.)
  # - Module-level constants (UPPER_CASE.join)
  # - Function parameters used in useMemo/useCallback deps (repos.join, symbols.join)
  grep -v -E '(\.(map|filter|slice|sort|flat|flatMap|reduce|concat|split)\(.*\.join|\|\|\s*\[\]\)\.join|\?\?\s*\[\]\)\.join|Object\.(keys|values|entries)|Array\.(from|isArray)|^\s*//|`.*\.join|\.length\s*[>!=].*\.join|[Pp]arts\.join|[Ll]ines\.join|formatted\.join|[Tt]ooltip[Pp]arts\.join|demoData\.\w+\.join|details\.join|problems\.join|output\.join|dataLines\.join|[A-Z_]{2,}\.join|discoveredClusters\.join|symbols\.join|repos\.join)' \
    "$raw_file" > "$results_file" || true

  local count
  count=$(wc -l < "$results_file" | tr -d ' ')
  PHASE_ERRORS[3]=$count
  TOTAL_ERRORS=$((TOTAL_ERRORS + count))

  if [[ $count -gt 0 ]]; then
    while IFS= read -r line; do
      print_violation "${RED}❌${NC}" "$line"
      print_fix 3 "$line"
    done < "$results_file"
  fi

  if [[ $count -eq 0 ]]; then
    echo -e "  ${GREEN}✅ No violations${NC}"
  else
    echo -e "\n  Result: ${RED}${count} violations${NC}"
  fi
  echo ""
}

# ============================================================================
# Phase 4: localStorage without try-catch
# ============================================================================

phase4() {
  local results_file="$TMPDIR_CONSISTENCY/phase4.txt"
  > "$results_file"

  # Only flag the dangerous pattern: JSON.parse(localStorage.getItem(...)) without try-catch.
  # Simple getItem (string reads), setItem, and removeItem are inherently safe and don't need
  # try-catch — the production crash risk is specifically from JSON.parse throwing SyntaxError
  # on corrupted/malformed stored data.
  local matches
  matches=$(rg -n 'JSON\.parse\(\s*localStorage\.getItem' \
    --glob '*.{ts,tsx}' \
    "${RG_EXCLUDES[@]}" \
    src/ 2>/dev/null || true)

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    local filepath
    filepath=$(echo "$line" | cut -d: -f1)
    local linenum
    linenum=$(echo "$line" | cut -d: -f2)

    # Look for a try block within the enclosing function scope (up to 30 lines back)
    local lookback=30
    local start=$((linenum > lookback ? linenum - lookback : 1))
    local context
    context=$(sed -n "${start},${linenum}p" "$filepath" 2>/dev/null || true)
    if ! echo "$context" | grep -qE 'try\s*\{|try\s*$'; then
      echo "$line" >> "$results_file"
    fi
  done <<< "$matches"

  local count
  count=$(wc -l < "$results_file" | tr -d ' ')
  PHASE_ERRORS[4]=$count
  TOTAL_ERRORS=$((TOTAL_ERRORS + count))

  if [[ $count -gt 0 ]]; then
    while IFS= read -r line; do
      print_violation "${RED}❌${NC}" "$line"
      print_fix 4 "$line"
    done < "$results_file"
  fi

  if [[ $count -eq 0 ]]; then
    echo -e "  ${GREEN}✅ No violations${NC}"
  else
    echo -e "\n  Result: ${RED}${count} violations${NC}"
  fi
  echo ""
}

# ============================================================================
# Phase 5: fetch() without timeout/signal
# ============================================================================

phase5() {
  local results_file="$TMPDIR_CONSISTENCY/phase5.txt"
  > "$results_file"

  # Find all fetch() calls (real fetch, not refetch/prefetch/fetchData helpers)
  local matches
  matches=$(rg -n '(await |return )\s*fetch\(' \
    --glob '*.{ts,tsx}' \
    "${RG_EXCLUDES[@]}" \
    --glob '!**/analytics.ts' \
    src/ 2>/dev/null || true)

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    # Skip refetch/prefetch patterns and commented-out code
    echo "$line" | grep -qE '(refetch|prefetch|registerRefetch|fetchPRCount|fetchData|fetchNodes|fetchClusters|fetchGitHub|fetchStatus)' && continue
    # The content portion (after file:line:) may have leading whitespace before //
    local content_part
    content_part=$(echo "$line" | cut -d: -f3- | sed 's/^[[:space:]]*//')
    [[ "$content_part" == //* ]] && continue

    local filepath
    filepath=$(echo "$line" | cut -d: -f1)
    local linenum
    linenum=$(echo "$line" | cut -d: -f2)

    # Check next 15 lines for 'signal' or AbortSignal (fetch options can span many lines)
    local end=$((linenum + 15))
    local max_lines
    max_lines=$(wc -l < "$filepath" | tr -d ' ')
    [[ $end -gt $max_lines ]] && end=$max_lines
    local block
    block=$(sed -n "${linenum},${end}p" "$filepath" 2>/dev/null || true)

    if ! echo "$block" | grep -q 'signal'; then
      echo "$line" >> "$results_file"
    fi
  done <<< "$matches"

  local count
  count=$(wc -l < "$results_file" | tr -d ' ')
  PHASE_ERRORS[5]=$count
  TOTAL_ERRORS=$((TOTAL_ERRORS + count))

  if [[ $count -gt 0 ]]; then
    while IFS= read -r line; do
      print_violation "${RED}❌${NC}" "$line"
      print_fix 5 "$line"
    done < "$results_file"
  fi

  if [[ $count -eq 0 ]]; then
    echo -e "  ${GREEN}✅ No violations${NC}"
  else
    echo -e "\n  Result: ${RED}${count} violations${NC}"
  fi
  echo ""
}

# ============================================================================
# Phase 6: Cache pattern consistency
# ============================================================================

phase6() {
  local results_file="$TMPDIR_CONSISTENCY/phase6.txt"
  > "$results_file"

  # Exclude cache infrastructure, contexts, and non-caching files that use localStorage +
  # Date.now() for unrelated purposes (ID generation, JWT expiry, analytics sessions, etc.)
  local PHASE6_EXCLUDES=(
    'src/lib/cache/'           # Caching infrastructure (implements generic caching)
    'src/hooks/useCachedData'  # Wrapper hooks delegating to cache infra
    'src/contexts/'            # Contexts use Date.now() for IDs, not cache TTL
    'src/lib/api.ts'           # Token management, not data caching
    'src/lib/analytics.ts'     # Session tracking, not cache expiry
    'src/lib/auth.tsx'         # JWT expiry management, not data caching
    'src/hooks/useDashboardCards' # UI layout persistence, no TTL
    'src/hooks/useMissions.tsx'       # Date.now() for mission duration, not cache TTL
    'src/hooks/useCertManager.ts'     # Date.now() for cert expiry demo data, not cache TTL
    'src/hooks/useWorkloads.ts'       # Date.now() for demo data timestamps, not cache TTL
    'src/components/settings/UpdateSettings.tsx'  # Date.now() for spinner elapsed, not cache TTL
    'src/components/cards/WorkloadDeployment.tsx'  # Date.now() for demo data timestamps, not cache TTL
    'src/components/cards/workload-monitor/GitHubCIMonitor.tsx'  # Date.now() for demo data, not cache TTL
    'src/components/cards/Missions.tsx'  # Date.now() for demo mission timestamps, not cache TTL
  )

  # Find files that implement caching with TTL: have localStorage AND Date.now() - (subtraction
  # for expiry checking). Files using Date.now() only for ID generation or animation are excluded.
  local cache_files
  cache_files=$(rg -l 'localStorage\.(getItem|setItem)' \
    --glob '*.{ts,tsx}' \
    "${RG_EXCLUDES[@]}" \
    src/ 2>/dev/null | \
    xargs rg -l 'Date\.now\(\)\s*-' 2>/dev/null || true)

  for filepath in $cache_files; do
    [[ -z "$filepath" ]] && continue

    # Skip excluded infrastructure / non-caching files
    local skip=""
    for excl in "${PHASE6_EXCLUDES[@]}"; do
      if [[ "$filepath" == *"$excl"* ]]; then
        skip="1"
        break
      fi
    done
    [[ -n "$skip" ]] && continue

    local issues=""

    # Check for named cache key constant (CACHE_KEY, STORAGE_KEY, CACHE_PREFIX — defined or imported)
    if ! rg -q '(const\s+\w*(CACHE_KEY|STORAGE_KEY|CACHE_PREFIX)\w*\s*=|import\s+.*\b\w*(CACHE_KEY|STORAGE_KEY|CACHE_PREFIX)\w*\b)' "$filepath" 2>/dev/null; then
      issues="${issues}missing named cache key constant; "
    fi

    # Check for named TTL constant (TTL, MAX_AGE, CACHE_DURATION, CACHE_EXPIRY — defined or imported)
    if ! rg -q '(const\s+\w*(TTL|MAX_AGE|CACHE_DURATION|CACHE_EXPIRY)\w*\s*=|import\s+.*\b\w*(TTL|MAX_AGE|CACHE_DURATION|CACHE_EXPIRY)\w*\b)' "$filepath" 2>/dev/null; then
      issues="${issues}missing named TTL constant; "
    fi

    if [[ -n "$issues" ]]; then
      echo "${filepath}:1: ${issues}" >> "$results_file"
    fi
  done

  local count
  count=$(wc -l < "$results_file" | tr -d ' ')
  PHASE_WARNINGS[6]=$count
  TOTAL_WARNINGS=$((TOTAL_WARNINGS + count))

  if [[ $count -gt 0 ]]; then
    while IFS= read -r line; do
      print_violation "${YELLOW}⚠️ ${NC}" "$line"
      print_fix 6 "$line"
    done < "$results_file"
  fi

  if [[ $count -eq 0 ]]; then
    echo -e "  ${GREEN}✅ No warnings${NC}"
  else
    echo -e "\n  Result: ${YELLOW}${count} warnings${NC}"
  fi
  echo ""
}

# ============================================================================
# Report generation
# ============================================================================

PHASE_NAMES=("" "Magic Numbers" "Array Guards" "Join Guards" "localStorage Safety" "Fetch Timeout" "Cache Patterns")

build_json_report() {
  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  local mode="normal"
  [[ -n "$STRICT_MODE" ]] && mode="strict"
  local passed="true"
  [[ $TOTAL_ERRORS -gt 0 ]] && passed="false"
  [[ -n "$STRICT_MODE" && $TOTAL_WARNINGS -gt 0 ]] && passed="false"

  # Build JSON via node for correctness (handles escaping)
  local violations_json=""
  for i in 1 2 3 4 5 6; do
    local phase_file="$TMPDIR_CONSISTENCY/phase${i}.txt"
    [[ ! -f "$phase_file" ]] && phase_file="$TMPDIR_CONSISTENCY/phase${i}_raw.txt"
    # Use the actual results file for phases that filter
    case $i in
      2) phase_file="$TMPDIR_CONSISTENCY/phase2.txt" ;;
      3) phase_file="$TMPDIR_CONSISTENCY/phase3.txt" ;;
      *) phase_file="$TMPDIR_CONSISTENCY/phase${i}.txt" ;;
    esac

    local ec="${PHASE_ERRORS[$i]}"
    local wc="${PHASE_WARNINGS[$i]}"
    local status="pass"
    [[ $ec -gt 0 ]] && status="fail"
    [[ $wc -gt 0 && $ec -eq 0 ]] && status="warn"
    local severity="error"
    [[ $i -eq 2 || $i -eq 6 ]] && severity="warning"

    [[ $i -gt 1 ]] && violations_json+=","
    violations_json+="{\"id\":$i,\"name\":\"${PHASE_NAMES[$i]}\",\"severity\":\"$severity\",\"errors\":$ec,\"warnings\":$wc,\"status\":\"$status\",\"violations\":["

    if [[ -f "$phase_file" && -s "$phase_file" ]]; then
      local first="true"
      while IFS= read -r vline; do
        local vfile
        vfile=$(echo "$vline" | cut -d: -f1)
        local vnum
        vnum=$(echo "$vline" | cut -d: -f2)
        local vcode
        vcode=$(echo "$vline" | cut -d: -f3- | sed 's/^[[:space:]]*//' | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')
        [[ "$first" == "true" ]] && first="false" || violations_json+=","
        violations_json+="{\"file\":\"$vfile\",\"line\":$vnum,\"code\":\"$vcode\"}"
      done < "$phase_file"
    fi

    violations_json+="]}"
  done

  local json="{\"timestamp\":\"$timestamp\",\"version\":\"1.0.0\",\"mode\":\"$mode\",\"summary\":{\"totalErrors\":$TOTAL_ERRORS,\"totalWarnings\":$TOTAL_WARNINGS,\"passed\":$passed},\"phases\":[$violations_json]}"

  echo "$json" | python3 -m json.tool > "$JSON_REPORT" 2>/dev/null || echo "$json" > "$JSON_REPORT"
}

build_md_summary() {
  {
    echo "# Code Consistency Report"
    echo ""
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    echo "| Phase | Check | Status | Count |"
    echo "|-------|-------|--------|-------|"

    for i in 1 2 3 4 5 6; do
      local ec="${PHASE_ERRORS[$i]}"
      local wc="${PHASE_WARNINGS[$i]}"
      local icon="✅"
      local count_str="0"
      if [[ $ec -gt 0 ]]; then
        icon="❌"
        count_str="${ec} errors"
      elif [[ $wc -gt 0 ]]; then
        icon="⚠️"
        count_str="${wc} warnings"
      fi
      echo "| $i | ${PHASE_NAMES[$i]} | $icon | $count_str |"
    done

    echo ""
    echo "**Total: ${TOTAL_ERRORS} errors, ${TOTAL_WARNINGS} warnings**"
    echo ""

    # Detail sections for phases with violations
    for i in 1 2 3 4 5 6; do
      local ec="${PHASE_ERRORS[$i]}"
      local wc="${PHASE_WARNINGS[$i]}"
      [[ $ec -eq 0 && $wc -eq 0 ]] && continue

      local phase_file="$TMPDIR_CONSISTENCY/phase${i}.txt"

      echo "## Phase $i: ${PHASE_NAMES[$i]}"
      echo ""
      echo '```'
      if [[ -f "$phase_file" && -s "$phase_file" ]]; then
        cat "$phase_file"
      fi
      echo '```'
      echo ""
    done
  } > "$MD_SUMMARY"
}

print_summary() {
  echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  Summary${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
  echo ""

  for i in 1 2 3 4 5 6; do
    local ec="${PHASE_ERRORS[$i]}"
    local wc="${PHASE_WARNINGS[$i]}"
    local status
    if [[ $ec -gt 0 ]]; then
      status="${RED}❌ ${ec} violations${NC}"
    elif [[ $wc -gt 0 ]]; then
      status="${YELLOW}⚠️  ${wc} warnings${NC}"
    else
      status="${GREEN}✅ clean${NC}"
    fi
    printf "  Phase %d %-22s %b\n" "$i" "(${PHASE_NAMES[$i]})" "$status"
  done

  echo ""
  echo -e "  Total: ${BOLD}${TOTAL_ERRORS} errors, ${TOTAL_WARNINGS} warnings${NC}"
  echo ""
}

# ============================================================================
# Main
# ============================================================================

print_header

print_phase_header 1 "Magic Numbers in setTimeout/setInterval"
phase1

print_phase_header 2 "Unguarded for...of Iteration"
phase2

print_phase_header 3 "Unguarded .join() Calls"
phase3

print_phase_header 4 "localStorage without try-catch"
phase4

print_phase_header 5 "fetch() without timeout/signal"
phase5

print_phase_header 6 "Cache Pattern Consistency"
phase6

# Generate reports
build_json_report
build_md_summary

# Print summary
print_summary

echo "Reports:"
echo "  JSON:     web/$JSON_REPORT"
echo "  Summary:  web/$MD_SUMMARY"
echo ""

# Exit code
EXIT_CODE=0
if [[ $TOTAL_ERRORS -gt 0 ]]; then
  EXIT_CODE=1
fi
if [[ -n "$STRICT_MODE" && $TOTAL_WARNINGS -gt 0 ]]; then
  EXIT_CODE=1
fi

exit $EXIT_CODE
