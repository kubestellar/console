#!/bin/bash
# gh-rate-check.sh — Scans agent tmux panes for GitHub API rate limit messages.
# Writes alerts to /var/run/hive-metrics/gh_rate_limits.json and sends ntfy notifications.
# Called periodically (e.g., every 60s via kick-agents.sh).
#
# IMPORTANT: This script detects GITHUB API rate limits only.
# Claude/Copilot CLI usage limits ("You're out of extra usage", "resets Xam/pm")
# are handled separately by kick-agents.sh and must NOT be confused with GH API limits.
#
# Rate-limit pullback: when a rate limit is detected, agents on the same CLI are
# temporarily paused for PULLBACK_SECONDS. Agents already paused before the pullback
# are NOT unpaused when the pullback expires.

set -euo pipefail

METRICS_FILE="/var/run/hive-metrics/gh_rate_limits.json"
PULLBACK_STATE_DIR="/var/run/hive-metrics/rate_pullback"
GOVERNOR_FLAG_DIR="/var/run/kick-governor"
NTFY_SERVER="${NTFY_SERVER:-https://ntfy.sh}"
NTFY_TOPIC="${NTFY_TOPIC:-hive}"
TMUX_BIN="${TMUX_BIN:-tmux}"
TTL_SECONDS=900   # 15 minutes — cleared sooner if API shows recovery
PULLBACK_SECONDS=900  # 15 minutes

mkdir -p "$PULLBACK_STATE_DIR"

# Agent name -> tmux session name
declare -A AGENT_SESSIONS=(
  [scanner]=scanner
  [reviewer]=reviewer
  [architect]=architect
  [outreach]=outreach
)

# Which CLI each agent uses (read from env files)
get_agent_cli() {
  local agent="$1"
  local cli
  cli=$(grep -s '^AGENT_CLI=' "/etc/hive/${agent}.env" 2>/dev/null | cut -d= -f2 || echo "")
  if [ -z "$cli" ]; then
    cli=$(grep -s 'AGENT_LAUNCH_CMD=' "/etc/hive/${agent}.env" 2>/dev/null | grep -oP '(copilot|claude)' | head -1 || echo "unknown")
  fi
  echo "${cli:-unknown}"
}

# GitHub API rate limit patterns
GH_RATE_PATTERNS='API rate limit exceeded|secondary rate limit|rate limit|403.*rate|You have exceeded|retry-after|gh: Resource not accessible'

# Claude/Copilot CLI patterns to EXCLUDE
CLI_EXCLUDE_PATTERNS="You.re out of extra usage|out of extra usage|extra usage.*resets|resets [0-9]+(:[0-9]+)?[aApP][mM]"

now_epoch=$(date +%s)
now_iso=$(date -Is)

log() { echo "[$(date -Is)] GH-RATE-CHECK $*" >> /var/log/kick-agents.log; }

# Fetch GitHub API rate limit reset times (cached per invocation)
GH_BIN="${GH_BIN:-/usr/bin/gh}"
_api_reset_cache=""
get_api_reset_epoch() {
  if [ -z "$_api_reset_cache" ]; then
    _api_reset_cache=$($GH_BIN api rate_limit --jq '[.resources.graphql.reset, .resources.core.reset] | max' 2>/dev/null || echo "0")
  fi
  echo "$_api_reset_cache"
}

# --- Phase 1: Check and expire existing pullbacks ---
for pullback_file in "$PULLBACK_STATE_DIR"/pullback_*.json; do
  [ -f "$pullback_file" ] || continue
  expiry=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('expiry_epoch', 0))" "$pullback_file" 2>/dev/null || echo 0)
  if (( now_epoch >= expiry )); then
    # Pullback expired — unpause only the agents this pullback paused
    paused_by_us=$(python3 -c "import json,sys; print(' '.join(json.load(open(sys.argv[1])).get('paused_agents', [])))" "$pullback_file" 2>/dev/null || echo "")
    cli_name=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('cli', 'unknown'))" "$pullback_file" 2>/dev/null || echo "unknown")
    for agent in $paused_by_us; do
      if [ -f "$GOVERNOR_FLAG_DIR/operator_paused_${agent}" ]; then
        log "PULLBACK-SKIP $agent — operator-paused, not resuming after pullback for cli=$cli_name"
        continue
      fi
      if [ -f "$GOVERNOR_FLAG_DIR/paused_${agent}" ]; then
        rm -f "$GOVERNOR_FLAG_DIR/paused_${agent}"
        log "PULLBACK-RESUME $agent — rate-limit pullback expired for cli=$cli_name"
      fi
    done
    rm -f "$pullback_file"
    log "PULLBACK-EXPIRED cli=$cli_name — resumed: $paused_by_us"

    curl -s \
      -H "Title: Rate Limit Pullback Expired ($cli_name)" \
      -H "Priority: default" \
      -H "Tags: white_check_mark" \
      -d "Resumed agents: $paused_by_us" \
      "$NTFY_SERVER/$NTFY_TOPIC" >/dev/null 2>&1 || true
  fi
