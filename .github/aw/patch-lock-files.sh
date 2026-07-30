#!/usr/bin/env bash
# Post-compile patch for gh-aw lock files
#
# Run this after `gh aw compile` to apply required fixes that the
# gh-aw framework doesn't yet support natively.
#
# Usage: .github/aw/patch-lock-files.sh
#
# What it fixes:
# 1. Adds GraphQL-Features header for Copilot coding agent assignment
#    (required by GitHub API since Dec 2025)
# 2. Expands fallback trigger to catch "Bot does not have access" errors
#
# See: https://github.blog/changelog/2025-12-03-assign-issues-to-copilot-using-the-api/

set -euo pipefail

LOCK_FILE=".github/workflows/implement-fix.lock.yml"

if [ ! -f "$LOCK_FILE" ]; then
  echo "ERROR: $LOCK_FILE not found. Run from repo root."
  exit 1
fi

echo "Patching $LOCK_FILE for Copilot agent assignment..."

# 1. Add GraphQL-Features header to the primary replaceActorsForAssignable mutation
#    The github.graphql() call passes headers as part of the variables object
sed -i.bak 's/actorIds: actorIds,$/actorIds: actorIds,\n                headers: { '\''GraphQL-Features'\'': '\''issues_copilot_assignment_api_support'\'' },/' "$LOCK_FILE"

# 2. Add GraphQL-Features header to the fallback addAssigneesToAssignable mutation
sed -i.bak 's/assigneeIds: \[agentId\],$/assigneeIds: [agentId],\n                    headers: { '\''GraphQL-Features'\'': '\''issues_copilot_assignment_api_support'\'' },/' "$LOCK_FILE"

# 3. Add GraphQL-Features header to findAgent suggestedActors query
sed -i.bak 's/const response = await github\.graphql(query, { owner, repo });/const response = await github.graphql(query, { owner, repo, headers: { '\''GraphQL-Features'\'': '\''issues_copilot_assignment_api_support'\'' } });/' "$LOCK_FILE"

# 4. Expand fallback trigger to include "Bot does not have access" error
sed -i.bak 's/errorMessage\.includes("Insufficient permissions to assign"))/errorMessage.includes("Insufficient permissions to assign") || errorMessage.includes("Bot does not have access"))/' "$LOCK_FILE"

# Clean up backup files
rm -f "${LOCK_FILE}.bak"

echo "Patch applied successfully."
echo ""
echo "Verify with: git diff $LOCK_FILE"
