#!/bin/bash
# Run E2E tests with code coverage collection

set -e

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
VITE_COVERAGE=true npx playwright test --project=chromium || true

echo "🛑 Stopping dev server..."
kill $DEV_PID 2>/dev/null || true

echo "📊 Generating coverage report..."
npx nyc report --reporter=text --reporter=html --reporter=lcov

echo ""
echo "✅ Done! Coverage report available in ./coverage/index.html"
echo ""
