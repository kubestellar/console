#!/usr/bin/env bash
# Heuristic only: report production TSX files with loading state but no known
# visual indicator. Run from web/, or pass a source directory for fixture tests.
set -euo pipefail
SOURCE_DIR="${1:-src}"

while IFS= read -r -d '' file; do
  if grep -qE '\bisLoading\b|\bloading\b' "$file" &&
    ! grep -qE '<([[:alnum:]_]+\.)?(Skeleton[[:alnum:]_]*|Spinner|Loading[[:alnum:]_]*|Loader[[:digit:]]*)\b|skeleton|animate-spin' "$file"; then
    printf '  - `%s`\n' "$file"
  fi
done < <(find "$SOURCE_DIR" -type f -name '*.tsx' \
  ! -name '*.test.tsx' ! -name '*.spec.tsx' ! -name '*.stories.tsx' \
  ! -path '*/__tests__/*' ! -path '*/node_modules/*' -print0)
