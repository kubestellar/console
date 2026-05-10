# Stellar — Spec Prep Brief

**Use this document as the input to Claude web Planning.** Paste the whole thing in, then ask Claude to produce a detailed implementation spec for the next phase of work. The vision sits at the top because everything else is downstream of it — if the spec doesn't reinforce the JARVIS-to-Iron-Man model, push back on the spec.

---

## The vision (read this first; everything else serves it)

**Stellar is JARVIS for a Kubernetes operator who already knows everything.**

Not a tutorial. Not a babysitter. Not a dashboard. The user is technical, opinionated, and competent — they don't need Stellar to *explain* Kubernetes to them. They need Stellar to **handle the busy parts proactively**, **report back in one line**, and **only interrupt when something genuinely ambiguous needs their judgment**.

The reference experience is Iron Man's JARVIS:
- *"Sir, I've restarted the api-server in payments. It's healthy again. The auth-service is showing the same crash signature — should I handle that one too, or do you want to look first?"*

What this rules out:
- Verbose explanations of what `CrashLoopBackOff` means (the user already knows).
- Approval-gated workflows for things that are obviously safe (the user trusts a senior engineer to just restart a pod).
- Decorative AI features that don't actually change cluster state.
- "Click to investigate" buttons that just open a chat window — investigation should happen on its own.

What this demands:
- **Stellar acts first, reports second.** Critical issues with a clear fix get fixed before the human sees them. The notification is *"I did this, here's the result"*, not *"Want me to do this?"*
- **Attempts are visible.** If Stellar tried something and it didn't hold, that history is front-and-center: *"tried 3×, all failed, paused for your input."*
- **One-line summaries.** Every panel should answer "what's the state?" in a glance, with detail one click away — not three.
- **Trust escalation.** First occurrence: just do it. Recurrence: ask first, because if the obvious fix didn't work the problem isn't obvious.
- **Sticky usage.** Operators come back daily not because Stellar tells them what's broken (alerting tools do that) but because Stellar tells them what's been *handled*. The value is in the long tail of issues the human never had to think about.

Why this matters for KubeStellar: multi-cluster is a fragmentation problem. Stellar is the integrator that makes the fragmentation invisible — one inbox, one assistant, one operator who feels like they have an army of juniors handling the obvious problems across every cluster.

---

## What's built today (as of this handoff)

### Backend (Go / Fiber)

**Event ingestion pipeline** — `pkg/api/handlers/stellar.go` → `ProcessEvent()`:
1. Dedup by `dedupeKey` (cluster:namespace:resource)
2. LLM evaluator (`pkg/stellar/evaluator.go`) classifies severity + recommends action; falls back to deterministic rules for known reasons (`BackOff`, `CrashLoopBackOff`, `FailedScheduling`, etc.)
3. Observer (`pkg/stellar/observer/observer.go`) tracks recurrence; auto-creates `StellarWatch` entries when recurring threshold (3) is exceeded
4. Notification persisted + broadcast over SSE
5. Auto-tend:
   - First occurrence + has `RecommendedAction` → `autoExecuteAction()` runs `scheduler.Dispatch()` directly. Audit logged. Success/failure notification created and broadcast.
   - Recurring occurrence → `queueAutoTendAction()` creates `pending_approval` action; user must click Approve.
   - Only `RestartDeployment` is on the safe-auto allowlist today. Scale/Delete always go through approval.

**Action scheduler** — `pkg/stellar/scheduler/dispatch.go`:
- Exported `Dispatch(ctx, k8sClient, action)` runs the actual kubectl operations (rollout restart, scale, etc.)
- Used by both the approval flow (`ExecuteAction`) and auto-execute path (`autoExecuteAction`)

**Background workers** — `StartBackgroundWorkers()`:
- `dueTaskReminderLoop` — 30s ticker scans `GetOverdueOpenTasks()` and fires `⏰ Task due` notifications when scheduled tasks come due. Dedup-keyed so retries are idempotent.

