#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES="$(mktemp -d)"
trap 'rm -rf "$FIXTURES"' EXIT
mkdir -p "$FIXTURES/__tests__" "$FIXTURES/node_modules" "$FIXTURES/with spaces"

# Each fixture describes only the source text inspected by the heuristic.
printf '%s\n' 'return loading ? <Loader2 /> : <Content />' > "$FIXTURES/Loader.tsx"
printf '%s\n' 'return loading ? <Loader /> : <Content />' > "$FIXTURES/PlainLoader.tsx"
printf '%s\n' 'return loading ? <span className="animate-spin" /> : null' > "$FIXTURES/Spin.tsx"
printf '%s\n' 'return isLoading ? <Skeleton /> : <Content />' > "$FIXTURES/Skeleton.tsx"
printf '%s\n' 'return loading ? <Spinner /> : <Content />' > "$FIXTURES/Spinner.tsx"
printf '%s\n' 'return isLoading ? <LoadingIndicator /> : null' > "$FIXTURES/Loading.tsx"
printf '%s\n' 'return loading ? <UI.Skeleton /> : null' > "$FIXTURES/Namespaced.tsx"
printf '%s\n' 'const loading = true' | tee \
  "$FIXTURES/Component.test.tsx" "$FIXTURES/Component.spec.tsx" \
  "$FIXTURES/Component.stories.tsx" "$FIXTURES/__tests__/Component.tsx" \
  "$FIXTURES/node_modules/Component.tsx" > /dev/null
printf '%s\n' 'return <Content />' > "$FIXTURES/Static.tsx"
printf '%s\n' 'const loadingMessage = "ready"' > "$FIXTURES/Message.tsx"
printf '%s\n' 'const isLoading = true; return null' > "$FIXTURES/with spaces/Missing.tsx"

ACTUAL="$(bash "$SCRIPT_DIR/check-flicker-loading.sh" "$FIXTURES")"
EXPECTED="  - \`$FIXTURES/with spaces/Missing.tsx\`"
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
  printf 'Unexpected findings:\n%s\nExpected:\n%s\n' "$ACTUAL" "$EXPECTED" >&2
  exit 1
fi
printf 'Flicker loading detector regression tests passed\n'
