#!/bin/bash
# Multi-layered contract test runner.
# Runs:
# 1. Frontend source-code contract tests (Vitest)
# 2. Backend unit contract tests (Go)
# 3. (Optional) Live API contract tests (Bash + curl)

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)

echo "--- Layer 1: Frontend Source Contract Verification ---"
cd "$REPO_ROOT/web"
npx vitest run src/test/auth-contract.test.ts
npx vitest run src/test/api-contract.test.ts

echo ""
echo "--- Layer 2: Backend Handler Contract Verification ---"
cd "$REPO_ROOT"
go test -v ./pkg/api/handlers -run TestAPIContract
go test -v ./pkg/api/handlers -run TestAuthRefreshContract

echo ""
echo "--- Layers complete: REST contract is verified across the stack ---"
