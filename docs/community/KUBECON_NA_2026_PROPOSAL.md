# KubeCon NA 2026 Proposal Draft

## Talk Title

**From Dashboard to Copilot: AI-Native Multi-Cluster Observability with Agentic Workflows**

## Session Type and Duration

- **Format**: Conference talk
- **Duration**: 35 minutes
- **Target audience**: Platform engineers, SREs, cloud-native architects, AI/ML operators, and maintainers building multi-cluster tooling

## Abstract

Kubernetes operators already collect massive amounts of cluster data, but most dashboards still stop at display. KubeStellar Console pushes further: it combines multi-cluster observability, guided operational workflows, and persistent AI agents so teams can move from "something is wrong" to "the right remediation is underway" across fleets of clusters.

In this talk, we show how KubeStellar Console is evolving into an AI-native multi-cluster operations surface. We will walk through a console architecture that spans 300+ ecosystem cards, WebAssembly-backed caching for fast revisits, Kubernetes access through an MCP bridge, and the Stellar persistent AI runtime for event-driven missions, memory, and tool-aware automation. We will also explain how agentic workflows help operators manage edge locations, GPU workloads, and heterogeneous cloud environments without collapsing into one giant control-plane bottleneck.

The session is grounded in real operational scenarios: detecting workload drift across clusters, correlating observability signals for AI/ML platforms, launching guided missions for investigation, and coordinating safe remediation with human oversight. Attendees will leave with concrete patterns for building AI-native observability systems that respect cloud-native control loops, security boundaries, and the practical realities of multi-cluster operations.

## Why This Talk Now

- AI-native observability is becoming a practical requirement for Kubernetes platforms, not a future concept.
- Multi-cluster and edge environments need operator experiences that combine insight, context, and guided action.
- KubeStellar Console now has a differentiated story spanning observability, agentic workflows, and persistent AI runtime design.
- The talk connects timely themes for KubeCon audiences: platform engineering, AI/ML operations, multi-cluster management, and responsible agentic automation.

## Audience Takeaways

- How to design a multi-cluster observability surface that goes beyond passive dashboards
- Where agentic workflows fit in Kubernetes operations without replacing human judgment
- Patterns for combining mission orchestration, memory, event streams, and tool routing in a persistent AI runtime
- Practical demo ideas for AI/ML, edge, and fleet-scale remediation workflows

## Session Outline (35 Minutes)

### 1. Why dashboards are not enough anymore (5 min)

- Observability overload in multi-cluster Kubernetes environments
- Why AI/ML and edge workloads make the problem worse
- The gap between status visibility and operational follow-through

### 2. Architecture of an AI-native multi-cluster console (8 min)

- KubeStellar Console as a fleet operations surface
- 300+ ecosystem integrations and card-based extensibility
- WebAssembly-backed cache for fast revisits and stale-while-revalidate behavior
- MCP bridge for controlled Kubernetes access from AI-aware tooling

### 3. From observability to missions (8 min)

- Stellar runtime overview: Mission, MissionExecution, MemoryStore, ToolBinding, Event Gateway
- How guided missions turn signals into bounded operator workflows
- Human-in-the-loop checkpoints, policy boundaries, and auditability

### 4. Demo: AI-native multi-cluster management in action (10 min)

- Walk through live scenarios covering observability, diagnosis, and guided remediation
- Show how operators move from card-level signal to cross-cluster action
- Highlight how memory and workflow context reduce repeated investigation effort

### 5. Lessons learned and adoption guidance (4 min)

- What worked, what did not, and where humans remain essential
- Safe rollout patterns for teams adopting AI-native operations
- How open source communities can contribute cards, missions, and integrations

## Key Demo Scenarios

### Demo 1: Fleet-wide drift detection with guided investigation

- Surface an unhealthy workload pattern across multiple clusters
- Use dashboard cards to compare status, rollout drift, and policy findings
- Launch a guided mission that collects context, narrows likely causes, and proposes next steps
- Show explicit operator approval before any remediation action

### Demo 2: AI/ML observability across GPU-enabled clusters

- Use Volcano and related cards to show queue pressure, GPU allocation, and failed batch workloads
- Correlate infrastructure and workload symptoms across clusters
- Demonstrate how an AI mission recommends capacity balancing or placement adjustments

### Demo 3: Edge outage triage with persistent memory

- Simulate a flaky edge site with intermittent connectivity and stale telemetry
- Show cached insights, recent mission history, and memory-aware follow-up guidance
- Explain how persistent context avoids restarting the investigation from scratch after reconnects

### Demo 4: Event-driven remediation with guardrails

- Trigger a change event flowing through the Event Gateway into a mission
- Show a bounded workflow that gathers evidence, suggests a safe remediation plan, and records the outcome
- Emphasize auditability, RBAC, and policy-aware tool routing instead of unconstrained autonomy

## Speaker Notes / Key Points

### Positioning

- Frame the talk as **AI-native observability**, not generic "AI for ops"
- Emphasize that the goal is faster, safer operator decisions across clusters
- Keep the story grounded in Kubernetes-native APIs, controllers, policy, and human review

### Technical points to land clearly

- Persistent agents matter because operations work spans time, events, and partial failures
- Multi-cluster UX must connect signals to action, not just aggregate metrics
- Memory is useful when it preserves prior investigation context without hiding provenance
- MCP and bounded tool routing are important for safe integration between AI systems and cluster operations

### Suggested proof points

- 300+ dashboard cards / broad ecosystem coverage
- Stellar runtime CRDs and event-driven mission model
- AI/ML and edge scenarios as concrete examples rather than abstract promises
- Human approval and guardrails as a differentiator from fully autonomous demos

### Submission guidance

- Best fit tracks: Platform Engineering, Observability, AI/ML on Kubernetes, Multi-Cluster / Fleet Management
- Strong co-speaker profile: one KubeStellar Console maintainer plus one operator or ecosystem collaborator with AI/ML or edge experience
- Demo should be real but tightly bounded; prioritize clarity over breadth

## Optional Alternate Titles

- **From Signals to Missions: AI-Native Multi-Cluster Observability on Kubernetes**
- **Building an Agentic Kubernetes Console for Multi-Cluster and Edge Operations**
- **AI-Native Observability for Kubernetes: From Fleet Dashboards to Guided Remediation**

## One-Sentence CFP Summary

KubeStellar Console shows how to turn multi-cluster observability into guided, human-governed action using persistent AI missions, memory, and Kubernetes-native guardrails.
