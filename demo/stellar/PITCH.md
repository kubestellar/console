# Stellar — pitch deck (speakable, one page)

## The problem

- **Alert fatigue.** Prometheus / k8s events dump 200/hour. ~5 actually matter. Operators tune it out.
- **"What happened while I was away?"** Coming back to a cluster means scrolling Slack and `kubectl logs`. No one does it well.
- **Tab-hopping to kubectl.** Even after you know what's broken, the fix is 4 tabs and a copy-paste of the deployment name.

## The solution

**Stellar is a persistent AI personal assistant embedded in KubeStellar Console. It watches your clusters 24/7 through *your* LLM, surfaces only what matters, and lets you fix it with one click.**

Four things nothing else in the pane does:

1. **Bring your own LLM.** Claude, OpenAI, Ollama local. Your key, your data, your bill.
2. **Executes real kubectl.** Not a chatbot — clicking *Restart* calls `Deployments().Update()` against the real cluster.
3. **Proactive nudges.** A 60-second observer loop scans events, auto-watches recurring/critical resources, and pushes unprompted: *"I noticed api-server crashed 3 times in 10 minutes. Want me to restart it?"*
4. **Multi-cluster inbox.** All clusters, one sidebar, one filter.

## Live demo storyboard (~3 minutes)

| Beat | Time | What happens | What you say |
|------|------|--------------|--------------|
| 1. Login | 0:00 | Open console, open Stellar sidebar — *"Watching N clusters. 0 unread."* | "Stellar was running while I was at lunch." |
| 2. Filter | 0:20 | `./inject-events.sh noise` then `crash` — only the crash card appears | "4 events filtered by *my* LLM. Never woke me up." |
| 3. Investigate | 0:50 | Click *Investigate* → chat pre-fills → LLM pulls live pod state | "It queried the cluster. I didn't write the query." |
| 4. **Unprompted nudge** | 1:20 | After 60s observer tick, a new card slides in: *"Stellar observation: api-server crash-looping. Consider rollout restart."* | **"I didn't ask. It noticed."** |
| 5. One-click restart | 1:50 | Click *Restart* → chip says *"Will execute: RestartDeployment …"* → hit Enter → `kubectl get pods -w` shows roll | "Real `Deployments().Update()`. Not a hallucination." |
| 6. Audit | 2:30 | Show audit log / memory entries — every nudge, every action recorded | "Compliance-safe. And it remembers — tomorrow's nudge will say *'this happened yesterday too.'*" |

## Why now / why us

- KubeStellar already owns the multi-cluster substrate (kubeconfig bridge, MCP, agent).
- Stellar is the **product layer** on top — the part operators come back to.
- No competing OSS console has a real, executing AI loop. Datadog/Grafana stop at "AI insights" — Stellar takes the action.

## What we want

`<TODO: your ask — pilot users? headcount? integration partners? funding?>`

---

## Demo dry-run checklist (do this once before recording)

- [ ] `./startup-oauth.sh` — backend :8080, frontend :5174.
- [ ] `export STELLAR_TOKEN=…` and `export STELLAR_CLUSTER=kind-1`.
- [ ] `kubectl apply -f demo/stellar/crashloop-deployment.yaml` — wait for `CrashLoopBackOff`.
- [ ] `./demo/stellar/inject-events.sh noise` → sidebar stays empty.
- [ ] `./demo/stellar/inject-events.sh crash` → 1 critical card appears within 2s.
- [ ] `./demo/stellar/inject-events.sh flood` → wait ~60s → unprompted nudge appears.
- [ ] Click *Restart* on the crash card → terminal `kubectl get pods -n payments -w` shows the pod recycle.
- [ ] If the nudge doesn't fire (hourly dedup), run:
  `sqlite3 ./data/console.db "DELETE FROM stellar_notifications WHERE type='observation';"`

If all seven boxes tick on the second take, you're recording-ready.
