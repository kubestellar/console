#!/bin/bash
# kick-agents.sh — fires work orders at the scanner, reviewer, architect, and outreach tmux sessions.
# Called by systemd timers (or manually). Does NOT require Claude to be running
# as a supervisor — it speaks directly to the named tmux sessions.
#
# Usage:
#   kick-agents.sh scanner    # kick scanner only
#   kick-agents.sh reviewer   # kick reviewer only
#   kick-agents.sh architect  # kick architect only
#   kick-agents.sh outreach   # kick outreach only
#   kick-agents.sh all        # kick all four (default)
#
# Systemd timer fires this every 15 min for scanner, every 30 min for reviewer,
# every 2 hours for architect and outreach.

set -euo pipefail

# Source centralized backend/model config
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKENDS_CONF="${SCRIPT_DIR}/../config/backends.conf"
if [[ -f "$BACKENDS_CONF" ]]; then
  # shellcheck source=../config/backends.conf
  source "$BACKENDS_CONF"
elif [[ -f /usr/local/etc/hive/backends.conf ]]; then
  source /usr/local/etc/hive/backends.conf
fi

# Source project config for org/repo/author values
if [[ -f "${SCRIPT_DIR}/hive-config.sh" ]]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/hive-config.sh"
elif [[ -f /usr/local/bin/hive-config.sh ]]; then
  # shellcheck disable=SC1091
  source /usr/local/bin/hive-config.sh
fi

TARGET="${1:-all}"
TMUX_BIN="${TMUX_BIN:-tmux}"
LOG="/var/log/kick-agents.log"
TIMESTAMP="$(TZ=America/New_York date '+%Y-%m-%d %I:%M:%S %p %Z')"
ET_NOW="$(TZ=America/New_York date '+%I:%M %p ET')"
NTFY_TOPIC="${NTFY_TOPIC:-hive}"
NTFY_SERVER="${NTFY_SERVER:-https://ntfy.sh}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK:-}"
NOTIFY_LIB="${NOTIFY_LIB:-/usr/local/bin/notify.sh}"
[ -f "$NOTIFY_LIB" ] && . "$NOTIFY_LIB"

# Backend state directory — tracks which backend each agent is currently using.
# On rate limit, the agent switches to its fallback backend.
BACKEND_STATE_DIR="/var/run/agent-backends"
mkdir -p "$BACKEND_STATE_DIR" 2>/dev/null || true

# Policy hash directory — stores md5 hashes of each agent's CLAUDE.md (and skill files)
# to skip redundant re-reads when policy is unchanged between kicks.
POLICY_HASH_DIR="/var/run/hive-metrics"
mkdir -p "$POLICY_HASH_DIR" 2>/dev/null || true
# Auto-detect agents directory from repo examples/ structure
AGENTS_DIR=$(find "${SCRIPT_DIR}/.." -path '*/examples/*/agents' -type d 2>/dev/null | head -1)
AGENTS_DIR="${AGENTS_DIR:-${SCRIPT_DIR}/../agents}"

GOVERNOR_FLAG_DIR="/var/run/kick-governor"

_is_agent_paused() {
  [[ -f "$GOVERNOR_FLAG_DIR/paused_${1}" ]] || [[ -f "$GOVERNOR_FLAG_DIR/operator_paused_${1}" ]]
}

# Agent handoff state — captures last N lines of work context when switching backends
HANDOFF_DIR="/tmp/agent-handoff"
mkdir -p "$HANDOFF_DIR" 2>/dev/null || true

log() { echo "[$TIMESTAMP] $*" | tee -a "$LOG"; }
ntfy() { notify "$1" "$2"; }  # legacy shim — use notify() directly for new code

# ── Backend management ──────────────────────────────────────────────
# Each agent has a primary and fallback backend. State is tracked in
# /var/run/agent-backends/<agent> (contains "claude" or "copilot").

# Default backend assignments per agent
declare -A AGENT_PRIMARY_BACKEND=(
  [scanner]=copilot
  [reviewer]=claude
  [architect]=claude
  [outreach]=claude
)
declare -A AGENT_FALLBACK_BACKEND=(
  [scanner]=claude
  [reviewer]=copilot
  [architect]=copilot
  [outreach]=copilot
)
# Model to use per backend — Copilot uses dots, Claude uses hyphens
declare -A BACKEND_MODEL=(
  [copilot]=claude-opus-4-6
  [claude]=claude-sonnet-4-5
)
# Scanner runs Opus on both backends
declare -A AGENT_MODEL_OVERRIDE=(
  [scanner-copilot]=claude-opus-4-6
  [scanner-claude]=claude-opus-4-6
)
declare -A MODEL_SWITCHED=()

get_current_backend() {
  local agent="$1"
  if [ -f "$BACKEND_STATE_DIR/$agent" ]; then
    cat "$BACKEND_STATE_DIR/$agent"
  else
    echo "${AGENT_PRIMARY_BACKEND[$agent]:-claude}"
  fi
}

set_current_backend() {
  local agent="$1" backend="$2"
  echo "$backend" > "$BACKEND_STATE_DIR/$agent"
}

get_model_for() {
  local agent="$1" backend="$2"
  local override_key="${agent}-${backend}"
  if [ -n "${AGENT_MODEL_OVERRIDE[$override_key]+x}" ]; then
    echo "${AGENT_MODEL_OVERRIDE[$override_key]}"
  else
    echo "${BACKEND_MODEL[$backend]}"
  fi
}

