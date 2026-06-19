#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SCHEMA_FILE="web/src/lib/missions/mission.schema.json"
TESTDATA_ROOT="scripts/testdata/validate-missions"
VALID_DIR="${TESTDATA_ROOT}/valid"
INVALID_DIR="${TESTDATA_ROOT}/invalid-missing-version"
EXPECTED_VERSION_ERROR="must have required property 'version'"

# ── Prerequisite check ──────────────────────────────────────────────
# AJV must be available for schema validation tests to be meaningful.
# If AJV is missing or non-functional, exit with code 2 (configuration error)
# rather than silently skipping schema checks and giving false positives.
if ! command -v ajv &>/dev/null; then
  echo "✗ CONFIGURATION ERROR: 'ajv' CLI not found in PATH."
  echo "  Schema validation tests require ajv-cli. Install with:"
  echo "    npm ci --ignore-scripts --prefix .github/kb-scripts"
  echo "  Then add to PATH:"
  echo "    export PATH=\".github/kb-scripts/node_modules/.bin:\$PATH\""
  exit 2
fi

# Smoke-test that ajv can actually validate against the schema with formats
SMOKE_FILE=$(mktemp)
trap 'rm -f "$SMOKE_FILE"' EXIT
echo '{"version":"kc-mission-v1","title":"AJV smoke test","steps":[{"title":"Step 1","description":"Smoke test"}]}' > "$SMOKE_FILE"

if ! ajv validate --spec=draft7 -s "$SCHEMA_FILE" -d "$SMOKE_FILE" -c ajv-formats >/dev/null 2>&1; then
  echo "✗ CONFIGURATION ERROR: ajv cannot validate against schema with ajv-formats plugin."
  echo "  The schema file may have changed or the ajv-formats plugin is unavailable."
  echo "  Schema: $SCHEMA_FILE"
  exit 2
fi

assert_validation_passes() {
  local name="$1"
  local mission_dir="$2"
  local output

  if output=$(./scripts/validate-missions.sh --local "$mission_dir" --schema "$SCHEMA_FILE" 2>&1); then
    # Verify that schema validation was actually performed (not silently skipped)
    if echo "$output" | grep -qi "schema validation skipped"; then
      echo "✗ $name"
      echo "  Schema validation was silently skipped — this is a false positive."
      echo "$output"
      exit 2
    fi
    echo "✓ $name"
    return
  fi

  echo "✗ $name"
  echo "$output"
  exit 1
}

assert_validation_fails_with() {
  local name="$1"
  local mission_dir="$2"
  local expected_snippet="$3"
  local output

  if output=$(./scripts/validate-missions.sh --local "$mission_dir" --schema "$SCHEMA_FILE" 2>&1); then
    echo "✗ $name"
    echo "Expected schema validation to fail, but it passed."
    echo "  This may indicate schema validation was silently skipped."
    echo "$output"
    exit 1
  fi

  if [[ "$output" != *"$expected_snippet"* ]]; then
    echo "✗ $name"
    echo "Expected output to include: $expected_snippet"
    echo "$output"
    exit 1
  fi

  echo "✓ $name"
}

assert_validation_passes "accepts minimal runtime-valid mission fixture" "$VALID_DIR"
assert_validation_fails_with "rejects mission missing required version" "$INVALID_DIR" "$EXPECTED_VERSION_ERROR"

echo "Mission schema validation path passed fixture coverage checks."
