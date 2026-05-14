#!/usr/bin/env bash
# Build dashboard snapshots (light + classic) and push to the docs repo.
# Creates a PR and merges with --admin to satisfy branch protection.
#
# Produces:
#   public/live/hive/index.html        — default (light mode)
#   public/live/hive/light/index.html   — light mode
#   public/live/hive/classic/index.html — classic mode
#
# Usage: ./publish-snapshot.sh
# Env vars:
#   HIVE_DASHBOARD_URL  — dashboard URL (default: http://localhost:3001)
#   DOCS_REPO_DIR       — local clone of kubestellar/docs (default: /tmp/kubestellar-docs-snapshot)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_URL="${HIVE_DASHBOARD_URL:-http://localhost:3001}"
DOCS_REPO="${DOCS_REPO_DIR:-/tmp/kubestellar-docs-snapshot}"
DOCS_REPO_SLUG="kubestellar/docs"

GH_APP_TOKEN_FILE="/var/run/hive-metrics/gh-app-token.cache"
if [ -f "$GH_APP_TOKEN_FILE" ]; then
  GH_APP_TOKEN=$(cat "$GH_APP_TOKEN_FILE")
  export GH_TOKEN="$GH_APP_TOKEN"
else
  echo "ERROR: no GitHub App token at $GH_APP_TOKEN_FILE"
  exit 1
fi

DOCS_REMOTE="https://github.com/${DOCS_REPO_SLUG}.git"

# Configure git credential helper to supply token without embedding in URL
_setup_git_auth() {
  git -C "$1" config credential.helper \
    '!f() { echo "username=x-access-token"; echo "password='"$GH_APP_TOKEN"'"; }; f'
}

# Ensure docs repo clone exists
if [ ! -d "$DOCS_REPO/.git" ]; then
  git -c "credential.helper=!f() { echo username=x-access-token; echo password=${GH_APP_TOKEN}; }; f" \
    clone --depth 1 --single-branch -b main "$DOCS_REMOTE" "$DOCS_REPO"
fi

cd "$DOCS_REPO"
_setup_git_auth "$DOCS_REPO"
git remote set-url origin "$DOCS_REMOTE"
git fetch origin main
git checkout main 2>/dev/null || git checkout -b main origin/main
git reset --hard origin/main

# Build all three snapshots from the same API data
mkdir -p public/live/hive/light public/live/hive/classic

node "${SCRIPT_DIR}/build-snapshot.mjs" --mode light "$DASHBOARD_URL" public/live/hive/light/index.html
node "${SCRIPT_DIR}/build-snapshot.mjs" --mode classic "$DASHBOARD_URL" public/live/hive/classic/index.html
cp public/live/hive/light/index.html public/live/hive/index.html

# Check if anything changed
if git diff --quiet -- public/live/hive/; then
  echo "No changes to snapshot — skipping."
  exit 0
fi

TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')
SNAPSHOT_BRANCH="chore/hive-snapshot-$(date -u '+%Y%m%d-%H%M%S')"

git checkout -b "$SNAPSHOT_BRANCH"
git add public/live/hive/
git commit -s -m "chore: update hive dashboard snapshot $TIMESTAMP"
git push origin "$SNAPSHOT_BRANCH"

PR_URL=$(gh pr create \
  --repo "$DOCS_REPO_SLUG" \
  --title "chore: hive dashboard snapshot $TIMESTAMP" \
  --body "Automated snapshot update from hive server." \
  --head "$SNAPSHOT_BRANCH" \
  --base main 2>&1)

PR_NUM=$(echo "$PR_URL" | grep -o '[0-9]*$')
echo "Created PR #${PR_NUM}: ${PR_URL}"

if gh pr merge "$PR_NUM" --repo "$DOCS_REPO_SLUG" --admin --squash --delete-branch 2>/dev/null; then
  echo "Snapshot published via PR #${PR_NUM} (admin merge)."
else
  echo "Admin merge unavailable — enabling auto-merge on PR #${PR_NUM}."
  gh pr merge "$PR_NUM" --repo "$DOCS_REPO_SLUG" --squash --auto --delete-branch
  echo "Auto-merge enabled on PR #${PR_NUM} — will merge when checks pass."
fi

# Reset back to main for next run
git checkout main
git reset --hard origin/main
