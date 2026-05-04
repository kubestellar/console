#!/bin/bash
# Unified supervisor — keeps a tmux session alive with an AI CLI agent inside.
# Uses the gastown pattern: prompt is passed as a CLI argument, not via
# tmux send-keys, eliminating the startup race condition.
#
# Supports optional rate-limit failover between CLI backends (set
# AGENT_RATE_LIMIT_FAILOVER=true and AGENT_FAILOVER_CMD in env).
set -euo pipefail

# Source shared config (provides hive_log, hive_is_paused, etc.)
_SUP_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
for _cf in "${_SUP_SCRIPT_DIR}/hive-config.sh" /usr/local/bin/hive-config.sh; do
  if [[ -f "$_cf" ]]; then source "$_cf"; break; fi
done

# Source centralized backend/model config
_SUP_BACKENDS_CONF="${_SUP_SCRIPT_DIR}/../config/backends.conf"
if [[ -f "$_SUP_BACKENDS_CONF" ]]; then
  # shellcheck source=../config/backends.conf
  source "$_SUP_BACKENDS_CONF"
elif [[ -f /usr/local/etc/hive/backends.conf ]]; then
  source /usr/local/etc/hive/backends.conf
fi

NTFY_SERVER="${NTFY_SERVER:-https://ntfy.sh}"

: "${AGENT_SESSION_NAME:?AGENT_SESSION_NAME is required}"
: "${AGENT_WORKDIR:?AGENT_WORKDIR is required}"
: "${AGENT_LOOP_PROMPT:?AGENT_LOOP_PROMPT is required}"
: "${AGENT_LAUNCH_CMD:?AGENT_LAUNCH_CMD is required}"

SESSION="$AGENT_SESSION_NAME"
WORKDIR="$AGENT_WORKDIR"
POLL_SEC="${AGENT_POLL_SEC:-10}"
CLI="${AGENT_CLI:-claude}"
AUTO_APPROVE_PHRASE="${AGENT_AUTO_APPROVE_PHRASE:-}"
AUTO_DISMISS_PHRASES="${AGENT_AUTO_DISMISS_PHRASES:-}"
NOTIFY_ON_PHRASE_REGEX="${AGENT_NOTIFY_ON_PHRASE_REGEX:-}"
NOTIFY_ON_PHRASE_TITLE="${AGENT_NOTIFY_ON_PHRASE_TITLE:-Agent needs attention}"
NOTIFY_ON_PHRASE_BODY="${AGENT_NOTIFY_ON_PHRASE_BODY:-Matched notify phrase in session $SESSION on $(hostname).}"
TMUX_STATUS_STYLE="${AGENT_TMUX_STATUS_STYLE:-}"
TMUX_PANE_BORDER_STYLE="${AGENT_TMUX_PANE_BORDER_STYLE:-}"
TMUX_PANE_ACTIVE_BORDER_STYLE="${AGENT_TMUX_PANE_ACTIVE_BORDER_STYLE:-}"
CLAUDE_RENAME_TO="${AGENT_CLAUDE_RENAME_TO:-}"

RATE_LIMIT_FAILOVER="${AGENT_RATE_LIMIT_FAILOVER:-false}"
FAILOVER_CMD="${AGENT_FAILOVER_CMD:-}"
FAILOVER_CLI="${AGENT_FAILOVER_CLI:-}"
RATE_LIMIT_REGEX="${AGENT_RATE_LIMIT_REGEX:-out of extra usage|Claude usage limit|Copilot usage limit|monthly limit|quota exhausted}"
RATE_LIMIT_COOLDOWN_SEC="${AGENT_RATE_LIMIT_COOLDOWN_SEC:-300}"
LAST_SWITCH_EPOCH=0
RATE_LIMIT_ALERTED=""

ACTIVE_LAUNCH_CMD="$AGENT_LAUNCH_CMD"
LAUNCH_CMD_ARGS=()

