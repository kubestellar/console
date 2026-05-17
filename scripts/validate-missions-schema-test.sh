#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SCHEMA_FILE="web/src/lib/missions/mission.schema.json"
TESTDATA_ROOT="scripts/testdata/validate-missions"
VALID_DIR="${TESTDATA_ROOT}/valid"
INVALID_DIR="${TESTDATA_ROOT}/invalid-missing-version"
EXPECTED_VERSION_ERROR="must have required property 'version'"

assert_validation_passes() {
  local name="$1"
  local mission_dir="$2"
  local output

  if output=$(./scripts/validate-missions.sh --local "$mission_dir" --schema "$SCHEMA_FILE" 2>&1); then
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
    echo "Expected schema validation to fail."
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
