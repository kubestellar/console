#!/usr/bin/env bash
# validate-missions.sh — Validate KB install missions from kubestellar/console-kb
#
# Fetches mission JSON files from the console-kb GitHub repository and validates
# them against the MissionExport schema used by the KubeStellar Console.
#
# Usage:
#   bash scripts/validate-missions.sh              # validate all install missions
#   bash scripts/validate-missions.sh --verbose     # show per-mission detail
#   bash scripts/validate-missions.sh --local DIR   # validate local JSON files instead
#
# Requires: jq, curl (both standard on CI runners and dev machines).
#
# Exit codes:
#   0  All missions pass validation
#   1  One or more critical issues found
#   2  Missing dependencies (jq/curl)

set -euo pipefail

# ── Constants ───────────────────────────────────────────────────────
CONSOLE_KB_REPO="kubestellar/console-kb"
CONSOLE_KB_REF="master"
GITHUB_RAW_URL="https://raw.githubusercontent.com/${CONSOLE_KB_REPO}/${CONSOLE_KB_REF}"
GITHUB_API_URL="https://api.github.com/repos/${CONSOLE_KB_REPO}/contents"

# Required fields in a MissionExport (top-level or inside nested .mission)
REQUIRED_FIELDS=("title" "steps")
# Recommended fields that improve mission quality
RECOMMENDED_FIELDS=("description" "type" "tags" "prerequisites" "uninstall" "troubleshooting" "security" "metadata")
# Valid mission types per the TypeScript schema
VALID_TYPES="upgrade troubleshoot analyze deploy repair custom maintain"

# Install paths referenced by cardInstallMap.ts
CARD_INSTALL_MAP_FILE="web/src/lib/cards/cardInstallMap.ts"

VERBOSE=false
LOCAL_DIR=""

# ── Argument parsing ────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose|-v) VERBOSE=true; shift ;;
    --local)      LOCAL_DIR="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,/^$/s/^# //p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
done

# ── Dependency check ────────────────────────────────────────────────
for cmd in jq curl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is required but not found." >&2
    exit 2
  fi
done

# ── Color helpers (disabled if not a terminal) ──────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; CYAN=''; BOLD=''; RESET=''
fi

# ── Counters ────────────────────────────────────────────────────────
total=0
passed=0
warnings=0
critical=0
missing_recommended=0

declare -a issues=()
declare -a mission_names=()

# ── Collect KB paths referenced by cardInstallMap.ts ────────────────
declare -A referenced_paths=()
if [[ -f "$CARD_INSTALL_MAP_FILE" ]]; then
  while IFS= read -r p; do
    referenced_paths["$p"]=1
  done < <(grep -oP "fixes/[^'\"]*\.json" "$CARD_INSTALL_MAP_FILE" | sort -u)
fi

# ── Fetch helper ────────────────────────────────────────────────────
fetch_json() {
  local url="$1"
  curl -fsSL --max-time 15 "$url" 2>/dev/null
}

