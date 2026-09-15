#!/bin/bash
# scripts/check-go-ratchet-orphans.sh
#
# Reports Go packages LISTED in the per-package coverage ratchet file that
# no longer exist under the source roots — i.e. packages that were deleted
# from the tree but whose ratchet line was left behind.
#
# This is the mirror image of scripts/check-go-ratchet-completeness.sh
# (which reports on-disk packages MISSING from the ratchet). Orphaned
# ratchet entries are the failure mode that broke every PR after PR
# #23366 removed `pkg/stellar/metrics/` without deleting line 94 of
# .github/go-package-coverage-ratchet.txt: the "Check Go coverage
# ratchet" step then fails on every downstream PR with
# `Package pkg/stellar/metrics was not found in coverage.out`, because
# the enforcement step can't tell "package deleted intentionally" from
# "package coverage dropped to nothing". See kubestellar/console#23427.
#
# By default the script only reports (exit 0). Pass --strict (or set
# STRICT=1) to exit non-zero when any orphan is present, so it can be
# wired into CI on the PR that does the deletion — cleaning the ratchet
# there rather than broadcasting the failure to every downstream PR.
#
# Usage:
#   ./scripts/check-go-ratchet-orphans.sh <package-threshold-file> [<root-dir>...] [--strict]
#
# Defaults: roots = "pkg cmd" if no roots supplied (matches
# check-go-ratchet-completeness.sh).

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

# A "Go package directory" is any dir under a root that contains at least
# one non-test *.go file directly. Vendored/third-party trees are skipped.
# Same rule used by check-go-ratchet-completeness.sh so the two scripts
# agree on what "packages that exist" means.
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

PRESENT=$(find_go_dirs)

ORPHANS=""
ORPHAN_COUNT=0

while IFS= read -r pkg; do
  [ -z "$pkg" ] && continue
  if ! printf '%s\n' "$PRESENT" | grep -qxF "$pkg"; then
    ORPHANS="${ORPHANS}${pkg}"$'\n'
    ORPHAN_COUNT=$((ORPHAN_COUNT + 1))
  fi
done <<< "$TRACKED"

if [ "$ORPHAN_COUNT" -eq 0 ]; then
  echo "All packages listed in ${THRESHOLD_FILE} still exist under ${ROOTS[*]}."
  exit 0
fi

echo "::warning::${ORPHAN_COUNT} Go package(s) listed in ${THRESHOLD_FILE} no longer exist under ${ROOTS[*]}:"
printf '%s' "$ORPHANS" | sed 's/^/  - /'
echo "Delete these lines from ${THRESHOLD_FILE} in the same PR that removed the package."

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Go ratchet orphans"
    echo ""
    echo "**${ORPHAN_COUNT}** package(s) listed in \`${THRESHOLD_FILE}\` no longer exist under \`${ROOTS[*]}\`:"
    echo ""
    printf '%s' "$ORPHANS" | sed 's/^/- `/; s/$/`/'
    echo ""
    echo "Delete these lines from \`${THRESHOLD_FILE}\` in the same PR that removed the package."
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$STRICT" = "1" ]; then
  echo "::error::Ratchet file lists ${ORPHAN_COUNT} orphan package(s); remove the stale entries."
  exit 1
fi

exit 0
