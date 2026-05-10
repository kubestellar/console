# Stellar — AI Persistent Operations Assistant for KubeStellar Console
## Implementation Specification for Codex

---

## 1. FEASIBILITY ANSWER

**Yes, this is fully buildable.** Here is the honest breakdown:

| Capability | Feasibility | Notes |
|---|---|---|
| Persistent agent watching all clusters | ✅ Fully feasible | Background workers + k8s informers/watchers |
| Proactive updates and summaries | ✅ Fully feasible | Event-driven, scheduled digest jobs |
| Scheduled cluster actions (deletion, scaling, etc.) | ✅ Fully feasible | CronJob-backed mission execution via k8s API |
| Tool execution (helm, kubectl, etc.) | ✅ Fully feasible | Sandboxed exec with RBAC enforcement |
| Memory of past events and incidents | ✅ Fully feasible | Postgres + vector store for semantic recall |
| Multi-cluster awareness | ✅ Fully feasible | KubeStellar already handles multi-cluster context |
| "Junior engineer" proactive narration | ✅ Fully feasible | LLM-generated summaries on event triggers |
| Voice interface | ⚠️ Optional / Phase 3 | Web Speech API + streaming TTS |

The hard parts are not technical impossibilities — they are engineering discipline problems: persistence, auditability, safe execution, and making the LLM narration feel natural rather than spammy.

---

## 2. SYSTEM OVERVIEW

Stellar transforms the existing KubeStellar Console "AI Missions" feature from a prompt-response tool into a **continuously running operational assistant** that:

- Watches all clusters 24/7
- Proactively surfaces anomalies, events, and drift
- Executes scheduled and on-demand actions
- Remembers past incidents and references them in context
- Communicates like a junior engineer giving shift handoffs

The mental model: **Stellar is a junior SRE who never sleeps, never forgets, and always has your clusters in view.**

---

## 3. WHAT EXISTS TODAY (Baseline)

The current KubeStellar Console AI Missions feature has:
- A prompt input box per mission
- An AI provider selector (Ollama, OpenAI, etc.)
- Mission save functionality
- "Orbit" mode: periodic re-runs of a mission with timestamped output

**What is missing (this spec implements):**
- Proactive, event-driven awareness (not just scheduled re-runs)
- Persistent memory across missions and restarts
- Action execution (not just observation)
- A persistent ambient assistant panel (not a modal/page)
- Structured operational feed with severity, correlation, and follow-up
- Scheduling of cluster-level operations

---

## 4. ARCHITECTURE

### 4.1 High-Level Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│                     KubeStellar Console (React)                  │
│  ┌─────────────────────┐    ┌───────────────────────────────┐   │
│  │  Stellar Side Panel  │    │     Missions Page (existing)   │   │
│  │  - Live feed         │    │     + Action scheduling        │   │
│  │  - Quick actions     │    │     + Memory inspector         │   │
│  │  - Status indicators │    │     + Execution history        │   │
│  └──────────┬──────────┘    └──────────────┬────────────────┘   │
│             │  WebSocket / SSE              │  REST / GraphQL    │
└─────────────┼──────────────────────────────┼────────────────────┘
              │                              │
┌─────────────▼──────────────────────────────▼────────────────────┐
│                    Stellar Backend (Go)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Event Engine  │  │Mission Runner│  │  Memory Engine        │   │
│  │ (informers)   │  │(scheduler)   │  │  (Postgres + pgvector)│   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘   │
│         │                 │                                        │
│  ┌──────▼─────────────────▼───────────────────────────────────┐  │
│  │              Stellar Core Orchestrator                       │  │
│  │  - Routes events → missions → LLM → actions                 │  │
│  │  - Manages agent lifecycle                                   │  │
│  │  - Maintains operational state                               │  │
│  └──────┬──────────────────────────────────────────────────────┘  │
│         │                                                          │
│  ┌──────▼──────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  AI Provider     │  │ Tool Executor │  │  Notification Bus   │   │
│  │  Abstraction     │  │ (sandboxed)  │  │  (WebSocket / NATS) │   │
│  └─────────────────┘  └──────────────┘  └────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼────────────────────────────────────────────────────┐
│           Kubernetes Clusters (via KubeStellar multi-cluster)     │
│    cluster-a    cluster-b    cluster-c    staging    production   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. CORE COMPONENTS TO IMPLEMENT

