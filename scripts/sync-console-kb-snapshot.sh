#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
TARGET_DIR="$REPO_ROOT/pkg/api/handlers/embedded_kb"
WORK_DIR="$REPO_ROOT/.snapshot-work/console-kb"
SOURCE_REF="master"
SOURCE_URL="https://github.com/kubestellar/console-kb.git"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

rm -rf "$WORK_DIR" "$TARGET_DIR/fixes"
mkdir -p "$(dirname "$WORK_DIR")" "$TARGET_DIR"

git clone --depth 1 --filter=blob:none --sparse --branch "$SOURCE_REF" "$SOURCE_URL" "$WORK_DIR" >/dev/null 2>&1
git -C "$WORK_DIR" sparse-checkout set fixes/cncf-install fixes/platform-install >/dev/null 2>&1

mkdir -p "$TARGET_DIR/fixes"
cp -R "$WORK_DIR/fixes/cncf-install" "$TARGET_DIR/fixes/"
cp -R "$WORK_DIR/fixes/platform-install" "$TARGET_DIR/fixes/"
git -C "$WORK_DIR" show "HEAD:fixes/index.json" > "$TARGET_DIR/fixes/index.json"
rm -rf "$WORK_DIR"

echo "Synced console-kb snapshot into $TARGET_DIR"