capture_handoff_state() {
  local session="$1" agent="$2"
  local handoff_file="$HANDOFF_DIR/${agent}-handoff.md"
  local pane_text
  pane_text=$($TMUX_BIN capture-pane -t "$session" -p -S -200 2>/dev/null || true)
  if [ -n "$pane_text" ]; then
    cat > "$handoff_file" <<HANDOFF_EOF
# Agent Handoff — $agent
# Captured at: $(date -Is)
# Reason: Backend switch due to rate limit

## Last 200 lines of session output:
\`\`\`
$pane_text
\`\`\`

## Instructions
Continue where the previous session left off. Read your CLAUDE.md for standing instructions.
HANDOFF_EOF
    log "HANDOFF $agent — saved context to $handoff_file"
  fi
}

switch_backend() {
  local session="$1" agent="$2"
  local current_backend fallback_backend model

  current_backend=$(get_current_backend "$agent")
  fallback_backend="${AGENT_FALLBACK_BACKEND[$agent]:-claude}"

  if [ "$current_backend" = "$fallback_backend" ]; then
    fallback_backend="${AGENT_PRIMARY_BACKEND[$agent]:-claude}"
  fi

  model=$(get_model_for "$agent" "$fallback_backend")

  log "SWITCH $agent: $current_backend → $fallback_backend (model: $model)"
  ntfy "$agent — switching backend" "Rate limited on $current_backend. Switching to $fallback_backend ($model)"

  capture_handoff_state "$session" "$agent"

  # Write governor model file so supervisor.sh picks up the new backend on relaunch
  cat > "$GOVERNOR_FLAG_DIR/model_${agent}" <<MODELEOF
BACKEND=$fallback_backend
MODEL=$model
COST_WEIGHT=0
REASON=rate_limit_switch
UPDATED=$(date -Iseconds)
MODELEOF

  # 4x Esc + /exit with 4x Enter (split text and Enter per tmux_send_enter rule)
  $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
  sleep 1
  $TMUX_BIN send-keys -t "$session" -l "/exit" 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true

  set_current_backend "$agent" "$fallback_backend"

  local SWITCH_STARTUP_WAIT=90
  local SWITCH_POLL=3
  local sw_waited=0
  log "SWITCH $agent — waiting up to ${SWITCH_STARTUP_WAIT}s for $fallback_backend CLI to start"
  while (( sw_waited < SWITCH_STARTUP_WAIT )); do
    if session_cli_ready "$session"; then
      log "SWITCH $agent — $fallback_backend CLI ready after ${sw_waited}s"
      break
    fi
    sleep "$SWITCH_POLL"
    (( sw_waited += SWITCH_POLL ))
  done
  if (( sw_waited >= SWITCH_STARTUP_WAIT )); then
    log "SWITCH $agent — $fallback_backend CLI did not start within ${SWITCH_STARTUP_WAIT}s"
  fi
}

session_exists() {
  $TMUX_BIN has-session -t "$1" 2>/dev/null
}

session_idle() {
  local pane_text
  pane_text=$($TMUX_BIN capture-pane -t "$1" -p 2>/dev/null || true)
  # Check for idle prompt — ignore "Cancelling" in scrollback since it can
  # be caused by stale queued text (which we clear before kicking)
  echo "$pane_text" | grep -q "❯"
}

flush_pending_input() {
  # Detect text stuck in the input line (sent without -l or missing Enter).
  # If the last ❯ line has trailing text, the agent has unsent input — send Enter.
  local session="$1"
  local pane_text
  pane_text=$($TMUX_BIN capture-pane -t "$session" -p 2>/dev/null || true)
  local prompt_line
  prompt_line=$(echo "$pane_text" | grep "❯" | tail -1)
  if [ -n "$prompt_line" ]; then
    local after_prompt
    after_prompt=$(echo "$prompt_line" | sed 's/.*❯[[:space:]]*//')
    if [ -n "$after_prompt" ] && [ ${#after_prompt} -gt 2 ]; then
      log "FLUSH $session — found unsent input (${#after_prompt} chars), sending Enter"
      $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
      sleep 2
      return 0
    fi
  fi
  return 1
}

record_restart() {
  local session="$1"
  local restart_file="${GOVERNOR_FLAG_DIR}/restarts_${session}"
  echo "$(date +%s)" >> "$restart_file"
  # Prune entries older than 24h
  local cutoff=$(( $(date +%s) - 86400 ))
  if [ -f "$restart_file" ]; then
    awk -v c="$cutoff" '$1 >= c' "$restart_file" > "${restart_file}.tmp" && mv "${restart_file}.tmp" "$restart_file"
  fi
}

restart_stuck_agent() {
  # Kill the stuck CLI process and relaunch it in the same tmux pane.
  # Used when the input buffer is completely full and won't accept any keys.
  local session="$1" agent="$2"
  record_restart "$session"
  local pane_pid
  pane_pid=$($TMUX_BIN display-message -t "$session" -p '#{pane_pid}' 2>/dev/null || true)
  if [ -n "$pane_pid" ]; then
    log "RESTART $session — killing pane process tree (pid $pane_pid)"
    kill -9 "$pane_pid" 2>/dev/null || true
    sleep 2
  fi
  # Reset status file so governor doesn't immediately re-flag as stale
  local status_file="$HOME/.hive/${agent}_status.txt"
  cat > "$status_file" <<STATUSEOF
AGENT=$agent
STATUS=INITIALIZING
TASK=Restarting after stuck detection
PROGRESS=Process killed, supervisor relaunching
RESULTS=
UPDATED=$(date -u +%Y-%m-%dT%H:%M:%S+00:00)
STATUSEOF
  # supervisor.sh detects the killed process and relaunches automatically
  # (reading the governor model file for the correct backend:model).
  # Just wait for it to come back.
  log "RESTART $session — killed, waiting for supervisor.sh to relaunch"
  local RESTART_WAIT=90
  local waited=0
  while (( waited < RESTART_WAIT )); do
    if session_cli_ready "$session"; then
      log "RESTART $session — CLI ready after ${waited}s"
      return 0
    fi
    sleep 3
    (( waited += 3 ))
  done
  log "RESTART $session — CLI did not start within ${RESTART_WAIT}s"
  return 1
}

session_cli_ready() {
  # Returns 0 if the CLI has fully started (not just shell prompt visible).
  # After a model switch, the old scrollback still has ❯ from the previous
  # session, so session_idle returns true before the new CLI loads. This
  # function checks for actual CLI startup markers AND the idle prompt.
  local pane_text
  pane_text=$($TMUX_BIN capture-pane -t "$1" -p 2>/dev/null || true)
  # Must have BOTH: a CLI startup banner AND the idle prompt
  if echo "$pane_text" | grep -qE "Environment loaded|Describe a task|custom instructions"; then
    if echo "$pane_text" | grep -q "❯"; then
      return 0
    fi
  fi
  return 1
}

next_run() {
  # Compute next run time in ET for a given agent
  case "$1" in
    scanner)  systemctl show kick-scanner.timer  --property=NextElapseUSecRealtime --value 2>/dev/null | xargs -I{} date -d "{}" '+%I:%M %p ET' 2>/dev/null || echo "unknown" ;;
    reviewer) systemctl show kick-reviewer.timer  --property=NextElapseUSecRealtime --value 2>/dev/null | xargs -I{} date -d "{}" '+%I:%M %p ET' 2>/dev/null || echo "unknown" ;;
    architect) systemctl show kick-architect.timer --property=NextElapseUSecRealtime --value 2>/dev/null | xargs -I{} date -d "{}" '+%I:%M %p ET' 2>/dev/null || echo "unknown" ;;
    outreach) systemctl show kick-outreach.timer --property=NextElapseUSecRealtime --value 2>/dev/null | xargs -I{} date -d "{}" '+%I:%M %p ET' 2>/dev/null || echo "unknown" ;;
  esac
}

check_rate_limit() {
  # After a kick, wait and check if the session hit a CLAUDE/COPILOT CLI rate limit.
  # If so, parse the reset time and schedule a re-kick.
  # Error format: "You're out of extra usage · resets 3am (UTC)"
  #           or: "resets 12:30pm (UTC)"
  #
  # IMPORTANT DISTINCTION — two kinds of rate limits exist:
  #   1. Claude/Copilot CLI usage limits (handled HERE) — the AI backend is exhausted.
  #      Patterns: "You're out of extra usage", "out of extra usage", "resets Xam/pm".
  #      Action: switch backend, schedule re-kick after reset.
  #   2. GitHub API rate limits (handled by gh-rate-check.sh) — the gh CLI hit GitHub's
  #      REST/GraphQL throttle. Patterns: "API rate limit exceeded", "secondary rate limit",
  #      "403.*rate", "Resource not accessible".
  #      Action: do NOT restart — agent should wait/retry/use cache. See GH_RATE_LIMIT_INSTRUCTIONS.
  #
  # The grep patterns below match ONLY category 1 (CLI limits).
  # Category 2 is detected separately by /tmp/hive/bin/gh-rate-check.sh.
  local session="$1"
  local agent="$2"
  local delay_secs="${3:-30}"

  (
    sleep "$delay_secs"
    local pane_text
    pane_text=$($TMUX_BIN capture-pane -t "$session" -p 2>/dev/null || true)

    # Match Claude/Copilot CLI exhaustion messages ONLY.
    # These patterns are specific to AI backend usage limits and will NOT match
    # GitHub API rate limit messages ("API rate limit exceeded", "secondary rate limit", etc.).
    # GitHub API limits are handled by gh-rate-check.sh and should not trigger a backend switch.
    local limit_line
    limit_line=$(echo "$pane_text" | grep -iE "you('re| are) out of|out of extra usage|extra usage.*resets|resets [0-9]+(:[0-9]+)?[aApP][mM]" | tail -1 || true)

    if [ -z "$limit_line" ]; then
      return 0
    fi

    log "RATE-LIMITED $session — $limit_line"

    # Extract reset time — matches patterns like "resets 3am", "resets 12:30pm", "resets 3am (UTC)"
    local reset_time
    reset_time=$(echo "$limit_line" | grep -oP 'resets\s+\K[0-9]{1,2}(:[0-9]{2})?\s*[aApP][mM]' || true)

    if [ -z "$reset_time" ]; then
      ntfy "$agent — rate limited" "Hit rate limit but could not parse reset time. Manual re-kick needed."
      log "RATE-LIMITED $session — could not parse reset time from: $limit_line"
      return 0
    fi

    # Convert reset time (UTC) to epoch seconds
    # Normalize: "3am" -> "3:00 AM", "12:30pm" -> "12:30 PM"
    local normalized
    normalized=$(echo "$reset_time" | sed -E 's/([aApP])([mM])/\U\1\U\2/; s/([0-9])([AP])/\1 \2/')
    # If no colon, add :00
    if ! echo "$normalized" | grep -q ":"; then
      normalized=$(echo "$normalized" | sed -E 's/([0-9]+)/\1:00/')
    fi

    local reset_epoch
    reset_epoch=$(TZ=UTC date -d "today $normalized" +%s 2>/dev/null || true)

    # If the parsed time is in the past, it means tomorrow
    local now_epoch
    now_epoch=$(date +%s)
    if [ -n "$reset_epoch" ] && [ "$reset_epoch" -le "$now_epoch" ]; then
      reset_epoch=$(TZ=UTC date -d "tomorrow $normalized" +%s 2>/dev/null || true)
    fi

    if [ -z "$reset_epoch" ]; then
      ntfy "$agent — rate limited" "Hit rate limit, resets at $reset_time UTC. Could not schedule re-kick."
      log "RATE-LIMITED $session — could not compute epoch for: $reset_time"
      return 0
    fi

    # Schedule re-kick 60 seconds after reset
    local rekick_epoch=$((reset_epoch + 60))
    local wait_secs=$((rekick_epoch - now_epoch))
    local reset_et
    reset_et=$(TZ=America/New_York date -d "@$reset_epoch" '+%I:%M %p ET' 2>/dev/null || echo "$reset_time UTC")

    log "RATE-LIMITED $session — resets $reset_time UTC ($reset_et), wait ${wait_secs}s"

    # Strategy: switch to fallback backend immediately, AND schedule a
    # re-kick on the original backend after the rate limit resets.
    switch_backend "$session" "$agent"

    # After the new backend starts, kick it with the agent's work order
    sleep 15
    /usr/local/bin/kick-agents.sh "$agent"

    # Also schedule a switch back to the primary backend after rate limit resets
    sleep "$wait_secs"
    local current_after_switch
    current_after_switch=$(get_current_backend "$agent")
    local primary="${AGENT_PRIMARY_BACKEND[$agent]:-claude}"
    if [ "$current_after_switch" != "$primary" ]; then
      log "RATE-LIMIT RESET $agent — switching back to primary ($primary)"
      switch_backend "$session" "$agent"
      sleep 15
      /usr/local/bin/kick-agents.sh "$agent"
    fi
  ) &
}

render_policy() {
  # Substitute template variables in a policy file before sending to agents.
  # This allows policy templates to reference project-specific values from
  # hive-project.yaml / hive-config.sh without hardcoding them.
  local policy_file="$1"
  sed \
    -e "s|\${PROJECT_ORG}|${PROJECT_ORG}|g" \
    -e "s|\${PROJECT_PRIMARY_REPO}|${PROJECT_PRIMARY_REPO}|g" \
    -e "s|\${PROJECT_AI_AUTHOR}|${PROJECT_AI_AUTHOR}|g" \
    -e "s|\${PROJECT_REPOS_LIST}|${PROJECT_REPOS}|g" \
    -e "s|\${GA4_PROPERTY_ID}|${OUTREACH_GA4_PROPERTY_ID}|g" \
    -e "s|\${HIVE_REPO}|${PROJECT_HIVE_REPO:-kubestellar/hive}|g" \
    -e "s|\${AGENTS_WORKDIR}|${AGENTS_WORKDIR}|g" \
    -e "s|\${BEADS_BASE}|${BEADS_BASE}|g" \
    "$policy_file"
}

policy_changed() {
  # Returns 0 (true) if the agent's policy (CLAUDE.md + skill files) has changed
  # since the last kick, 1 (false) if unchanged. Hash is stored in
  # $POLICY_HASH_DIR/policy_hash_<agent> so it persists across kicks.
  #
  # Hash is computed on the RENDERED output (after template variable substitution)
  # so that config changes (e.g. PROJECT_ORG) trigger re-kicks even if the
  # raw policy file is unchanged.
  local agent="$1"
  local policy_file="${AGENTS_DIR}/${agent}-CLAUDE.md"
  local hash_file="${POLICY_HASH_DIR}/policy_hash_${agent}"

  if [[ ! -f "$policy_file" ]]; then
    return 0  # No policy file — treat as changed to force read
  fi

  # Hash RENDERED CLAUDE.md plus any skill files in <agent>-skills/ directory
  local skills_dir="${AGENTS_DIR}/${agent}-skills"
  local current_hash
  if [[ -d "$skills_dir" ]]; then
    # Sort skill files for deterministic ordering; render all through template substitution
    current_hash=$({ render_policy "$policy_file"; for f in $(find "$skills_dir" -type f | sort); do render_policy "$f"; done; } 2>/dev/null | md5sum | cut -d' ' -f1)
  else
    current_hash=$(render_policy "$policy_file" 2>/dev/null | md5sum | cut -d' ' -f1)
  fi

  if [[ -f "$hash_file" ]] && [[ "$(cat "$hash_file" 2>/dev/null)" == "$current_hash" ]]; then
    return 1  # Unchanged
  fi

  # Store the new hash for next comparison
  echo "$current_hash" > "$hash_file"
  return 0  # Changed (or first run)
}

send_chunked() {
  # Send a long message in small text chunks to avoid CLI input buffer overflow.
  # Each chunk is sent as text only (no Enter) with a sleep between to let the
  # tmux paste buffer flush.  One final Enter submits the complete message.
  local session="$1"
  local message="$2"
  local MAX_CHUNK=400
  local CHUNK_DELAY=1

  if [ ${#message} -le "$MAX_CHUNK" ]; then
    $TMUX_BIN send-keys -t "$session" -l "$message"
    sleep "$CHUNK_DELAY"
    hive_send_enter "$session"
    return
  fi

  local offset=0
  local total=${#message}
  while [ "$offset" -lt "$total" ]; do
    local chunk="${message:$offset:$MAX_CHUNK}"
    $TMUX_BIN send-keys -t "$session" -l "$chunk"
    (( offset += MAX_CHUNK ))
    sleep "$CHUNK_DELAY"
  done
  hive_send_enter "$session"
}

kick() {
  local session="$1"
  local message="$2"
  local agent="$3"

  # Respect pause state — if agent is paused, skip the kick entirely
  if _is_agent_paused "$agent"; then
    log "SKIP $session — agent is paused"
    return
  fi

  # After model switch, poll for the session to reappear before checking existence.
  # apply_model_if_changed() sends /exit + agent-launch.sh, which kills the old
  # session and starts a new one. Without polling, session_exists fails because
  # the new CLI hasn't created its tmux session yet.
  if [[ "${MODEL_SWITCHED[$agent]:-}" == "1" ]]; then
    local MODEL_SWITCH_STARTUP_WAIT=90
    local POLL_INTERVAL=3
    local waited=0
    log "MODEL SWITCH $agent — waiting up to ${MODEL_SWITCH_STARTUP_WAIT}s for CLI to fully start"
    while (( waited < MODEL_SWITCH_STARTUP_WAIT )); do
      if session_exists "$session" && session_cli_ready "$session"; then
        log "MODEL SWITCH $agent — CLI ready after ${waited}s"
        break
      fi
      sleep "$POLL_INTERVAL"
      (( waited += POLL_INTERVAL ))
    done
    if (( waited >= MODEL_SWITCH_STARTUP_WAIT )); then
      log "MODEL SWITCH $agent — CLI did not start within ${MODEL_SWITCH_STARTUP_WAIT}s, kicking anyway"
    fi
    MODEL_SWITCHED[$agent]=0
  fi

  if ! session_exists "$session"; then
    log "SKIP $session — session not found"
    ntfy "$agent — not found" "Session $session does not exist. Next try: $(next_run "$agent")"
    return
  fi

  if ! session_idle "$session"; then
    # Check if session is stuck on a Claude/Copilot CLI rate limit (NOT GitHub API rate limit).
    local pane_text
    pane_text=$($TMUX_BIN capture-pane -t "$session" -p 2>/dev/null || true)
    if echo "$pane_text" | grep -qiE "you('re| are) out of|out of extra usage|extra usage.*resets"; then
      log "RATE-LIMITED $session — switching backend (CLI usage exhausted)"
      switch_backend "$session" "$agent"
      sleep 15
      /usr/local/bin/kick-agents.sh "$agent"
      return
    fi

    # Force-clear prolonged cancellation: if agent has been in Cancelling state
    # with stale queued input for >5 min, send Escape + C-c + C-u to break out
    if echo "$pane_text" | grep -qE "Cancelling"; then
      local _queued_text
      _queued_text=$(echo "$pane_text" | grep "❯" | tail -1 | sed 's/.*❯[[:space:]]*//')
      if [ -n "$_queued_text" ] && [ ${#_queued_text} -gt 10 ]; then
        local CANCEL_STUCK_THRESHOLD=300
        local _last_kick_file="$STATE_DIR/last_kick_${agent}"
        if [ -f "$_last_kick_file" ]; then
          local _last_kick_epoch _now_epoch _elapsed
          _last_kick_epoch=$(cat "$_last_kick_file")
          _now_epoch=$(date +%s)
          _elapsed=$(( _now_epoch - _last_kick_epoch ))
          if [ "$_elapsed" -ge "$CANCEL_STUCK_THRESHOLD" ]; then
            log "FORCE-CLEAR $session — stuck in Cancelling for ${_elapsed}s with ${#_queued_text} chars queued"
            $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
            sleep 2
            $TMUX_BIN send-keys -t "$session" C-c 2>/dev/null || true
            sleep 2
            $TMUX_BIN send-keys -t "$session" C-u 2>/dev/null || true
            sleep 2
            # Now the agent should be idle — proceed to kick below
            log "FORCE-CLEAR $session — input cleared, proceeding to kick"
          else
            log "SKIP $session — cancelling (${_elapsed}s < ${CANCEL_STUCK_THRESHOLD}s threshold)"
            return
          fi
        else
          log "SKIP $session — cancelling (no last_kick timestamp)"
          return
        fi
      else
        log "SKIP $session — cancelling (no stale input)"
        return
      fi
    else
      log "SKIP $session — already working"
      ntfy "$agent — busy" "Still working, skipped kick at $ET_NOW. Next: $(next_run "$agent")"
      return
    fi
  fi

  # Check if governor flagged this agent for restart (buffer completely stuck)
  local _restart_flag="$GOVERNOR_FLAG_DIR/needs_restart_${agent}"
  if [ -f "$_restart_flag" ]; then
    log "RESTART $session — governor flagged buffer stuck, killing CLI"
    rm -f "$_restart_flag"
    restart_stuck_agent "$session" "$agent"
    # After restart, fall through to kick below
  fi

  # Clear any stale input before sending new kick
  local _stale_text
  _stale_text=$($TMUX_BIN capture-pane -t "$session" -p 2>/dev/null | grep "❯" | tail -1 | sed 's/.*❯[[:space:]]*//')
  if [ -n "$_stale_text" ] && [ ${#_stale_text} -gt 2 ]; then
    log "CLEAR $session — removing ${#_stale_text} chars of stale input"
    $TMUX_BIN send-keys -t "$session" C-c 2>/dev/null || true
    sleep 1
    $TMUX_BIN send-keys -t "$session" C-u 2>/dev/null || true
    sleep 1
  fi

  # Reset conversation context so agent reads kick message fresh.
  # With 40-50 restarts/day the accumulated context is mostly stale
  # rationalization; the kick message already contains all deterministic data.
  log "CLEAR-CONTEXT $session — sending /clear before kick"
  $TMUX_BIN send-keys -t "$session" -l "/clear" 2>/dev/null || true
  sleep 1
  $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
  local CLEAR_WAIT=15
  local _cw=0
  while [ "$_cw" -lt "$CLEAR_WAIT" ]; do
    sleep 1
    _cw=$(( _cw + 1 ))
    if session_idle "$session"; then
      break
    fi
  done
  if ! session_idle "$session"; then
    log "WARN $session — /clear did not return to prompt within ${CLEAR_WAIT}s, proceeding anyway"
  fi

  log "KICK $session (${#message} chars)"
  send_chunked "$session" "$message"
  # Deterministic status heartbeat — refresh timestamp on every kick
  cat > "$HOME/.hive/${agent}_status.txt" <<STATUSEOF
AGENT=$agent
STATUS=WORKING
TASK=Processing kick
PROGRESS=Kick delivered, agent working
RESULTS=
UPDATED=$(date -u +%Y-%m-%dT%H:%M:%S+00:00)
STATUSEOF
  # Verify Enter was delivered — retry then restart if buffer is stuck
  sleep 3
  local _vline _vtext
  _vline=$($TMUX_BIN capture-pane -t "$session" -p 2>/dev/null | grep "❯" | tail -1)
  _vtext=$(echo "$_vline" | sed 's/.*❯[[:space:]]*//')
  if [ -n "$_vtext" ] && [ ${#_vtext} -gt 2 ]; then
    log "RETRY $session — Enter not delivered (${#_vtext} chars stuck), retrying"
    $TMUX_BIN send-keys -t "$session" Enter
    sleep 3
    _vline=$($TMUX_BIN capture-pane -t "$session" -p 2>/dev/null | grep "❯" | tail -1)
    _vtext=$(echo "$_vline" | sed 's/.*❯[[:space:]]*//')
    if [ -n "$_vtext" ] && [ ${#_vtext} -gt 2 ]; then
      log "STUCK $session — buffer overflow, killing and relaunching CLI"
      ntfy "$agent — restarting" "Input buffer stuck (${#_vtext} chars). Killing CLI process."
      restart_stuck_agent "$session" "$agent"
      # Re-kick after restart
      sleep 5
      send_chunked "$session" "$message"
      sleep 3
    fi
  fi
  ntfy "$agent started" "Kicked at $ET_NOW. Next: $(next_run "$agent")"

  # Background check for rate limit after kick settles
  check_rate_limit "$session" "$agent" 60
}

# ── Compact kick messages ──────────────────────────────────────────
# All standing instructions (pull, beads, rate limits, hold rules, speed rules,
# lane boundaries) are in each agent's CLAUDE.md. Kicks only carry the trigger
# + any live dynamic data (e.g. current RED indicators).
#
# Policy hash compression: if CLAUDE.md (and skill files) are unchanged since
# the last kick, we tell the agent to skip re-reading to save tokens.

# --- Sync repo files to deployed locations ---
# Scripts source hive-config.sh from $SCRIPT_DIR and /usr/local/bin/.
# Pipeline reads hive-project.yaml from /etc/hive/.
# Both must stay in sync with the repo after git pull.
_REPO_PROJECT_YAML=$(find /tmp/hive/examples -name 'hive-project.yaml' -type f 2>/dev/null | head -1)
if [ -n "$_REPO_PROJECT_YAML" ] && [ -f "$_REPO_PROJECT_YAML" ]; then
  sudo cp "$_REPO_PROJECT_YAML" /etc/hive/hive-project.yaml 2>/dev/null || true
fi
if [ -f "/tmp/hive/bin/hive-config.sh" ]; then
  sudo cp /tmp/hive/bin/hive-config.sh /usr/local/bin/hive-config.sh 2>/dev/null || true
  source /usr/local/bin/hive-config.sh 2>/dev/null || true
fi
if [ -f "/tmp/hive/bin/gh-zombie-reaper.sh" ]; then
  sudo cp /tmp/hive/bin/gh-zombie-reaper.sh /usr/local/bin/gh-zombie-reaper.sh 2>/dev/null || true
  sudo chmod +x /usr/local/bin/gh-zombie-reaper.sh 2>/dev/null || true
fi
for _unit in /tmp/hive/systemd/*.service /tmp/hive/systemd/*.timer; do
  [ -f "$_unit" ] && sudo cp "$_unit" /etc/systemd/system/ 2>/dev/null || true
done

# --- Pre-kick pipeline: enumerators → classifiers → gates → monitors ---
# Runs all stages declared in hive-project.yaml → pipeline.stages in dependency order.
# Each stage writes its output to /var/run/hive-metrics/*.json.
# Agents receive pre-computed data in their kick messages — never query GitHub directly.
/tmp/hive/bin/run-pipeline.sh 2>/dev/null || log "WARN: run-pipeline.sh failed (non-fatal, falling back to direct calls)"
# Always refresh the enumerator and merge gate — the pipeline may have 0 stages
# configured, and a stale actionable.json causes agents to miss new issues.
/tmp/hive/bin/enumerate-actionable.sh 2>/dev/null || log "WARN: enumerate-actionable.sh failed (non-fatal)"
/tmp/hive/bin/merge-gate.sh 2>/dev/null || log "WARN: merge-gate.sh failed (non-fatal)"
/tmp/hive/bin/copilot-comment-checker.sh 2>/dev/null || log "WARN: copilot-comment-checker.sh failed (non-fatal)"

# Build inline work list for scanner kick message (agents must NOT list issues/PRs themselves)
_ENUM_FILE="/var/run/hive-metrics/actionable.json"
_MERGE_FILE="/var/run/hive-metrics/merge-eligible.json"
_WORK_LIST=""
if [ -f "$_ENUM_FILE" ]; then
  _ENUM_ISSUES=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('issues',{}).get('count',0))" "$_ENUM_FILE" 2>/dev/null || echo 0)
  _ENUM_PRS=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('prs',{}).get('count',0))" "$_ENUM_FILE" 2>/dev/null || echo 0)
  _ENUM_SLA=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('issues',{}).get('sla_violations',0))" "$_ENUM_FILE" 2>/dev/null || echo 0)
  _ISSUES_INLINE=$(python3 -c "
import json,sys
d = json.load(open(sys.argv[1]))
items = sorted(d.get('issues',{}).get('items',[]), key=lambda x: x.get('age_minutes',0), reverse=True)
# Only show scanner-lane issues (classifier pre-assigns lanes)
scanner_items = [i for i in items if i.get('lane', 'scanner') == 'scanner']
for i in scanner_items[:20]:
    tier = i.get('complexity_tier', '?')[0]
    model = i.get('model_recommendation', 'sonnet')
    tracker = ' [TRACKER]' if i.get('is_tracker') else ''
    print(f\"  {i['age_minutes']}m {i['repo']}#{i['number']} [{tier}/{model}] [{','.join(i.get('labels',[]))}] {i['title'][:60]}{tracker}\")
" "$_ENUM_FILE" 2>/dev/null || echo "  (none)")
  # Build cluster summary for scanner
  _CLUSTERS_INLINE=$(python3 -c "
import json,sys
d = json.load(open(sys.argv[1]))
clusters = d.get('clusters', [])
for c in clusters[:10]:
    nums = ', '.join(f\"#{i['number']}\" for i in c['issues'])
    print(f\"  BUNDLE [{c['key']}]: {nums} ({c['count']} issues)\")
" "$_ENUM_FILE" 2>/dev/null || echo "")
  _PRS_INLINE=$(python3 -c "
import json,sys
d = json.load(open(sys.argv[1]))
for p in d.get('prs',{}).get('items',[]):
    print(f\"  {p['repo']}#{p['number']} by @{p.get('author','')} {p['title'][:70]}\")
" "$_ENUM_FILE" 2>/dev/null || echo "  (none)")
  _WORK_LIST="ACTIONABLE ISSUES (${_ENUM_ISSUES}, oldest first):
${_ISSUES_INLINE}
ACTIONABLE PRs (${_ENUM_PRS}):
${_PRS_INLINE}"
  [ "$_ENUM_SLA" -gt 0 ] 2>/dev/null && _WORK_LIST="${_WORK_LIST}
⚠️ ${_ENUM_SLA} SLA VIOLATIONS (>30 min)"
fi
_MERGE_INLINE=""
if [ -f "$_MERGE_FILE" ]; then
  _MERGE_COUNT=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('count',0))" "$_MERGE_FILE" 2>/dev/null || echo 0)
  if [ "$_MERGE_COUNT" -gt 0 ] 2>/dev/null; then
    _MERGE_LIST=$(python3 -c "
import json,sys
d = json.load(open(sys.argv[1]))
for p in d.get('merge_eligible',[]):
    print(f\"  {p['repo']}#{p['number']} {p['title'][:70]}\")
" "$_MERGE_FILE" 2>/dev/null || echo "  (none)")
    _MERGE_INLINE="
MERGE-READY PRs (${_MERGE_COUNT}):
${_MERGE_LIST}"
  fi
fi

if policy_changed "scanner"; then
  _SCANNER_POLICY_INSTR="Read your CLAUDE.md."
else
  _SCANNER_POLICY_INSTR="Policy unchanged since last kick — skip CLAUDE.md re-read, continue with standing instructions."
fi
_GH_AUTH_INSTR="⚙ GH AUTH: ALWAYS prefix gh commands with: GH_TOKEN=\$(cat /var/run/hive-metrics/gh-app-token.cache) gh ... — this uses the GitHub App token (15k/hr). NEVER use a PAT or hardcode tokens. NEVER set GH_TOKEN from env vars or hosts.yml. The App token file is refreshed automatically."

_CLUSTER_SECTION=""
if [ -n "$_CLUSTERS_INLINE" ]; then
  _CLUSTER_SECTION="
CLUSTERS (bundle into 1 agent each):
${_CLUSTERS_INLINE}"
fi
SCANNER_MSG="[agent:scanner] [KICK] git pull /tmp/hive. ${_SCANNER_POLICY_INSTR}
${_GH_AUTH_INSTR}
YOUR WORK LIST (pre-filtered — hold/ADOPTERS/drafts excluded, classified):
${_WORK_LIST}${_CLUSTER_SECTION}${_MERGE_INLINE}
⛔ NEVER run gh issue list, gh pr list, gh search issues, or gh search prs — the work list above is your ONLY source. You may use gh issue view, gh pr view, gh pr merge, gh pr create on individual items.
⛔ NEVER post @copilot or @claude comments on issues. NEVER use gh issue comment to dispatch work. NEVER assign copilot-swe-agent[bot]. Posting @copilot comments does nothing and wastes cycles.
⛔ MERGE DISCIPLINE: You may ONLY merge PRs listed in the MERGE-READY section above. If no MERGE-READY section exists, merge NOTHING. NEVER merge a PR you created in this session — it must pass CI first and appear in a future kick's MERGE-READY list. Before merging, run 'gh pr checks <number> --repo <repo>' and verify every line shows 'pass' (ignore 'tide'). If ANY check is 'fail' or 'pending', do NOT merge — wait for the next kick.
WORKFLOW: Dispatch a sub-agent for each issue (use the Agent tool). Each agent does: 1) git worktree add /tmp/fix-NNNN -b fix/NNNN from the repo checkout, 2) cd into worktree, read the issue with gh issue view, make the fix, 3) git add + git commit -s, 4) git push origin fix/NNNN, 5) gh pr create --body 'Fixes #NNNN'. Dispatch 4-6 agents IN PARALLEL — do not work issues one-at-a-time. Use the model_recommendation for each issue (S=haiku, M=sonnet, C=opus). Bundle clustered issues into 1 agent per cluster. Skip issues with lane!=scanner. Do NOT stand by — if issues exist, work them. NEVER run vitest, npm test, npm run build, tsc, or any test/build locally. Beads: ~/scanner-beads"

# Build live health preamble for reviewer — tells it exactly what's red RIGHT NOW
_rh_json=$(/tmp/hive/dashboard/health-check.sh 2>/dev/null || echo '{}')
_rh_reds=""
_rh_ci=$(echo "$_rh_json" | jq -r '.ci // 0' 2>/dev/null || echo 0)
[ "$_rh_ci" -lt 100 ] && _rh_reds="${_rh_reds} CI=${_rh_ci}%"
for _rk in nightly nightlyCompliance nightlyDashboard nightlyPlaywright hourly weekly nightlyRel weeklyRel; do
  _rv=$(echo "$_rh_json" | jq -r ".${_rk} // -1" 2>/dev/null || echo -1)
  [ "$_rv" = "0" ] && _rh_reds="${_rh_reds} ${_rk}=RED"
done
# Read deploy job names from HEALTH_DEPLOY_JOBS config (JSON array)
_deploy_job_names=$(python3 -c "
import json,sys
jobs = json.loads(sys.argv[1])
for j in jobs:
    name = j.get('name', '') if isinstance(j, dict) else j
    if name: print(name)
" "${HEALTH_DEPLOY_JOBS:-[]}" 2>/dev/null || true)
for _dk in $_deploy_job_names; do
  _dv=$(echo "$_rh_json" | jq -r ".${_dk} // -1" 2>/dev/null || echo -1)
  [ "$_dv" = "0" ] && _rh_reds="${_rh_reds} deploy:${_dk}=RED"
done
_rh_cvg=$(curl -sf "${OUTREACH_COVERAGE_BADGE_URL:-${BADGE_URL:-}}" 2>/dev/null | jq -r '.message // "0"' | tr -d '%' || echo 0)
[ "${_rh_cvg:-0}" -lt 91 ] && _rh_reds="${_rh_reds} coverage=${_rh_cvg}%<91%"
if [ -n "$_rh_reds" ]; then
  _HEALTH_PREAMBLE="URGENT — RED INDICATORS:${_rh_reds}. Fix these first. "
else
  _HEALTH_PREAMBLE=""
fi
if policy_changed "reviewer"; then
  _REVIEWER_POLICY_INSTR="Read your CLAUDE.md."
else
  _REVIEWER_POLICY_INSTR="Policy unchanged since last kick — skip CLAUDE.md re-read, continue with standing instructions."
fi
# Build reviewer pipeline data preamble
_COPILOT_FILE="/var/run/hive-metrics/copilot-comments.json"
_GA4_FILE="/var/run/hive-metrics/ga4-anomalies.json"
_COPILOT_PREAMBLE=""
_GA4_PREAMBLE=""
if [ -f "$_COPILOT_FILE" ]; then
  _COPILOT_COUNT=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('total_unaddressed',0))" "$_COPILOT_FILE" 2>/dev/null || echo 0)
  if [ "$_COPILOT_COUNT" -gt 0 ] 2>/dev/null; then
    _COPILOT_DETAILS=$(python3 -c "
import json,sys
d = json.load(open(sys.argv[1]))
for c in d.get('comments', [])[:10]:
    sev = c.get('severity','?').upper()
    print(f\"  [{sev}] {c['repo']}#{c['pr_number']} {c.get('file','')}:{c.get('line','')} — {c['body'][:80]}\")
" "$_COPILOT_FILE" 2>/dev/null || echo "  (details unavailable)")
    _COPILOT_PREAMBLE="
COPILOT COMMENTS (${_COPILOT_COUNT} unaddressed — pre-fetched):
${_COPILOT_DETAILS}"
  fi
fi
if [ -f "$_GA4_FILE" ]; then
  _GA4_SUMMARY=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('summary',''))" "$_GA4_FILE" 2>/dev/null || echo "")
  if [ -n "$_GA4_SUMMARY" ]; then
    _GA4_PREAMBLE="
GA4: ${_GA4_SUMMARY}"
  fi
fi
REVIEWER_MSG="[agent:reviewer] [KICK] ${_HEALTH_PREAMBLE}git pull /tmp/hive. ${_REVIEWER_POLICY_INSTR}${_GA4_PREAMBLE}${_COPILOT_PREAMBLE}
${_GH_AUTH_INSTR}
Fix REDs (NOT Playwright — file issues only, scanner owns Playwright fixes), merge green PRs. Copilot comments and GA4 data above are pre-computed — do NOT re-query. Read /var/run/hive-metrics/copilot-comments.json and /var/run/hive-metrics/ga4-anomalies.json for full details. Beads: ~/reviewer-beads"

if policy_changed "architect"; then
  _ARCHITECT_POLICY_INSTR="Read your CLAUDE.md."
else
  _ARCHITECT_POLICY_INSTR="Policy unchanged since last kick — skip CLAUDE.md re-read, continue with standing instructions."
fi
ARCHITECT_MSG="[agent:architect] [KICK] git pull /tmp/hive. ${_ARCHITECT_POLICY_INSTR}
${_GH_AUTH_INSTR}
Full architect pass — refactor/perf scan. Beads: ~/architect-beads"

if policy_changed "outreach"; then
  _OUTREACH_POLICY_INSTR="Read your CLAUDE.md."
else
  _OUTREACH_POLICY_INSTR="Policy unchanged since last kick — skip CLAUDE.md re-read, continue with standing instructions."
fi
# Build outreach pipeline data preamble
_OUTREACH_FILE="/var/run/hive-metrics/outreach-prs.json"
_OUTREACH_PREAMBLE=""
if [ -f "$_OUTREACH_FILE" ]; then
  _OUTREACH_PREAMBLE=$(python3 -c "
import json,sys
d = json.load(open(sys.argv[1]))
c = d.get('counts', {})
violations = d.get('one_pr_per_org_violations', {})
lines = []
lines.append(f\"OUTREACH STATUS: {c.get('open_total',0)} open ({c.get('open_adopters',0)} adopters), {c.get('merged_total',0)} merged, {c.get('unique_orgs_merged',0)}/{c.get('target_placements',0)} placements ({c.get('progress_pct',0)}%)\")
if violations:
    lines.append(f'⚠ ONE-PR-PER-ORG VIOLATIONS: {\", \".join(violations.keys())}')
blocked = d.get('blocked_orgs', [])
if blocked:
    lines.append(f'Blocked orgs (have open PR): {\", \".join(blocked[:20])}')
print('\n'.join(lines))
" "$_OUTREACH_FILE" 2>/dev/null || echo "")
fi
_OUTREACH_SECTION=""
[ -n "$_OUTREACH_PREAMBLE" ] && _OUTREACH_SECTION="
${_OUTREACH_PREAMBLE}"
OUTREACH_MSG="[agent:outreach] [KICK] git pull /tmp/hive. ${_OUTREACH_POLICY_INSTR}${_OUTREACH_SECTION}
${_GH_AUTH_INSTR}
Full outreach pass. PR counts above are pre-computed — do NOT re-query with gh search. Read /var/run/hive-metrics/outreach-prs.json for full details. Check blocked_orgs before opening new PRs. Beads: ~/outreach-beads"

# ── Governor model integration ──────────────────────────────────────
# Reads /var/run/kick-governor/model_<agent> written by the governor's
# optimize_model_assignment(). Uses in-CLI /model command when possible
# to avoid disrupting agent work. Only restarts when the backend binary
# itself changes (e.g., claude → copilot).
GOVERNOR_STATE_DIR="/var/run/kick-governor"

detect_running_model() {
  # Detect the actual model running in a tmux session from its process cmdline.
  # Returns "backend:model" or empty string if undetectable.
  local session="$1"
  local pane_pid cmd_line
  pane_pid=$($TMUX_BIN display-message -t "$session" -p '#{pane_pid}' 2>/dev/null || true)
  [ -z "$pane_pid" ] && return

  # Walk child processes to find the CLI binary
  local child_pids
  child_pids=$(pgrep -P "$pane_pid" 2>/dev/null || true)
  for cpid in $pane_pid $child_pids; do
    cmd_line=$(ps -p "$cpid" -o args= 2>/dev/null || true)
    [ -z "$cmd_line" ] && continue

    local detected_backend="" detected_model=""
    case "$cmd_line" in
      *copilot*) detected_backend="copilot" ;;
      *claude*)  detected_backend="claude" ;;
      *gemini*)  detected_backend="gemini" ;;
      *)         continue ;;
    esac

    detected_model=$(echo "$cmd_line" | grep -oE '\-\-model[= ]+[a-zA-Z0-9._-]+' | sed 's/--model[= ]*//' || true)
    if [ -n "$detected_backend" ] && [ -n "$detected_model" ]; then
      echo "${detected_backend}:${detected_model}"
      return
    fi
  done
}

apply_model_if_changed() {
  local agent="$1" session="$2"

  # Skip model changes for paused agents
  if _is_agent_paused "$agent"; then
    return 0
  fi

  # Respect manual CLI pin -- operator used hive switch or dashboard dropdown
  local pin_file
  case "$agent" in
    scanner) pin_file="/etc/hive/scanner.env" ;;
    *) pin_file="/etc/hive/${agent}.env" ;;
  esac
  # Pin checks: AGENT_CLI_PINNED=both, AGENT_PIN_CLI=backend only, AGENT_PIN_MODEL=model only
  local pin_both pin_cli pin_model
  pin_both=$(grep -q "^AGENT_CLI_PINNED=true" "$pin_file" 2>/dev/null && echo 1 || echo 0)
  pin_cli=$(grep -q "^AGENT_PIN_CLI=true" "$pin_file" 2>/dev/null && echo 1 || echo 0)
  pin_model=$(grep -q "^AGENT_PIN_MODEL=true" "$pin_file" 2>/dev/null && echo 1 || echo 0)

  if [[ "$pin_both" == "1" ]]; then
    return 0
  fi

  local model_file="$GOVERNOR_STATE_DIR/model_${agent}"
  [[ ! -f "$model_file" ]] && return 0

  local gov_backend gov_model
  gov_backend=$(grep '^BACKEND=' "$model_file" 2>/dev/null | cut -d= -f2)
  gov_model=$(grep '^MODEL=' "$model_file" 2>/dev/null | cut -d= -f2)
  [[ -z "$gov_backend" || -z "$gov_model" ]] && return 0

  # Detect the actual running model from the process, not from our state files.
  local cur_backend cur_model
  local detected
  detected=$(detect_running_model "$session")
  if [[ -n "$detected" ]]; then
    cur_backend="${detected%%:*}"
    cur_model="${detected#*:}"
  else
    cur_backend=$(get_current_backend "$agent")
    cur_model=$(get_model_for "$agent" "$cur_backend")
  fi

  # Enforce granular pins — override governor's requested value with current
  if [[ "$pin_cli" == "1" && "$gov_backend" != "$cur_backend" ]]; then
    log "PIN_CLI $agent: backend pinned to $cur_backend, ignoring governor request for $gov_backend"
    gov_backend="$cur_backend"
  fi
  if [[ "$pin_model" == "1" ]]; then
    if ! models_equal "$gov_model" "$cur_model"; then
      log "PIN_MODEL $agent: model pinned to $cur_model, ignoring governor request for $gov_model"
      gov_model="$cur_model"
    fi
  fi

  if [[ "$cur_backend" == "$gov_backend" ]] && models_equal "$cur_model" "$gov_model"; then
    return 0
  fi

  if ! session_exists "$session"; then
    set_current_backend "$agent" "$gov_backend"
    BACKEND_MODEL[$gov_backend]="$gov_model"
    AGENT_MODEL_OVERRIDE["${agent}-${gov_backend}"]="$gov_model"
    return 0
  fi

  # Never interrupt a working agent — defer all model changes until idle
  if ! session_idle "$session"; then
    log "MODEL DEFER $agent: ${cur_backend}:${cur_model} → ${gov_backend}:${gov_model} — agent busy, will apply when idle"
    return 0
  fi

  # Same backend, different model — use in-place /model command (no restart needed)
  if [[ "$cur_backend" == "$gov_backend" ]]; then
    local cli_model
    cli_model=$(normalize_model_for_backend "$gov_backend" "$gov_model")
    log "MODEL IN-PLACE $agent: ${cur_model} → ${cli_model} (same backend, using /model command)"
    $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
    sleep 0.3
    $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
    sleep 0.3
    $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
    sleep 0.3
    $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
    sleep 0.5
    $TMUX_BIN send-keys -t "$session" -l "/model ${cli_model}" 2>/dev/null || true
    sleep 0.3
    $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
    sleep 0.3
    $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
    sleep 0.3
    $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
    sleep 2

    BACKEND_MODEL[$gov_backend]="$gov_model"
    AGENT_MODEL_OVERRIDE["${agent}-${gov_backend}"]="$gov_model"
    log "MODEL IN-PLACE $agent — sent /model ${cli_model}, no restart needed"
    return 0
  fi

  # Different backend — full restart required
  log "MODEL SWITCH $agent: ${cur_backend}:${cur_model} → ${gov_backend}:${gov_model} (backend change, restarting)"
  record_restart "$session"

  capture_handoff_state "$session" "$agent"

  # 4x Esc clears autocomplete, menus, and pending input reliably on both
  # claude and copilot CLIs. Then /exit with 4x Enter (split per tmux_send_enter rule).
  $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Escape 2>/dev/null || true
  sleep 1
  $TMUX_BIN send-keys -t "$session" -l "/exit" 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true
  sleep 0.3
  $TMUX_BIN send-keys -t "$session" Enter 2>/dev/null || true

  set_current_backend "$agent" "$gov_backend"
  BACKEND_MODEL[$gov_backend]="$gov_model"
  AGENT_MODEL_OVERRIDE["${agent}-${gov_backend}"]="$gov_model"

  log "MODEL SWITCH $agent — sent /exit, supervisor.sh will relaunch with ${gov_backend}:${gov_model}"
  MODEL_SWITCHED[$agent]=1
  # Return 1 so the && chain skips the kick — the session is dying/restarting
  return 1
}

_now_et=$(TZ=America/New_York date '+%Y-%m-%d %I:%M %p %Z')
if policy_changed "supervisor"; then
  _SUPERVISOR_POLICY_INSTR="Read your CLAUDE.md."
else
  _SUPERVISOR_POLICY_INSTR="Policy unchanged since last kick — skip CLAUDE.md re-read, continue with standing instructions."
fi
SUPERVISOR_MSG="[agent:supervisor] [KICK] MONITORING PASS ${_now_et}. ${_SUPERVISOR_POLICY_INSTR}
${_GH_AUTH_INSTR}
Check all agent panes, merge green PRs, unstick idle agents. Beads: ~/supervisor-beads"

case "$TARGET" in
  scanner)
    apply_model_if_changed "scanner" "scanner" && kick "scanner" "$SCANNER_MSG" "scanner"
    ;;
  reviewer)
    apply_model_if_changed "reviewer" "reviewer" && kick "reviewer" "$REVIEWER_MSG" "reviewer"
    ;;
  architect)
    apply_model_if_changed "architect" "architect" && kick "architect" "$ARCHITECT_MSG" "architect"
    ;;
  outreach)
    apply_model_if_changed "outreach" "outreach" && kick "outreach" "$OUTREACH_MSG" "outreach"
    ;;
  supervisor)
    apply_model_if_changed "supervisor" "supervisor" && kick "supervisor" "$SUPERVISOR_MSG" "supervisor"
    ;;
  all)
    apply_model_if_changed "scanner" "scanner" && kick "scanner" "$SCANNER_MSG" "scanner"
    apply_model_if_changed "reviewer" "reviewer" && kick "reviewer" "$REVIEWER_MSG" "reviewer"
    apply_model_if_changed "architect" "architect" && kick "architect" "$ARCHITECT_MSG" "architect"
    apply_model_if_changed "outreach" "outreach" && kick "outreach" "$OUTREACH_MSG" "outreach"
    # supervisor is NOT kicked in "all" — it has its own cadence via governor
    ;;
  *)
    echo "Usage: $0 [scanner|reviewer|architect|outreach|supervisor|all]" >&2
    exit 1
    ;;
esac

bd dolt push 2>&1 | tee -a "$LOG" || log "WARN: bd dolt push failed (non-fatal)"

# Merge all agent JSONL exports into central ledger for dashboard/supervisor visibility
CENTRAL_ISSUES="/tmp/hive/.beads/issues.jsonl"
CENTRAL_INTERACTIONS="/tmp/hive/.beads/interactions.jsonl"
{
  for _agent in ${AGENTS_ENABLED:-supervisor scanner reviewer architect outreach}; do
    agent_dir="${BEADS_BASE:-/home/dev}/${_agent}-beads"
    [ -f "$agent_dir/.beads/issues.jsonl" ] && cat "$agent_dir/.beads/issues.jsonl"
  done
} > "${CENTRAL_ISSUES}.tmp" 2>/dev/null && mv "${CENTRAL_ISSUES}.tmp" "$CENTRAL_ISSUES" || true
{
  for _agent in ${AGENTS_ENABLED:-supervisor scanner reviewer architect outreach}; do
    agent_dir="${BEADS_BASE:-/home/dev}/${_agent}-beads"
    [ -f "$agent_dir/.beads/interactions.jsonl" ] && cat "$agent_dir/.beads/interactions.jsonl"
  done
} > "${CENTRAL_INTERACTIONS}.tmp" 2>/dev/null && mv "${CENTRAL_INTERACTIONS}.tmp" "$CENTRAL_INTERACTIONS" || true
log "Central ledger synced ($(wc -l < "$CENTRAL_ISSUES" 2>/dev/null || echo 0) issues)"

# Scan agent panes for GitHub API rate limit messages
/tmp/hive/bin/gh-rate-check.sh 2>/dev/null || log "WARN: gh-rate-check.sh failed (non-fatal)"

log "DONE"
