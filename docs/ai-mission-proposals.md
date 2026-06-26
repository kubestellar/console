# AI Mission Proposals for KubeStellar Console

> Research & ideation document for new AI mission types.
> Generated: 2026-02-06

---

## Table of Contents

1. [Current State Summary](#current-state-summary)
2. [Gap Analysis](#gap-analysis)
3. [Proposed Missions](#proposed-missions)
   - [1. Capacity Forecast & Right-Sizing](#1-capacity-forecast--right-sizing)
   - [2. Security Hardening Advisor](#2-security-hardening-advisor)
   - [3. Cost Optimization Sweep](#3-cost-optimization-sweep)
   - [4. Compliance Audit & Remediation](#4-compliance-audit--remediation)
   - [5. Incident Runbook Executor](#5-incident-runbook-executor)
   - [6. Cross-Cluster Drift Reconciler](#6-cross-cluster-drift-reconciler)
   - [7. Upgrade Impact Analyzer](#7-upgrade-impact-analyzer)
   - [8. Network Policy Generator](#8-network-policy-generator)
   - [9. GPU Workload Optimizer](#9-gpu-workload-optimizer)
   - [10. Chaos Engineering Probe](#10-chaos-engineering-probe)
   - [11. RBAC Least-Privilege Auditor](#11-rbac-least-privilege-auditor)
   - [12. Secret & Certificate Rotation Planner](#12-secret--certificate-rotation-planner)
   - [13. Multi-Cluster Application Health Correlator](#13-multi-cluster-application-health-correlator)
   - [14. LLM-d Inference Latency Profiler](#14-llm-d-inference-latency-profiler)
   - [15. Proactive Maintenance Scheduler](#15-proactive-maintenance-scheduler)
   - [16. Namespace Lifecycle Manager](#16-namespace-lifecycle-manager)
   - [17. Cluster Onboarding Wizard](#17-cluster-onboarding-wizard)
   - [18. Post-Mortem Generator](#18-post-mortem-generator)
4. [Architecture Considerations](#architecture-considerations)
5. [Priority Ranking](#priority-ranking)

---

## Current State Summary

### Existing Mission Types

| Type | Description | Trigger Points |
|------|-------------|----------------|
| `troubleshoot` | Diagnose issues with pods, deployments, alerts, operators | Drilldown views, Alerts, Suggestions |
| `repair` | Fix pod/deployment issues with AI-guided remediation | Pod drilldown ("Repair Pod") |
| `analyze` | General analysis of security, drift, workloads | Suggestions, Drilldowns |
| `deploy` | Multi-cluster deployment tracking and troubleshooting | Deploy dashboard |
| `upgrade` | Cluster/component upgrade guidance | Not yet fully used |
| `custom` | User-defined free-form AI task | Search bar, Mission sidebar |

### Existing Auto-Suggestions (7 types)

- **restart** - Pods restarting >5 times
- **unavailable** - Deployments with missing replicas
- **security** - High-severity security issues
- **health** - Unhealthy/unreachable clusters
- **resource** - Node CPU/memory >85%
- **limits** - Pods without resource limits configured
- **scale** - Potential scaling needs

### Existing AI Features

- **AI Predictions** - Background failure forecasting (pod-crash, node-pressure, GPU exhaustion, anomaly)
- **AI Insights** - LLM-d stack optimization recommendations
- **Diagnose/Repair Loop** - Structured scanning -> diagnosis -> proposal -> approval -> repair -> verify
- **Resolution Knowledge Base** - Save and auto-match successful troubleshooting resolutions
- **Multi-Agent Support** - Claude, Claude Code, OpenAI, Gemini, Bob

### Console Feature Surface (available for mission leverage)

- **24 dashboards**, **150+ card types**
- **13 drilldown view types** (pod, node, deployment, namespace, helm, ArgoCD, etc.)
- **Full kubectl proxy** - agents can execute kubectl get/describe/logs/top/scale/delete/rollout
- **MCP tools** - kubestellar-ops (RBAC, security, events, gatekeeper) + kubestellar-deploy (deploy, scale, patch, helm, kustomize, drift)
- **Hardware tracking** - GPU, NIC, NVMe, InfiniBand device monitoring per node
- **GitOps** - Helm, Kustomize, ArgoCD integration
- **RBAC analysis** - Full role/binding/permission checking
- **Notifications** - Native OS, Slack, email, webhook channels

---

## Gap Analysis

| Gap Area | What Exists | What's Missing |
|----------|-------------|----------------|
| **Capacity planning** | Predictions detect pressure | No mission to right-size resources or plan ahead |
| **Cost optimization** | Cost cards (demo data) | No AI mission to analyze waste and propose savings |
| **Security hardening** | Security scan cards, RBAC check | No multi-step mission to progressively harden a cluster |
| **Compliance enforcement** | OPA/Kyverno/Trivy cards (demo) | No mission to audit against a standard and remediate |
| **Incident response** | Troubleshoot single resource | No structured multi-resource incident workflow |
| **Drift remediation** | Drift detection exists | No mission to analyze drift cause and safely reconcile |
| **Upgrade planning** | Upgrade status card | No mission to analyze impact, drain nodes, coordinate upgrade |
| **Network policy** | Network cards exist | No mission to generate or validate network policies |
| **GPU optimization** | GPU monitoring cards | No mission to optimize GPU scheduling or bin-packing |
| **Chaos testing** | None | No proactive resilience testing |
| **RBAC auditing** | Permission checking | No mission to audit for over-permissioned subjects |
| **Secret rotation** | Cert-manager/Vault cards (demo) | No mission to audit and plan credential rotation |
| **Cross-cluster correlation** | Per-cluster health | No mission to correlate issues across clusters |
| **LLM-d profiling** | Flow/KV/EPP cards | No mission to profile end-to-end inference latency |
| **Proactive maintenance** | Hardware alerts | No scheduled proactive maintenance workflow |
| **Namespace lifecycle** | Namespace overview | No mission to find stale/unused namespaces |
| **Cluster onboarding** | Cluster list | No guided workflow to onboard a new cluster |
| **Post-mortems** | Mission history | No auto-generated post-mortem from resolved incidents |

---

## Proposed Missions

### 1. Capacity Forecast & Right-Sizing

**Mission Name:** `capacity-plan`
**Type:** `analyze`
**Priority:** Critical

**Description:**
A multi-step mission that examines resource utilization across selected clusters, identifies over-provisioned and under-provisioned workloads, and generates concrete right-sizing recommendations with projected savings.

**How It Works:**
1. Agent runs `kubectl top pods` and `kubectl top nodes` across target clusters
2. Compares current requests/limits against actual usage (last 24h/7d trend from metrics history API)
3. Identifies workloads where actual usage is <30% of requests (over-provisioned) or >90% of limits (under-provisioned)
4. Calculates optimal requests/limits based on P95 usage + headroom
5. Generates a patch manifest the user can review and apply
6. Optionally projects future capacity needs based on growth trends

**Console Features Leveraged:**
- `kubectl top` via agent proxy
- `/metrics/history` API for trends
- Prediction engine data (resource-trend, capacity-risk)
- Resource Usage / Resource Capacity / Resource Trend cards
- Node drilldown for per-node analysis
- `kubestellar-deploy__patch_app` to apply patches

**User Value:**
- Avoid surprise OOM kills and CPU throttling
- Reduce cloud spend by eliminating over-provisioning
- Proactive capacity planning instead of reactive fire-fighting
- Concrete, actionable patches rather than vague recommendations

**Suggested Trigger Points:**
- Auto-suggestion when >20% of pods have requests >3x actual usage
- Auto-suggestion when any node exceeds 85% capacity
- Manual from Resource Usage card or Node drilldown
- Scheduled weekly capacity review

---

### 2. Security Hardening Advisor

**Mission Name:** `security-harden`
**Type:** `analyze` + `repair`
**Priority:** Critical

**Description:**
A progressive, multi-step mission that performs a comprehensive security audit of a cluster or namespace and walks the user through hardening each finding. Unlike the existing one-shot security scan, this mission chains multiple checks, prioritizes by risk, and offers guided remediation with approval gates.

**How It Works:**
1. **Scan phase:** Agent runs `check_security_issues` (MCP), checks for privileged containers, host network, missing security contexts, running as root
2. **RBAC scan:** Agent analyzes overly permissive ClusterRoleBindings (e.g., cluster-admin bound to large groups)
3. **Network exposure:** Checks for services with `type: LoadBalancer` or `NodePort` without network policies
4. **Image scan:** Identifies pods running `:latest` tags or unscanned images
5. **Prioritization:** Ranks all findings by severity and blast radius
6. **Guided remediation:** For each finding, proposes a specific fix (SecurityContext patch, NetworkPolicy manifest, RBAC restriction) and waits for user approval before applying
7. **Verification:** Re-runs scan after each fix to confirm remediation

**Console Features Leveraged:**
- `kubestellar-ops__check_security_issues` MCP tool
- `kubestellar-ops__get_cluster_roles` / `get_cluster_role_bindings`
- `kubestellar-deploy__kubectl_apply` for patches
- Security dashboard cards
- RBAC drilldown views

**User Value:**
- Systematic, not ad-hoc, security improvement
- No security expertise required - AI explains each risk and fix
- Approval gates prevent accidental lockouts
- Verification ensures fixes actually work
- Can resume where you left off across sessions

**Suggested Trigger Points:**
- Auto-suggestion when >5 critical security issues detected
- Manual from Security dashboard
- Scheduled monthly security review
- After cluster onboarding (new cluster = full audit)

---

### 3. Cost Optimization Sweep

**Mission Name:** `cost-optimize`
**Type:** `analyze`
**Priority:** High

**Description:**
Analyzes spending patterns across clusters to find cost reduction opportunities: idle resources, orphaned PVCs, oversized node pools, under-utilized GPU nodes, and duplicate workloads running across too many clusters.

**How It Works:**
1. **Idle resource detection:** Find deployments scaled to 0 for >7 days, jobs completed but not cleaned up, pods in Succeeded/Failed state lingering
2. **Orphaned storage:** PVCs in Released/Available state without active consumers, PVs not bound
3. **GPU waste:** GPU nodes with <50% GPU utilization, pods requesting GPUs but not using them
4. **Node pool analysis:** Nodes with <30% resource utilization suggesting consolidation opportunity
5. **Duplicate workload detection:** Same app name running on too many clusters (could consolidate)
6. **Generates report:** Estimated monthly savings for each recommendation with implementation steps
7. **Cleanup assistance:** Offers to delete orphaned resources (with approval)

**Console Features Leveraged:**
- GPU dashboard cards (gpu_overview, gpu_utilization, gpu_workloads)
- Storage cards (pvc_status, storage_overview)
- Cost management cards (kubecost_overview, opencost_overview)
- `kubestellar-deploy__get_app_instances` for cross-cluster app detection
- `kubectl get pvc/pv` via agent proxy
- Resource capacity / trend cards

**User Value:**
- Direct cost savings with minimal effort
- Cleanup of accumulated technical debt (orphaned resources)
- GPU utilization improvement (GPUs are expensive)
- Reduces cluster sprawl
- Quantified savings make it easy to justify to management

**Suggested Trigger Points:**
- Scheduled weekly/monthly sweep
- Auto-suggestion when orphaned PVCs detected
- Auto-suggestion when GPU utilization <50%
- Manual from Cost dashboard

---

### 4. Compliance Audit & Remediation

**Mission Name:** `compliance-audit`
**Type:** `analyze` + `repair`
**Priority:** High

**Description:**
Audits clusters against a compliance framework (CIS Kubernetes Benchmark, NIST, SOC2, PCI-DSS, or custom) and produces an actionable report with severity rankings. For each violation, offers a specific remediation that the user can approve and apply.

**How It Works:**
1. **Framework selection:** User picks a compliance framework (or "general best practices")
2. **Control enumeration:** Agent maps framework controls to concrete Kubernetes checks:
   - CIS: API server flags, etcd encryption, audit logging, RBAC restrictions, pod security standards
   - PCI-DSS: Network segmentation, access logging, encryption in transit
   - SOC2: Access controls, monitoring, incident response capabilities
3. **Scan execution:** Runs checks against cluster state using kubectl + MCP tools
4. **Report generation:** Produces compliance scorecard with pass/fail/warning per control
5. **Remediation:** For each failure, generates a remediation manifest or command
6. **Evidence collection:** Captures scan results as artifacts for audit trail
7. **Tracking:** Saves compliance state for trend tracking over time

**Console Features Leveraged:**
- Compliance dashboard cards (compliance_score, policy_violations, opa_policies, kyverno_policies)
- `kubestellar-ops__check_security_issues`
- `kubestellar-ops__check_resource_limits`
- RBAC analysis tools
- Namespace RBAC drilldown
- Resolution knowledge base (save compliance fixes)

**User Value:**
- Audit readiness without hiring consultants
- Continuous compliance, not point-in-time checks
- Evidence artifacts for auditors
- Remediation guidance specific to your cluster
- Tracks compliance posture improvement over time

---

### 5. Incident Runbook Executor

**Mission Name:** `incident-response`
**Type:** `troubleshoot` + `repair`
**Priority:** Critical

**Description:**
A structured incident response workflow that goes beyond single-resource troubleshooting. When a user reports "the application is down," this mission coordinates investigation across pods, deployments, services, ingress, DNS, nodes, and events to find the root cause, then walks through remediation.

**How It Works:**
1. **Triage:** User describes the symptom (app down, high latency, 5xx errors, etc.)
2. **Impact assessment:** Agent checks how many pods/services/clusters are affected
3. **Systematic investigation:**
   - Check pod status across all namespaces for the app (`get_app_status` MCP)
   - Check service endpoints and ingress rules
   - Check recent events and warning events
   - Check node health where affected pods run
   - Check recent deployments/changes that may have caused the issue
   - Pull logs from affected pods
4. **Root cause hypothesis:** Agent forms a hypothesis and explains its reasoning
5. **Remediation options:** Presents multiple options ranked by risk:
   - Rollback deployment (low risk)
   - Scale up replicas (low risk)
   - Restart affected pods (medium risk)
   - Apply configuration fix (medium risk)
   - Node drain and reschedule (high risk)
6. **Execute with approval:** Performs selected remediation with user confirmation
7. **Verify recovery:** Checks that the app returns to healthy state
8. **Post-mortem prompt:** Offers to generate a post-mortem document (see Mission #18)

**Console Features Leveraged:**
- `kubestellar-deploy__get_app_status` for cross-cluster health
- `kubestellar-deploy__get_app_logs` for cross-cluster logs
- `kubestellar-ops__find_pod_issues` / `find_deployment_issues`
- `kubestellar-ops__get_warning_events`
- Event stream / Timeline cards
- Pod, Deployment, Service drilldowns
- Helm rollback tools
- Resolution knowledge base (auto-match similar incidents)

**User Value:**
- Reduces MTTR (mean time to resolution) dramatically
- Structured approach prevents panic-driven debugging
- Cross-resource correlation that humans often miss
- Preserves incident context for team handoff
- Builds organizational knowledge via saved resolutions

**Suggested Trigger Points:**
- Manual (user reports an incident)
- Auto-suggestion when multiple pods enter CrashLoopBackOff simultaneously
- Auto-suggestion when an app goes from healthy to degraded across clusters
- Triggered from alert drilldown (critical alert -> start incident response)

---

### 6. Cross-Cluster Drift Reconciler

**Mission Name:** `drift-reconcile`
**Type:** `analyze` + `repair`
**Priority:** High

**Description:**
Goes beyond drift detection to understand *why* drift occurred, assess whether the drift is intentional or accidental, and safely reconcile the desired state. Handles the nuance of multi-cluster environments where some drift may be by design (region-specific config) vs. accidental.

**How It Works:**
1. **Detection:** Runs `detect_drift` MCP tool against git repository for all clusters
2. **Classification:** For each drifted resource, asks:
   - Is this a known cluster-specific override? (checks annotations, labels)
   - Was this changed by a human (managedFields check) or by a controller?
   - How recently was it changed? (could be an in-progress rollout)
   - Does this drift match a pattern of intentional customization?
3. **Risk assessment:** Tags each drift as:
   - `safe-to-reconcile` - Accidental drift, git is correct
   - `investigate` - Ambiguous, needs human review
   - `intentional` - Cluster-specific override, should be codified
4. **Remediation options:**
   - Reconcile safe drifts automatically
   - Present ambiguous drifts for human decision
   - For intentional drifts: offer to create a Kustomize overlay or Helm values override
5. **Apply:** Uses `kubestellar-deploy__reconcile` for safe drifts, `kubectl_apply` for custom fixes
6. **Codify:** Offers to commit cluster-specific overrides back to git to prevent future drift

**Console Features Leveraged:**
- `kubestellar-deploy__detect_drift` / `kubestellar-ops__detect_drift`
- `kubestellar-deploy__reconcile` for safe reconciliation
- `kubestellar-deploy__preview_changes` for dry-run
- `kubestellar-ops__find_resource_owners` for managedFields analysis
- GitOps dashboard / Drift card
- Helm values diff card

**User Value:**
- Eliminates "drift fatigue" - not all drift is equal
- Prevents accidental reconciliation of intentional overrides
- Codifies cluster-specific configs into git (prevents recurrence)
- Reduces manual review burden by classifying drift automatically

---

### 7. Upgrade Impact Analyzer

**Mission Name:** `upgrade-analyze`
**Type:** `analyze`
**Priority:** High

**Description:**
Before upgrading a cluster, this mission performs a comprehensive impact analysis: checks API deprecations, tests workload compatibility, verifies resource budgets, and generates a step-by-step upgrade plan with rollback procedures.

**How It Works:**
1. **Version discovery:** Gets current version and available upgrades via `get_cluster_version_info`
2. **API deprecation check:** Compares current workload API versions against the target version's removals
   - Finds deployments using `extensions/v1beta1`, `autoscaling/v1`, etc.
   - Lists CRDs that may need updates
3. **Prerequisite check:** Runs `get_upgrade_prerequisites` to verify node health, operator readiness
4. **Pod Disruption Budget analysis:** Checks PDBs to estimate worst-case disruption during rolling upgrade
5. **Operator compatibility:** Checks if installed operators support the target version
6. **Helm chart compatibility:** Checks if Helm charts have newer versions that support the target K8s version
7. **Generates upgrade plan:**
   - Pre-upgrade steps (update deprecated APIs, update operators)
   - Upgrade execution order (control plane -> workers)
   - Expected downtime/disruption per workload
   - Rollback procedure if something goes wrong
   - Post-upgrade verification checklist
8. **Optional execution:** Can trigger the upgrade with user approval (OpenShift: `trigger_openshift_upgrade`)

**Console Features Leveraged:**
- `kubestellar-ops__get_cluster_version_info`
- `kubestellar-ops__get_upgrade_prerequisites`
- `kubestellar-ops__check_olm_operator_upgrades`
- `kubestellar-ops__check_helm_release_upgrades`
- `kubestellar-ops__trigger_openshift_upgrade`
- Upgrade Status card
- Helm / Operator cards

**User Value:**
- No surprise breakages after upgrade
- Clear understanding of what will be affected
- Step-by-step plan reduces human error
- API deprecation catches prevent post-upgrade failures
- Rollback plan provides safety net

---

### 8. Network Policy Generator

**Mission Name:** `netpol-generate`
**Type:** `analyze` + `repair`
**Priority:** Medium

**Description:**
Analyzes actual network traffic patterns (or service topology) in a namespace to generate least-privilege NetworkPolicy manifests. Starts with a "default deny" baseline and adds specific allow rules based on observed communication patterns.

**How It Works:**
1. **Service discovery:** Maps all services, pods, and their labels in target namespace
2. **Communication analysis:**
   - Examines service endpoints to find which pods talk to which services
   - Checks ingress/gateway resources for external access points
   - Analyzes pod annotations and known sidecar patterns (Istio, Linkerd)
3. **Policy generation:** Creates NetworkPolicy manifests:
   - Default deny ingress + egress for the namespace
   - Allow rules for each identified communication path
   - Allow DNS egress (required for most pods)
   - Allow health check probes from kubelet
4. **Dry-run validation:** Applies policies in dry-run mode to check for errors
5. **Review:** Presents policies with explanation of each rule
6. **Staged rollout:** Applies in monitoring mode first (if CNI supports), then enforcing

**Console Features Leveraged:**
- Service Topology card
- Network Overview card
- `kubectl get services,endpoints,ingress,networkpolicies`
- Service drilldown views
- `kubestellar-deploy__kubectl_apply` for applying policies

**User Value:**
- Zero-trust networking without manual policy authoring
- Reduces attack surface by restricting lateral movement
- Compliance requirement for many frameworks (PCI-DSS, NIST)
- Confidence that policies won't break existing traffic

---

### 9. GPU Workload Optimizer

**Mission Name:** `gpu-optimize`
**Type:** `analyze`
**Priority:** High (for AI/ML-heavy environments)

**Description:**
Optimizes GPU utilization across clusters by analyzing scheduling patterns, identifying GPU waste, recommending bin-packing improvements, and suggesting workload redistribution for better GPU efficiency.

**How It Works:**
1. **GPU inventory:** Uses hardware health tracking to map all GPUs across clusters
2. **Utilization analysis:** Checks GPU utilization per node via `kubectl top` and device plugin metrics
3. **Waste detection:**
   - Pods requesting GPUs but using <30% utilization
   - Pods requesting more GPUs than needed (fractional GPU opportunity)
   - GPU nodes running non-GPU workloads (wasting expensive resources)
   - Time-based patterns (GPUs idle at night for batch training jobs)
4. **Scheduling optimization:**
   - Recommend taints/tolerations to reserve GPU nodes for GPU workloads
   - Suggest node affinity rules for GPU workloads
   - Recommend MIG (Multi-Instance GPU) partitioning where applicable
5. **Cross-cluster rebalancing:** If some clusters have idle GPUs while others are saturated, suggest redistribution
6. **LLM-d specific:** For inference stacks, analyze prefill vs decode GPU allocation balance

**Console Features Leveraged:**
- GPU dashboard (gpu_overview, gpu_status, gpu_inventory, gpu_utilization, gpu_workloads)
- Hardware Health card (device tracking)
- LLM-d cards (llmd_flow, pd_disaggregation)
- `kubestellar-deploy__find_clusters_for_workload` (GPU-aware placement)
- `kubestellar-deploy__list_cluster_capabilities`
- Node drilldown (GPU details)

**User Value:**
- GPUs cost $2-10/hour each - even small utilization improvements save thousands
- Prevents GPU starvation for critical ML workloads
- Identifies time-based patterns for spot/preemptible scheduling
- LLM-d specific optimizations for inference workloads

---

### 10. Chaos Engineering Probe

**Mission Name:** `chaos-probe`
**Type:** `analyze`
**Priority:** Medium

**Description:**
A controlled resilience assessment that tests how well the cluster handles failures. Rather than injecting actual chaos, it *simulates* failure scenarios by analyzing current state and identifying what would break, creating a resilience report without any risk.

**How It Works:**
1. **Scenario selection:** User picks scenarios to evaluate:
   - "What if this node goes down?"
   - "What if this namespace's pods all restart?"
   - "What if the database service becomes unreachable?"
   - "What if GPU node X loses its GPUs?"
2. **Impact analysis (read-only):**
   - Checks PodDisruptionBudgets - would they prevent scheduling?
   - Checks replica counts - are there enough replicas to survive?
   - Checks pod anti-affinity - are replicas spread across nodes?
   - Checks resource headroom - can other nodes absorb the workload?
   - Checks persistent storage - are PVs on the affected node?
3. **Resilience scoring:** Rates each workload's resilience (A-F grade)
4. **Improvement recommendations:**
   - Add PDBs where missing
   - Increase replica count for single-replica deployments
   - Add pod anti-affinity rules
   - Configure pod topology spread constraints
5. **Optional hardening:** Offers to apply the recommended improvements

**Console Features Leveraged:**
- Node/Pod/Deployment drilldowns for state inspection
- Resource Capacity card for headroom analysis
- `kubectl get pdb,deploy,statefulset` for resilience data
- Hardware Health card (device failure scenarios)
- Cluster Groups for multi-cluster resilience

**User Value:**
- Understand resilience posture without causing outages
- Prioritize hardening efforts by impact
- Meet SLA requirements by ensuring redundancy
- Prepare for real failures before they happen

---

### 11. RBAC Least-Privilege Auditor

**Mission Name:** `rbac-audit`
**Type:** `analyze`
**Priority:** High

**Description:**
Audits all RBAC bindings in a cluster to identify overly permissive roles, unused service accounts, and permissions that violate the principle of least privilege. Generates specific recommendations to tighten access.

**How It Works:**
1. **Binding enumeration:** Lists all ClusterRoleBindings and RoleBindings
2. **High-risk detection:**
   - Subjects bound to `cluster-admin` (who has god-mode?)
   - Wildcard permissions (`*` on resources or verbs)
   - `escalate` or `bind` verbs (can create more powerful roles)
   - ServiceAccounts with secrets access across namespaces
3. **Usage analysis:** Cross-references with audit logs (if available) to find unused permissions
4. **Service account audit:**
   - Default service accounts with non-default permissions
   - Service accounts not mounted by any pod (orphaned)
   - Pods not opting out of automountServiceAccountToken
5. **Recommendation generation:**
   - For each overly-broad binding, generates a tighter replacement
   - Suggests namespace-scoped roles instead of cluster-scoped where possible
   - Recommends removing unused bindings
6. **Remediation:** Offers to apply the tightened RBAC with approval

**Console Features Leveraged:**
- `kubestellar-ops__get_cluster_roles` / `get_cluster_role_bindings`
- `kubestellar-ops__get_roles` / `get_role_bindings`
- `kubestellar-ops__analyze_subject_permissions`
- `kubestellar-ops__describe_role`
- Namespace RBAC drilldown
- User Management card

**User Value:**
- Reduces blast radius of compromised credentials
- Compliance requirement (SOC2, CIS, NIST)
- Identifies privilege escalation paths
- Cleans up accumulated RBAC sprawl

---

### 12. Secret & Certificate Rotation Planner

**Mission Name:** `secret-rotation`
**Type:** `analyze`
**Priority:** Medium

**Description:**
Scans all secrets and certificates across clusters, identifies those approaching expiration or that haven't been rotated in a long time, and generates a rotation plan with prioritized actions.

**How It Works:**
1. **Secret inventory:** Lists all secrets across target clusters/namespaces
2. **Certificate analysis:**
   - TLS secrets: Extract and check certificate expiration dates
   - cert-manager certificates: Check renewal status and issuer health
   - Service account tokens: Check token age
3. **Risk classification:**
   - `critical` - Expires within 7 days
   - `warning` - Expires within 30 days
   - `info` - Hasn't been rotated in >90 days
4. **Rotation plan:**
   - Priority-ordered list of secrets/certs to rotate
   - For cert-manager managed certs: trigger renewal
   - For manual certs: generate renewal commands
   - For service account tokens: rotation procedure
5. **Dependency mapping:** Shows which pods/services depend on each secret
6. **Execution:** For cert-manager certs, can trigger rotation automatically

**Console Features Leveraged:**
- Cert Manager card
- Vault Secrets / External Secrets cards
- `kubectl get secrets,certificates` via agent
- Data Compliance dashboard
- Namespace drilldown (secrets section)

**User Value:**
- Prevents outages from expired certificates (a top-3 cause of production incidents)
- Compliance requirement for credential rotation
- Visibility into credential hygiene across clusters
- Automated rotation where tooling supports it

---

### 13. Multi-Cluster Application Health Correlator

**Mission Name:** `app-correlate`
**Type:** `troubleshoot`
**Priority:** High

**Description:**
When an application runs across multiple clusters, diagnosing issues requires correlating signals from all instances simultaneously. This mission provides a unified view of app health across clusters and identifies patterns that single-cluster analysis would miss.

**How It Works:**
1. **App discovery:** Uses `get_app_instances` to find all instances of the app
2. **Health aggregation:** Collects status from each cluster:
   - Pod readiness, restart counts, events
   - Service endpoint health
   - Resource utilization
   - Recent deployment changes
3. **Cross-cluster correlation:**
   - Did all clusters degrade at the same time? (upstream dependency issue)
   - Did only certain clusters degrade? (cluster-specific issue)
   - Did clusters degrade sequentially? (rolling deployment issue)
   - Are failure modes the same? (common root cause vs. coincidence)
4. **Dependency analysis:** Identifies shared dependencies (shared database, external API, DNS)
5. **Root cause hypothesis:** Forms and ranks hypotheses based on patterns
6. **Remediation:** Cluster-targeted fixes based on where the issue manifests

**Console Features Leveraged:**
- `kubestellar-deploy__get_app_instances`
- `kubestellar-deploy__get_app_status`
- `kubestellar-deploy__get_app_logs` (cross-cluster logs)
- Cluster Comparison card
- Cluster Health card
- Deployment Status card

**User Value:**
- Cuts through the noise of multi-cluster debugging
- Identifies patterns invisible when looking at one cluster at a time
- Shared dependency detection prevents misdiagnosis
- Faster resolution for distributed application issues

---

### 14. LLM-d Inference Latency Profiler

**Mission Name:** `llmd-profile`
**Type:** `analyze`
**Priority:** High (for AI/ML environments)

**Description:**
Profiles end-to-end inference latency through the LLM-d stack (gateway -> EPP -> prefill -> decode -> response) to identify bottlenecks and recommend optimizations. Correlates KV cache hit rates, queue depths, and routing decisions with latency measurements.

**How It Works:**
1. **Stack discovery:** Identifies all LLM-d stacks using StackContext
2. **Component profiling:** For each stack component:
   - Gateway: Check routing rules, connection pool status
   - EPP: Analyze routing distribution, queue depth
   - Prefill pods: Check GPU utilization, batch sizes, processing times
   - Decode pods: Check KV cache utilization, throughput
   - VariantAutoscaler: Check scaling decisions and response times
3. **Bottleneck identification:**
   - KV cache miss rate too high (memory thrashing)
   - Prefill/Decode imbalance (disaggregation ratio off)
   - EPP routing not distributing evenly
   - Queue depth building up (capacity issue)
   - GPU memory approaching limits
4. **Optimization recommendations:**
   - Adjust prefill/decode ratio
   - Tune KV cache size parameters
   - Modify EPP routing weights
   - Scale specific components (prefill vs decode independently)
   - Suggest model quantization if GPU memory is bottleneck
5. **What-if analysis:** "If you add 2 more decode pods, estimated throughput increase: X%"

**Console Features Leveraged:**
- LLMd Flow card (request flow visualization)
- KV Cache Monitor card
- EPP Routing card
- PD Disaggregation card
- LLMd Benchmarks card
- LLMd Stack Monitor card
- StackContext (live stack data)
- GPU Utilization cards

**User Value:**
- LLM inference is latency-sensitive - small improvements matter
- Identifies which component to scale rather than scaling everything
- KV cache tuning directly impacts cost and performance
- Disaggregation ratio optimization for multi-GPU setups

---

### 15. Proactive Maintenance Scheduler

**Mission Name:** `maintenance-plan`
**Type:** `analyze`
**Priority:** Medium

**Description:**
Generates a prioritized maintenance schedule based on cluster health signals: upcoming certificate expirations, pending OS updates, node age, disk usage trends, and hardware health alerts. Creates a maintenance window plan with pre/post checks.

**How It Works:**
1. **Signal collection:**
   - Certificate expiration dates (see Mission #12)
   - Node uptime / last reboot time
   - Disk usage trends (approaching capacity)
   - Hardware alerts (device disappearances, degradation)
   - Pending operator/Helm chart upgrades
   - Kubernetes version end-of-life timeline
2. **Priority scoring:** Each maintenance item scored by:
   - Urgency (how soon before it becomes a problem)
   - Impact (how many workloads affected)
   - Risk (how disruptive is the maintenance)
3. **Maintenance window generation:**
   - Groups related items into efficient maintenance windows
   - Suggests optimal timing (low-traffic periods)
   - Orders operations to minimize disruption
   - Includes pre-checks (PDB verification, replica counts)
   - Includes post-checks (health verification)
4. **Calendar export:** Generates maintenance schedule in a reviewable format

**Console Features Leveraged:**
- Hardware Health card (device alerts)
- Upgrade Status card
- Cert Manager card
- `kubestellar-ops__get_upgrade_prerequisites`
- `kubestellar-ops__check_helm_release_upgrades`
- Node drilldown
- Prediction engine data

**User Value:**
- Shifts from reactive to proactive operations
- Avoids maintenance windows that conflict with each other
- Ensures nothing falls through the cracks
- Reduces unplanned downtime by addressing issues before they become incidents

---

### 16. Namespace Lifecycle Manager

**Mission Name:** `namespace-cleanup`
**Type:** `analyze` + `repair`
**Priority:** Medium

**Description:**
Audits all namespaces across clusters to find stale, abandoned, or misconfigured namespaces. Identifies candidates for cleanup and ensures active namespaces have proper resource quotas, limit ranges, and RBAC.

**How It Works:**
1. **Activity analysis:** For each namespace:
   - Last deployment/scale event
   - Last pod creation/restart
   - Number of running pods
   - Last human kubectl access (if audit logs available)
2. **Stale detection:** Namespaces with no activity in >30 days and no running workloads
3. **Misconfiguration check:**
   - Namespaces without ResourceQuota
   - Namespaces without LimitRange
   - Namespaces without NetworkPolicy
   - Namespaces without RBAC restrictions (everyone has access)
4. **Cost estimation:** Calculate resources consumed by stale namespaces
5. **Cleanup recommendations:**
   - Archive and delete truly abandoned namespaces
   - Add quotas/limits to unconstrained namespaces
   - Add RBAC to open namespaces
6. **Safe deletion:** For approved cleanups, backs up namespace resources before deletion

**Console Features Leveraged:**
- `kubestellar-ops__analyze_namespace`
- Namespace Overview card
- Namespace Quotas card
- Namespace RBAC card
- `kubestellar-ops__get_events` (activity checking)
- Resource Quota Status card

**User Value:**
- Eliminates namespace sprawl (common in dev/staging environments)
- Ensures all namespaces meet minimum governance standards
- Reclaims wasted resources from abandoned projects
- Enforces organizational standards consistently

---

### 17. Cluster Onboarding Wizard

**Mission Name:** `cluster-onboard`
**Type:** `deploy` + `analyze`
**Priority:** Medium

**Description:**
A guided, multi-step mission that takes a newly added cluster from bare-metal/cloud to production-ready. Checks baseline requirements, installs common tooling, configures monitoring, and validates readiness.

**How It Works:**
1. **Detection:** Identifies new clusters added to kubeconfig
2. **Baseline assessment:**
   - Cluster type detection (`detect_cluster_type`)
   - Kubernetes version check
   - Node count and capacity
   - Installed CRDs and operators
   - Networking (CNI) detection
3. **Standard tooling installation (user-selected):**
   - Monitoring: Prometheus stack via Helm
   - Logging: EFK/Loki stack
   - Ingress: NGINX or Gateway API
   - Policy: OPA Gatekeeper or Kyverno
   - Cert management: cert-manager
4. **Governance configuration:**
   - Default resource quotas for namespaces
   - Default limit ranges
   - RBAC setup (admin, developer, viewer roles)
   - Network policies (default deny)
   - Ownership labels policy (via Gatekeeper)
5. **Monitoring integration:**
   - Configure alerts for critical conditions
   - Set up console notification channels
   - Verify metrics collection
6. **Readiness validation:** Final health check and readiness report

**Console Features Leveraged:**
- `kubestellar-ops__detect_cluster_type`
- `kubestellar-ops__get_cluster_health`
- `kubestellar-ops__install_ownership_policy` (Gatekeeper)
- `kubestellar-deploy__helm_install` for tooling
- `kubestellar-deploy__kubectl_apply` for RBAC/quotas
- Settings (local cluster creation)
- Cluster Health card

**User Value:**
- Consistent cluster configuration across the fleet
- No missed steps when onboarding new clusters
- Reduces time from "new cluster" to "production-ready" from days to minutes
- Encodes organizational best practices as executable steps

---

### 18. Post-Mortem Generator

**Mission Name:** `post-mortem`
**Type:** `analyze`
**Priority:** Medium

**Description:**
After an incident is resolved (via any mission), this mission auto-generates a structured post-mortem document by analyzing the mission conversation, cluster events, and timeline of changes.

**How It Works:**
1. **Input:** Takes a completed mission (troubleshoot, repair, or incident-response) as input
2. **Timeline reconstruction:**
   - Extracts timestamps from mission conversation
   - Correlates with cluster events during the incident window
   - Identifies the first warning signal, escalation points, and resolution time
3. **Impact assessment:**
   - Which clusters/namespaces/workloads were affected
   - Duration of impact
   - Number of pods/services affected
4. **Root cause extraction:** Synthesizes the root cause from the mission conversation
5. **Document generation:**
   - **Incident summary** (1-2 sentences)
   - **Timeline** (chronological event log)
   - **Impact** (what was affected, for how long)
   - **Root cause** (why it happened)
   - **Resolution** (what was done to fix it)
   - **Action items** (prevent recurrence)
   - **Lessons learned**
6. **Distribution:** Can save to resolution knowledge base, copy to clipboard, or generate markdown

**Console Features Leveraged:**
- Mission conversation history
- Event Timeline card data
- Resolution knowledge base
- Warning Events data
- Cluster Health history

**User Value:**
- Post-mortems are often skipped because they're tedious - this makes it automatic
- Captures knowledge while it's fresh
- Structured format ensures completeness
- Builds organizational learning from incidents
- Compliance requirement for many organizations (documenting incident response)

---

## Architecture Considerations

### Mission Chaining

Several of these missions naturally chain together:

```
Incident Response (#5) --> Post-Mortem (#18) --> Resolution saved
Security Hardening (#2) --> Compliance Audit (#4) --> verify improvements
Upgrade Impact Analyzer (#7) --> Proactive Maintenance (#15) --> schedule upgrade
Capacity Forecast (#1) --> Cost Optimization (#3) --> right-size resources
Cluster Onboarding (#17) --> Security Hardening (#2) --> RBAC Audit (#11)
```

**Recommendation:** Implement a `next_mission` field in the mission result that suggests logical follow-up missions with pre-populated context.

### Scheduled/Recurring Missions

Some missions are most valuable when run periodically:

| Mission | Suggested Cadence | Trigger |
|---------|------------------|---------|
| Capacity Forecast | Weekly | Cron + threshold |
| Cost Optimization | Weekly | Cron |
| Compliance Audit | Monthly | Cron |
| RBAC Audit | Monthly | Cron |
| Secret Rotation | Daily check | Cron |
| Namespace Cleanup | Weekly | Cron |
| Maintenance Planner | Weekly | Cron |

**Recommendation:** Add a `MissionScheduler` that runs configured missions at intervals and surfaces results as notification cards on the dashboard, similar to how predictions work today.

### Multi-Phase Missions

Missions like Security Hardening (#2) and Compliance Audit (#4) may take many steps and span multiple user sessions.

**Recommendation:** Extend the mission model with:
- `phase: number` - Current phase in a multi-phase mission
- `checkpoint: object` - Serializable state to resume from
- `totalPhases: number` - How many phases in total
- `resumable: boolean` - Whether this mission supports resume

### Approval Gates

Missions that modify cluster state (#2, #4, #6, #8, #11, #16, #17) need strong approval gates.

**Recommendation:** Extend the diagnose/repair loop pattern to all modifying missions:
- `proposing` state shows what will change with a diff view
- User must explicitly approve each change
- Changes are applied with dry-run first
- Post-application verification confirms the change worked
- Rollback procedure documented for each change

### Cross-Cluster Mission Context

Several missions (#6, #13, #14) operate across clusters simultaneously.

**Recommendation:** Add a `targetClusters: string[]` field to missions so the agent knows which clusters to operate on. The UI should show a cluster selector when starting cross-cluster missions.

---

## Priority Ranking

### Tier 1 - Highest Impact, Build First

| # | Mission | Why |
|---|---------|-----|
| 5 | Incident Runbook Executor | Directly reduces MTTR - the #1 metric for ops teams |
| 1 | Capacity Forecast & Right-Sizing | Saves money and prevents outages - universal value |
| 2 | Security Hardening Advisor | Multi-step progressive hardening fills a major gap |
| 13 | App Health Correlator | Multi-cluster is the console's differentiator |

### Tier 2 - High Value, Build Next

| # | Mission | Why |
|---|---------|-----|
| 11 | RBAC Least-Privilege Auditor | Leverages existing MCP RBAC tools heavily |
| 3 | Cost Optimization Sweep | Clear ROI, actionable recommendations |
| 7 | Upgrade Impact Analyzer | Leverages existing upgrade MCP tools |
| 14 | LLM-d Inference Profiler | Differentiating for AI/ML users |

### Tier 3 - Good Value, Build When Ready

| # | Mission | Why |
|---|---------|-----|
| 6 | Cross-Cluster Drift Reconciler | Builds on existing drift detection |
| 9 | GPU Workload Optimizer | High value for GPU-heavy environments |
| 18 | Post-Mortem Generator | Natural follow-up to incident missions |
| 4 | Compliance Audit | Requires framework templates |

### Tier 4 - Nice to Have

| # | Mission | Why |
|---|---------|-----|
| 8 | Network Policy Generator | Useful but niche |
| 12 | Secret Rotation Planner | Useful but many orgs have external tools |
| 15 | Maintenance Scheduler | Aggregates other missions |
| 16 | Namespace Cleanup | Simple but useful |
| 17 | Cluster Onboarding Wizard | Mostly orchestrates other missions |
| 10 | Chaos Probe | Read-only is safe but less exciting than actual chaos |

---

## Summary

This proposal identifies **18 new AI mission types** across 6 categories:

- **Operational intelligence:** Capacity Forecast, Cost Optimization, Maintenance Scheduler
- **Security & compliance:** Security Hardening, Compliance Audit, RBAC Audit, Secret Rotation
- **Incident management:** Incident Runbook, App Health Correlator, Post-Mortem Generator
- **Infrastructure optimization:** GPU Optimizer, Network Policy, Namespace Cleanup, Chaos Probe
- **Change management:** Drift Reconciler, Upgrade Analyzer, Cluster Onboarding
- **AI/ML specific:** LLM-d Inference Profiler

Each mission leverages existing console infrastructure (MCP tools, kubectl proxy, cards, drilldowns) and follows the established mission architecture (WebSocket-based, multi-agent, with approval gates for mutations).

The most impactful missions to build first are the **Incident Runbook Executor** (reduces MTTR), **Capacity Forecast** (saves money), **Security Hardening Advisor** (progressive security), and **Multi-Cluster App Health Correlator** (unique multi-cluster value).