**SSE broadcaster** — `Stream` handler at `/api/stellar/stream`. All write paths now broadcast: `ProcessEvent`, `autoExecuteAction`, `queueAutoTendAction`, `fireDueTaskReminders`. (Pre-fix, only ProcessEvent broadcast — auto-fix notifs were invisible to the live UI. That bug is fixed.)

**Storage** — SQLite WASM. Tables: `stellar_notifications`, `stellar_actions`, `stellar_tasks`, `stellar_watches`, `stellar_executions`, `stellar_audit_entries`, `stellar_memory_entries`, `stellar_observations`. `dedupe_key` indexes on notifications.

### Frontend (React / TS)

**Route** — `/stellar` (the full-page Stellar workspace). Three columns:
- Left rail: header + tasks + Stellar Suggests (proactive task catalog) + Watches
- Center: severity-grouped Events panel
- Right: Chat (LLM with MCP cluster tools)

**Components**:
- `EventCard` — derives importance badge, tag chips, narration preview, clickable to open `EventModal`. Action buttons: 🔍 Investigate / ↻ Restart / ✦ Solve.
- `EventModal` — deep-dive with "What happened / Why / What we're doing / Stellar's attempts / Recommendations / Related events / Tags." The "What we're doing" line is dynamic: detects pending approvals, completed auto-fixes, prior failed attempts.
- `WatchCard` / `WatchDetailModal` — trend arrow, sparkline, 24h count, deep-dive modal.
- `RecommendedTasksPanel` — 8 curated security/observability/reliability tasks with schedule picker (Do now / 1h / Tomorrow / 3 days / 1 week). Creates real `StellarTask` with `dueAt`.
- `EventsPanel` — severity bands (CRITICAL / HIGH PRIORITY / INFO) + dedicated "✦ Resolved by Stellar" band. **No generic "Resolved" tray** — dismissed cards disappear from view entirely (matching the JARVIS principle of not cluttering with history).
- `StellarToastBridge` — cross-page toasts on critical/warning events; auto-fix toasts always fire (even on /stellar) because "Stellar acted" is a wow moment.

**Hooks**:
- `useStellar()` — owns SSE connection, optimistic mutations for ack/dismiss/approve/reject, sorted notifications/actions/tasks/watches/observations.
- `lib/derive.ts` — shared importance / tag / trend / sparkline / short-reason helpers. Single source of truth for derived UI signals.

### The action loop today (what works end-to-end)

```
K8s event → kc-agent forwards → POST /api/stellar/events/ingest
   ↓
ProcessEvent: dedup → evaluate → observer → notification (SSE'd)
   ↓
If !isRecurring + RecommendedAction:
   autoExecuteAction → scheduler.Dispatch → kubectl rollout restart
                    → audit entry + execution record + "Stellar auto-fixed" notif (SSE'd)
                    → green success toast
                    → card lands in "✦ Resolved by Stellar" band
If isRecurring:
   queueAutoTendAction → pending_approval action + "Stellar suggests" notif
                       → approval card in "⚠ Approval required" band
                       → user clicks Approve → scheduler.Dispatch
```

---

## What's broken today (visible in the screenshot you showed me)

1. **Recurring/cached events don't get auto-attempted.** The screenshot shows a `CrashLoopBackOff` on `kubescape/kubevuln` with the modal saying *"Standing by — click Investigate..."* — meaning Stellar never ran an auto-fix attempt. Two probable causes:
   - The event arrived recurring (observer threshold already passed before the toast bridge was watching), so it went through `queueAutoTendAction` instead of `autoExecuteAction`. The approval card may or may not have been created, but either way the modal isn't showing it.
   - Or: the evaluator didn't produce a `RecommendedAction` because the LLM was unavailable and the fallback didn't trigger for this reason string.
2. **No retroactive evaluation of cached events.** Events that arrived before the user opened `/stellar` come down via the initial state fetch — but they're not re-evaluated. They sit there with no action attempted, no narration, no Stellar fingerprint.
3. **Toast misses on fresh page-load.** First SSE connection sometimes returns red for the first few requests (auth race). Toast bridge has a 10s mount-tolerance gate that suppresses notifications older than mount-time-minus-10s; that gate can swallow legitimately new events delivered during the initial state hydration.
4. **The narration before the fixes I just made was static.** Now it's dynamic — detects prior attempts and reports them. But the underlying issue (Stellar didn't *make* an attempt for this event) remains.