# ── Validate a single mission JSON blob ─────────────────────────────
# Args: $1 = json string, $2 = source label (path or URL)
validate_mission() {
  local json="$1"
  local source="$2"
  local mission_issues=()
  local has_critical=false

  total=$((total + 1))

  # Check it's valid JSON
  if ! echo "$json" | jq empty 2>/dev/null; then
    issues+=("CRITICAL [$source]: Invalid JSON")
    critical=$((critical + 1))
    return
  fi

  # Normalize: if there's a nested .mission object, merge it (mirrors types.ts normalizeMissionData)
  local normalized
  normalized=$(echo "$json" | jq '
    if (.mission | type) == "object" then
      (.mission) + {
        version: (.version // .mission.version // "kc-mission-v1"),
        name: (.name // .mission.name),
        missionClass: (.missionClass // .mission.missionClass),
        author: (.author // .mission.author),
        authorGithub: (.authorGithub // .mission.authorGithub)
      }
    else
      .
    end
  ')

  # Extract key fields
  local title name steps_count description type tags_count
  title=$(echo "$normalized" | jq -r '.title // empty')
  name=$(echo "$normalized" | jq -r '.name // empty')
  steps_count=$(echo "$normalized" | jq '.steps | if type == "array" then length else 0 end')
  description=$(echo "$normalized" | jq -r '.description // empty')
  type=$(echo "$normalized" | jq -r '.type // empty')
  tags_count=$(echo "$normalized" | jq '.tags | if type == "array" then length else 0 end')

  local display_name="${title:-${name:-$source}}"
  mission_names+=("$display_name")

  # ── Required field checks (critical) ──────────────────────────
  if [[ -z "$title" && -z "$name" ]]; then
    mission_issues+=("CRITICAL: Missing both 'title' and 'name' fields")
    has_critical=true
  fi

  if [[ "$steps_count" -eq 0 ]]; then
    mission_issues+=("CRITICAL: 'steps' array is empty or missing")
    has_critical=true
  fi

  # Validate each step has at least title or description
  local bad_steps
  bad_steps=$(echo "$normalized" | jq '[.steps // [] | .[] | select(
    ((.title // "") == "") and ((.description // "") == "")
  )] | length')
  if [[ "$bad_steps" -gt 0 ]]; then
    mission_issues+=("WARNING: $bad_steps step(s) missing both title and description")
  fi

  # ── Type validation ───────────────────────────────────────────
  if [[ -n "$type" ]]; then
    if ! echo "$VALID_TYPES" | grep -qw "$type"; then
      mission_issues+=("WARNING: Unrecognized type '$type' (expected: $VALID_TYPES)")
    fi
  fi

  # ── Recommended field checks ──────────────────────────────────
  local missing_rec=()
  if [[ -z "$description" ]]; then missing_rec+=("description"); fi
  if [[ "$tags_count" -eq 0 ]]; then missing_rec+=("tags"); fi

  for field in prerequisites uninstall troubleshooting security; do
    local val
    val=$(echo "$normalized" | jq -r ".$field // empty")
    local arr_len
    arr_len=$(echo "$normalized" | jq ".$field | if type == \"array\" then length else 0 end")
    if [[ -z "$val" || "$arr_len" -eq 0 ]]; then
      missing_rec+=("$field")
    fi
  done

  if [[ -n "$(echo "$normalized" | jq -r '.metadata // empty')" ]]; then
    : # metadata exists
  else
    missing_rec+=("metadata")
  fi

  if [[ ${#missing_rec[@]} -gt 0 ]]; then
    mission_issues+=("INFO: Missing recommended fields: ${missing_rec[*]}")
    missing_recommended=$((missing_recommended + ${#missing_rec[@]}))
  fi

  # ── URL validation ────────────────────────────────────────────
  local urls
  urls=$(echo "$normalized" | jq -r '.. | strings' 2>/dev/null | grep -oP 'https?://[^\s"'"'"']+' | sort -u || true)
  for url in $urls; do
    # Check for obviously malformed URLs
    if [[ "$url" =~ \{|\}|\<|\> ]]; then
      mission_issues+=("WARNING: Potentially malformed URL: $url")
    fi
    # Check for placeholder URLs
    if [[ "$url" =~ example\.com|your-domain|placeholder|TODO|FIXME ]]; then
      mission_issues+=("WARNING: Placeholder URL detected: $url")
    fi
  done

  # ── Version staleness heuristic ───────────────────────────────
  local version_refs
  version_refs=$(echo "$normalized" | jq -r '.. | strings' 2>/dev/null | grep -oP 'v[0-9]+\.[0-9]+\.[0-9]+' | sort -u || true)
  # Just report versions found — can't determine staleness without a live check
  if [[ -n "$version_refs" ]] && $VERBOSE; then
    mission_issues+=("INFO: Version references found: $(echo $version_refs | tr '\n' ' ')")
  fi

  # ── Tally results ─────────────────────────────────────────────
  if $has_critical; then
    critical=$((critical + 1))
  else
    passed=$((passed + 1))
  fi

  for issue in "${mission_issues[@]+"${mission_issues[@]}"}"; do
    if [[ "$issue" == WARNING* ]]; then
      warnings=$((warnings + 1))
    fi
    issues+=("[$source] $issue")
  done

  # Verbose per-mission output
  if $VERBOSE; then
    local status_icon="✅"
    if $has_critical; then status_icon="❌"; elif [[ ${#mission_issues[@]} -gt 0 ]]; then status_icon="⚠️"; fi
    echo -e "  ${status_icon} ${BOLD}${display_name}${RESET} (${steps_count} steps, type=${type:-unset})"
    for issue in "${mission_issues[@]+"${mission_issues[@]}"}"; do
      echo "      $issue"
    done
  fi
}

# ── Main ────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  KubeStellar Console — Mission Content Validation${RESET}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}"
echo ""

if [[ -n "$LOCAL_DIR" ]]; then
  # ── Local mode: validate JSON files from a directory ──────────
  echo -e "${CYAN}Source:${RESET} Local directory: $LOCAL_DIR"
  echo ""

  if [[ ! -d "$LOCAL_DIR" ]]; then
    echo "ERROR: Directory '$LOCAL_DIR' does not exist." >&2
    exit 2
  fi

  while IFS= read -r -d '' file; do
    json=$(cat "$file")
    validate_mission "$json" "$file"
  done < <(find "$LOCAL_DIR" -name "*.json" -type f -print0 | sort -z)

else
  # ── Remote mode: fetch from kubestellar/console-kb ────────────
  echo -e "${CYAN}Source:${RESET} github.com/${CONSOLE_KB_REPO} (ref: ${CONSOLE_KB_REF})"
  echo ""

  # Collect all install mission paths
  declare -a mission_paths=()

  # 1. Paths from cardInstallMap.ts
  for p in "${!referenced_paths[@]}"; do
    mission_paths+=("$p")
  done

  # 2. Try to list the cncf-install directory
  echo -e "${CYAN}Fetching mission index from console-kb...${RESET}"
  cncf_listing=$(fetch_json "${GITHUB_API_URL}/fixes/cncf-install?ref=${CONSOLE_KB_REF}" || echo "[]")
  if echo "$cncf_listing" | jq -e 'type == "array"' &>/dev/null; then
    while IFS= read -r path; do
      [[ -n "$path" ]] && mission_paths+=("$path")
    done < <(echo "$cncf_listing" | jq -r '.[] | select(.name | endswith(".json")) | .path')
  fi

  # Also check platform-install
  platform_listing=$(fetch_json "${GITHUB_API_URL}/fixes/platform-install?ref=${CONSOLE_KB_REF}" || echo "[]")
  if echo "$platform_listing" | jq -e 'type == "array"' &>/dev/null; then
    while IFS= read -r path; do
      [[ -n "$path" ]] && mission_paths+=("$path")
    done < <(echo "$platform_listing" | jq -r '.[] | select(.name | endswith(".json")) | .path')
  fi

  # Deduplicate
  declare -A seen_paths=()
  declare -a unique_paths=()
  for p in "${mission_paths[@]}"; do
    if [[ -z "${seen_paths[$p]:-}" ]]; then
      seen_paths["$p"]=1
      unique_paths+=("$p")
    fi
  done

  echo -e "Found ${BOLD}${#unique_paths[@]}${RESET} mission files to validate"
  echo ""

  if [[ ${#unique_paths[@]} -eq 0 ]]; then
    echo -e "${YELLOW}WARNING: No mission files found. GitHub API rate limit may be exceeded.${RESET}"
    echo "Try again later or use --local with a cloned console-kb repo."
    exit 0
  fi

  # Fetch and validate each mission
  for path in "${unique_paths[@]}"; do
    json=$(fetch_json "${GITHUB_RAW_URL}/${path}" || echo "")
    if [[ -z "$json" ]]; then
      issues+=("WARNING [$path]: Failed to fetch from GitHub (may not exist in KB yet)")
      warnings=$((warnings + 1))
      total=$((total + 1))
      continue
    fi
    validate_mission "$json" "$path"
  done

  # ── Cross-reference: cardInstallMap paths that are missing from KB ──
  echo ""
  echo -e "${BOLD}Card Install Map Cross-Reference:${RESET}"
  map_total=${#referenced_paths[@]}
  map_found=0
  map_missing=0
  for p in "${!referenced_paths[@]}"; do
    if [[ -n "${seen_paths[$p]:-}" ]]; then
      map_found=$((map_found + 1))
    else
      map_missing=$((map_missing + 1))
      issues+=("WARNING [cardInstallMap] Referenced path not found in KB: $p")
      warnings=$((warnings + 1))
      if $VERBOSE; then
        echo -e "  ${YELLOW}⚠️  Missing:${RESET} $p"
      fi
    fi
  done
  echo -e "  Referenced paths: ${map_total} | Found: ${map_found} | Missing: ${map_missing}"
fi

# ── Summary Report ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Validation Summary${RESET}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Total missions validated:  ${BOLD}${total}${RESET}"

if [[ $total -gt 0 ]]; then
  pass_pct=$((passed * 100 / total))
  echo -e "  Passed (no critical issues): ${GREEN}${passed}${RESET} (${pass_pct}%)"
else
  echo -e "  Passed: ${GREEN}0${RESET}"
fi

echo -e "  Critical issues:           ${RED}${critical}${RESET}"
echo -e "  Warnings:                  ${YELLOW}${warnings}${RESET}"
echo -e "  Missing recommended fields: ${missing_recommended}"
echo ""

# Print all issues
if [[ ${#issues[@]} -gt 0 ]]; then
  echo -e "${BOLD}Issues Found:${RESET}"
  for issue in "${issues[@]}"; do
    if [[ "$issue" == *CRITICAL* ]]; then
      echo -e "  ${RED}●${RESET} $issue"
    elif [[ "$issue" == *WARNING* ]]; then
      echo -e "  ${YELLOW}●${RESET} $issue"
    else
      echo -e "  ${CYAN}●${RESET} $issue"
    fi
  done
  echo ""
fi

# Exit code
if [[ $critical -gt 0 ]]; then
  echo -e "${RED}${BOLD}FAIL${RESET}: $critical critical issue(s) found."
  exit 1
else
  echo -e "${GREEN}${BOLD}PASS${RESET}: All missions pass structural validation."
  exit 0
fi