---

### 5.1 Stellar Core Orchestrator (`stellar-core`)

**Location:** `apps/backend/stellar/core/`

**Responsibilities:**
- Central event router
- Mission lifecycle manager
- Agent state manager
- Memory retrieval coordinator

**Key interfaces:**

```go
// StellarCore is the central orchestration engine
type StellarCore struct {
    eventBus       EventBus
    missionRunner  MissionRunner
    memoryEngine   MemoryEngine
    providerRouter ProviderRouter
    toolExecutor   ToolExecutor
    notifier       Notifier
}

// Process routes an incoming operational event through the system
func (s *StellarCore) Process(ctx context.Context, event OperationalEvent) error

// DispatchMission starts or resumes a mission execution
func (s *StellarCore) DispatchMission(ctx context.Context, mission Mission) (*MissionExecution, error)

// GetOperationalState returns current cluster awareness snapshot
func (s *StellarCore) GetOperationalState(ctx context.Context) (*OperationalState, error)
```

---

### 5.2 Event Engine (`stellar-events`)

This is what makes Stellar feel "always watching."

**Location:** `apps/backend/stellar/events/`

**Event Sources to implement:**

| Source | Mechanism | Priority |
|---|---|---|
| Pod failures / CrashLoopBackOff | k8s informer on Pod events | P0 |
| Deployment rollout status | k8s informer on Deployment events | P0 |
| Node pressure / resource spikes | Metrics API polling (30s) | P0 |
| Prometheus alert firing | Alertmanager webhook receiver | P1 |
| PVC bound/lost | k8s informer on PVC events | P1 |
| HPA scaling events | k8s informer on HPA events | P1 |
| Cluster drift detection | Periodic reconciliation check | P2 |
| Certificate expiry | Scheduled scan | P2 |

**Event normalization:**

All events must be normalized to a common schema before entering the orchestrator:

```go
type OperationalEvent struct {
    ID          string
    Timestamp   time.Time
    Cluster     string
    Namespace   string
    Severity    Severity   // Info, Warning, Critical
    Category    Category   // Failure, Scaling, Drift, Alert, Scheduled
    Title       string
    RawData     map[string]any
    Source      EventSource
}
```

**Deduplication:** Events from the same source within a 5-minute window must be deduplicated. Use Redis with a TTL key per `cluster:namespace:resource:event-type`.

**Correlation:** Before generating a narration, the event engine must query memory for similar past events:
```go
func (e *EventEngine) Correlate(ctx context.Context, event OperationalEvent) ([]MemoryEntry, error)
```

---

### 5.3 Mission Runner (`stellar-missions`)

**Location:** `apps/backend/stellar/missions/`

A mission is the unit of work in Stellar. It can be:
- **Reactive:** triggered by an event
- **Scheduled:** runs on a cron
- **Manual:** triggered by the user
- **Chained:** triggered by the completion of another mission

**Mission schema (Postgres table `missions`):**

```sql
CREATE TABLE missions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    type            TEXT NOT NULL,    -- 'reactive' | 'scheduled' | 'manual' | 'chained'
    status          TEXT NOT NULL,    -- 'active' | 'paused' | 'completed' | 'failed'
    schedule        TEXT,             -- cron expression if scheduled
    trigger_event   TEXT,             -- event category if reactive
    provider_id     TEXT NOT NULL,
    model           TEXT NOT NULL,
    system_prompt   TEXT,
    task_template   TEXT NOT NULL,
    tools_enabled   TEXT[],
    clusters        TEXT[],           -- empty = all clusters
    memory_enabled  BOOLEAN DEFAULT true,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mission_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id      UUID REFERENCES missions(id),
    trigger_type    TEXT NOT NULL,
    trigger_data    JSONB,
    status          TEXT NOT NULL,    -- 'running' | 'completed' | 'failed' | 'cancelled'
    input           TEXT,
    output          TEXT,
    actions_taken   JSONB,
    tokens_used     INTEGER,
    duration_ms     INTEGER,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
```

**Execution flow:**

