#!/usr/bin/env bash
# KB Query Gap Tracker
# Identifies common user queries that return poor or no results from the knowledge base.
# Usage: ./scripts/kb-query-gap-tracker.sh [--output report.md]
set -euo pipefail

OUTPUT="${1:-kb-gap-report.md}"
KB_REPO="kubestellar/console-kb"
CONSOLE_REPO="kubestellar/console"

echo "# KB Query Gap Report" > "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# 1. Check mission coverage - which CNCF projects have install missions?
echo "## Mission Coverage" >> "$OUTPUT"
echo "" >> "$OUTPUT"

MISSIONS_COUNT=$(gh api "repos/$KB_REPO/contents/missions" --jq 'length' 2>/dev/null || echo "0")
echo "Total missions in console-kb: $MISSIONS_COUNT" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# 2. Check for common operation types
echo "## Operation Type Coverage" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| Operation | Missions Available |" >> "$OUTPUT"
echo "|-----------|-------------------|" >> "$OUTPUT"

for op in install upgrade rollback troubleshoot monitor backup restore; do
  count=$(gh api "repos/$KB_REPO/git/trees/main?recursive=1" --jq "[.tree[].path | select(test(\"$op\"))] | length" 2>/dev/null || echo "0")
  echo "| $op | $count |" >> "$OUTPUT"
done
echo "" >> "$OUTPUT"

# 3. Identify potential gaps
echo "## Potential Gaps" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Common Kubernetes operations without dedicated missions:" >> "$OUTPUT"
echo "" >> "$OUTPUT"

COMMON_OPS=("disaster-recovery" "certificate-rotation" "etcd-backup" "node-drain" "cluster-upgrade" "storage-migration" "network-policy" "rbac-audit")
for op in "${COMMON_OPS[@]}"; do
  exists=$(gh api "repos/$KB_REPO/git/trees/main?recursive=1" --jq "[.tree[].path | select(test(\"$op\"))] | length" 2>/dev/null || echo "0")
  if [ "$exists" = "0" ]; then
    echo "- ❌ $op — no mission found" >> "$OUTPUT"
  else
    echo "- ✅ $op — $exists file(s)" >> "$OUTPUT"
  fi
done

echo "" >> "$OUTPUT"
echo "## Recommendations" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "1. Prioritize creating missions for operations marked ❌ above" >> "$OUTPUT"
echo "2. Add troubleshooting guides for top-5 user-reported issues" >> "$OUTPUT"
echo "3. Validate all existing install missions against latest CNCF project versions" >> "$OUTPUT"

echo ""
echo "Report written to: $OUTPUT"
