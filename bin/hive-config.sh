#!/bin/bash
# hive-config.sh — Shared config reader for all hive scripts.
# Sources project-specific values from hive-project.yaml.
#
# Usage: source /usr/local/bin/hive-config.sh
#        (or source this file from the repo at bin/hive-config.sh)
#
# After sourcing, these variables are available:
#   PROJECT_NAME, PROJECT_ORG, PROJECT_PRIMARY_REPO, PROJECT_REPOS (space-sep),
#   PROJECT_AI_AUTHOR, PROJECT_WEBSITE, AGENTS_ENABLED (space-sep), BEADS_BASE,
#   AGENTS_WORKDIR, DASHBOARD_TITLE, DASHBOARD_PORT, HEALTH_CHECK_WORKFLOWS (JSON),
#   HEALTH_CI_WORKFLOW, HEALTH_DEPLOY_JOBS (JSON), HEALTH_PERF_WORKFLOWS (JSON),
#   HEALTH_BREW_TAP_REPO, HEALTH_BREW_FORMULA, HEALTH_HELM_CHART_PATH,
#   HEALTH_RELEASE_WORKFLOW, OUTREACH_ENABLED, OUTREACH_DESCRIPTION,
#   OUTREACH_TARGET_PLACEMENTS, OUTREACH_COVERAGE_BADGE_URL,
#   OUTREACH_GA4_PROPERTY_ID, OUTREACH_GA4_KEY_PATH,
#   GH_APP_ID, GH_APP_INSTALLATION_ID, GH_APP_KEY_FILE,
#   HIVE_GITHUB_TOKEN (auto-generated if GitHub App is configured), GH_TOKEN

HIVE_REPO_DIR="${HIVE_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd || echo /tmp/hive)}"
export HIVE_REPO_DIR

_HIVE_CONFIG="${HIVE_PROJECT_CONFIG:-/etc/hive/hive-project.yaml}"

_hive_yq() {
  if command -v yq &>/dev/null; then
    yq -r "$1" "$_HIVE_CONFIG" 2>/dev/null
  elif command -v python3 &>/dev/null; then
    python3 -c "
import yaml, sys, json
with open(sys.argv[1]) as f:
    d = yaml.safe_load(f)
# Navigate dotted path
path = sys.argv[2].lstrip('.')
parts = []
current = ''
for ch in path:
    if ch == '.' and not current.endswith('\\\\'):
        parts.append(current)
        current = ''
    elif ch == '[':
        if current:
            parts.append(current)
        current = ch
    elif ch == ']':
        current += ch
        parts.append(current)
        current = ''
    else:
        current += ch
if current:
    parts.append(current)
val = d
for p in parts:
    if p.startswith('[') and p.endswith(']'):
        val = val[int(p[1:-1])]
    elif isinstance(val, dict):
        val = val.get(p)
    else:
        val = None
    if val is None:
        break
if isinstance(val, (list, dict)):
    print(json.dumps(val))
elif val is None:
    print('null')
else:
    print(val)
" "$_HIVE_CONFIG" "$1" 2>/dev/null
  else
    echo ""
  fi
}

_hive_read() {
  local val
  val=$(_hive_yq "$1")
  if [[ "$val" == "null" || -z "$val" ]]; then
    echo "${2:-}"
  else
    echo "$val"
  fi
}

_hive_read_array() {
  local val
  val=$(_hive_yq "$1")
  if [[ "$val" == "null" || -z "$val" || "$val" == "[]" ]]; then
    echo "${2:-}"
  else
    if command -v python3 &>/dev/null; then
      python3 -c "import json,sys; print(' '.join(json.loads(sys.argv[1])))" "$val" 2>/dev/null || echo "${2:-}"
    else
      echo "$val" | tr -d '[]",' | xargs
    fi
  fi
}