```
Event / Schedule / Manual trigger
         │
         ▼
  MissionRunner.Execute(mission, triggerContext)
         │
         ├── 1. Load memory context (similar past events, cluster history)
         ├── 2. Gather live cluster data via enabled tools
         ├── 3. Build enriched prompt (task + memory + live data)
         ├── 4. Stream LLM response
         ├── 5. Parse response for action intents
         ├── 6. Execute approved actions (if auto-approve enabled)
         ├── 7. Store execution in memory
         └── 8. Emit result to notification bus → UI
```

**Action scheduling:**

Users must be able to schedule cluster operations via natural language or structured form:

```go
type ScheduledAction struct {
    ID          string
    Description string
    ActionType  ActionType   // DeleteCluster, ScaleDeployment, AddBinding, RunHelm, etc.
    Parameters  map[string]any
    ScheduledAt time.Time    // OR cron expression
    ApprovedBy  string
    Status      string
    AuditLog    []AuditEntry
}
```

**CRITICAL:** All destructive actions (cluster deletion, namespace wipe, scaling to zero) require explicit user confirmation before execution. The system must:
1. Present the action with full parameter summary to the user
2. Require a typed confirmation or button click
3. Log the approval with timestamp and user identity
4. Execute only after confirmed

---

### 5.4 Memory Engine (`stellar-memory`)

**Location:** `apps/backend/stellar/memory/`

This is what makes Stellar feel like it "remembers."

**Three memory layers:**

**Layer 1: Short-term (Redis, TTL 24h)**
- Active mission executions
- Recent events (last 100 per cluster)
- Current operational state snapshot

**Layer 2: Long-term (Postgres)**
- All mission executions with full input/output
- Incident timeline
- User preferences and configuration
- Action history with outcomes

**Layer 3: Semantic (pgvector or Weaviate)**
- Embeddings of past incident summaries
- Enables "this resembles the X incident from Tuesday" correlation

```go
type MemoryEngine interface {
    // Store saves a memory entry (short + long term)
    Store(ctx context.Context, entry MemoryEntry) error

    // Recall returns recent relevant entries
    Recall(ctx context.Context, query RecallQuery) ([]MemoryEntry, error)

    // SemanticSearch finds semantically similar past events
    SemanticSearch(ctx context.Context, text string, limit int) ([]MemoryEntry, error)

    // Summarize compresses old entries to save space
    Summarize(ctx context.Context, clusterID string, before time.Time) error
}

type MemoryEntry struct {
    ID          string
    Cluster     string
    Namespace   string
    Category    string
    Summary     string     // Human-readable LLM-generated summary
    RawContent  string
    Embedding   []float32  // pgvector
    Tags        []string
    Timestamp   time.Time
    MissionID   *string
}
```

**Memory-augmented prompt construction:**

Before every LLM call, the mission runner must inject memory context:

```go
func BuildEnrichedPrompt(task string, liveData ClusterSnapshot, memory []MemoryEntry) string {
    // Returns: task + "\n\n## Cluster Context\n" + liveData + "\n\n## Relevant History\n" + memory summaries
}
```

---

### 5.5 AI Provider Abstraction (`stellar-providers`)

**Location:** `apps/backend/stellar/providers/`

```go
type AIProvider interface {
    Generate(ctx context.Context, input GenerateInput) (*GenerateOutput, error)
    Stream(ctx context.Context, input GenerateInput) (<-chan Token, error)
    SupportsTools() bool
    SupportsStreaming() bool
    Health(ctx context.Context) error
    TokenCount(text string) int
}

type GenerateInput struct {
    Model       string
    SystemPrompt string
    Messages    []Message
    Tools       []ToolDefinition
    MaxTokens   int
    Temperature float32
}
```

**Providers to implement:**
- `OllamaProvider` — local LLM via Ollama HTTP API
- `OpenAIProvider` — OpenAI and compatible APIs (Groq, Together, etc.)
- `AnthropicProvider` — Claude API
- `GeminiProvider` — Google Gemini

**Fallback chain:** If primary provider fails or is slow (>10s), automatically fall back to secondary. Configurable per mission.

---

### 5.6 Tool Executor (`stellar-tools`)

**Location:** `apps/backend/stellar/tools/`

Tools are what allow Stellar to take actions, not just observe.

**Tool registry:**

