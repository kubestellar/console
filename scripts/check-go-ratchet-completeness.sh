#!/bin/bash
# scripts/check-go-ratchet-completeness.sh
#
# Reports Go packages that ship non-test .go files but are NOT listed in the
# per-package coverage ratchet file. Unlisted packages are silently unenforced
# by check-go-coverage-ratchet.sh — their coverage can regress to 0% without
# failing CI as long as the overall total floor is met.
#
# By default the script only reports (exit 0). Pass --strict (or set
# STRICT=1) to exit non-zero when any package is missing, so it can be wired
# into CI as a hard gate once the ratchet file is fully populated.
#
# Usage:
#   ./scripts/check-go-ratchet-completeness.sh <package-threshold-file> [<root-dir>...] [--strict]
#
# Defaults: roots = "pkg cmd" if no roots supplied.

set -euo pipefail

STRICT="${STRICT:-0}"
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done

if [ "${#ARGS[@]}" -lt 1 ]; then
  echo "Usage: $0 <package-threshold-file> [<root-dir>...] [--strict]" >&2
  exit 2
fi

THRESHOLD_FILE="${ARGS[0]}"
if [ ! -f "$THRESHOLD_FILE" ]; then
  echo "Package coverage threshold file not found: $THRESHOLD_FILE" >&2
  exit 2
fi

ROOTS=("${ARGS[@]:1}")
if [ "${#ROOTS[@]}" -eq 0 ]; then
  ROOTS=(pkg cmd)
fi

TRACKED=$(awk '
  /^[[:space:]]*($|#)/ { next }
  { print $1 }
' "$THRESHOLD_FILE" | sort -u)

MISSING=""
MISSING_COUNT=0

# A "Go package directory" is any dir under a root that contains at least one
# non-test *.go file directly. Vendored/third-party trees are skipped.
find_go_dirs() {
  for root in "${ROOTS[@]}"; do
    [ -d "$root" ] || continue
    find "$root" \
      -type d \
      \( -name vendor -o -name testdata -o -name node_modules -o -name .git \) -prune -o \
      -type f -name '*.go' -not -name '*_test.go' -print 2>/dev/null
  done | while read -r gofile; do
    dirname "$gofile"
  done | sort -u
}

while IFS= read -r pkg_dir; do
  [ -z "$pkg_dir" ] && continue
  if ! printf '%s\n' "$TRACKED" | grep -qxF "$pkg_dir"; then
    MISSING="${MISSING}${pkg_dir}"$'\n'
    MISSING_COUNT=$((MISSING_COUNT + 1))
  fi
done < <(find_go_dirs)

if [ "$MISSING_COUNT" -eq 0 ]; then
  echo "All Go packages under ${ROOTS[*]} are listed in ${THRESHOLD_FILE}."
  exit 0
fi

echo "::warning::${MISSING_COUNT} Go package(s) with non-test code are missing from ${THRESHOLD_FILE}:"
printf '%s' "$MISSING" | sed 's/^/  - /'

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Go ratchet completeness"
    echo ""
    echo "**${MISSING_COUNT}** Go package(s) with non-test code are missing from \`${THRESHOLD_FILE}\`:"
    echo ""
    printf '%s' "$MISSING" | sed 's/^/- `/; s/$/`/'
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$STRICT" = "1" ]; then
  echo "::error::Ratchet file is incomplete (${MISSING_COUNT} packages unlisted); run with --strict disabled or add entries."
  exit 1
fi

exit 0
