# Stellar Architecture v0.1 (Persistent AI Operations Assistant)

Stellar extends KubeStellar Console from request/response AI into a **persistent operational runtime** with mission continuity, memory, and proactive execution.

## 1. Runtime topology

1. **Stellar Core (control-plane service)**  
   Mission planner, execution coordinator, context assembler, provider router, memory retriever, policy guard.
2. **Stellar Mission Operator (Kubernetes controller-runtime)**  
   Reconciles `Mission`, `MissionExecution`, `Agent`, `MemoryStore`, `ToolBinding`, `Trigger` CRDs.
3. **Stellar Event Gateway**  
   Normalizes Kubernetes events, Prometheus alerts, webhooks, and schedules into durable event envelopes.
4. **Stellar Memory Service**  
   Short-term + long-term + semantic memory APIs (Redis/Postgres/vector backend).
5. **Stellar Tool Runtime**  
   RBAC-aware, policy-enforced tool invocation (kubernetes, kubectl, helm, github, slack, prometheus, grafana).
6. **Stellar Provider Router**  
   Local/cloud/hybrid LLM routing with failover chains and health checks.
7. **Console Integration Layer**  
   Assistant panel, mission builder, execution timeline, memory inspector, proactive feed.

## 2. Data and control flow

1. Trigger arrives (schedule/event/webhook/manual).  
2. Mission Operator creates `MissionExecution` CR.  
3. Stellar Core loads user preferences + mission state + memory context.  
4. Provider Router selects provider chain (local/cloud/hybrid policy).  
5. Tool Runtime executes approved tool steps with audit records.  
6. Memory Service writes observations, summaries, incident links, preferences.  
7. Execution status/telemetry streamed to Console; follow-up tasks scheduled.

## 3. Memory architecture

- **Session memory**: active mission state, recent tool outputs, conversational intent.
- **Operational memory**: incidents, postmortems, rollout history, recurring failures.
- **Semantic memory**: embeddings for similarity recall ("resembles outage X").
- **Policy memory**: per-user/operator preferences (provider mode, quiet hours, pinned clusters).

## 4. Provider abstraction contract

All providers implement:

```go
type RuntimeProvider interface {
	Name() string
	Health(ctx context.Context) error
	Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error)
	Stream(ctx context.Context, req GenerateRequest, onToken func(string), onEvent func(ProviderEvent)) error
	SupportsTools() bool
	SupportsStreaming() bool
}
```

Routing policies:
- `local-only`
- `cloud-only`
- `hybrid` (local first, cloud fallback)

## 5. Security model

- Namespace and user scoping on every mission execution.
- Tool allowlist + per-mission tool binding.
- RBAC check before each cluster action.
- Secret references only (`SecretKeyRef`), no inline secrets.
- Structured audit trail for prompts, tools, decisions, and outputs.
- Quotas: tokens, runtime, concurrency, retries.

## 6. Observability model

- OpenTelemetry traces per mission execution step.
- Prometheus metrics: mission throughput, success/failure, provider latency, token usage, tool calls.
- Structured logs with mission/user/cluster correlation IDs.
- Mission timeline UI for step-by-step replay.

## 7. Incremental roadmap

1. **Phase 1 (implemented in this PR)**: persistent user preferences + mission registry APIs in Console backend.  
2. **Phase 2**: mission executor worker + queue + retry/backoff + execution journal.  
3. **Phase 3**: CRD-backed operator + schedule/event trigger reconciliation.  
4. **Phase 4**: memory service (operational + semantic retrieval).  
5. **Phase 5**: provider failover chains + health scoring + token policy engine.  
6. **Phase 6**: full console UX (assistant panel, mission feed, memory inspector, execution graphs).  

## 8. Repository structure proposal

```text
pkg/stellar/core/          # orchestration engine + mission planner
pkg/stellar/runtime/       # execution state machine + retries + checkpoints
pkg/stellar/providers/     # provider adapters and routing chains
pkg/stellar/memory/        # short/long/semantic memory APIs
pkg/stellar/tools/         # policy-enforced tool adapters
pkg/stellar/events/        # trigger ingestion + queue integration
pkg/stellar/operator/      # controller-runtime reconcilers for CRDs
pkg/api/handlers/stellar*  # console-facing REST APIs
web/src/components/stellar # assistant panel, mission builder, memory views
deploy/crds/ai.kubestellar.io_*.yaml
```