```go
type Tool interface {
    Name() string
    Description() string
    Schema() JSONSchema        // for LLM function calling
    Execute(ctx context.Context, params map[string]any, rbac RBACContext) (*ToolResult, error)
    IsDestructive() bool      // requires explicit confirmation
    RequiresApproval() bool
}
```

**Tools to implement (Phase 1):**

| Tool | Operations | Destructive |
|---|---|---|
| `kubernetes` | get/list/describe pods, deployments, nodes, events | No |
| `kubectl_logs` | fetch pod logs (last N lines or since time) | No |
| `kubectl_exec` | execute command in pod (restricted allowlist) | Yes |
| `kubectl_scale` | scale deployment replicas | Yes |
| `kubectl_rollout` | rollout restart, undo, status | Yes |
| `kubectl_delete` | delete resource (pods only by default) | Yes |
| `helm` | list releases, get values, upgrade, rollback | Partial |
| `prometheus_query` | run PromQL query | No |
| `cluster_schedule` | schedule a cluster-level operation for a future time | Yes |

**RBAC enforcement:**

Every tool execution must respect the user's Kubernetes RBAC:

```go
type RBACContext struct {
    UserIdentity   string
    Groups         []string
    Namespace      string
    ClusterName    string
}

func (t *KubernetesTool) Execute(ctx context.Context, params map[string]any, rbac RBACContext) (*ToolResult, error) {
    // Impersonate user's identity for k8s API calls
    // Never execute with service account that has more rights than user
}
```

---

### 5.7 Notification Bus (`stellar-notify`)

**Location:** `apps/backend/stellar/notify/`

The bus delivers real-time updates to the frontend.

```go
type Notification struct {
    ID          string
    Type        NotificationType  // Event, MissionUpdate, ActionRequired, Digest
    Severity    Severity
    Title       string
    Body        string
    Cluster     string
    MissionID   *string
    ActionID    *string           // If user confirmation required
    Timestamp   time.Time
    Read        bool
}
```

**Transport:** WebSocket (primary) with SSE fallback. Use a per-user channel keyed to session.

**Digest notifications:** Every morning (configurable, default 08:00 local) Stellar should emit a `Digest` notification summarizing overnight activity across all clusters. This is the "shift handoff" from the overnight junior engineer.

---

## 6. FRONTEND IMPLEMENTATION

### 6.1 Stellar Side Panel (Persistent Ambient Panel)

**This is the most important UI element.** It must be always visible in the console layout, not a page or modal.

**Location in layout:** Right side of the main console, collapsible, width ~380px expanded.

**Panel sections:**
1. **Status bar** — Stellar online/offline indicator, active mission count, unread alerts
2. **Live feed** — Real-time stream of events, narrations, and action completions
3. **Quick ask** — Single-line input for ad-hoc questions to Stellar
4. **Active missions** — Mini-cards for each running mission with live status
5. **Pending actions** — Any actions awaiting user approval (highlighted, must-acknowledge)

**Component:** `<StellarPanel />` using Zustand store `useStellarStore`

```tsx
interface StellarStore {
    isOpen: boolean
    notifications: Notification[]
    activeMissions: Mission[]
    pendingActions: ScheduledAction[]
    operationalState: OperationalState | null
    unreadCount: number

    // Actions
    acknowledge: (notificationId: string) => void
    approveAction: (actionId: string) => Promise<void>
    rejectAction: (actionId: string, reason: string) => Promise<void>
    sendQuickAsk: (prompt: string) => Promise<void>
}
```

**Live feed card design:**

Each notification in the feed must show:
- Severity badge (color coded: blue=info, yellow=warning, red=critical)
- Cluster and namespace badge
- Stellar narration text (LLM generated, past-tense, matter-of-fact tone)
- Timestamp (relative: "3 min ago")
- Action buttons if applicable ("Collect Logs", "Approve Restart", "Dismiss")
- Expandable section for raw details

**Tone of Stellar narrations:**

Stellar must sound like a junior engineer, not a system log. Examples:

| Bad (system log style) | Good (Stellar junior engineer style) |
|---|---|
| `CrashLoopBackOff detected: payments/api-server` | `The api-server pod in payments has been crash-looping for 4 minutes. It has restarted 6 times. Last exit code was 137 (OOM killed). Memory limit is 512Mi — want me to pull the last 200 lines of logs?` |
| `HPA scaled deployment/worker from 3 to 8` | `I noticed traffic picked up in production around 14:32 — the worker deployment autoscaled from 3 to 8 pods. Everything looks stable now. Latency is back to baseline.` |
| `Node node-3 has condition MemoryPressure=True` | `node-3 in cluster-prod is under memory pressure. It's running 14 pods. I can list the top memory consumers if you want to decide whether to cordon it.` |

The LLM system prompt for narration must enforce this tone. See Section 8.

### 6.2 Missions Page Enhancements

Extend the existing Missions page with:

**Action Scheduler tab:**
- Calendar/time picker UI for scheduling cluster operations
- Form: select cluster → select action type → configure parameters → set schedule → confirm
- Table of pending/completed scheduled actions with status, outcome, and audit log

**Mission Builder enhancements:**
- Trigger type selector: Manual / Cron / On Event / On Alert
- Cluster scope: All / Select specific clusters
- Memory toggle: Enable/disable memory injection
- Tools selector: Checkbox list of available tools
- Auto-approve toggle (off by default): Skip confirmation for non-destructive tool calls

**Memory Inspector tab:**
- Timeline view of stored memories per cluster
- Search bar (semantic search backed by pgvector)
- "What does Stellar know about X" freeform query

**Execution History tab:**
- Full execution log with input prompt, enriched prompt, LLM output, tools called, actions taken
- Token usage per execution
- Duration metrics

---

## 7. DATA MODELS (Complete)

### 7.1 Postgres Schema

```sql
-- Missions
CREATE TABLE missions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    type            TEXT NOT NULL CHECK (type IN ('reactive','scheduled','manual','chained')),
    status          TEXT NOT NULL CHECK (status IN ('active','paused','completed','failed')),
    schedule        TEXT,
    trigger_event   TEXT,
    trigger_cluster TEXT,
    provider_id     TEXT NOT NULL,
    model           TEXT NOT NULL,
    system_prompt   TEXT,
    task_template   TEXT NOT NULL,
    tools_enabled   TEXT[] DEFAULT '{}',
    clusters        TEXT[] DEFAULT '{}',
    memory_enabled  BOOLEAN DEFAULT true,
    auto_approve    BOOLEAN DEFAULT false,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Mission executions
CREATE TABLE mission_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id      UUID NOT NULL REFERENCES missions(id),
    trigger_type    TEXT NOT NULL,
    trigger_data    JSONB DEFAULT '{}',
    status          TEXT NOT NULL CHECK (status IN ('running','completed','failed','cancelled')),
    raw_input       TEXT,
    enriched_input  TEXT,
    output          TEXT,
    actions_taken   JSONB DEFAULT '[]',
    tokens_input    INTEGER DEFAULT 0,
    tokens_output   INTEGER DEFAULT 0,
    duration_ms     INTEGER,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- Memory entries
CREATE TABLE memory_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster         TEXT NOT NULL,
    namespace       TEXT,
    category        TEXT NOT NULL,
    summary         TEXT NOT NULL,
    raw_content     TEXT,
    embedding       vector(1536),    -- pgvector, 1536 for OpenAI, 768 for local models
    tags            TEXT[] DEFAULT '{}',
    mission_id      UUID REFERENCES missions(id),
    execution_id    UUID REFERENCES mission_executions(id),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON memory_entries USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON memory_entries (cluster, created_at DESC);

-- Scheduled actions
CREATE TABLE scheduled_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description     TEXT NOT NULL,
    action_type     TEXT NOT NULL,
    parameters      JSONB NOT NULL DEFAULT '{}',
    cluster         TEXT NOT NULL,
    namespace       TEXT,
    scheduled_at    TIMESTAMPTZ,
    cron_expr       TEXT,
    status          TEXT NOT NULL CHECK (status IN ('pending_approval','approved','running','completed','failed','cancelled')),
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    executed_at     TIMESTAMPTZ,
    outcome         TEXT,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor           TEXT NOT NULL,   -- 'stellar' or user identity
    action          TEXT NOT NULL,
    resource_type   TEXT,
    resource_id     TEXT,
    cluster         TEXT,
    namespace       TEXT,
    parameters      JSONB DEFAULT '{}',
    outcome         TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. LLM SYSTEM PROMPTS

### 8.1 Narration System Prompt (for event-to-notification conversion)

```
You are Stellar, an operational assistant embedded in the KubeStellar Console.
Your job is to narrate Kubernetes events as if you are a junior SRE giving a colleague a real-time update.