log() { hive_log "$*"; }

fail() {
  log "$*"
  exit 1
}

parse_launch_cmd() {
  local raw_cmd="$1"
  local launch_bin

  [[ "$raw_cmd" =~ ^[[:alnum:]_./:=,+@%~-]+([[:space:]][[:alnum:]_./:=,+@%~-]+)*$ ]] \
    || fail "refusing unsafe launch command: $raw_cmd"

  read -r -a LAUNCH_CMD_ARGS <<< "$raw_cmd"
  [ ${#LAUNCH_CMD_ARGS[@]} -gt 0 ] || fail "launch command cannot be empty"

  launch_bin="${LAUNCH_CMD_ARGS[0]##*/}"
  case "$launch_bin" in
    agent-launch.sh|claude|copilot|gemini|codex|q|goose|aider) ;;
    *) fail "refusing unsupported launch command: ${LAUNCH_CMD_ARGS[0]}" ;;
  esac
}

write_launch_cmd_array() {
  local arg

  printf 'LAUNCH_CMD=(' >> "$LAUNCHER"
  for arg in "$@"; do
    printf ' %q' "$arg" >> "$LAUNCHER"
  done
  printf ' )\n' >> "$LAUNCHER"
}

# ─── Write launcher script (avoids quoting hell with eval) ─────────────────

LAUNCHER="/tmp/.supervisor-launch-${SESSION}.sh"

write_launcher() {
  local prompt_file="/tmp/.supervisor-prompt-${SESSION}.txt"
  printf '%s' "$AGENT_LOOP_PROMPT" > "$prompt_file"

  parse_launch_cmd "$ACTIVE_LAUNCH_CMD"

  cat > "$LAUNCHER" << LAUNCH
#!/bin/bash
cd $(printf '%q' "$WORKDIR")
LAUNCH
  write_launch_cmd_array "${LAUNCH_CMD_ARGS[@]}"

  case "$CLI" in
    copilot|gemini)
      cat >> "$LAUNCHER" << LAUNCH
prompt=\$(cat $(printf '%q' "$prompt_file"))
exec "\${LAUNCH_CMD[@]}" -i "\$prompt"
LAUNCH
      ;;
    goose)
      cat >> "$LAUNCHER" << LAUNCH
prompt=\$(cat $(printf '%q' "$prompt_file"))
exec "\${LAUNCH_CMD[@]}" --prompt "\$prompt"
LAUNCH
      ;;
    *)
      cat >> "$LAUNCHER" << LAUNCH
prompt=\$(cat $(printf '%q' "$prompt_file"))
exec "\${LAUNCH_CMD[@]}" "\$prompt"
LAUNCH
      ;;
  esac
  chmod +x "$LAUNCHER"
}

# ─── Tmux styling ─────────────────────────────────────────────────────────

apply_tmux_styling() {
  [ -n "$TMUX_STATUS_STYLE" ] && tmux set -t "$SESSION" status-style "$TMUX_STATUS_STYLE" 2>/dev/null || true
  [ -n "$TMUX_PANE_BORDER_STYLE" ] && tmux set -t "$SESSION" pane-border-style "$TMUX_PANE_BORDER_STYLE" 2>/dev/null || true
  [ -n "$TMUX_PANE_ACTIVE_BORDER_STYLE" ] && tmux set -t "$SESSION" pane-active-border-style "$TMUX_PANE_ACTIVE_BORDER_STYLE" 2>/dev/null || true
}

# ─── Session lifecycle ─────────────────────────────────────────────────────

PROMPT_DELIVERED=""

is_paused() { hive_is_paused "$SESSION"; }

