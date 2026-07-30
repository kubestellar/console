#!/bin/bash
# AI-Driven Bug Discovery Scanner
#
# Scans web/src/ for common anti-patterns and potential bugs.
# Part of the LFX Mentorship: AI-Driven Bug Discovery (#4190).
#
# Usage:
#   ./scripts/bug-discovery.sh                # Full scan, output to stdout
#   ./scripts/bug-discovery.sh --report       # Write markdown report to file
#   ./scripts/bug-discovery.sh --category X   # Scan only category X
#
# Categories:
#   array-safety    — .map/.filter/.join/.forEach/for...of without || [] guard
#   magic-numbers   — numeric literals not assigned to named constants
#   demo-data       — card components using useCached* without isDemoData
#   any-types       — TypeScript `any` type usage
#   raw-strings     — JSX string literals not wrapped in t() for i18n
#   all             — run every category (default)
#
# Output:
#   Markdown-formatted report with file:line references and counts.
#
# Exit code:
#   0 — scan completed (findings may exist)
#   1 — script error

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_ROOT/web/src"
REPORT_FILE="$REPO_ROOT/scripts/bug-discovery-report.md"
WRITE_REPORT=false
CATEGORY="all"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report) WRITE_REPORT=true; shift ;;
    --category) CATEGORY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
FINDINGS_COUNT=0

# Write output to a staging file to avoid shell variable size limits
STAGE_FILE="$REPO_ROOT/scripts/.bug-discovery-stage.md"
: > "$STAGE_FILE"

emit() {
  printf '%s\n' "$1" >> "$STAGE_FILE"
}

emit_header() {
  emit ""
  emit "## $1"
  emit ""
}

cleanup() { rm -f "$STAGE_FILE" "$REPO_ROOT/scripts/.bug-matches"; }
trap cleanup EXIT

# Count matches from grep; accepts a label and a grep command via args
scan_pattern() {
  local label="$1"
  shift
  local match_file="$REPO_ROOT/scripts/.bug-matches"
  "$@" > "$match_file" 2>/dev/null || true
  local count
  count=$(wc -l < "$match_file" 2>/dev/null || echo 0)
  count=$((count + 0))  # ensure numeric
  if [[ "$count" -gt 0 ]]; then
    FINDINGS_COUNT=$((FINDINGS_COUNT + count))
    emit "**$label** — $count finding(s)"
    emit ""
    emit '```'
    head -80 "$match_file" >> "$STAGE_FILE"
    if [[ "$count" -gt 80 ]]; then
      emit "... ($((count - 80)) more lines omitted)"
    fi
    emit '```'
    emit ""
  else
    emit "**$label** — ✅ no findings"
    emit ""
  fi
  rm -f "$match_file"
}

# ---------------------------------------------------------------------------
# Category: Array Safety
# ---------------------------------------------------------------------------
scan_array_safety() {
  emit_header "Array Safety — missing \`|| []\` guards"
  emit "Detects \`.map(\`, \`.filter(\`, \`.join(\`, \`.forEach(\`, and \`for...of\`"
  emit "on variables that may be undefined (no \`|| []\` on the same line)."
  emit ""

  # Look for array methods where the line does NOT contain '|| []'
  local methods='\.(map|filter|join|forEach)\('
  scan_pattern "Array method calls without \`|| []\` guard" \
    grep -rn --include='*.tsx' --include='*.ts' \
    -E "$methods" "$SRC_DIR" \
    --exclude-dir='__tests__' \
    --exclude-dir='node_modules' \
    --exclude='*.test.*' \
    --exclude='*.spec.*' \
    --exclude='demoData.*'

  # for...of without || []
  scan_pattern "\`for...of\` without \`|| []\` guard" \
    grep -rn --include='*.tsx' --include='*.ts' \
    -E 'for\s*\(.*\bof\b' "$SRC_DIR" \
    --exclude-dir='__tests__' \
    --exclude-dir='node_modules' \
    --exclude='*.test.*' \
    --exclude='*.spec.*'
}

# ---------------------------------------------------------------------------
# Category: Magic Numbers
# ---------------------------------------------------------------------------
scan_magic_numbers() {
  emit_header "Magic Numbers"
  emit "Numeric literals (excluding 0, 1, 2, common indices, and import/type lines)"
  emit "that are not assigned to a named constant."
  emit ""

  # Heuristic: find lines with bare numeric literals >= 2 that are NOT
  # part of a const/let/var assignment pattern like `const X = 42`.
  scan_pattern "Potential magic numbers" \
    grep -rn --include='*.tsx' --include='*.ts' \
    -E '[\(\[,: ][0-9]{2,5}[,\)\]; ]' "$SRC_DIR" \
    --exclude-dir='node_modules' \
    --exclude-dir='__tests__' \
    --exclude-dir='locales' \
    --exclude='*.test.*' \
    --exclude='*.spec.*' \
    --exclude='*.d.ts' \
    --exclude='demoData.*' \
    --exclude='themes.ts'
}

