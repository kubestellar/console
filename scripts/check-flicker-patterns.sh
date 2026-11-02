#!/usr/bin/env bash
# Heuristic flicker checks over production TSX. Run from web/, or pass a source
# directory for fixture tests. Usage: check-flicker-patterns.sh <setstate|suspense|layout> [dir]
set -euo pipefail
MODE="${1:?mode: setstate|suspense|layout}"
SOURCE_DIR="${2:-src}"

production_files() {
  find "$SOURCE_DIR" -type f -name '*.tsx' \
    ! -name '*.test.tsx' ! -name '*.spec.tsx' ! -name '*.stories.tsx' \
    ! -path '*/__tests__/*' ! -path '*/node_modules/*' -print0 | sort -z
}

case "$MODE" in
  setstate)
    # Only setter statements on adjacent lines count; setters nested in
    # separate callbacks or JSX handlers are not consecutive updates.
    while IFS= read -r -d '' file; do
      awk -v f="$file" '
        /^[[:space:]]*set[A-Z][A-Za-z0-9_]*\(.*\)[[:space:]]*;?[[:space:]]*$/ {
          if (prev == NR - 1) printf "%s:%d and %s:%d - consecutive setState calls\n", f, prev, f, NR
          prev = NR; next
        }
        { prev = 0 }
      ' "$file"
    done < <(production_files)
    ;;
  suspense)
    # A lazy-loaded component needs a Suspense boundary; plain await/.then does not.
    while IFS= read -r -d '' file; do
      if grep -Eq '\b(React\.)?lazy[[:space:]]*\(' "$file" && ! grep -q 'Suspense' "$file"; then
        basename "$file"
      fi
    done < <(production_files)
    ;;
  layout)
    # Report calls only, not imports or comments mentioning the hook.
    while IFS= read -r -d '' file; do
      grep -nE '^[^/*]*\b(React\.)?useLayoutEffect[[:space:]]*\(' "$file" | sed "s|^|$file:|" || true
    done < <(production_files)
    ;;
  *)
    echo "unknown mode: $MODE" >&2
    exit 2
    ;;
esac