---

## The gap between today and the vision

| Vision | Current state | Gap |
|---|---|---|
| Stellar acts on every actionable event | Acts only on first occurrence with a clear `RecommendedAction` | Recurring events with no human action go silent; cached events on page-load aren't tended |
| Stellar shows what it tried | Auto-fix success notif lands in "✦ Resolved" band; failed attempts surface in modal's "Stellar's attempts" section | No always-visible attempt history per workload; the user has to open the modal to see it |
| Stellar tries → fails → escalates → asks | Tries once → on recurrence demotes to approval | No multi-attempt loop, no "I tried three different fixes and none worked, here's what I'd try next" |
| One-line state per workload | Watch cards show trend + 24h count + sparkline | No "Stellar status" per workload (`acting / waiting / failed / healthy`); no aggregate "Stellar is currently handling X across Y clusters" |
| Solve = AI runs a full mission | Solve button prefills chat with a comprehensive prompt; user runs LLM with MCP tools | Solve isn't headless — user has to watch the chat. No server-side LLM-loop that executes investigate → act → verify autonomously |
| Recommended tasks actually run | Tasks with `dueAt` fire a reminder notification | No execution. Reminder is a notification, not a kicked-off mission. Tasks remain user-driven. |
| Proactive cross-cluster intelligence | Notifications scoped per cluster | No "the auth-service across all 3 clusters is showing the same signature" insight |
| Stickiness mechanism | First-time-user "wow" — auto-fix toast | No daily-return loop. After the wow, why does the operator come back tomorrow? Needs a digest / a recap / a "here's what I did last night" |

---

## What I want from the next spec

Use the Planning tool in Claude web to design **the headless solve loop and the daily recap**. Those are the two things that turn Stellar from "neat demo" into "operator opens this tab every morning." Specifically:

### 1. Headless Solve loop (server-side AI mission)

When the user clicks **✦ Solve** on an event — or when Stellar decides on its own to escalate a recurring issue from "approval-needed" back to "auto" because it now has enough confidence — a server-side loop should run:

```
loop until resolved or budget exhausted:
  read pod logs (last N lines)
  read pod describe output
  read recent deployment events
  read related notifications (prior attempts)
  → LLM call: "given this state, what is the SAFEST single next action?"
  if LLM returns "no safe action" → escalate to user
  dispatch the action via scheduler
  wait 15s
  re-read pod status
  → LLM call: "did this resolve? what next?"
  notify user with one-line progress: "tried X. status: Y. next: Z."
end loop
```

Constraints:
- Hard budget: max 5 actions per loop, max 3 minutes wall-clock, max $0.50 LLM spend per loop.
- Allowed actions: restart, scale, rollback. Anything else escalates to user.
- Every step gets an audit entry.
- Every notification goes through the existing SSE broadcaster.
- The loop is one goroutine per active solve; multiple solves can run concurrently.

### 2. Daily recap

Every morning (configurable), Stellar generates a one-screen recap:
- *"Overnight: handled 12 issues across 4 clusters. 3 still need your input. 1 task scheduled for today."*
- Clickable: each handled issue → modal with what happened, what Stellar did, current state.
- Posted as a special `digest` notification that pins to the top.
- Generated via a daily cron (same `dueTaskReminderLoop` pattern).

### 3. Attempt history surfaced per workload

In `WatchCard` and `WatchDetailModal`, add a "Stellar's track record" line:
- *"Stellar restarted this 3× in 24h. 2 succeeded, 1 paused for input."*
- Pulled from the same `StellarAttempt` derivation I just wired into `EventModal`.

### 4. Re-evaluation of pending events

On startup, ProcessEvent should re-evaluate any open `pending_approval` action whose original event is now > 1 hour old:
- If the resource is now healthy → cancel the action (`status='superseded'`)
- If the resource is still unhealthy → bump the action to the top of the user's view
- Notification: *"Stellar reviewed 4 stale approvals. 2 self-resolved. 2 still need you."*

---

## Constraints to bake into the spec

