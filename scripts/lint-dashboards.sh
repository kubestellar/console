#!/usr/bin/env bash
# Lints the repo's self-observability artifacts:
#   - deploy/grafana/*.json      Grafana dashboard(s) for the console's own
#                                 bounded Prometheus self-metrics.
#   - PrometheusRule template    Alerting rules over the same metrics,
#                                 rendered from the Helm chart.
#
# Checks performed:
#   1. Each dashboard JSON file is well-formed and has the minimum fields
#      Grafana expects (title, panels).
#   2. `promtool check rules` validates the rendered PrometheusRule for
#      syntactically/semantically valid PromQL and rule structure.
#   3. Every metric name referenced by a dashboard panel or alert rule is in
#      the bounded allow-list derived from pkg/api/metrics/metrics.go. This
#      guards against a dashboard or alert silently drifting to reference an
#      unbounded or not-yet-registered metric.
#
# Requires: jq, yq (mikefarah/yq), promtool, and helm — all preinstalled on
# GitHub-hosted ubuntu-latest runners except promtool, which
# dashboard-lint.yml installs from a pinned, checksummed release.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

METRICS_GO="pkg/api/metrics/metrics.go"
CHART_DIR="deploy/helm/kubestellar-console"
DASHBOARD_GLOB="deploy/grafana/*.json"

fail=0

echo "== Deriving bounded metric allow-list from ${METRICS_GO} =="
# Extract `Name: "console_..."` literals — the only metrics the backend
# actually registers (see pkg/api/metrics/metrics.go Init()).
mapfile -t base_metrics < <(grep -oP 'Name:\s*"\K[^"]+' "$METRICS_GO" | sort -u)
if [ "${#base_metrics[@]}" -eq 0 ]; then
  echo "::error::No metric names found in ${METRICS_GO} — refusing to lint against an empty allow-list"
  exit 1
fi

# Build the full allow-list including histogram/summary suffixes Prometheus
# generates automatically (_bucket, _sum, _count) so alerts/dashboards that
# query those derived series aren't flagged as unknown.
allow_list=()
for m in "${base_metrics[@]}"; do
  allow_list+=("$m" "${m}_bucket" "${m}_sum" "${m}_count")
done
printf ' - %s\n' "${base_metrics[@]}"

is_allowed() {
  local candidate="$1"
  for m in "${allow_list[@]}"; do
    [ "$candidate" = "$m" ] && return 0
  done
  return 1
}

# Scans a chunk of text for identifiers that look like our metrics
# (console_<word>) and flags any not in the allow-list.
check_metric_refs() {
  local source_label="$1"
  local text="$2"
  local found
  found=$(grep -oP 'console_[a-zA-Z0-9_]+' <<<"$text" | sort -u || true)
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    if ! is_allowed "$ref"; then
      echo "::error::${source_label} references unbounded/unknown metric '${ref}' (not in ${METRICS_GO} allow-list)"
      fail=1
    fi
  done <<<"$found"
}

echo
echo "== Validating dashboard JSON files =="
shopt -s nullglob
dashboards=($DASHBOARD_GLOB)
if [ "${#dashboards[@]}" -eq 0 ]; then
  echo "::error::No dashboard JSON files found matching ${DASHBOARD_GLOB}"
  exit 1
fi
for f in "${dashboards[@]}"; do
  echo "-- ${f}"
  if ! jq empty "$f" 2>/tmp/jq-err.txt; then
    echo "::error::${f} is not valid JSON: $(cat /tmp/jq-err.txt)"
    fail=1
    continue
  fi
  title=$(jq -r '.title // empty' "$f")
  panel_count=$(jq -r '.panels // [] | length' "$f")
  if [ -z "$title" ]; then
    echo "::error::${f} is missing a top-level 'title'"
    fail=1
  fi
  if [ "$panel_count" -eq 0 ]; then
    echo "::error::${f} has no panels"
    fail=1
  fi
  check_metric_refs "$f" "$(jq -r '[.panels[]?.targets[]?.expr // empty] | join("\n")' "$f")"
done

echo
echo "== Rendering and checking PrometheusRule via helm + promtool =="
RENDERED_DIR="$(mktemp -d)"
helm template kc "$CHART_DIR" \
  --namespace kc \
  --set metrics.serviceMonitor.enabled=true \
  --set metrics.prometheusRule.enabled=true \
  --show-only templates/prometheusrule.yaml \
  > "${RENDERED_DIR}/prometheusrule.yaml"

if [ ! -s "${RENDERED_DIR}/prometheusrule.yaml" ]; then
  echo "::error::helm template produced an empty PrometheusRule — check metrics.prometheusRule.enabled wiring"
  fail=1
else
  echo "-- rendered PrometheusRule --"
  cat "${RENDERED_DIR}/prometheusrule.yaml"
  # promtool expects the plain Prometheus rule-file shape (groups: [...]),
  # not the PrometheusRule CR wrapper, so strip the CR metadata and take
  # only .spec as the rule file body.
  yq eval '.spec' "${RENDERED_DIR}/prometheusrule.yaml" > "${RENDERED_DIR}/rules.yaml"
  if ! promtool check rules "${RENDERED_DIR}/rules.yaml"; then
    echo "::error::promtool check rules failed for the rendered PrometheusRule"
    fail=1
  fi
  # Scan the whole rendered file text for metric references — simpler than
  # extracting each `expr` field individually, and safe here because the
  # only place a "console_..." token can appear is inside a PromQL expr.
  check_metric_refs "PrometheusRule" "$(cat "${RENDERED_DIR}/prometheusrule.yaml")"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "Dashboard/alert lint FAILED"
  exit 1
fi
echo "Dashboard/alert lint OK"