Rules:
- Write in first person ("I noticed...", "It looks like...", "I'm seeing...")
- Be concise but complete. 2-4 sentences maximum per narration.
- State what is happening, how long it has been happening, and the potential impact.
- Offer a specific next step the user can take or ask if they want you to take it.
- Never use log-format language (no "ERROR:", no "WARN:", no timestamps in the text).
- Reference past incidents when relevant: "This looks similar to the outage in payments last Tuesday."
- If you do not have enough information, say so and offer to collect more.
- Tone: calm, professional, matter-of-fact. Like a good on-call engineer.
```

### 8.2 Mission Execution System Prompt (for general mission runs)

```
You are Stellar, a persistent AI operations assistant for Kubernetes infrastructure.
You have access to tools that let you inspect clusters, read logs, and execute approved operations.

Your operational context:
- Clusters you are watching: {cluster_list}
- Current time: {current_time}
- User: {user_identity}

Memory context (recent relevant history):
{memory_context}

Current cluster state:
{cluster_snapshot}

Instructions:
- Be proactive: if you notice something concerning in the data, mention it even if not asked.
- Be specific: always name the resource, namespace, cluster, and timestamp.
- Reference history: if something resembles a past incident, say so explicitly.
- For actions: describe exactly what you plan to do before doing it. Wait for approval on destructive operations.
- Summarize findings clearly. Use bullet points for multi-item reports.
- End with a concrete recommendation or question.
```

### 8.3 Daily Digest System Prompt

```
You are Stellar. It is {time} and you are delivering the daily operational digest.

Review the past {hours} hours of cluster activity and produce a shift-handoff style summary.

Structure your digest as:
1. **Overall health** — one sentence on the state of all clusters
2. **Incidents** — any failures, crashes, or alerts, with resolution status
3. **Changes** — deployments, scaling events, configuration changes
4. **Trends** — anything gradually getting worse or better (memory creep, error rate drift)
5. **Recommended actions** — 1-3 specific things worth doing today

Keep it under 400 words. Be direct. This is a handoff, not a report.
```

---

## 9. API ENDPOINTS

### REST API additions to the KubeStellar Console backend:

```
# Missions
GET    /api/v1/stellar/missions
POST   /api/v1/stellar/missions
GET    /api/v1/stellar/missions/:id
PATCH  /api/v1/stellar/missions/:id
DELETE /api/v1/stellar/missions/:id
POST   /api/v1/stellar/missions/:id/execute    -- manual trigger
POST   /api/v1/stellar/missions/:id/pause
POST   /api/v1/stellar/missions/:id/resume

# Mission executions
GET    /api/v1/stellar/executions?mission_id=&cluster=&status=&limit=
GET    /api/v1/stellar/executions/:id

# Scheduled actions
GET    /api/v1/stellar/actions
POST   /api/v1/stellar/actions
GET    /api/v1/stellar/actions/:id
POST   /api/v1/stellar/actions/:id/approve
POST   /api/v1/stellar/actions/:id/reject
DELETE /api/v1/stellar/actions/:id

# Memory
GET    /api/v1/stellar/memory?cluster=&category=&limit=
POST   /api/v1/stellar/memory/search    -- semantic search { "query": "..." }
DELETE /api/v1/stellar/memory/:id

# Operational state
GET    /api/v1/stellar/state            -- current cluster awareness snapshot
GET    /api/v1/stellar/digest           -- on-demand digest generation

# Quick ask
POST   /api/v1/stellar/ask              -- { "prompt": "...", "cluster": "..." }