write_paused_launcher() {
  parse_launch_cmd "$ACTIVE_LAUNCH_CMD"

  cat > "$LAUNCHER" << LAUNCH
#!/bin/bash
cd $(printf '%q' "$WORKDIR")
LAUNCH
  write_launch_cmd_array "${LAUNCH_CMD_ARGS[@]}"
  cat >> "$LAUNCHER" << 'LAUNCH'
exec "${LAUNCH_CMD[@]}"
LAUNCH
  chmod +x "$LAUNCHER"
}

start_session() {
  if is_paused; then
    write_paused_launcher
    log "starting tmux session $SESSION (cli=$CLI) — PAUSED (no prompt)"
  else
    write_launcher
    log "starting tmux session $SESSION (cli=$CLI)"
  fi
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  PROMPT_DELIVERED=""
  tmux new-session -d -s "$SESSION" -c "$WORKDIR" "$LAUNCHER"
  apply_tmux_styling
}

# ─── Startup dialog handling ──────────────────────────────────────────────

handle_startup_dialogs() {
  local pane
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null) || return 0

  if echo "$pane" | grep -qF "Do you trust the files"; then
    log "auto-approving folder trust dialog (Down, Enter)"
    tmux send-keys -t "$SESSION" Down Enter
    sleep 2
    return 0
  fi

  if echo "$pane" | grep -qF "bypass permissions on" && echo "$pane" | grep -qF "shift+tab to cycle"; then
    log "accepting bypass permissions prompt (Enter)"
    tmux send-keys -t "$SESSION" Enter
    sleep 2
    return 0
  fi
}

check_prompt_delivered() {
  [ -n "$PROMPT_DELIVERED" ] && return 0
  local pane
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null) || return 1
  if echo "$pane" | grep -qE '◐|◑|◒|◓|● Read CLAUDE|● Environment loaded.*custom instructions'; then
    PROMPT_DELIVERED="yes"
    log "prompt delivered and agent is working"
    if [ -n "$CLAUDE_RENAME_TO" ]; then
      sleep 5
      log "sending /rename $CLAUDE_RENAME_TO"
      tmux send-keys -t "$SESSION" -l "/rename $CLAUDE_RENAME_TO"
      sleep 1
      tmux send-keys -t "$SESSION" Enter
    fi
    return 0
  fi
  return 1
}

# ─── Prompt handling ──────────────────────────────────────────────────────

approve_prompt_if_present() {
  [ -z "$AUTO_APPROVE_PHRASE" ] && return 0
  local pane
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null) || return 0
  if echo "$pane" | grep -qF "$AUTO_APPROVE_PHRASE"; then
    log "auto-approving pending prompt (Down, Enter)"
    tmux send-keys -t "$SESSION" Down Enter
    sleep 3
  fi
}

dismiss_prompts_if_present() {
  [ -z "$AUTO_DISMISS_PHRASES" ] && return 0
  local pane phrase
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null) || return 0
  while IFS= read -r phrase; do
    [ -z "$phrase" ] && continue
    if echo "$pane" | grep -qF "$phrase"; then
      log "auto-dismissing prompt (Escape) — matched: $phrase"
      tmux send-keys -t "$SESSION" Escape
      sleep 2
      return 0
    fi
  done <<< "$AUTO_DISMISS_PHRASES"
}

# ─── Notify on phrase ─────────────────────────────────────────────────────

NOTIFY_PHRASE_ALERTED=""