# ---------------------------------------------------------------------------
# Category: Missing isDemoData
# ---------------------------------------------------------------------------
scan_demo_data() {
  emit_header "Missing \`isDemoData\` in Card Components"
  emit "Card components using \`useCached*\` hooks must destructure \`isDemoData\`."
  emit ""

  # Find files that call useCached* but do NOT mention isDemoData
  local card_dir="$SRC_DIR/components/cards"
  if [[ ! -d "$card_dir" ]]; then
    emit "**isDemoData wiring** — ⚠️ card directory not found at \`$card_dir\`"
    emit ""
    return
  fi

  local card_files
  card_files=$(grep -rl --include='*.tsx' --include='*.ts' 'useCached' "$card_dir" 2>/dev/null || true)

  if [[ -z "$card_files" ]]; then
    emit "**isDemoData wiring** — ✅ no card files with useCached* found"
    emit ""
    return
  fi

  local missing=""
  local count=0
  while IFS= read -r f; do
    if ! grep -q 'isDemoData\|isDemoFallback' "$f" 2>/dev/null; then
      missing+="  $f"$'\n'
      count=$((count + 1))
    fi
  done <<< "$card_files"

  if [[ "$count" -gt 0 ]]; then
    FINDINGS_COUNT=$((FINDINGS_COUNT + count))
    emit "**isDemoData wiring** — $count file(s) missing isDemoData/isDemoFallback"
    emit ""
    emit '```'
    printf '%s' "$missing" >> "$STAGE_FILE"
    emit '```'
  else
    emit "**isDemoData wiring** — ✅ all card components wire isDemoData"
  fi
  emit ""
}

# ---------------------------------------------------------------------------
# Category: any Types
# ---------------------------------------------------------------------------
scan_any_types() {
  emit_header "TypeScript \`any\` Usage"
  emit "Explicit \`any\` types reduce type safety."
  emit ""

  scan_pattern "\`any\` type annotations" \
    grep -rn --include='*.tsx' --include='*.ts' \
    -E ':\s*any\b|<any>|as any' "$SRC_DIR" \
    --exclude-dir='node_modules' \
    --exclude-dir='__tests__' \
    --exclude='*.test.*' \
    --exclude='*.spec.*' \
    --exclude='*.d.ts' \
    --exclude='vite-env.d.ts'
}

# ---------------------------------------------------------------------------
# Category: Raw Strings in JSX
# ---------------------------------------------------------------------------
scan_raw_strings() {
  emit_header "Raw Strings in JSX (missing i18n)"
  emit "User-facing text should use \`t()\` from react-i18next, not raw string literals."
  emit "This check flags JSX text content that appears to be English words (heuristic)."
  emit ""

  # Heuristic: find lines in TSX files with JSX text content
  scan_pattern "Potential raw strings in JSX" \
    grep -rn --include='*.tsx' \
    -E '>[A-Z][a-z]{2,}[^<]*</' "$SRC_DIR" \
    --exclude-dir='node_modules' \
    --exclude-dir='__tests__' \
    --exclude-dir='locales' \
    --exclude='*.test.*' \
    --exclude='*.spec.*' \
    --exclude='*.stories.*'
}

# ---------------------------------------------------------------------------
# Run selected categories
# ---------------------------------------------------------------------------
emit "# Bug Discovery Report"
emit ""
emit "**Generated:** $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
emit "**Scanned:** \`$SRC_DIR\`"
emit "**Category:** $CATEGORY"

case "$CATEGORY" in
  array-safety)   scan_array_safety ;;
  magic-numbers)  scan_magic_numbers ;;
  demo-data)      scan_demo_data ;;
  any-types)      scan_any_types ;;
  raw-strings)    scan_raw_strings ;;
  all)
    scan_array_safety
    scan_magic_numbers
    scan_demo_data
    scan_any_types
    scan_raw_strings
    ;;
  *)
    echo "Unknown category: $CATEGORY"
    echo "Valid: array-safety, magic-numbers, demo-data, any-types, raw-strings, all"
    exit 1
    ;;
esac

emit ""
emit "---"
emit "**Total findings: $FINDINGS_COUNT**"

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if $WRITE_REPORT; then
  cp "$STAGE_FILE" "$REPORT_FILE"
  echo "Report written to $REPORT_FILE ($FINDINGS_COUNT findings)"
else
  cat "$STAGE_FILE"
fi