# WebSocket
WS     /api/v1/stellar/stream           -- real-time notifications
```

---

## 10. PHASED IMPLEMENTATION ROADMAP

### Phase 1 — Foundation (Weeks 1–4)
**Goal:** Stellar watches clusters and narrates events. No actions yet.

- [ ] Postgres schema + migrations
- [ ] Redis integration for short-term memory and deduplication
- [ ] Event Engine: Pod and Deployment informers for all connected clusters
- [ ] Event normalization and deduplication
- [ ] Basic LLM provider abstraction (Ollama + OpenAI)
- [ ] Narration system prompt + event-to-notification pipeline
- [ ] WebSocket notification delivery to frontend
- [ ] Stellar Side Panel v1: live feed + unread count
- [ ] Mission execution logging (store all runs in Postgres)

**Definition of done:** User opens the console and sees real-time narrated events from their clusters within 30 seconds of occurrence, with no duplicate notifications.

---

### Phase 2 — Memory + Missions (Weeks 5–8)
**Goal:** Stellar remembers the past and runs scheduled missions.

- [ ] Long-term memory storage (Postgres `memory_entries`)
- [ ] Semantic memory with pgvector (embeddings on mission execution summaries)
- [ ] Memory-augmented prompt construction
- [ ] "This resembles X from Y" correlation in narrations
- [ ] Mission Runner: cron-scheduled missions
- [ ] Mission Runner: reactive missions (event-triggered)
- [ ] Mission Builder UI enhancements (trigger types, cluster scope, memory toggle)
- [ ] Execution History tab in Missions page
- [ ] Memory Inspector tab
- [ ] Daily digest generation and delivery
- [ ] All provider implementations (Anthropic, Gemini)

**Definition of done:** Stellar references a past crash when the same pod fails again. Overnight digest arrives at 08:00 summarizing activity. Missions run on cron without manual triggering.

---

### Phase 3 — Tool Execution + Action Scheduling (Weeks 9–12)
**Goal:** Stellar can do things, not just observe.

- [ ] Tool framework (interface, registry, RBAC enforcement, audit logging)
- [ ] `kubernetes` tool (read-only: get, list, describe)
- [ ] `kubectl_logs` tool
- [ ] `kubectl_scale` tool (with approval gate)
- [ ] `helm` tool (read: list, get values)
- [ ] `prometheus_query` tool
- [ ] Approval workflow: pending actions, confirmation UI, audit log
- [ ] Action Scheduler UI (calendar picker, action form, pending table)
- [ ] Cluster operation scheduling (scale, cordon, delete with confirmation)
- [ ] Tool execution result injection into mission output
- [ ] Auto-approve mode (opt-in, non-destructive tools only)

**Definition of done:** User can say "scale the worker deployment to 5 replicas at 2am" and Stellar presents a confirmation, schedules the action, executes it at the right time, and sends a completion notification. All actions are in the audit log.

---

### Phase 4 — Observability + Security Hardening (Weeks 13–16)
**Goal:** Production-ready operational confidence.

- [ ] OpenTelemetry tracing for all Stellar operations
- [ ] Prometheus metrics: mission count, execution duration, token usage, tool call rate
- [ ] Grafana dashboard for Stellar internals
- [ ] RBAC enforcement audit (Stellar never exceeds user's k8s permissions)
- [ ] Execution quotas per user and per cluster
- [ ] Rate limiting on LLM calls and tool executions
- [ ] Encrypted secret storage for provider API keys (Kubernetes Secrets or Vault)
- [ ] Network policies for Stellar backend pods
- [ ] Memory pruning / summarization job (keeps DB size bounded)
- [ ] Provider health monitoring and fallback chain testing

---

### Phase 5 — Advanced Capabilities (Post-MVP)
- [ ] Multi-step chained missions (mission triggers another mission)
- [ ] GitHub webhook integration (deploy event → Stellar validates rollout)
- [ ] Slack/email notification channels
- [ ] Anomaly detection baselines (alert on deviation from historical norm)
- [ ] KubeStellar binding propagation awareness (multi-cluster drift detection)
- [ ] Voice narration (Web Speech API, optional)
- [ ] Mobile push notifications

---

## 11. REPOSITORY STRUCTURE

```
apps/
  backend/
    stellar/
      core/           -- orchestrator, event routing, lifecycle
      events/         -- k8s informers, prometheus webhook, event normalizer
      missions/       -- mission runner, scheduler, chained execution
      memory/         -- short-term (redis), long-term (postgres), semantic (pgvector)
      providers/      -- ollama, openai, anthropic, gemini
      tools/          -- tool registry, kubernetes, helm, prometheus tools
      notify/         -- websocket hub, notification delivery
      api/            -- REST handlers
      db/             -- migrations, queries (sqlc recommended)
      config/         -- stellar configuration struct

  frontend/
    src/
      components/
        stellar/
          StellarPanel.tsx          -- persistent side panel
          LiveFeed.tsx              -- notification stream
          NotificationCard.tsx     -- individual event card
          QuickAsk.tsx             -- single-line prompt input
          PendingActions.tsx       -- approval queue
          ActiveMissions.tsx       -- mission status mini-cards
      pages/
        missions/
          MissionBuilder.tsx       -- extended mission creation form
          ExecutionHistory.tsx     -- execution log table
          ActionScheduler.tsx      -- calendar + action form
          MemoryInspector.tsx      -- semantic search + timeline
      stores/
        stellarStore.ts            -- zustand store for all stellar state
      hooks/
        useStellarWebSocket.ts     -- websocket connection + reconnect
        useStellarState.ts         -- operational state polling
      api/
        stellar.ts                 -- all API client functions