notify_if_phrase_present() {
  [ -z "$NOTIFY_ON_PHRASE_REGEX" ] && return 0
  local topic="${NTFY_TOPIC:-}"
  [ -z "$topic" ] && return 0
  local pane
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null) || return 0
  if echo "$pane" | grep -qiE "$NOTIFY_ON_PHRASE_REGEX"; then
    if [ -z "$NOTIFY_PHRASE_ALERTED" ]; then
      log "notify-phrase matched; pushing ntfy alert"
      curl -sS -m 10 \
        -H "Priority: high" \
        -H "Title: $NOTIFY_ON_PHRASE_TITLE" \
        -H "Tags: warning,key" \
        -d "$NOTIFY_ON_PHRASE_BODY" \
        "$NTFY_SERVER/$topic" >/dev/null || true
      NOTIFY_PHRASE_ALERTED="yes"
    fi
  else
    if [ -n "$NOTIFY_PHRASE_ALERTED" ]; then
      log "notify-phrase cleared"
      curl -sS -m 10 \
        -H "Priority: default" \
        -H "Title: $NOTIFY_ON_PHRASE_TITLE — cleared" \
        -H "Tags: white_check_mark" \
        -d "Phrase no longer visible in pane." \
        "$NTFY_SERVER/$topic" >/dev/null || true
      NOTIFY_PHRASE_ALERTED=""
    fi
  fi
}

# ─── Rate-limit failover (opt-in via AGENT_RATE_LIMIT_FAILOVER=true) ──────

check_rate_limit_and_failover() {
  [ "$RATE_LIMIT_FAILOVER" != "true" ] && return 0
  [ -z "$FAILOVER_CMD" ] && return 0

  local pane topic now elapsed
  topic="${NTFY_TOPIC:-}"
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null) || return 0

  if echo "$pane" | grep -qiE "$RATE_LIMIT_REGEX"; then
    # Paused agents must not be switched — failover violates operator intent
    if is_paused; then
      [ -z "$RATE_LIMIT_ALERTED" ] && log "rate limit on $CLI but $SESSION is PAUSED — not switching"
      RATE_LIMIT_ALERTED="paused"
      return 0
    fi
    # Pinned agents must not be switched — alert but stay on the pinned CLI
    local envfile="/etc/hive/${SESSION}.env"
    if grep -q "^AGENT_CLI_PINNED=true" "$envfile" 2>/dev/null; then
      if [ -z "$RATE_LIMIT_ALERTED" ]; then
        log "rate limit on $CLI but $SESSION is PINNED — NOT switching"
        [ -n "$topic" ] && curl -sS -m 10 \
          -H "Priority: high" \
          -H "Title: $SESSION: rate-limited but pinned (staying on $CLI)" \
          -H "Tags: pushpin,warning" \
          -d "$SESSION hit rate limit on $CLI but is pinned — not switching." \
          "$NTFY_SERVER/$topic" >/dev/null || true
        RATE_LIMIT_ALERTED="pinned"
      fi
      return 0
    fi
    if [ -z "$RATE_LIMIT_ALERTED" ]; then
      now=$(date +%s)
      elapsed=$((now - LAST_SWITCH_EPOCH))
      if (( elapsed < RATE_LIMIT_COOLDOWN_SEC )); then
        log "rate limit on $CLI but cooldown active (${elapsed}s < ${RATE_LIMIT_COOLDOWN_SEC}s) — NOT switching"
        RATE_LIMIT_ALERTED="cooldown"
        return 0
      fi

      local old_cli="$CLI"
      if [ "$CLI" = "$FAILOVER_CLI" ]; then
        CLI="${AGENT_CLI:-claude}"
        ACTIVE_LAUNCH_CMD="$AGENT_LAUNCH_CMD"
      else
        CLI="$FAILOVER_CLI"
        ACTIVE_LAUNCH_CMD="$FAILOVER_CMD"
      fi
      log "rate limit on $old_cli; switching to $CLI"

      [ -n "$topic" ] && curl -sS -m 10 \
        -H "Priority: high" \
        -H "Title: $SESSION: rate limit on $old_cli → $CLI" \
        -H "Tags: rotating_light,key" \
        -d "$SESSION at $(hostname) hit CLI usage limit on $old_cli. Switching to $CLI." \
        "$NTFY_SERVER/$topic" >/dev/null || true

      RATE_LIMIT_ALERTED="yes"
      LAST_SWITCH_EPOCH=$(date +%s)
      start_session
    fi
  else
    if [ -n "$RATE_LIMIT_ALERTED" ]; then
      log "rate limit cleared; $CLI running"
      [ -n "$topic" ] && curl -sS -m 10 \
        -H "Priority: default" \
        -H "Title: $SESSION: resumed on $CLI" \
        -H "Tags: white_check_mark" \
        -d "$SESSION resumed on $CLI." \
        "$NTFY_SERVER/$topic" >/dev/null || true
      RATE_LIMIT_ALERTED=""
    fi
  fi
}

