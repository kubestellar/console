# Kagenti Partnership: AI Agent Control Plane for Kubernetes

## Overview

**Kagenti** (github.com/kagenti) is a Kubernetes-native control plane for AI agents that supports the **A2A (Agent-to-Agent)** and **MCP (Model Context Protocol)** standards. KubeStellar Console has established a strategic partnership with Kagenti to deliver a complete AI-on-Kubernetes stack.

## Why This Partnership Matters

KubeStellar Console and Kagenti operate at **complementary layers** of the AI agent stack:

```
┌─────────────────────────────────────────────────────┐
│ AI Agents (Claude Code, LangGraph, CrewAI)         │
│ ↓ MCP protocol                                     │
│ kubestellar-mcp (cluster inspection + operations)  │ ← KubeStellar layer
│ ↓                                                  │
│ KubeStellar Console (dashboard + Stellar runtime)  │ ← KubeStellar layer
│ ↓                                                  │
│ Kagenti (agent lifecycle management on K8s)        │ ← Kagenti layer
│ ↓                                                  │
│ Kubernetes Clusters (multi-cluster fleet)          │ ← KubeStellar Core layer
└─────────────────────────────────────────────────────┘
```

**Kagenti** manages AI agent orchestration, scheduling, and lifecycle on Kubernetes.  
**KubeStellar Console** provides the multi-cluster dashboard, observability, and Stellar AI runtime.  
**Together**: A production-ready AI agent platform on Kubernetes.

## What Kagenti Provides

### Core Features
- **A2A Protocol Support**: Implements Google's Agent-to-Agent communication standard
- **MCP Integration**: Full Model Context Protocol compliance
- **Framework-Neutral**: Works with LangGraph, CrewAI, AutoGen, and custom frameworks
- **Kubernetes-Native**: CRDs for agents, workflows, and tasks
- **Scalable Orchestration**: Multi-tenant agent scheduling across K8s clusters
- **Security**: RBAC-aware agent execution, secret management, network policies

### Use Cases
- Multi-agent workflows (coordinator + specialized agents)
- Long-running autonomous agents
- Event-driven agent execution (Kubernetes events, webhooks, schedules)
- Agent-to-agent collaboration (A2A protocol)

## KubeStellar + Kagenti Integration

### Current Integration Points

#### 1. **Guided Kagenti Installation**
KubeStellar Console KB includes the `install-kagenti` mission:
```bash
# From the KubeStellar Console dashboard:
# Missions → Browse → Search "Kagenti" → Run mission
```

This mission:
- Deploys Kagenti control plane to the selected cluster
- Configures CRDs (AgentDeployment, AgentTask, AgentWorkflow)
- Sets up RBAC for agent execution
- Validates installation with health checks

#### 2. **kubestellar-mcp + Kagenti**
The `kubestellar-mcp` server (MCP protocol for Claude Code, Cursor, Windsurf) can interact with Kagenti-managed agents:
- Query agent status via Kagenti CRDs
- Trigger agent workflows from the console
- Monitor agent execution logs

#### 3. **Stellar + Kagenti**
KubeStellar Console's **Stellar runtime** (persistent AI missions) can delegate tasks to Kagenti agents:
- Stellar detects a cluster issue (e.g., pod crash loop)
- Stellar triggers a Kagenti agent workflow to investigate
- Kagenti agent executes, reports findings back to Stellar
- Stellar proposes remediation based on agent results

### Roadmap Integration (H2 2026)

#### **Kagenti Dashboard Card**
A dedicated dashboard card showing:
- Active Kagenti agents across clusters
- Agent workflow status (running, completed, failed)
- A2A communication graph (which agents are talking to each other)
- Resource usage per agent

#### **Kagenti Mission Templates**
Pre-built missions in console-kb:
- "Deploy LangGraph agent to cluster"
- "Create multi-agent RAG pipeline"
- "Configure A2A agent mesh"

#### **Agent Observability**
Integration with KubeStellar Console's observability stack:
- Agent logs → dashboard drill-down
- Agent metrics → Prometheus integration
- Agent traces → OpenTelemetry export

## Architecture: Complete AI Stack on Kubernetes

### The Three Layers

| Layer | Responsibility | Tool |
|-------|---------------|------|
| **Agent Development** | Write, test, and debug AI agents | Claude Code, Cursor, Windsurf + kubestellar-mcp |
| **Agent Orchestration** | Deploy, schedule, and manage agents on K8s | Kagenti |
| **Cluster Management** | Multi-cluster observability, Stellar AI runtime | KubeStellar Console |

### Example Workflow

