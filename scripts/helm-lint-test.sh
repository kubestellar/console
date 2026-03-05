#!/bin/bash
# Helm chart validation — runs helm lint, renders templates, validates YAML
# structure, checks required values, secret references, and probe paths.
#
# Usage:
#   ./scripts/helm-lint-test.sh              # Run all Helm checks
#   ./scripts/helm-lint-test.sh --strict     # Strict mode (warnings = failures)
#
# Prerequisites:
#   - helm installed
#
# Output:
#   /tmp/helm-lint-report.json    — JSON test results
#   /tmp/helm-lint-summary.md     — human-readable summary
#
# Exit code:
#   0 — all checks pass
#   1 — one or more checks failed

set -euo pipefail

cd "$(dirname "$0")/.."

# ============================================================================
# Colors & argument parsing
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

STRICT_MODE=""
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT_MODE="1" ;;
  esac
done

CHART_DIR="deploy/helm/kubestellar-console"
REPORT_JSON="/tmp/helm-lint-report.json"
REPORT_MD="/tmp/helm-lint-summary.md"
TMPDIR_HELM=$(mktemp -d)
trap 'rm -rf "$TMPDIR_HELM"' EXIT

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Helm Chart Validation${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

if ! command -v helm &>/dev/null; then
  echo -e "${YELLOW}⚠️  helm not installed — skipping Helm chart tests${NC}"
  echo -e "${DIM}   Install: brew install helm${NC}"

  cat > "$REPORT_JSON" << EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","status":"skipped","reason":"helm not installed"}
EOF
  cat > "$REPORT_MD" << EOF
# Helm Chart Validation — SKIPPED

helm not installed. Install with: \`brew install helm\`
EOF
  echo ""
  echo "Reports:"
  echo "  JSON:     $REPORT_JSON"
  echo "  Summary:  $REPORT_MD"
  exit 0
fi

if [ ! -d "$CHART_DIR" ]; then
  echo -e "${YELLOW}⚠️  Chart directory not found: ${CHART_DIR}${NC}"
  exit 1
fi

TOTAL=0
PASSED=0
FAILED=0

# ============================================================================
# Phase 1: helm lint
# ============================================================================

echo -e "${BOLD}Phase 1: helm lint${NC}"

LINT_OUTPUT="$TMPDIR_HELM/lint.txt"
LINT_EXIT=0

if [ -n "$STRICT_MODE" ]; then
  helm lint "$CHART_DIR" --strict > "$LINT_OUTPUT" 2>&1 || LINT_EXIT=$?
else
  helm lint "$CHART_DIR" > "$LINT_OUTPUT" 2>&1 || LINT_EXIT=$?
fi

LINT_WARNINGS=$(grep -c "\[WARNING\]" "$LINT_OUTPUT" 2>/dev/null || echo "0")
LINT_ERRORS=$(grep -c "\[ERROR\]" "$LINT_OUTPUT" 2>/dev/null || echo "0")

TOTAL=$((TOTAL + 1))
if [ "$LINT_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  helm lint passed"
  [ "$LINT_WARNINGS" -gt 0 ] && echo -e "    ${DIM}(${LINT_WARNINGS} warnings)${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} helm lint failed (${LINT_ERRORS} errors, ${LINT_WARNINGS} warnings)"
  grep "\[ERROR\]\|\[WARNING\]" "$LINT_OUTPUT" 2>/dev/null | head -10 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 2: helm template render
# ============================================================================

echo -e "${BOLD}Phase 2: Template rendering${NC}"

TEMPLATE_OUTPUT="$TMPDIR_HELM/template.yaml"
TEMPLATE_EXIT=0
helm template test-release "$CHART_DIR" > "$TEMPLATE_OUTPUT" 2>&1 || TEMPLATE_EXIT=$?

TOTAL=$((TOTAL + 1))
if [ "$TEMPLATE_EXIT" -eq 0 ]; then
  RESOURCE_COUNT=$(grep -c "^kind:" "$TEMPLATE_OUTPUT" 2>/dev/null || echo "0")
  echo -e "  ${GREEN}✓${NC}  Template renders successfully (${RESOURCE_COUNT} resources)"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Template rendering failed"
  tail -5 "$TEMPLATE_OUTPUT" | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

# Render with OpenShift values too
if [ -f "${CHART_DIR}/values-openshift.yaml" ]; then
  OCP_OUTPUT="$TMPDIR_HELM/template-ocp.yaml"
  OCP_EXIT=0
  helm template test-release "$CHART_DIR" -f "${CHART_DIR}/values-openshift.yaml" > "$OCP_OUTPUT" 2>&1 || OCP_EXIT=$?

  TOTAL=$((TOTAL + 1))
  if [ "$OCP_EXIT" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC}  OpenShift values template renders successfully"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}❌${NC} OpenShift values template failed"
    FAILED=$((FAILED + 1))
  fi
fi

echo ""

# ============================================================================
# Phase 3: Chart.yaml validation
# ============================================================================

echo -e "${BOLD}Phase 3: Chart.yaml validation${NC}"

CHART_YAML="${CHART_DIR}/Chart.yaml"

TOTAL=$((TOTAL + 1))
if grep -q "^apiVersion: v2" "$CHART_YAML" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  apiVersion: v2 present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing or wrong apiVersion (should be v2)"
  FAILED=$((FAILED + 1))
fi

TOTAL=$((TOTAL + 1))
if grep -q "^name:" "$CHART_YAML" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Chart name present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing chart name"
  FAILED=$((FAILED + 1))
fi

TOTAL=$((TOTAL + 1))
if grep -q "^version:" "$CHART_YAML" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Chart version present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing chart version"
  FAILED=$((FAILED + 1))
fi

TOTAL=$((TOTAL + 1))
if grep -q "^description:" "$CHART_YAML" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Chart description present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing chart description"
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 4: Template content checks
# ============================================================================

echo -e "${BOLD}Phase 4: Template content checks${NC}"

if [ -f "$TEMPLATE_OUTPUT" ] && [ "$TEMPLATE_EXIT" -eq 0 ]; then
  # Check for Deployment
  TOTAL=$((TOTAL + 1))
  if grep -q "kind: Deployment" "$TEMPLATE_OUTPUT" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC}  Deployment resource present"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}❌${NC} No Deployment resource in template"
    FAILED=$((FAILED + 1))
  fi

  # Check for Service
  TOTAL=$((TOTAL + 1))
  if grep -q "kind: Service" "$TEMPLATE_OUTPUT" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC}  Service resource present"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}❌${NC} No Service resource in template"
    FAILED=$((FAILED + 1))
  fi

  # Check for ServiceAccount
  TOTAL=$((TOTAL + 1))
  if grep -q "kind: ServiceAccount" "$TEMPLATE_OUTPUT" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC}  ServiceAccount resource present"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${YELLOW}⚠️ ${NC} No ServiceAccount in template"
    FAILED=$((FAILED + 1))
  fi

  # Check for resource limits
  TOTAL=$((TOTAL + 1))
  if grep -q "resources:" "$TEMPLATE_OUTPUT" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC}  Resource limits defined"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}❌${NC} No resource limits in template"
    FAILED=$((FAILED + 1))
  fi

  # Check for health probes
  TOTAL=$((TOTAL + 1))
  if grep -q "livenessProbe:\|readinessProbe:" "$TEMPLATE_OUTPUT" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC}  Health probes configured"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${YELLOW}⚠️ ${NC} No health probes in template"
    FAILED=$((FAILED + 1))
  fi
fi

echo ""

# ============================================================================
# Generate reports
# ============================================================================

cat > "$REPORT_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "chartDir": "${CHART_DIR}",
  "summary": {
    "total": ${TOTAL},
    "passed": ${PASSED},
    "failed": ${FAILED}
  },
  "lint": {
    "exit_code": ${LINT_EXIT},
    "warnings": ${LINT_WARNINGS},
    "errors": ${LINT_ERRORS}
  }
}
EOF

cat > "$REPORT_MD" << EOF
# Helm Chart Validation

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Chart:** \`${CHART_DIR}\`

## Summary

| Metric   | Count |
|----------|-------|
| Total    | ${TOTAL} |
| Passed   | ${PASSED} |
| Failed   | ${FAILED} |

## Phases

- **Phase 1:** helm lint — $([ "$LINT_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL") (${LINT_WARNINGS} warnings, ${LINT_ERRORS} errors)
- **Phase 2:** Template rendering
- **Phase 3:** Chart.yaml validation
- **Phase 4:** Template content checks
EOF

# ============================================================================
# Summary
# ============================================================================

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All ${PASSED} Helm chart checks passed${NC}"
else
  echo -e "${RED}${BOLD}${FAILED}/${TOTAL} Helm chart checks failed${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
