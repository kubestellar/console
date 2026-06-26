#!/bin/bash
# scripts/check-go-coverage-ratchet.sh
#
# Enforces total and optional per-package Go coverage ratchets against a
# generated coverprofile. Coverage may rise above the stored floors, but it
# must never drop below them.
#
# Usage:
#   ./scripts/check-go-coverage-ratchet.sh <coverprofile> <total-threshold-file> [package-threshold-file] [report-file]

set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 <coverprofile> <total-threshold-file> [package-threshold-file] [report-file]" >&2
  exit 1
fi

COVERPROFILE="$1"
TOTAL_THRESHOLD_FILE="$2"
PACKAGE_THRESHOLD_FILE="${3:-}"
REPORT_FILE="${4:-}"
MODULE_PREFIX="github.com/kubestellar/console/"
FAILURES=0
REPORT_ROWS=""

is_number() {
  [[ "$1" =~ ^[0-9]+([.][0-9]+)?$ ]]
}

is_less_than() {
  awk -v left="$1" -v right="$2" 'BEGIN { exit !(left + 0 < right + 0) }'
}

is_greater_than() {
  awk -v left="$1" -v right="$2" 'BEGIN { exit !(left + 0 > right + 0) }'
}

format_coverage_cell() {
  if is_number "$1"; then
    printf '%s%%' "$1"
    return
  fi

  printf '%s' "$1"
}

append_row() {
  local current_display
  local required_display

  current_display=$(format_coverage_cell "$2")
  required_display=$(format_coverage_cell "$3")
  REPORT_ROWS+="| $1 | ${current_display} | ${required_display} | $4 |"$'\n'
}

coverage_from_profile() {
  local package_path="${1:-}"

  awk -v module_prefix="$MODULE_PREFIX" -v target="$package_path" '
    BEGIN { FS = "[: ,]+" }
    NR == 1 { next }
    {
      file = $1
      sub("^" module_prefix, "", file)
      depth = split(file, parts, "/")
      package_dir = parts[1]
      for (segment_index = 2; segment_index < depth; segment_index++) {
        package_dir = package_dir "/" parts[segment_index]
      }
      if (target != "" && package_dir != target) {
        next
      }
      statements = $(NF - 1)
      executions = $NF
      total += statements
      if (executions > 0) {
        covered += statements
      }
    }
    END {
      if (total == 0) {
        exit 1
      }
      printf "%.1f", (covered / total) * 100
    }
  ' "$COVERPROFILE"
}

if [ ! -f "$COVERPROFILE" ]; then
  echo "Coverprofile not found: $COVERPROFILE" >&2
  exit 1
fi

if [ ! -f "$TOTAL_THRESHOLD_FILE" ]; then
  echo "Coverage threshold file not found: $TOTAL_THRESHOLD_FILE" >&2
  exit 1
fi

if [ -n "$PACKAGE_THRESHOLD_FILE" ] && [ ! -f "$PACKAGE_THRESHOLD_FILE" ]; then
  echo "Package coverage threshold file not found: $PACKAGE_THRESHOLD_FILE" >&2
  exit 1
fi

TOTAL_COVERAGE=$(coverage_from_profile)
TOTAL_REQUIRED=$(tr -d '[:space:]' < "$TOTAL_THRESHOLD_FILE")

if [ -z "$TOTAL_COVERAGE" ]; then
  echo "Unable to read total coverage from $COVERPROFILE" >&2
  exit 1
fi

if ! is_number "$TOTAL_REQUIRED"; then
  echo "Coverage threshold must be numeric, got: $TOTAL_REQUIRED" >&2
  exit 1
fi

printf 'Total Go coverage: %s%%\n' "$TOTAL_COVERAGE"
printf 'Go coverage ratchet floor: %s%%\n' "$TOTAL_REQUIRED"

TOTAL_STATUS=':white_check_mark:'
if is_less_than "$TOTAL_COVERAGE" "$TOTAL_REQUIRED"; then
  TOTAL_STATUS=':x:'
  FAILURES=1
  echo "::error::Go coverage ${TOTAL_COVERAGE}% is below ratchet floor ${TOTAL_REQUIRED}%"
fi
append_row 'total' "$TOTAL_COVERAGE" "$TOTAL_REQUIRED" "$TOTAL_STATUS"

if is_greater_than "$TOTAL_COVERAGE" "$TOTAL_REQUIRED"; then
  echo "::notice::Total Go coverage improved above the stored floor. Update ${TOTAL_THRESHOLD_FILE} in a follow-up ratchet PR to lock in ${TOTAL_COVERAGE}%."
fi

if [ -n "$PACKAGE_THRESHOLD_FILE" ]; then
  while read -r package_path minimum_coverage _rest; do
    if [ -z "${package_path:-}" ] || [[ "$package_path" == \#* ]]; then
      continue
    fi

    if [ -z "${minimum_coverage:-}" ] || ! is_number "$minimum_coverage"; then
      echo "Invalid package threshold line in ${PACKAGE_THRESHOLD_FILE}: ${package_path} ${minimum_coverage:-}" >&2
      exit 1
    fi

    if ! current_coverage=$(coverage_from_profile "$package_path"); then
      echo "::error::Package ${package_path} was not found in ${COVERPROFILE}"
      FAILURES=1
      append_row "$package_path" 'missing' "$minimum_coverage" ':x:'
      continue
    fi

    PACKAGE_STATUS=':white_check_mark:'
    if is_less_than "$current_coverage" "$minimum_coverage"; then
      PACKAGE_STATUS=':x:'
      FAILURES=1
      echo "::error::Go coverage for ${package_path} is ${current_coverage}% which is below ratchet floor ${minimum_coverage}%"
    elif is_greater_than "$current_coverage" "$minimum_coverage"; then
      echo "::notice::Go coverage for ${package_path} improved above the stored floor. Update ${PACKAGE_THRESHOLD_FILE} in a follow-up ratchet PR to lock in ${current_coverage}%."
    fi

    append_row "$package_path" "$current_coverage" "$minimum_coverage" "$PACKAGE_STATUS"
  done < "$PACKAGE_THRESHOLD_FILE"
fi

REPORT_CONTENT=$(cat <<EOF
## Go coverage ratchet

- Total coverage: **${TOTAL_COVERAGE}%**
- Total floor: **${TOTAL_REQUIRED}%**
${PACKAGE_THRESHOLD_FILE:+- Package floors file: \
\`${PACKAGE_THRESHOLD_FILE}\`}

| Scope | Current | Required | Status |
|-------|---------|----------|--------|
${REPORT_ROWS}
EOF
)

if [ -n "$REPORT_FILE" ]; then
  printf '%s\n' "$REPORT_CONTENT" > "$REPORT_FILE"
fi

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '%s\n' "$REPORT_CONTENT" >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$FAILURES" -ne 0 ]; then
  exit 1
fi
