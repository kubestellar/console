#!/usr/bin/env bash
# run-demo.sh — full-pipeline walkthrough of Stellar's capabilities.
#
# Runs through every Stellar feature in order, narrating each step so you can
# read along while screen-recording. Pauses between steps so you have time
# to flip windows.
#
# Prereqs:
#   - ./startup-oauth.sh (or ./start-dev.sh) is running
#   - STELLAR_TOKEN exported (or pass --token <jwt>)
#   - For Step 4 (real restart): a kind cluster with the crashloop manifest applied:
#       kubectl apply -f demo/stellar/crashloop-deployment.yaml
#
# Usage:
#   ./run-demo.sh                    # full run, ~5 minutes
#   ./run-demo.sh --fast             # no pauses, ~30s — for sanity checks
#   ./run-demo.sh --steps 1,2,3      # only run specific steps

set -euo pipefail

HOST="${STELLAR_HOST:-http://localhost:8080}"
TOKEN="${STELLAR_TOKEN:-}"
CLUSTER="${STELLAR_CLUSTER:-kind-1}"
FAST=0
STEPS="1,2,3,4,5,6"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)   TOKEN="$2"; shift 2 ;;
    --host)    HOST="$2"; shift 2 ;;
    --cluster) CLUSTER="$2"; shift 2 ;;
    --fast)    FAST=1; shift ;;
    --steps)   STEPS="$2"; shift 2 ;;
    *) shift ;;
  esac
done

[[ -n "$TOKEN" ]] || { echo "error: set STELLAR_TOKEN or pass --token" >&2; exit 2; }

# ANSI colors for narration
BOLD='\033[1m'; CYAN='\033[36m'; YEL='\033[33m'; GRN='\033[32m'; RST='\033[0m'

say() { printf "${CYAN}%s${RST}\n" "$1"; }
narrate() { printf "${BOLD}%s${RST}\n" "$1"; }
wait_pause() { [[ $FAST -eq 1 ]] || { printf "${YEL}    ⏸  press enter to continue…${RST}"; read -r; }; }
have_step() { echo "$STEPS" | tr ',' '\n' | grep -qx "$1"; }

post_event() {
  local reason="$1" name="$2" message="$3" etype="${4:-Warning}"
  local body
  body=$(printf '{"cluster":"%s","namespace":"payments","kind":"Pod","name":"%s","reason":"%s","message":"%s","type":"%s","count":1}' \
    "$CLUSTER" "$name" "$reason" "$message" "$etype")
  curl -sS -o /dev/null -w '' -X POST "${HOST%/}/api/stellar/events/ingest" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Requested-With: XMLHttpRequest" \
    -H "Content-Type: application/json" \
    --data-binary "$body"
}

# ─────────────────────────────────────────────────────────────────────────────

if have_step 1; then
  echo
  narrate "▸ STEP 1 — The filter"
  say "Stellar runs every event through the user's LLM evaluator before showing it."
  say "First, send 4 noise events that SHOULD be filtered (rolling updates, pulls, schedules)."
  echo "    open the browser at $HOST/stellar — keep it visible"
  wait_pause

  post_event "Pulling"           "api-server-pod-a" "Pulling image busybox:1.36" "Normal"
  post_event "Pulled"            "api-server-pod-a" "Successfully pulled image"  "Normal"
  post_event "Scheduled"         "api-server-pod-a" "Assigned to kind-1-worker"  "Normal"
  post_event "ScalingReplicaSet" "api-server"       "Scaled up replica set"      "Normal"
  printf "    ${GRN}✓${RST} sent 4 noise events — sidebar should remain empty\n"
  wait_pause
fi

if have_step 2; then
  echo
  narrate "▸ STEP 2 — The surface"
  say "Now send 1 CrashLoopBackOff. The LLM evaluator classifies it critical and surfaces it."
  say "If you're on a DIFFERENT page (try /workloads), a toast pops up via StellarToastBridge."
  wait_pause

  post_event "CrashLoopBackOff" "api-server-7d4c5b9f4-abc12" "Back-off restarting failed container" "Warning"
  printf "    ${GRN}✓${RST} 1 critical event sent — toast + sidebar badge + event card\n"
  wait_pause
fi

if have_step 3; then
  echo
  narrate "▸ STEP 3 — Auto-tend (the magic)"
  say "Stellar's evaluator decided this event needs a RestartDeployment. It auto-queued the action"
  say "as pending_approval — see the yellow Approval card at the top of the Events panel."
  say ""
  say "Sending 3 more CrashLoopBackOff events to trigger:"
  say "  - recurring detection (3+ in 1h → escalation)"
  say "  - observer auto-watch (3+ events → creates a standing watch)"
  wait_pause

  for i in 2 3 4; do
    post_event "CrashLoopBackOff" "api-server-7d4c5b9f4-abc1$i" "Back-off restarting failed container" "Warning"
    sleep 1
  done
  printf "    ${GRN}✓${RST} 3 more crashes sent — wait 60s for the observer tick\n"
  printf "    ${YEL}→ watch for: auto-watch in the Watches panel, plus an 'observation' nudge${RST}\n"
  wait_pause
fi

if have_step 4; then
  echo
  narrate "▸ STEP 4 — One-click execution"
  say "Click 'Approve' on the Stellar suggestion card. The scheduler dispatches a real"
  say "kubectl rollout restart against the cluster. If you applied the crashloop manifest,"
  say "you'll see the pod recycle in 'kubectl get pods -n payments -w'."
  say ""
  say "(Skipping the click — that's manual. After clicking, run:)"
  say "  kubectl rollout history deployment/api-server -n payments"
  wait_pause
fi

if have_step 5; then
  echo
  narrate "▸ STEP 5 — The proactive nudge"
  say "Every 60s the observer scans the last 2 hours of events and, if it finds a pattern,"
  say "calls the user's LLM with a ProactiveNudge prompt. The result is dropped into the"
  say "sidebar as a 'Stellar observation' card — unprompted. Deduped per hour."
  say ""
  say "(No action needed — just wait for the observer tick and see if a nudge appears.)"
  wait_pause
fi

if have_step 6; then
  echo
  narrate "▸ STEP 6 — Audit trail"
  say "Every nudge, every action, every LLM call is logged."
  echo "    curl -s -H 'Authorization: Bearer \$STELLAR_TOKEN' \\"
  echo "      $HOST/api/stellar/audit | jq '.items[:10]'"
  echo ""
  echo "    sqlite3 ./data/console.db \\"
  echo "      \"SELECT type, severity, title FROM stellar_notifications ORDER BY created_at DESC LIMIT 10;\""
  wait_pause
fi

echo
narrate "Done. ✨"
echo "    To reset between takes:"
echo "      sqlite3 ./data/console.db \"DELETE FROM stellar_notifications; DELETE FROM stellar_actions; DELETE FROM stellar_watches; DELETE FROM stellar_observations;\""