done

# --- Phase 2: Load existing alerts and prune expired ---
if [ -f "$METRICS_FILE" ]; then
  existing=$(cat "$METRICS_FILE" 2>/dev/null || echo '{"alerts":[]}')
else
  existing='{"alerts":[]}'
fi

new_alerts=$(echo "$existing" | python3 -c "
import json, sys
data = json.load(sys.stdin)
now = int(sys.argv[1])
ttl = int(sys.argv[2])
def is_active(a):
    reset = a.get('api_reset_epoch', 0)
    if reset > 0:
        return now < reset
    return now - a.get('detected_epoch', 0) < ttl
alerts = [a for a in data.get('alerts', []) if is_active(a)]
print(json.dumps(alerts))
" "$now_epoch" "$TTL_SECONDS" 2>/dev/null || echo '[]')

# --- Phase 2.5: Recovery check — clear alerts if API rate limit has recovered ---
# If we have active alerts but the API shows remaining > 0, the limit has reset.
alert_count=$(echo "$new_alerts" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
if [ "$alert_count" -gt 0 ]; then
  api_remaining=$($GH_BIN api rate_limit --jq '.rate.remaining' 2>/dev/null || echo "-1")
  if [ "$api_remaining" -gt 0 ] 2>/dev/null; then
    log "RECOVERY rate limit recovered (remaining=$api_remaining) — clearing $alert_count alerts"
    new_alerts="[]"
    # Also expire any active pullbacks since the limit has reset
    for pullback_file in "$PULLBACK_STATE_DIR"/pullback_*.json; do
      [ -f "$pullback_file" ] || continue
      paused_by_us=$(python3 -c "import json,sys; print(' '.join(json.load(open(sys.argv[1])).get('paused_agents', [])))" "$pullback_file" 2>/dev/null || echo "")
      cli_name=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('cli', 'unknown'))" "$pullback_file" 2>/dev/null || echo "unknown")
      for agent in $paused_by_us; do
        if [ -f "$GOVERNOR_FLAG_DIR/operator_paused_${agent}" ]; then
          continue
        fi
        rm -f "$GOVERNOR_FLAG_DIR/paused_${agent}"
      done
      rm -f "$pullback_file"
      log "RECOVERY-UNPAUSE cli=$cli_name — resumed: $paused_by_us"
    done
  fi
fi

# --- Phase 3: Scan agent panes for new rate limit hits ---
for agent in "${!AGENT_SESSIONS[@]}"; do
  session="${AGENT_SESSIONS[$agent]}"

  if ! $TMUX_BIN has-session -t "$session" 2>/dev/null; then
    continue
  fi

  pane_text=$($TMUX_BIN capture-pane -t "$session" -p -S -20 2>/dev/null || true)
  [ -z "$pane_text" ] && continue

  filtered_text=$(echo "$pane_text" | grep -viE "$CLI_EXCLUDE_PATTERNS" || true)
  [ -z "$filtered_text" ] && continue

  match_line=$(echo "$filtered_text" | grep -iE "$GH_RATE_PATTERNS" | tail -1 || true)
  [ -z "$match_line" ] && continue

  match_msg=$(echo "$match_line" | sed 's/^[[:space:]]*//' | head -c 200)
  agent_cli=$(get_agent_cli "$agent")

  # Check if we already have an active alert for this agent
  already_alerted=$(echo "$new_alerts" | python3 -c "
import json, sys
alerts = json.load(sys.stdin)
agent = sys.argv[1]
found = any(a['agent'] == agent for a in alerts)
print('yes' if found else 'no')
" "$agent" 2>/dev/null || echo 'no')

  if [ "$already_alerted" = "yes" ]; then
    continue
  fi

  # Fetch API reset time when we detect a rate limit
  api_reset=$(get_api_reset_epoch)

  # Add new alert with CLI info and API reset time
  new_alerts=$(echo "$new_alerts" | python3 -c "
import json, sys
alerts = json.load(sys.stdin)
alerts.append({
    'agent': sys.argv[1],
    'cli': sys.argv[2],
    'detected_at': sys.argv[3],
    'detected_epoch': int(sys.argv[4]),
    'message': sys.argv[5][:200],
    'ttl_seconds': int(sys.argv[6]),
    'pullback_seconds': int(sys.argv[7]),
    'api_reset_epoch': int(sys.argv[8])
})
print(json.dumps(alerts))
" "$agent" "$agent_cli" "$now_iso" "$now_epoch" "$match_msg" "$TTL_SECONDS" "$PULLBACK_SECONDS" "$api_reset" 2>/dev/null || echo "$new_alerts")

  log "GH-RATE-LIMIT $agent (cli=$agent_cli) — $match_msg"

  # --- Phase 4: Pullback — pause other agents on the same CLI ---
  pullback_file="$PULLBACK_STATE_DIR/pullback_${agent_cli}.json"
  if [ ! -f "$pullback_file" ]; then
    # Record which agents are ALREADY paused (we must not unpause these later)
    already_paused=()
    paused_by_pullback=()

    for other_agent in "${!AGENT_SESSIONS[@]}"; do
      other_cli=$(get_agent_cli "$other_agent")
      [ "$other_cli" != "$agent_cli" ] && continue
      # Skip scanner — it's the one that found the limit, let it finish its cycle
      [ "$other_agent" = "$agent" ] && continue

      if [ -f "$GOVERNOR_FLAG_DIR/paused_${other_agent}" ] || [ -f "$GOVERNOR_FLAG_DIR/operator_paused_${other_agent}" ]; then
        already_paused+=("$other_agent")
      else
        touch "$GOVERNOR_FLAG_DIR/paused_${other_agent}"
        paused_by_pullback+=("$other_agent")
        log "PULLBACK-PAUSE $other_agent — rate-limit on cli=$agent_cli (${PULLBACK_SECONDS}s)"
      fi
    done

    # Write pullback state so we know who to unpause later
    expiry_epoch=$((now_epoch + PULLBACK_SECONDS))
    python3 -c "
import json, sys
state = {
    'cli': sys.argv[1],
    'triggered_by': sys.argv[2],
    'triggered_at': sys.argv[3],
    'expiry_epoch': int(sys.argv[4]),
    'paused_agents': sys.argv[5].split(',') if sys.argv[5] else [],
    'already_paused': sys.argv[6].split(',') if sys.argv[6] else [],
    'api_reset_epoch': int(sys.argv[7])
}
print(json.dumps(state, indent=2))
" "$agent_cli" "$agent" "$now_iso" "$expiry_epoch" \
  "$(IFS=,; echo "${paused_by_pullback[*]}")" \
  "$(IFS=,; echo "${already_paused[*]}")" \
  "$api_reset" > "$pullback_file" 2>/dev/null

    if [ ${#paused_by_pullback[@]} -gt 0 ]; then
      curl -s \
        -H "Title: Rate Limit Pullback ($agent_cli)" \
        -H "Priority: high" \
        -H "Tags: warning" \
        -d "Paused: $(IFS=,; echo "${paused_by_pullback[*]}") for ${PULLBACK_SECONDS}s. Already paused: $(IFS=,; echo "${already_paused[*]:-none}")" \
        "$NTFY_SERVER/$NTFY_TOPIC" >/dev/null 2>&1 || true
    fi
  fi

  # ntfy for the rate limit itself
  curl -s \
    -H "Title: GH Rate Limit: $agent ($agent_cli)" \
    -H "Priority: high" \
    -H "Tags: warning" \
    -d "$match_msg" \
    "$NTFY_SERVER/$NTFY_TOPIC" >/dev/null 2>&1 || true
done

# --- Phase 5: Write final alerts file with active pullback info ---
# Collect active pullbacks for dashboard display
active_pullbacks="[]"
for pullback_file in "$PULLBACK_STATE_DIR"/pullback_*.json; do
  [ -f "$pullback_file" ] || continue
  active_pullbacks=$(python3 -c "
import json, sys
pullbacks = json.load(sys.stdin)
pb = json.load(open(sys.argv[1]))
pullbacks.append(pb)
print(json.dumps(pullbacks))
" "$pullback_file" <<< "$active_pullbacks" 2>/dev/null || echo "$active_pullbacks")
done

echo "$new_alerts" | python3 -c "
import json, sys
alerts = json.load(sys.stdin)
pullbacks = json.loads(sys.argv[2])
result = {
    'alerts': alerts,
    'pullbacks': pullbacks,
    'updated_at': sys.argv[1]
}
print(json.dumps(result, indent=2))
" "$now_iso" "$active_pullbacks" > "$METRICS_FILE" 2>/dev/null || echo "{\"alerts\":$new_alerts,\"updated_at\":\"$now_iso\"}" > "$METRICS_FILE"
