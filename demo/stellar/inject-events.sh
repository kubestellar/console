#!/usr/bin/env bash
# inject-events.sh — fire reproducible K8s events at Stellar for the pitch demo.
#
# Usage:
#   ./inject-events.sh crash    # 1 CrashLoopBackOff on payments/api-server (should surface)
#   ./inject-events.sh noise    # 4 noise events (should ALL be filtered)
#   ./inject-events.sh flood    # 4 CrashLoopBackOff events over ~10s (triggers auto-watch)
#
# Flags (or env vars):
#   --token <jwt>     or  $STELLAR_TOKEN
#   --host  <url>     or  $STELLAR_HOST   (default http://localhost:8080)
#   --cluster <name>  or  $STELLAR_CLUSTER (default kind-1)
#
# Note on Beat 4 of the demo:
#   The observer dedups nudges hourly via key "nudge:YYYY-MM-DD-HH". If you
#   already triggered a nudge this hour, delete the row or wait for the next
#   hour boundary before re-recording:
#     sqlite3 ./data/console.db "DELETE FROM stellar_notifications WHERE type='observation';"

set -euo pipefail

MODE="${1:-}"
HOST="${STELLAR_HOST:-http://localhost:8080}"
TOKEN="${STELLAR_TOKEN:-}"
CLUSTER="${STELLAR_CLUSTER:-kind-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)   TOKEN="$2"; shift 2 ;;
    --host)    HOST="$2"; shift 2 ;;
    --cluster) CLUSTER="$2"; shift 2 ;;
    crash|noise|flood) MODE="$1"; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"; exit 0 ;;
    *) shift ;;
  esac
done

if [[ -z "$MODE" ]]; then
  echo "error: missing mode (crash | noise | flood)" >&2
  exit 2
fi
if [[ -z "$TOKEN" ]]; then
  echo "error: no token. Set STELLAR_TOKEN or pass --token <jwt>" >&2
  exit 2
fi

URL="${HOST%/}/api/stellar/events/ingest"

# post <reason> <name> <message> <type>
post() {
  local reason="$1" name="$2" message="$3" etype="$4"
  local body
  body=$(printf '{"cluster":"%s","namespace":"payments","kind":"Pod","name":"%s","reason":"%s","message":"%s","type":"%s","count":1}' \
    "$CLUSTER" "$name" "$reason" "$message" "$etype")
  local status
  status=$(curl -sS -o /tmp/inject-events.out -w '%{http_code}' \
    -X POST "$URL" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Requested-With: XMLHttpRequest" \
    -H "Content-Type: application/json" \
    --data-binary "$body" || echo "000")
  if [[ "$status" != "202" && "$status" != "200" ]]; then
    echo "FAIL [$status] $reason on $name — $(cat /tmp/inject-events.out)" >&2
    exit 1
  fi
  echo "  ✓ $etype/$reason  $name"
}

case "$MODE" in
  crash)
    echo "→ injecting 1 CrashLoopBackOff (cluster=$CLUSTER)"
    post CrashLoopBackOff api-server-abc123 "Back-off restarting failed container" Warning
    ;;

  noise)
    echo "→ injecting 4 noise events (cluster=$CLUSTER) — all should be filtered"
    post Pulling   api-server-abc123 "Pulling image busybox:1.36" Normal
    post Pulled    api-server-abc123 "Successfully pulled image"  Normal
    post Scheduled api-server-abc123 "Assigned to kind-1-worker"  Normal
    post Created   api-server-abc123 "Created container app"      Normal
    ;;

  flood)
    echo "→ injecting 4 CrashLoopBackOff events over ~10s (auto-watch trigger)"
    for i in 1 2 3 4; do
      post CrashLoopBackOff "api-server-pod-$i" "Back-off restarting failed container" Warning
      sleep 2
    done
    echo "  wait ~60s for the observer tick, then check the sidebar's Watches panel"
    ;;

  *)
    echo "error: unknown mode '$MODE' (use crash | noise | flood)" >&2
    exit 2 ;;
esac