# ─── Governor model sync ──────────────────────────────────────────────────
# When the governor changes an agent's model, it writes to
# /var/run/kick-governor/model_<session>. kick-agents.sh sends /exit and
# types agent-launch.sh with the new model, but that process exits and
# supervisor.sh detects "agent missing" → relaunches with the ORIGINAL
# ACTIVE_LAUNCH_CMD. This function checks the governor model file before
# relaunch and updates ACTIVE_LAUNCH_CMD + CLI to match.

GOVERNOR_MODEL_DIR="$GOVERNOR_STATE_DIR"

sync_launch_cmd_from_governor() {
  local model_file="$GOVERNOR_MODEL_DIR/model_${SESSION}"
  [ -f "$model_file" ] || return 0

  local gov_backend gov_model
  gov_backend=$(grep '^BACKEND=' "$model_file" 2>/dev/null | cut -d= -f2)
  gov_model=$(grep '^MODEL=' "$model_file" 2>/dev/null | cut -d= -f2)
  [ -z "$gov_backend" ] || [ -z "$gov_model" ] && return 0

  gov_model=$(normalize_model_for_backend "$gov_backend" "$gov_model")
  local new_cmd="agent-launch.sh --backend $gov_backend --model $gov_model"
  if [ "$ACTIVE_LAUNCH_CMD" != "$new_cmd" ]; then
    log "governor model sync: updating launch cmd to ${gov_backend}:${gov_model}"
    ACTIVE_LAUNCH_CMD="$new_cmd"
    CLI=$(backend_binary "$gov_backend")
  fi
}

# ─── Liveness ──────────────────────────────────────────────────────────────

session_alive() { tmux has-session -t "$SESSION" 2>/dev/null; }

agent_alive() {
  local pids p cmd
  pids=$(tmux list-panes -t "$SESSION" -F "#{pane_pid}" 2>/dev/null) || return 1
  [ -n "$pids" ] || return 1
  for p in $pids; do
    cmd=$(ps -p "$p" -o comm= 2>/dev/null)
    if [ -n "$cmd" ] && [ "$cmd" != "bash" ] && [ "$cmd" != "sh" ]; then
      return 0
    fi
    if pgrep -P "$p" >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

# ─── Main loop ─────────────────────────────────────────────────────────────

trap 'log "supervisor exiting"; exit 0' TERM INT

# Prevent double-restart race: if systemd respawns supervisor while another
# instance is still running, the second exits immediately.
LOCK_FILE="/var/run/hive-supervisor-${SESSION}.lock"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  log "another supervisor for $SESSION is running; exiting"
  exit 0
fi

log "supervisor started (session=$SESSION, cli=$CLI, poll=${POLL_SEC}s, failover=$RATE_LIMIT_FAILOVER)"
sync_launch_cmd_from_governor
if session_alive && agent_alive; then
  log "existing session $SESSION is healthy; adopting without restart"
else
  start_session
fi
while true; do
  if ! session_alive; then
    log "session $SESSION gone; restarting"
    sync_launch_cmd_from_governor
    start_session
  elif ! agent_alive; then
    log "agent process missing in $SESSION; restarting"
    sync_launch_cmd_from_governor
    start_session
  else
    handle_startup_dialogs
    check_prompt_delivered
    approve_prompt_if_present
    dismiss_prompts_if_present
    notify_if_phrase_present
    check_rate_limit_and_failover
  fi
  sleep "$POLL_SEC"
done
