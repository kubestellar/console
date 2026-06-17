# CNCF Ecosystem Integrations

KubeStellar Console ships and/or surfaces integrations across the CNCF ecosystem so operators can monitor, install, and explain adjacent platforms from one multi-cluster console.

This overview focuses on the ecosystem integrations requested in the outreach/documentation issues for Volcano, WasmCloud, Ollama, LLM-d, vLLM, Kagenti, Karmada, Crossplane, Dapr, and Drasi.

> Notes
>
> - Card names below use the in-repo card type IDs where helpful.
> - Mission IDs refer to guided install or walkthrough content surfaced by the console from the mission catalog / console-kb.

## At a glance

| Ecosystem | What it is | Console surface today |
| --- | --- | --- |
| Volcano | CNCF batch / HPC scheduler for GPU, AI/ML, and gang-scheduled jobs | `volcano_status` card plus GPU workload context |
| WasmCloud | CNCF incubating WebAssembly application platform | `wasmcloud_status` card |
| Ollama | Local LLM runtime commonly deployed on workstations and Kubernetes | `install-ollama` mission and local-provider integration |
| LLM-d / vLLM | LLM serving, benchmarking, routing, cache, and GPU inference workflows | AI/ML dashboards, `install-llm-d`, `install-vllm`, and related mission content |
| Kagenti | Kubernetes-native AI agent control plane using A2A + MCP | AI Agents dashboard + `install-kagenti` mission |
| Karmada | CNCF multi-cluster federation and propagation platform | Karmada Ops dashboard + `karmada_status` card |
| Crossplane | CNCF platform engineering / control-plane framework | `crossplane_managed_resources` card + install CTA |
| Dapr | CNCF graduated distributed application runtime | `dapr_status` card |
| Drasi | CNCF sandbox reactive data / change-processing platform | Drasi dashboard + `install-drasi` mission |

## Volcano

**What it is:** Volcano is a CNCF incubating scheduler for AI/ML, HPC, and batch workloads on Kubernetes, especially where queueing, gang scheduling, and GPU-aware placement matter.

**Cards and missions**

- `volcano_status` — queues, jobs by phase, pod groups, and aggregate GPU allocation
- Related GPU visibility from the broader console: GPU overview, GPU workloads, GPU usage trend, and GPU inventory history
- No Volcano-specific guided mission is wired in this repo today

**Community**

- Website: <https://volcano.sh>
- GitHub: <https://github.com/volcano-sh/volcano>
- CNCF Slack: `#volcano`

## WasmCloud

**What it is:** wasmCloud is a CNCF incubating platform for running distributed WebAssembly workloads as actors and capability providers in a lattice.

**Cards and missions**

- `wasmcloud_status` — lattice hosts, actors, capability providers, and active link definitions
- No wasmCloud-specific guided mission is wired in this repo today

**Community**

- Website: <https://wasmcloud.com>
- GitHub: <https://github.com/wasmCloud/wasmCloud>
- CNCF Slack: `#wasmcloud`

## Ollama

**What it is:** Ollama is a popular local and on-prem LLM runtime used for laptop, edge, and Kubernetes-hosted model serving.

**Cards and missions**

- `install-ollama` — surfaced as the install mission for the local `ollama` provider in the agent selector
- Mission catalog support includes Ollama mission content under the generated mission browser
- Provider integration is exposed through the local agent / API key settings flow for Ollama endpoints

**Community**

- Website: <https://ollama.com>
- GitHub: <https://github.com/ollama/ollama>
- Community: Ollama Discord, r/ollama, r/LocalLLaMA

## LLM-d / vLLM

**What it is:** LLM-d and vLLM represent the modern Kubernetes-native LLM serving stack: request routing, KV-cache management, benchmarking, autoscaling, and GPU-backed inference.

**Cards and missions**

- AI/ML dashboard cards:
  - `llmd_flow`
  - `kvcache_monitor`
  - `epp_routing`
  - `pd_disaggregation`
  - `llmd_ai_insights`
  - `llmd_configurator`
  - `llmd_stack_monitor`
  - `llm_models`
  - `llm_inference`