db/
  migrations/
    001_stellar_missions.sql
    002_stellar_executions.sql
    003_stellar_memory.sql
    004_stellar_actions.sql
    005_stellar_audit.sql
```

---

## 12. CRITICAL IMPLEMENTATION CONSTRAINTS

**These are non-negotiable requirements that Codex must enforce throughout implementation:**

1. **No action executes without audit logging.** Every tool call, every scheduled action, every LLM decision that results in a Kubernetes API write must be in the `audit_log` table before execution begins.

2. **Stellar never has more RBAC permissions than the logged-in user.** All Kubernetes API calls from tools must impersonate the user's identity. The Stellar service account has no cluster-admin rights.

3. **Destructive operations always require explicit user approval.** No auto-approve mode for actions that delete or irrecoverably modify resources. The approval must be a conscious UI interaction, not just a timeout.

4. **Deduplication is required on all event sources.** The event engine must deduplicate before narration generation. Duplicate narrations destroy trust faster than silence.

5. **Memory injection must have a token budget.** The memory context injected into prompts must be capped (default: 2000 tokens for memory context). Oldest/least-relevant entries are dropped first.

6. **Provider failures must be silent to the user.** If the LLM provider fails, retry with backoff, then fall back to secondary. Do not show raw API errors in the notification feed. Log them internally.

7. **WebSocket must reconnect automatically.** The frontend WebSocket client must reconnect with exponential backoff on disconnect. Users should never need to refresh to restore the live feed.

8. **The Stellar panel must not block page interaction.** It is an overlay / sidebar, never a blocking modal. Pending action approvals are highlighted but non-blocking.

---

## 13. TESTING REQUIREMENTS

- Unit tests for event deduplication logic
- Unit tests for memory retrieval and prompt construction
- Unit tests for all tool `Execute()` implementations (mock k8s client)
- Integration tests for mission execution flow (mock LLM provider)
- Integration tests for WebSocket notification delivery
- E2E test: CrashLoopBackOff event → narration → notification in UI
- E2E test: Scheduled action → approval → execution → audit log entry
- Load test: 10 concurrent cluster event streams, verify deduplication holds

---

## 14. OPEN QUESTIONS FOR PRODUCT DECISION BEFORE IMPLEMENTATION

1. **Embedding model:** Use OpenAI `text-embedding-3-small` (requires API key) or a local model via Ollama for semantic memory? Recommend: make it configurable, default to the same provider selected for the mission.

2. **Notification persistence:** Should dismissed notifications be permanently gone, or soft-deleted (accessible in a "notification history" view)? Recommend: soft-delete, 30-day retention.

3. **Multi-user isolation:** Should Stellar memory be per-user or shared across the team? Recommend: shared read, user-attributed writes. Team sees the same operational history.

4. **Default mission library:** Ship with pre-built missions (overnight watch, daily digest, CrashLoop responder, OOM investigator)? Recommend: yes, as non-editable templates the user can clone.

5. **Auto-approve scope:** Which specific tool actions are eligible for auto-approve? Recommend: read-only tools only by default. Scale and restart require per-action configuration.