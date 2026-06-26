#!/bin/bash
# Card Registry Integrity Test
#
# Validates:
#   1. Every card in RAW_CARD_COMPONENTS resolves to a real file
#   2. That file exports the expected named symbol
#   3. Every DEMO_EXEMPT_CARDS entry exists in the registry
#   4. Every DEMO_DATA_CARDS entry exists in the registry
#
# Usage:
#   ./scripts/card-registry-integrity-test.sh
#
# Prerequisites:
#   - npm install done in web/
#
# Exit code:
#   0 = all checks passed
#   1 = one or more integrity violations found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/card-registry-integrity-test.mjs"
