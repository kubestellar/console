#!/bin/bash
# Bug Triage Report Generator
#
# Generates a summary of open/recently-closed bugs and cross-references
# with static analysis findings from bug-discovery.sh.
# Part of the LFX Mentorship: AI-Driven Bug Discovery (#4190).
#
# Usage:
#   ./scripts/bug-triage-report.sh                  # Print to stdout
#   ./scripts/bug-triage-report.sh --report          # Write to file
#   ./scripts/bug-triage-report.sh --days 14         # Lookback window (default: 30)
#
# Prerequisites:
#   - `gh` CLI authenticated with repo access
#   - Run from repo root (or scripts/ directory)
#
# Output:
#   Markdown report with:
#     1. Open bug counts by label
#     2. Recently closed bugs
#     3. Pattern frequency summary from bug-discovery.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$REPO_ROOT/scripts"
REPORT_FILE="$REPO_ROOT/scripts/bug-triage-report.md"
WRITE_REPORT=false
LOOKBACK_DAYS=30
REPO="kubestellar/console"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report) WRITE_REPORT=true; shift ;;
    --days)   LOOKBACK_DAYS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SINCE_DATE=$(date -u -d "${LOOKBACK_DAYS} days ago" '+%Y-%m-%d' 2>/dev/null \
  || date -u -v-"${LOOKBACK_DAYS}"d '+%Y-%m-%d' 2>/dev/null \
  || echo "2024-01-01")

STAGE_FILE="$REPO_ROOT/scripts/.bug-triage-stage.md"
: > "$STAGE_FILE"

emit() { printf '%s\n' "$1" >> "$STAGE_FILE"; }

cleanup() { rm -f "$STAGE_FILE"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Section 1 — Open bugs by label
# ---------------------------------------------------------------------------
emit "# Bug Triage Report"
emit ""
emit "**Generated:** $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
emit "**Repository:** $REPO"
emit "**Lookback:** $LOOKBACK_DAYS days (since $SINCE_DATE)"
emit ""

emit "## Open Bugs by Label"
emit ""

if command -v gh &>/dev/null; then
  # Fetch all open issues labeled 'bug' or 'kind/bug'
  bug_issues=$(gh issue list --repo "$REPO" --state open --label bug --json number,title,labels,createdAt --limit 200 2>/dev/null || echo "[]")
  kind_bug_issues=$(gh issue list --repo "$REPO" --state open --label kind/bug --json number,title,labels,createdAt --limit 200 2>/dev/null || echo "[]")

  # Merge and deduplicate by issue number
  all_bugs=$(echo "$bug_issues $kind_bug_issues" | jq -s 'add // [] | unique_by(.number) | sort_by(.number)')
  total_open=$(echo "$all_bugs" | jq 'length')

  emit "**Total open bugs:** $total_open"
  emit ""

  if [[ "$total_open" -gt 0 ]]; then
    # Count by label
    emit "| Label | Count |"
    emit "|-------|-------|"
    label_counts=$(echo "$all_bugs" | jq -r '
      [.[].labels[].name] | group_by(.) | map({label: .[0], count: length})
      | sort_by(-.count)[] | "| \(.label) | \(.count) |"
    ' 2>/dev/null || echo "| (parse error) | - |")
    emit "$label_counts"
    emit ""

    # List top 20
    emit "### Open Bug List (top 20)"
    emit ""
    emit "| # | Title | Created |"
    emit "|---|-------|---------|"
    echo "$all_bugs" | jq -r '
      .[:20][] | "| #\(.number) | \(.title[:80]) | \(.createdAt[:10]) |"
    ' 2>/dev/null | while IFS= read -r line; do emit "$line"; done
    emit ""
  fi
else
  emit "> ⚠️ \`gh\` CLI not found — skipping GitHub issue queries."
  emit "> Install: https://cli.github.com/"
  emit ""
fi

# ---------------------------------------------------------------------------
# Section 2 — Recently closed bugs
# ---------------------------------------------------------------------------
emit "## Recently Closed Bugs (last $LOOKBACK_DAYS days)"
emit ""

if command -v gh &>/dev/null; then
  closed_bugs=$(gh issue list --repo "$REPO" --state closed --label bug --json number,title,closedAt --limit 100 2>/dev/null || echo "[]")
  recent_closed=$(echo "$closed_bugs" | jq --arg since "$SINCE_DATE" '
    [.[] | select(.closedAt >= $since)] | sort_by(.closedAt) | reverse
  ' 2>/dev/null || echo "[]")
  closed_count=$(echo "$recent_closed" | jq 'length')

  emit "**Closed in window:** $closed_count"
  emit ""

  if [[ "$closed_count" -gt 0 ]]; then
    emit "| # | Title | Closed |"
    emit "|---|-------|--------|"
    echo "$recent_closed" | jq -r '
      .[:30][] | "| #\(.number) | \(.title[:80]) | \(.closedAt[:10]) |"
    ' 2>/dev/null | while IFS= read -r line; do emit "$line"; done
    emit ""
  fi
else
  emit "> ⚠️ \`gh\` CLI not available."
  emit ""
fi

# ---------------------------------------------------------------------------
# Section 3 — Static analysis pattern frequency
# ---------------------------------------------------------------------------
emit "## Static Analysis Summary"
emit ""

if [[ -x "$SCRIPT_DIR/bug-discovery.sh" ]]; then
  emit "Running \`bug-discovery.sh\` for pattern frequencies..."
  emit ""

  discovery_output=$("$SCRIPT_DIR/bug-discovery.sh" 2>&1 || true)

  # Extract finding counts per category
  emit "| Category | Findings |"
  emit "|----------|----------|"

  for category in "Array method" "for...of" "magic numbers" "isDemoData" "any.*type" "Raw strings"; do
    count=$(echo "$discovery_output" | grep -i "$category" | grep -oE '[0-9]+ finding' | head -1 | grep -oE '[0-9]+' || echo "0")
    emit "| $category | $count |"
  done
  emit ""

  # Total
  total_line=$(echo "$discovery_output" | grep -i 'Total findings' || echo "Total findings: unknown")
  emit "**$total_line**"
  emit ""
else
  emit "> ⚠️ \`bug-discovery.sh\` not found or not executable — skipping static analysis."
  emit ""
fi

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
emit "---"
emit "*Report generated by \`scripts/bug-triage-report.sh\` — LFX Mentorship #4190*"

if $WRITE_REPORT; then
  cp "$STAGE_FILE" "$REPORT_FILE"
  echo "Report written to $REPORT_FILE"
else
  cat "$STAGE_FILE"
fi
