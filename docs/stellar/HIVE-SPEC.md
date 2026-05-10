# Stellar v3 — Hive Handoff Spec

> The KubeStellar Console maintainers have a multi-agent "Hive" that swarms on issues. This spec is written for them. It documents **everything currently shipped in the `stellar-ai-pa` branch**, the **product vision**, the **non-negotiable architectural rules**, and a **prioritized list of next-level work** that takes Stellar from "very good demo" to "real Jarvis."
>
> Read end-to-end before opening any sub-issue. Don't refactor without re-reading "Architectural Invariants" — they encode hard-won lessons from the v2 build.

---

## 0. The Vision

Stellar is the **Jarvis of KubeStellar**. Not a chatbot, not a dashboard widget. A **junior engineer** that:

- **Lives in the operator's peripheral vision.** Toasts top-right, sidebar log, badges on cards. Never demands attention; always rewards a glance.
- **Reports its work in first person.** "I noticed BackOff on payments/api-server. I'm investigating. I tried RestartDeployment — it worked." Not "an action was executed."
- **Owns the boring half of operations.** Triage, dedup, first-line restarts, log pulls, "is this the same incident as before?" Frees the human for the actual hard call.
- **Knows what it doesn't know.** Escalates cleanly with a written-up case file when it can't fix something. Hands off to a deeper AI mission for the hard cases. Never silently fails.
- **Costs almost nothing to run.** Cheap local model for the 99% of events that are noise. Expensive cloud model only for the 1% that need real reasoning. Hourly batched scans, not per-event LLM calls.

The mental model: **a 24/7 junior on-call** who reads every event, files the routine stuff, restarts the obvious crash loops, and pings the senior (the user) only when it's actually stuck — with a written brief, not a raw stack trace.