1. **Developer** writes an AI agent using Claude Code with kubestellar-mcp
2. **Kagenti** deploys the agent to a Kubernetes cluster as an `AgentDeployment` CRD
3. **KubeStellar Console** monitors agent health via dashboard card
4. **Stellar runtime** detects cluster drift, triggers Kagenti agent to investigate
5. **Kagenti agent** runs, reports findings via A2A protocol
6. **Stellar** proposes remediation based on agent analysis
7. **Human operator** reviews in KubeStellar Console, approves fix
8. **Kagenti agent** executes remediation, KubeStellar Console validates success

## Partnership Activities

### Joint Outreach

#### 1. **CNCF Slack Announcement** (#ai-ml, #kubestellar)
*"KubeStellar Console KB ships a guided Kagenti install mission — Kagenti + kubestellar-mcp + Stellar runtime forms a complete AI agent stack on Kubernetes. Check it out: [link]"*

#### 2. **Joint Blog Post** (Target: CNCF Blog)
**Title**: "Building a Production AI Agent Platform on Kubernetes: Kagenti + KubeStellar Console + Stellar Runtime"  
**Content**:
- The AI agent orchestration landscape (why Kubernetes?)
- Layer-by-layer breakdown (agent dev, orchestration, cluster management)
- Demo: Deploying a multi-agent RAG pipeline with Kagenti + KubeStellar
- How A2A and MCP standards enable interop

#### 3. **KubeCon NA 2026 Joint Talk Proposal**
**Title**: "The Complete AI Agent Stack on Kubernetes: A2A + MCP + Multi-Cluster Orchestration"  
**Speakers**: Kagenti maintainer + KubeStellar maintainer  
**Track**: Platform Engineering or AI/ML  
**Content**:
- Live demo: Deploy, monitor, and debug a multi-agent workflow
- Show A2A communication between agents
- Demonstrate Stellar AI runtime delegating to Kagenti agents

#### 4. **Cross-Repository Integration**
- **Kagenti README**: Add KubeStellar Console to "Ecosystem Integrations" section
- **KubeStellar Console README**: Add Kagenti to "Supported AI Agent Platforms"
- **Mutual GitHub topics**: Both repos add `a2a-protocol`, `mcp`, `ai-agents-on-k8s`

### Technical Collaboration

#### 1. **CRD Compatibility**
Ensure KubeStellar Console's Stellar CRDs (Mission, MissionExecution) can reference Kagenti CRDs (AgentDeployment, AgentTask) as mission targets.

#### 2. **Event Gateway Integration**
KubeStellar Console's **Event Gateway** (part of Stellar) can emit events that trigger Kagenti agent workflows:
- Prometheus alert → Event Gateway → Kagenti AgentTask
- Kubernetes event (pod crash) → Event Gateway → Kagenti agent investigates

#### 3. **Shared MCP Tooling**
Kagenti and KubeStellar both implement MCP servers. Collaborate on:
- Shared MCP tool definitions (e.g., `kubectl` wrapper, cluster inspection)
- MCP proxy architecture (route MCP requests to Kagenti agents)

## Getting Started

### Install Kagenti via KubeStellar Console

1. **Open KubeStellar Console**
2. Navigate to **Missions → Browse**
3. Search for **"Kagenti"**
4. Click **"Run Mission: Install Kagenti"**
5. Select target cluster
6. Review mission steps, click **Execute**
7. Verify installation in the Kagenti dashboard card (coming in v0.4)

### Manual Installation

```bash
# Install Kagenti to current kubeconfig context
kubectl apply -f https://github.com/kagenti/kagenti/releases/latest/download/install.yaml

# Verify installation
kubectl get crd | grep kagenti
```

### Deploy Your First Agent

```yaml
apiVersion: kagenti.io/v1alpha1
kind: AgentDeployment
metadata:
  name: cluster-health-agent
spec:
  framework: langraph
  image: ghcr.io/your-org/health-agent:latest
  schedule: "0 2 * * *"  # Run daily at 2am
  mcpEndpoint: http://kubestellar-console:8080/mcp
```

## Community & Resources

- **Kagenti GitHub**: [github.com/kagenti](https://github.com/kagenti)
- **KubeStellar Console**: [github.com/kubestellar/console](https://github.com/kubestellar/console)
- **CNCF Slack**: `#kubestellar`, `#ai-ml`
- **Docs**: [console.kubestellar.io/docs/partnerships/kagenti](https://console.kubestellar.io/docs/partnerships/kagenti)

## Next Steps

- [ ] File upstream issue in Kagenti repo proposing integration discussion
- [ ] Create Kagenti dashboard card in KubeStellar Console v0.4
- [ ] Submit joint KubeCon NA 2026 CFP (deadline: TBD)
- [ ] Draft joint blog post for CNCF blog
- [ ] Add Kagenti to KubeStellar Console README "Ecosystem Integrations"

---

**Together, Kagenti and KubeStellar Console deliver the complete AI agent platform for Kubernetes.**