- LLM-d Benchmarks dashboard cards:
  - `nightly_e2e_status`
  - `benchmark_hero`
  - `pareto_frontier`
  - `hardware_leaderboard`
  - `latency_breakdown`
  - `throughput_comparison`
  - `performance_timeline`
  - `resource_utilization`
- `install-llm-d` — install CTA and KB path for LLM-d card flows
- `install-vllm` — local-provider install mission surfaced for vLLM
- Outreach tracking also references dedicated LLM-d install missions and vLLM-sourced mission content in console-kb

**Community**

- LLM-d: <https://github.com/llm-d/llm-d>
- vLLM: <https://github.com/vllm-project/vllm>
- CNCF / AI community: `#ai-ml`, `#llm-d`

## Kagenti

**What it is:** Kagenti is a Kubernetes-native AI agent control plane that brings A2A and MCP-oriented agent orchestration to clusters.

**Cards and missions**

- AI Agents dashboard tab for Kagenti with:
  - `kagenti_status`
  - `kagenti_agent_fleet`
  - `kagenti_build_pipeline`
  - `kagenti_tool_registry`
  - `kagenti_agent_discovery`
  - `kagenti_security`
  - `kagenti_topology`
- `install-kagenti` — guided install mission wired into card install flows and agent UX

**Community**

- GitHub: <https://github.com/kagenti/kagenti>
- Standards context: A2A + MCP ecosystem discussions, CNCF `#ai-ml`

## Karmada

**What it is:** Karmada is a CNCF sandbox project for multi-cluster Kubernetes federation, placement, and propagation policies.

**Cards and missions**

- Karmada Ops dashboard:
  - `karmada_status`
  - `kuberay_fleet`
  - `slo_compliance`
  - `failover_timeline`
  - `trino_gateway`
  - `cluster_health`
- The Karmada status surface focuses on controller health, member clusters, and resource bindings
- No Karmada-specific guided mission is wired in this repo today

**Community**

- Website: <https://karmada.io>
- GitHub: <https://github.com/karmada-io/karmada>
- CNCF Slack: `#karmada`

## Crossplane

**What it is:** Crossplane is a CNCF graduated platform engineering project for building control planes, compositions, and managed infrastructure APIs on Kubernetes.

**Cards and missions**

- `crossplane_managed_resources` — managed resource inventory with ready/synced/error state
- Install CTA wiring exists for Crossplane (`install-crossplane`) in the card install map

**Community**

- Website: <https://www.crossplane.io>
- GitHub: <https://github.com/crossplane/crossplane>
- Crossplane Slack / community meetings

## Dapr

**What it is:** Dapr is a CNCF graduated distributed application runtime for microservice building blocks such as state, pub/sub, bindings, actors, and service invocation.

**Cards and missions**

- `dapr_status` — control plane health, Dapr-enabled application count, and configured components
- No Dapr-specific guided mission is wired in this repo today

**Community**

- Website: <https://dapr.io>
- GitHub: <https://github.com/dapr/dapr>
- CNCF TAG Runtime / Dapr community channels

## Drasi

**What it is:** Drasi is a CNCF sandbox project for reactive change processing, continuous queries, and event-driven reactions across cloud-native systems.

**Cards and missions**

- Drasi dashboard with `drasi_reactive_graph`
- `install-drasi` — mission deep-link and dashboard CTA for guided setup
- The console also uses Drasi-style visual flows in adjacent UX, reinforcing the event-driven operations story

**Community**

- Website: <https://drasi.io>
- GitHub: <https://github.com/drasi-project/drasi-platform>

## Related in-repo entry points

- Dashboard card catalog: `web/src/components/dashboard/shared/cardCatalog.ts`
- AI/ML dashboard: `web/src/config/dashboards/ai-ml.ts`
- AI Agents dashboard: `web/src/config/dashboards/ai-agents.ts`
- Karmada Ops dashboard: `web/src/config/dashboards/karmada-ops.ts`
- Drasi dashboard: `web/src/config/dashboards/drasi.ts`
- LLM-d Benchmarks dashboard: `web/src/config/dashboards/llmd-benchmarks.ts`
- Card install mapping: `web/src/lib/cards/cardInstallMap.ts`
- Local LLM install mission mapping: `web/src/components/agent/agentSelectorUtils.ts`