This spec is about closing the gap between "demo-grade autonomous solve" (what's shipped) and "production-grade junior engineer" (the vision).

---

## 1. What's Already Built (state of `stellar-ai-pa`)

### 1.1 Backend (`pkg/stellar/*`, `pkg/api/handlers/stellar*.go`, `pkg/store/sqlite_stellar*.go`)

**Event ingestion → autonomous solve:**
- `pkg/api/handlers/timeline.go` → `StellarEventSink` interface fans every collected cluster event into `stellar.ProcessEvent`.
- `pkg/api/server.go` wires `stellarSink` into the timeline handler at startup. This is the **critical wire** — without it, events are invisible to Stellar.
- `ProcessEvent` (in `stellar.go`): writes a `critical_event` activity row, **skips `autoExecuteAction` for critical** (`autoTriggerSolve` owns them), then calls `autoTriggerSolve(ctx, event, notif, eval)`.

**The autonomous solve state machine** (`pkg/api/handlers/stellar_solver.go`):
- `AutoSolveCooldown = 5 * time.Minute`. Cooldown **only blocks when prior solve is `running`** — terminal solves (resolved/escalated/exhausted) do not claim new events for the same workload.
- Solve created in `stellar_solves` table with `eventId`, `cluster`, `namespace`, `workload`, `status='running'`.
- `broadcastSolveProgress(solveID, eventID, phase, message, percent)` emits SSE on every transition.
- **Phase 1** (20%): `investigating` — "Reading event context, checking recent activity."
- **Phase 2** (50%): `root_cause` — "Determined likely cause: <reason>."
- **Phase 3a** (75%): Deterministic restart. If `eval.Action` is in `safeAutoActions = {"RestartDeployment": true}`, dispatch via `scheduler.Dispatch`. On success → mark solve `resolved`, broadcast 100%, **return without firing a mission**.
- **Phase 3b** (75%): AI mission fallback. Broadcast `mission_trigger` envelope with `{stellarSolveId, stellarEventId, prompt, context}`. The frontend `StellarMissionBridge` picks this up and runs a real KubeStellar mission.
- `CompleteAutoMission` handler at `POST /api/stellar/solve/:solveID/complete` closes the loop: mission terminal → mapped to `resolved`/`escalated`/`exhausted` → solve row updated, final SSE broadcast.

**Provider resolution** (`pkg/stellar/observer/observer.go`, `pkg/stellar/providers/registry.go`):
- `resolveProviderForUser(ctx, userID)`: type-asserts store for `GetUserDefaultProvider`, translates `StellarProviderConfig` → `ResolvedUserProvider`. Falls back to registry default only when user has no preference.
- Smart default in registry: `STELLAR_DEFAULT_PROVIDER` env → first cloud provider with API key (anthropic → openai → groq → openrouter → together) → ollama. **Cloud beats Ollama when keys are configured.**
- Three observer call sites updated: `generateNudges`, `observeUser`, `checkWatch` all use `resolveProviderForUser`.

**Persistence** (`pkg/store/sqlite.go` + `sqlite_stellar_solves.go`):
- New tables: `stellar_solves`, `stellar_activity`.
- `ALTER stellar_executions ADD COLUMN solve_id, dedupe_key`.
- `ALTER stellar_actions ADD COLUMN bumped_at`.
- Methods: `CreateSolve`, `UpdateSolveStatus`, `IncrementSolveActions`, `GetActiveSolveForEvent`, `GetSolveByID`, `GetSolvesForUser`, `GetSolvesSince`, `GetRecentSolveForWorkload`, `LogActivity`, `ListActivity`, `BumpActionPriority`, `SupersedeAction`, `GetMemoryDedupeKey`/`SetMemoryDedupeKey`, etc.

**SSE stream** (`/api/stellar/stream`):
- Event envelope kinds: `notification`, `solve_started`, `solve_progress`, `solve_complete`, `mission_trigger`, `action_bumped`, `digest_fired`, `activity`.
- Single connection per browser session — frontend hoists via `StellarProvider`.

### 1.2 Frontend (`web/src/components/stellar/*`, `web/src/hooks/useStellar.tsx`)

**Single-source context:**
- `StellarProvider` mounted in `App.tsx` between `<MissionProvider>` and `<CardEventProvider>`. **One** `EventSource` for the whole app. Toasts work on any page.
- `useStellar()` consumes context with a graceful fallback for unparented usage.

**Mission bridge:**
- `StellarMissionBridge` (mounted in `Layout.tsx`) listens for `mission_trigger` SSE → `startMission({type:'repair', skipReview:true, context})`. Watches mission status; when terminal (`INACTIVE_MISSION_STATUSES`), POSTs `/api/stellar/solve/:solveID/complete` with derived status (`failed→escalated`, `cancelled→exhausted`, `completed→resolved`).

**Visual surface:**
- `EventCard`: progress bar (`solveStatus.percent`), `attemptCount` → "✦ Stellar tried N× — see details" badge. Hides manual buttons when `isAutoActive || isResolved`. Shows yellow "✦ Try AI mission" CTA when `isEscalated`. "Stellar is handling this — no input needed." line during auto-solve.
- `EventModal`: workload-aware narration (resolved / escalated / exhausted / active / attempt-history fallbacks). `✦ Stellar tried N×` pill in the header. "Stellar's attempts" section renders each `StellarSolve` row with outcome + relative time + action count. Falls back to legacy auto-fix notifications only when no solves exist.
- `EventsPanel`: dynamic group subtitles (`N solving · N resolved · N needs you`). Controlled-or-uncontrolled modal state.
- `StellarActivityPanel`: first-person log. Rows carrying `eventId` render as `<button>` with `details →` affordance; click → opens the matching event's modal via `onOpenEvent`. Rows without `eventId` render as plain `<div>`.
- `StellarPage`: 3-column layout (rail / events / chat); owns lifted `detailNotification` state so activity-log clicks and event-card clicks land in the same modal.
- `Toast`: container is `fixed top-6 right-6 z-toast` — top-right, app-wide.

**Derive helpers** (`web/src/components/stellar/lib/derive.ts`):
- `getSolveStatus(notification, solves, liveProgress)`: workload-aware via `workloadKeyForNotification` + `findSolveByWorkload`. Prefers running solves; ignores terminal solves older than `TERMINAL_SOLVE_STALENESS_MS = 10 * 60_000`.
- `countSolveAttempts(notification, solves)`: workload-keyed count powering the "Tried N×" badge.
- `describePhase`: phase string → label/color/percent.
- `workloadFromPodName`: strips ReplicaSet + pod suffix.

### 1.3 Demo artifacts (`demo/stellar/*`)
- `inject-events.sh`: reproducible event injection (`crash` | `noise` | `flood` modes).
- `crashloop-deployment.yaml`: pre-broken deployment that guarantees `CrashLoopBackOff`.
- `PITCH.md`: 6-beat storyboard for the recording.

### 1.4 Known shipped invariants (the user-facing contract)

| Behavior | Where enforced |
|---|---|
| Critical events auto-solve **without manual click** | `ProcessEvent` → `autoTriggerSolve` |
| Solve status visible on the **card itself**, not only modal | `EventCard` progress bar + attempt badge |
| Activity log is **first-person** ("Stellar tried…") | `pkg/api/handlers/stellar_solver.go` activity rows |
| Activity log is **clickable** → matching event modal | `StellarActivityPanel.onOpenEvent` |
| Toasts on every page, not only Stellar page | `StellarProvider` in `App.tsx` |
| User's chosen provider drives Stellar | `resolveProviderForUser` |
| Stale escalations don't poison new events | 10-min terminal staleness window + cooldown only blocks running |
| Modal narration matches card badge | `solveAttemptCount` pill + workload narration |

**These are the regression boundaries.** A Hive worker that breaks any of these has broken the demo.

---

## 2. Architectural Invariants (don't break these)

These are not preferences. Each is paid-for-in-pain from the v2 build.

### 2.1 One SSE connection per tab
`StellarProvider` is the only consumer. Components subscribe via `useStellar()`. Adding a second `EventSource` will reintroduce the "toasts don't fire on /clusters" bug. If a feature seems to need its own stream — extend the existing event envelope kinds instead.

### 2.2 Critical events never go through `autoExecuteAction`
That path was for the legacy deterministic ladder and races with `autoTriggerSolve`. Critical events route **only** through `autoTriggerSolve`, which internally decides deterministic-vs-mission. Reintroducing the dual path was the root cause of "every card escalated despite log showing auto-fixed."

### 2.3 Cooldown blocks only `running` solves
Terminal solves are **history**, not locks. A new BackOff event 12 minutes after an escalation should get a fresh solve, not inherit the escalation. `TERMINAL_SOLVE_STALENESS_MS` enforces the same on the frontend.

### 2.4 Provider resolution is per-user
`STELLAR_DEFAULT_PROVIDER` is a fallback, not a ceiling. If a user has set Anthropic in the navbar, Stellar must use Anthropic — even for background observation. The old "global registry default" pattern caused the "why is Stellar using Ollama when I picked Anthropic" bug. **Exception:** §3.2 introduces a deliberate Ollama path for cheap scanning. That is per-feature, not per-user.

### 2.5 Workload-aware status everywhere
Two BackOff cards for the same pod must share status. `workloadKeyForNotification` is the canonical key. New status surfaces (mobile, e-mail digest, anything) must use the same keying or they will lie.

### 2.6 No raw hex colors, no magic numbers, no `.join()` on possibly-undefined
See `CLAUDE.md`. Failing CI on these will waste a Hive cycle.

### 2.7 Demo mode must work for every new surface
Every endpoint and every card has a demo path. Stellar v3 features (cost dashboard, planner output, memory) must seed plausible demo data so the hosted site (`console.kubestellar.io`) and offline pitch demos still work.

---

## 3. Next-Level Work — Prioritized

The Hive should pick these up in order. Each section is a self-contained issue with **goal**, **why it matters**, **shipping definition**, and **suggested wedge** (the smallest first PR that proves it works).

### 3.1 Token economics: hourly batched scans + on-demand retry  *(P0 — biggest cost lever)*

**Goal.** Replace the current "LLM call per event" pattern with a **scheduled batch** that runs once per hour and a **manual retry** the user can fire from the UI.

**Why.** Today every observer tick calls the user's provider. A real cluster fires thousands of events per hour. At Anthropic rates that's tens of dollars/day per user — unshippable. Most events are noise; batching them lets the LLM see the *shape of an hour* at once (which is also cheaper *and* a better signal than seeing each event in isolation).

**Shipping definition.**

1. **Scheduler.** New goroutine in `pkg/stellar/observer/observer.go` with a configurable interval (default `1h`, env `STELLAR_SCAN_INTERVAL`). On tick:
   - Pull every unprocessed event since the last scan (new `stellar_events_scanned_at` column or per-user cursor).
   - Group by `(cluster, namespace, workload)` and **collapse** duplicates: keep count + first/last seen + a representative message.
   - Build a single prompt: "Here are 47 grouped events from the last hour. Triage: which are noise, which are recurring, which need an autonomous solve? Return JSON."
   - Make **one** call per user (not per event) to the user's chosen provider (§2.4).
   - For each "needs solve" entry, kick `autoTriggerSolve` as today.
2. **Manual retry.** New endpoint `POST /api/stellar/scan/now` (auth: any logged-in user, target: self). UI button in `StellarHeader`: "Rescan now". Resets the scan cursor *forward* (so we don't re-process old events) and runs a scan immediately. Shows a spinner via existing SSE `activity` events ("rescan_started", "rescan_complete").
3. **Critical bypass.** Severity `critical` still triggers an immediate solve — we don't make on-call wait an hour to learn the cluster is on fire. Implement as a fast pre-check in `ProcessEvent` that skips the batch queue for critical.
4. **Cost log.** Every LLM call writes to `stellar_provider_usage` (input tokens, output tokens, provider, model, $-estimate). Surface on a new "Stellar cost" tab in settings.

**Suggested wedge.** PR 1: add the scan goroutine, batched prompt, and `POST /scan/now` — feature-flagged with `STELLAR_BATCHED_SCAN=true`, no UI yet. PR 2: usage log + cost panel. PR 3: flip the flag on and remove the per-event LLM path.

**Don't break.** Critical-event auto-solve latency must remain sub-5-second. Demo mode must seed a plausible cost panel.

---

### 3.2 Cheap-local scanner: Ollama for watchers and triage  *(P0 — paired with 3.1)*

**Goal.** The **scanner** (the "is this noise?" filter) runs on Ollama, **locally**. The **solver** (the "now actually fix this") runs on the user's chosen cloud provider.

**Why.** Triage is a tiny-context, high-frequency task — perfect for a 7B local model. Solving needs a frontier model for tool use, multi-step planning, and structured output. Splitting them by skill collapses cost by ~50× without hurting quality, because the local model is just deciding "interesting / not interesting," not generating fix plans.

**Shipping definition.**

1. **Provider routing.** New helper `ResolveScannerProvider(ctx, userID)` in `pkg/stellar/providers/registry.go` — **always returns Ollama** when reachable; only falls back to the user's provider when Ollama is unhealthy. **Decoupled from `resolveProviderForUser`** which continues to govern the solver/chat paths.
2. **Health check.** Ping `http://localhost:11434/api/tags` at startup and on a 5-min heartbeat. Cache result. If unhealthy → degrade gracefully to the user's provider for scanning *and* surface a soft warning in the activity log ("Scanner fell back to Anthropic — local Ollama unreachable").
3. **Setup affordance.** When Ollama is unreachable and the user is on the Stellar settings page, show a one-liner: "Run `ollama pull llama3.2:3b` to enable free local scanning. Stellar will fall back to your cloud provider in the meantime."
4. **Wire to §3.1.** The batched scanner uses `ResolveScannerProvider`. The solver (`autoTriggerSolve` Phase 3b mission) uses `resolveProviderForUser`. Two providers, two purposes, no confusion.
5. **Model contract.** Scanner prompt MUST be tested against `llama3.2:3b` and `qwen2.5:3b`. Both must produce parseable JSON for the triage payload defined in §3.1. If a model fails the contract, log it and fall back; don't ship a scanner prompt that only works on Claude.

**Suggested wedge.** PR 1: `ResolveScannerProvider` + health check + log line, scanner still uses cloud (no behavior change). PR 2: flip scanner to Ollama, add fallback path. PR 3: settings page affordance.

**Don't break.** §2.4 — solver must still use the user's chosen provider. This is **only** for scanning.

---

### 3.3 Memory: "Stellar remembers what fixed this last time"  *(P1)*

**Goal.** Stellar should recognize "we've seen this exact problem before" and either **apply the past fix immediately** (when confidence is high) or **show the past fix as the top recommendation** (when not).

**Why.** Half of operations is pattern recognition. A junior who never remembered yesterday's incident is a bad junior. This is also the most pitch-worthy "feels like Jarvis" feature — "Stellar fixed this exact crash loop on Tuesday; reapplying that fix" lands in a demo.

**Shipping definition.**

1. **Incident table.** New `stellar_incidents` table: `id`, `user_id`, `signature` (hash of cluster+namespace+workload+reason+top-message-tokens), `first_seen`, `last_seen`, `count`, `resolution_status`, `winning_action`, `winning_action_payload`, `notes` (LLM-written postmortem). One row per *kind* of problem.
2. **Signature builder.** Deterministic hash function. Same crash loop on `api-server` two days apart = same signature. **Cluster-local** by default; an env flag enables cross-user signatures for KubeStellar Enterprise.
3. **Pre-solve lookup.** Before Phase 2 of `autoTriggerSolve`, query the incident table by signature. If a row exists with `winning_action` and `count >= 2`:
   - Jump directly to the winning action ("Stellar remembers this — applying RestartDeployment, which worked the last 3 times").
   - Skip the LLM round-trip for root-cause. Massive cost + latency win.
4. **Postmortem.** On solve `resolved`, write a 1-paragraph postmortem to `incidents.notes` via the user's provider. On `escalated`, write what was *tried* and why it failed.
5. **UI.** New "Memory" section on the Stellar page — a 2-column grid: known incident signatures + their winning fixes. Each row clickable → full postmortem in a modal.

**Suggested wedge.** PR 1: schema + signature builder + write-on-resolve, no read path yet. PR 2: pre-solve lookup behind `STELLAR_USE_MEMORY=true`. PR 3: UI. PR 4: cross-user signatures behind a separate env flag.

**Don't break.** Memory must be per-user by default — sharing fix history across orgs is a privacy bomb.

---

### 3.4 Approval ladder: bumping repeat fixes from auto → ask  *(P1)*

**Goal.** If Stellar has restarted the same workload 3× in 24h and the issue keeps coming back, **stop restarting on autopilot** and require the user's approval the next time. After approval, count resets.

**Why.** Restart-as-cure-all is a footgun — it hides real bugs and burns through pod-startup budgets. A junior who keeps restarting the same crashing service without escalating is a bad junior.

**Shipping definition.**

1. Reuse the existing `stellar_actions.bumped_at` column.
2. In `autoTriggerSolve` Phase 3a, before dispatching: count successful auto-restarts of this workload in the last 24h via `GetExecutionsByDedupeSince`. If `>= 3`, **don't dispatch**; instead create a pending action requiring approval, set `bumped_at = now`, broadcast `action_bumped` SSE.
3. UI: pending action card already exists — extend it to show "Stellar restarted this 3× already in 24h and the issue came back. Approve another restart, or click 'Try AI mission' for deeper diagnosis."
4. After user approval, the next 24h window resets for that workload.

**Suggested wedge.** Single PR — backend count + bumped-action path + frontend copy update. ~200 LOC.

---

### 3.5 Cost dashboard + per-feature LLM budgets  *(P1)*

**Goal.** Show the user a real-time meter of "how much has Stellar cost me today?" Allow per-feature budgets (e.g., "$2/day for scanning, $10/day for solving").

**Why.** Cost anxiety is the #1 blocker to autonomous AI adoption in operations. Surfacing it as a knob the user controls = trust. Hidden cost = uninstalled product.

**Shipping definition.**

1. `stellar_provider_usage` table from §3.1.
2. New `/api/stellar/cost` endpoint: today / week / month rollups + per-feature breakdown.
3. Settings page card: budget sliders per feature (scanner / solver / chat). Soft caps (warn + keep working). Hard caps (refuse + log).
4. Activity log row when a hard cap fires: "Paused scanning — daily budget reached. Resets at midnight UTC."

**Suggested wedge.** PR 1: usage logging. PR 2: rollup endpoint + read-only dashboard. PR 3: budgets.

---

### 3.6 Real RCA: log pulls before root-cause phase  *(P2)*

**Goal.** Today Phase 2 (`root_cause`) is a deterministic string from the event reason. Make it real: pull the last 100 lines of the affected pod's logs via the kc-agent bridge and feed them to the LLM along with the event.

**Why.** "Container exits non-zero on startup" is true and useless. "Container exits non-zero on startup; logs show `panic: nil pointer dereference at handler.go:42`" is true and actionable.

**Shipping definition.**

1. New helper `pkg/stellar/diagnose/logs.go`: given `(cluster, namespace, pod)`, calls the existing kc-agent `kubectl logs` route, tails last 100 lines + previous container.
2. In `autoTriggerSolve` between Phase 1 and Phase 2, pull logs if event is pod-related. Pass to the LLM with the event in a single prompt.
3. Persist log snippet on the `stellar_solves` row (truncated to 4KB) so the modal can show it in "Stellar's attempts" → expandable.
4. Token budget: if logs > 4KB, send first 2KB + last 2KB with a `[... truncated ...]` marker.

**Suggested wedge.** PR 1: log fetcher + persistence, no UI change. PR 2: feed to LLM. PR 3: surface in modal.

---

### 3.7 Multi-step planner: "diagnose → propose → apply → verify"  *(P2)*

**Goal.** Promote Phase 3b from "trigger a generic mission" to a **Stellar-specific 4-step plan** rendered live in the UI.

**Why.** The mission system is great for ad-hoc requests but generic. A Stellar-owned plan UI lets us narrate ("step 2 of 4: applying the proposed kubectl rollout restart"), surface intermediate state, and give the user a one-click abort.

**Shipping definition.**

1. New `stellar_plans` table linked to a solve.
2. Plan shape: ordered list of `Step{kind, description, status, started_at, ended_at, output}`. Kinds: `diagnose`, `propose`, `apply`, `verify`, `report`.
3. New SSE event `plan_step` mirroring `solve_progress` but at step granularity.
4. UI: when a solve has a plan, EventModal renders an inline checklist with live status icons. Abort button on running steps.

**Suggested wedge.** PR 1: schema + write-side instrumentation (Phase 3b emits steps). PR 2: SSE wiring + read endpoints. PR 3: UI.

---

### 3.8 Cross-cluster correlation  *(P2)*

**Goal.** If five different clusters all start firing `FailedMount` on PVCs in the same 60-second window, that's a **storage incident**, not five independent events. Stellar should detect, group, and report it as one.

**Why.** Multi-cluster is KubeStellar's whole pitch. Stellar needs to use that signal.

**Shipping definition.**

1. Backend correlation window: sliding 60-second buckets keyed by `(reason, k8sObjectKind)`. Threshold `>= 3 clusters` flips it into a correlated incident.
2. New SSE event `correlated_incident` with the list of affected clusters.
3. Toast: "⚠ Storage incident — 5 clusters reporting FailedMount in last 60s. Inspect →"
4. Single modal aggregating all five events.

**Suggested wedge.** Backend-only PR with feature flag. UI follows once detection is calibrated against real noise.

---

### 3.9 The "Stellar digest" — daily 8am email + activity feed  *(P3)*

**Goal.** A 5-bullet daily summary: "Yesterday I noticed 1,847 events, filtered 1,839 as noise, auto-resolved 6, escalated 2 (here they are)." Surfaced as a card on dashboard login + optionally e-mailed.

**Why.** This is the "I went on vacation; tell me what happened" feature. Single biggest reason operators reopen the console after a long weekend.

**Shipping definition.**

1. Cron at 08:00 user-local. Rolls up last 24h of `stellar_activity` and `stellar_solves`.
2. LLM call (uses scanner provider — cheap, batched) to write a 5-bullet narrative.
3. Persisted as a `digest` notification.
4. Optional e-mail via existing notification channel (already in the codebase for OAuth flows).

**Suggested wedge.** Single PR — cron + rollup + persisted notification. E-mail is its own follow-up.

---

### 3.10 Voice + ambient mode  *(P3 — moonshot)*

**Goal.** Spoken update on a hotkey (`Cmd+Shift+S`): "Hey Stellar, what's the cluster doing?" → 10-second TTS reply from the activity log.

**Why.** The Jarvis test. If we ship voice, we ship the vision.

**Shipping definition.**

1. Browser SpeechSynthesis API for output. Hotkey binding in `Layout.tsx`.
2. New endpoint `GET /api/stellar/spoken-update` returns a 2-sentence summary (uses scanner provider).
3. No voice **input** in v1 — push-to-speak only. Voice in is a privacy and accuracy can-of-worms.

**Suggested wedge.** Hotkey + spoken-update endpoint + SpeechSynthesis. One PR. Treat as polish, not a core feature.

---

## 4. Operational requirements

### 4.1 Telemetry
- Every Stellar code path must increment a Prometheus counter (`stellar_solves_total`, `stellar_scans_total`, `stellar_provider_calls_total{provider, feature}`).
- Histograms for solve latency and per-call LLM latency.
- Activity-log rows are the **user-facing** telemetry; Prometheus is the **operator-facing** telemetry. Both must be written.

### 4.2 Feature flags
Every section above ships behind an env var (`STELLAR_BATCHED_SCAN`, `STELLAR_USE_MEMORY`, `STELLAR_OLLAMA_SCANNER`, `STELLAR_BUDGETS_ENFORCED`). Default to off. Demo recordings need a stable surface; we don't want a half-shipped planner breaking the pitch the day a feature lands.

### 4.3 Test coverage
- Backend: every new SQL method gets a table-driven test in `pkg/store/sqlite_test.go`.
- Frontend: every new card or modal section gets a visual-regression spec under `web/e2e/visual/` per `CLAUDE.md`. Baselines committed.
- Integration: at least one Playwright spec per feature that drives it end-to-end in demo mode.

### 4.4 Documentation
- Every new env flag, every new endpoint, every new SSE kind: add to this spec under §1 (state) before merging.
- The `STELLAR.md` top-level file is the user-facing intro; `docs/stellar/HIVE-SPEC.md` (this file) is the engineering reference. Keep them in lockstep.

---

## 5. Anti-goals (don't build these)

- **A chatbot UI.** The chat panel that exists is a control surface, not the product. Don't promote it. The product is the autonomous loop, the log, and the toasts.
- **A "settings page for the LLM."** Hidden complexity. The provider knob in the navbar is enough. Don't add temperature sliders, system prompt editors, etc.
- **A second SSE channel.** One stream. Extend the envelope.
- **Mocking the LLM in tests.** Tests run in demo mode with deterministic seed data. Mocking the LLM creates the same drift the user's seen elsewhere; demo-mode fixtures are the contract.
- **Cross-tenant memory sharing without a flag.** §3.3 caveat. Per-user by default forever.
- **Deterministic action ladders for non-restart cases.** Phase 3a's `safeAutoActions` is intentionally a **single-entry whitelist**. The temptation to add `ScaleDeployment` or `DeletePod` will be strong. Resist; route those through Phase 3b's mission system where the LLM can reason about whether they're safe in context. The deterministic path exists only because "rollout restart" is *empirically* never the wrong thing to try first.

---

## 6. Glossary

| Term | Meaning |
|---|---|
| **Solve** | One end-to-end attempt by Stellar to handle one event. A row in `stellar_solves`. Goes `running → resolved | escalated | exhausted`. |
| **Workload key** | `(cluster, namespace, workload)` — the canonical identity for status-sharing across events. |
| **Scanner** | The cheap pass that decides "noise or signal?" §3.2 says this runs on Ollama. |
| **Solver** | The expensive pass that decides "what do we do about it?" Runs on the user's chosen provider. |
| **Mission** | KubeStellar's existing autonomous agent task. Stellar triggers a mission for Phase 3b. |
| **Phase 3a / 3b** | Deterministic restart (3a) vs AI mission (3b). The autonomous loop picks one or the other based on `safeAutoActions`. |
| **Activity** | First-person log entries Stellar writes about what *it* did. Distinct from notifications (what the *cluster* did). |
| **Digest** | A periodic LLM-written summary (§3.9). |

---

## 7. The single-question test

For every PR a Hive worker opens against this codebase, answer one question:

> *"Does this make Stellar feel more like a junior engineer who works in the background, or more like a dashboard widget the user has to click?"*

If the answer is "widget," send it back. The whole point is the engineer.