- **No new external services.** Everything must run inside the existing console binary + frontend bundle. No external workers, no Redis, no message bus. SQLite + goroutines is the architecture.
- **No new LLM providers in the loop.** Use whatever the user has configured under `/api/stellar/providers`. Token-budget must respect existing per-user limits.
- **Demo mode parity.** The hosted console (Netlify Functions) cannot run the solve loop (no kubectl access). Spec must define how the UI behaves in that environment — probably "scheduled but not executed; backend-only feature."
- **No new state libraries.** React Context + the existing `useStellar` hook.
- **CLAUDE.md rules apply.** No magic numbers, dedup clusters, secrets in env only, etc. The spec should not violate any of these.

---

## Files the spec needs to be aware of

```
Backend
  pkg/api/handlers/stellar.go        — ProcessEvent, autoExecuteAction, queueAutoTendAction, StartBackgroundWorkers
  pkg/api/server.go                  — SSE route registration, bootstrap
  pkg/stellar/evaluator.go           — LLM + fallback classification
  pkg/stellar/observer/observer.go   — recurrence tracking
  pkg/stellar/scheduler/dispatch.go  — kubectl action execution
  pkg/store/sqlite_stellar.go        — all Stellar tables; GetOverdueOpenTasks added recently
  pkg/agent/                         — LLM provider abstraction (Claude / OpenAI / Gemini)
  pkg/mcp/                           — Kubernetes MCP bridge

Frontend
  web/src/hooks/useStellar.ts        — SSE connection, optimistic mutations
  web/src/components/stellar/
    StellarPage.tsx                  — three-column layout
    EventCard.tsx                    — card chrome (tags, importance, narration preview)
    EventModal.tsx                   — deep-dive with attempts section (just added)
    EventsPanel.tsx                  — severity grouping + ✦ Resolved by Stellar band
    WatchCard.tsx + WatchDetailModal.tsx
    RecommendedTasksPanel.tsx        — proactive task catalog
    StellarToastBridge.tsx           — cross-page toasts
    lib/derive.ts                    — shared derivations
  web/src/types/stellar.ts           — type contracts
```

---

## Tone for the spec

Write it like you're briefing a senior engineer with strong opinions. No motivation paragraphs ("Why is this important?"), no implementation-detail walls of code, no JSON schema dumps unless the API contract is genuinely non-obvious. Spec should be 3 things per feature:

1. **What changes (user-visible).**
2. **What changes (architecture).**
3. **What we explicitly are not building.**

Keep it short. The vision section at the top of this brief is the longest thing you should let pass through.

---

## What the pitch demo needs to feel like (so you know when the spec is right)

Three minutes. Two people in the audience. The screen recording reads as:

1. *(0:00)* — Operator opens `/workloads`. A pod is crashing in cluster `kind-1`.
2. *(0:12)* — A green toast slides in: **"Stellar auto-fixed: RestartDeployment on payments/api-server."** Operator nods, doesn't even click.
3. *(0:30)* — Pod crashes again. Different toast, yellow: **"Stellar tried this 2× — paused for your input."** Operator clicks through to `/stellar`.
4. *(0:50)* — The event modal shows Stellar's attempts in red and green. The operator reads "tried restart twice, both failed, container exit code 1." They click **✦ Solve**.
5. *(1:05)* — The chat begins streaming. Stellar reads the pod's full logs, identifies a missing ConfigMap. It tries to patch — fails on RBAC. It reports back: *"I can't fix this without permissions to edit ConfigMaps. Should I escalate, or do you want to handle it?"*
6. *(1:40)* — Operator goes back to `/workloads`. The dashboard shows **"3 issues handled overnight by Stellar"** — one click, modal with the night's recap.
7. *(2:10)* — Operator opens "Stellar Suggests," picks **"Install Falco"**, schedules it for tomorrow morning. Stellar confirms. Operator closes the laptop.

If the spec produces a system where this demo works on a real cluster on the first take, you've got the right spec.

---

**End of brief.** Now paste this into Claude web Planning and ask for the spec. Pin the vision section at the top of every response you get back — that's the only thing that keeps the spec honest.