if [[ -f "$_HIVE_CONFIG" ]]; then
  # Project
  PROJECT_NAME=$(_hive_read "project.name" "")
  PROJECT_ORG=$(_hive_read "project.org" "")
  PROJECT_PRIMARY_REPO=$(_hive_read "project.primary_repo" "")
  PROJECT_REPOS=$(_hive_read_array "project.repos" "")
  PROJECT_AI_AUTHOR=$(_hive_read "project.ai_author" "")
  PROJECT_WEBSITE=$(_hive_read "project.website" "")

  # Agents
  AGENTS_ENABLED=$(_hive_read_array "agents.enabled" "supervisor scanner reviewer")
  BEADS_BASE=$(_hive_read "agents.beads_base" "/home/dev")
  AGENTS_WORKDIR=$(_hive_read "agents.workdir" "")

  # Dashboard
  DASHBOARD_TITLE=$(_hive_read "dashboard.title" "")
  [[ -z "$DASHBOARD_TITLE" && -n "$PROJECT_NAME" ]] && DASHBOARD_TITLE="${PROJECT_NAME} Hive"
  DASHBOARD_PORT=$(_hive_read "dashboard.port" "3001")

  # Health checks — keep as JSON for scripts that iterate
  HEALTH_CHECK_WORKFLOWS=$(_hive_yq "health_checks.workflows")
  [[ "$HEALTH_CHECK_WORKFLOWS" == "null" ]] && HEALTH_CHECK_WORKFLOWS="[]"
  HEALTH_CI_WORKFLOW=$(_hive_read "health_checks.ci_workflow" "")
  HEALTH_DEPLOY_JOBS=$(_hive_yq "health_checks.deploy_jobs")
  [[ "$HEALTH_DEPLOY_JOBS" == "null" ]] && HEALTH_DEPLOY_JOBS="[]"
  HEALTH_PERF_WORKFLOWS=$(_hive_yq "health_checks.perf_workflows")
  [[ "$HEALTH_PERF_WORKFLOWS" == "null" ]] && HEALTH_PERF_WORKFLOWS="[]"
  HEALTH_BREW_TAP_REPO=$(_hive_read "health_checks.brew.tap_repo" "")
  HEALTH_BREW_FORMULA=$(_hive_read "health_checks.brew.formula" "")
  HEALTH_HELM_CHART_PATH=$(_hive_read "health_checks.helm.chart_path" "")
  HEALTH_RELEASE_WORKFLOW=$(_hive_read "health_checks.release_workflow" "")

  # GitHub App (optional — isolates agent API calls from user's personal rate limit)
  GH_APP_ID=$(_hive_read "github_app.app_id" "")
  GH_APP_INSTALLATION_ID=$(_hive_read "github_app.installation_id" "")
  GH_APP_KEY_FILE=$(_hive_read "github_app.private_key_file" "/etc/hive/gh-app-key.pem")
  export GH_APP_ID GH_APP_INSTALLATION_ID GH_APP_KEY_FILE
  if [[ -n "$GH_APP_ID" && -n "$GH_APP_INSTALLATION_ID" && -f "$GH_APP_KEY_FILE" ]]; then
    _app_token_script="${HIVE_BIN:-/usr/local/bin}/gh-app-token.sh"
    if [[ -x "$_app_token_script" ]]; then
      HIVE_GITHUB_TOKEN=$("$_app_token_script" 2>/dev/null || true)
      if [[ -n "$HIVE_GITHUB_TOKEN" ]]; then
        export HIVE_GITHUB_TOKEN
        export GH_TOKEN="$HIVE_GITHUB_TOKEN"
      fi
    fi
  fi

  # Outreach
  OUTREACH_ENABLED=$(_hive_read "outreach.enabled" "false")
  OUTREACH_DESCRIPTION=$(_hive_read "outreach.description" "")
  OUTREACH_TARGET_PLACEMENTS=$(_hive_read "outreach.target_placements" "0")
  OUTREACH_COVERAGE_BADGE_URL=$(_hive_read "outreach.coverage_badge_url" "")
  OUTREACH_GA4_PROPERTY_ID=$(_hive_read "outreach.ga4.property_id" "")
  OUTREACH_GA4_KEY_PATH=$(_hive_read "outreach.ga4.service_account_key" "")

  # Export all variables so python3/subprocess children can read them via os.environ
  export PROJECT_NAME PROJECT_ORG PROJECT_PRIMARY_REPO PROJECT_REPOS
  export PROJECT_AI_AUTHOR PROJECT_WEBSITE
  export AGENTS_ENABLED BEADS_BASE AGENTS_WORKDIR
  export DASHBOARD_TITLE DASHBOARD_PORT
  export HEALTH_CHECK_WORKFLOWS HEALTH_CI_WORKFLOW HEALTH_DEPLOY_JOBS HEALTH_PERF_WORKFLOWS
  export HEALTH_BREW_TAP_REPO HEALTH_BREW_FORMULA HEALTH_HELM_CHART_PATH HEALTH_RELEASE_WORKFLOW
  export OUTREACH_ENABLED OUTREACH_DESCRIPTION OUTREACH_TARGET_PLACEMENTS
  export OUTREACH_COVERAGE_BADGE_URL OUTREACH_GA4_PROPERTY_ID OUTREACH_GA4_KEY_PATH

  HIVE_CONFIG_LOADED=true
else
  HIVE_CONFIG_LOADED=false
fi

# ─── Shared utility functions ─────────────────────────────────────────────
# Available to all scripts that source hive-config.sh.

GOVERNOR_STATE_DIR="${GOVERNOR_STATE_DIR:-/var/run/kick-governor}"

# Unified logging — all scripts use the same timestamp format and output style.
# Scripts needing file output use: hive_log "msg" | tee -a "$LOG_FILE"
# or: hive_log_to "$LOG_FILE" "msg"
hive_log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
hive_log_to() { local f="$1"; shift; printf '[%s] %s\n' "$(date -Is)" "$*" >> "$f"; }

# Canonical pause state checks — single source of truth for all scripts.
# An agent is paused if EITHER file exists. Operator pause survives system resume.
hive_is_paused() {
  local agent="${1:?agent name required}"
  [[ -f "${GOVERNOR_STATE_DIR}/paused_${agent}" ]] || \
  [[ -f "${GOVERNOR_STATE_DIR}/operator_paused_${agent}" ]]
}
hive_is_operator_paused() {
  local agent="${1:?agent name required}"
  [[ -f "${GOVERNOR_STATE_DIR}/operator_paused_${agent}" ]]
}

# Send Enter key(s) to a tmux session — consistent count across all callers.
HIVE_ENTER_COUNT="${HIVE_ENTER_COUNT:-3}"
hive_send_enter() {
  local session="${1:?session name required}"
  local count="${2:-$HIVE_ENTER_COUNT}"
  local i=0
  while [ "$i" -lt "$count" ]; do
    tmux send-keys -t "$session" Enter 2>/dev/null || true
    i=$((i + 1))
  done
}
