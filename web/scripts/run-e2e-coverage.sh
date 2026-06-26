#!/bin/bash
# Run E2E tests with code coverage collection

set -e

cleanup() {
	if [ -n "${DEV_PID:-}" ]; then
		kill "$DEV_PID" 2>/dev/null || true
	fi
}

trap cleanup EXIT

echo "🧹 Cleaning previous coverage data..."
rm -rf .nyc_output coverage

echo "🚀 Starting dev server with coverage instrumentation..."
VITE_COVERAGE=true npm run dev &
DEV_PID=$!

# Wait for dev server to be ready
echo "⏳ Waiting for dev server to start..."
npx wait-on http://localhost:5174 --timeout 60000

export PLAYWRIGHT_BASE_URL=http://localhost:5174

echo "🎭 Running Playwright tests (chromium only for coverage)..."
PLAYWRIGHT_EXIT=0
VITE_COVERAGE=true npx playwright test --project=chromium || PLAYWRIGHT_EXIT=$?

echo "🛑 Stopping dev server..."
kill "$DEV_PID" 2>/dev/null || true
DEV_PID=""

echo "📊 Generating coverage report..."
node scripts/coverage-report.mjs

echo ""
echo "✅ Done! Coverage report available in ./coverage/index.html"
echo ""

if [ "$PLAYWRIGHT_EXIT" -ne 0 ]; then
	echo "❌ Playwright tests failed during coverage run"
	exit "$PLAYWRIGHT_EXIT"
fi
