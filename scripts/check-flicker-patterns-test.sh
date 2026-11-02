#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES="$(mktemp -d)"
trap 'rm -rf "$FIXTURES"' EXIT
mkdir -p "$FIXTURES/__tests__"

printf '%s\n' '  setA(1)' '  setB(2)' > "$FIXTURES/Pair.tsx"
printf '%s\n' '  setA(1)' '  doWork()' '  setB(2)' > "$FIXTURES/Apart.tsx"
printf '%s\n' '  setA(1)' '  setB(2)' > "$FIXTURES/Pair.test.tsx"
printf '%s\n' 'const X = lazy(() => import("./X"))' > "$FIXTURES/Lazy.tsx"
printf '%s\n' 'const X = lazy(() => import("./X")); <Suspense />' > "$FIXTURES/LazyOk.tsx"
printf '%s\n' 'await fetch(u)' > "$FIXTURES/Await.tsx"
printf '%s\n' 'useLayoutEffect(() => {}, [])' > "$FIXTURES/Layout.tsx"
printf '%s\n' "import { useLayoutEffect } from 'react'" '// uses useLayoutEffect for measuring' > "$FIXTURES/Import.tsx"
printf '%s\n' 'useLayoutEffect(() => {}, [])' > "$FIXTURES/__tests__/Layout.tsx"

check() {
  local actual
  actual="$(bash "$SCRIPT_DIR/check-flicker-patterns.sh" "$1" "$FIXTURES")"
  if [[ "$actual" != "$2" ]]; then
    printf '%s: unexpected:\n%s\nexpected:\n%s\n' "$1" "$actual" "$2" >&2
    exit 1
  fi
}
check setstate "$FIXTURES/Pair.tsx:1 and $FIXTURES/Pair.tsx:2 - consecutive setState calls"
check suspense "Lazy.tsx"
check layout "$FIXTURES/Layout.tsx:1:useLayoutEffect(() => {}, [])"
printf 'Flicker pattern detector regression tests passed\n'
