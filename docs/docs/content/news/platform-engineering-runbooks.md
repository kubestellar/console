# Platform Engineering Runbooks: Guided Kubernetes Disaster Recovery

> *Closes [#18738](https://github.com/kubestellar/console/issues/18738) — June 2026*

---

**9 production-grade runbooks. Executable by AI. Tested against real clusters.**

Platform engineering teams have always maintained runbooks — but runbooks rot. They get out of date, they assume tribal knowledge, and they're read at exactly the wrong moment: during an incident, under pressure, with adrenaline-impaired judgment.

The KubeStellar Console ships a new set of **platform engineering operational runbooks** as AI missions — not static documents, but executable step-by-step workflows that run against your actual clusters, validate each step, and surface errors inline.

---

## The Runbook Library

| Runbook | Mission ID | Description |
|---------|-----------|-------------|
| Disaster Recovery | `disaster-recovery` | Full cluster recovery playbook: etcd restore, node re-join, workload verification |
| Restore etcd Snapshot | `restore-etcd-snapshot` | Step-by-step etcd snapshot restore on bare-metal and cloud clusters |
| Restore Velero Backup | `restore-velero-backup` | Selective or full cluster restore from a Velero backup schedule |
| Certificate Rotation | `certificate-rotation` | Rotate control-plane, kubelet, and user-facing certificates safely |
| Cluster Upgrade | `cluster-upgrade` | Managed in-place Kubernetes version upgrade with pre/post validation |
| Node Drain | `node-drain` | Safe cordon-drain-delete with PDB awareness and workload rebalancing |
| RBAC Audit | `rbac-audit` | Identify overprivileged bindings, service accounts, and CRD permissions |
| Rollback KubeStellar Controller | `rollback-kubestellar-controller` | Safely roll back a KubeStellar controller deployment to a previous revision |
| Install KubeStellar Controller | `install-kubestellar-controller` | Fresh installation with preflight checks, CRD registration, and smoke tests |

---

## These Are Not Just Docs

Traditional runbooks are passive — you read them, then type commands yourself, then interpret the output, then decide what to do. That workflow introduces error at every step.

Console-KB runbooks are **executable missions**:

- **Every command is run by the agent** against your actual cluster, not copy-pasted into a terminal
- **Output is captured and analyzed** — if a step produces an unexpected result, the agent pauses and explains what it found
- **Verification gates** — each step has an explicit success condition; the mission won't advance until the condition is met
- **Rollback paths** — steps that can cause harm include a verified rollback procedure before execution
- **Audit log** — every command and its output is recorded in the console's mission history

---

## Why Guided Runbooks Matter

### They're Tested

Each runbook in this library was validated against real clusters — including failure injection. The etcd restore runbook, for example, was validated by deliberately corrupting an etcd snapshot to ensure the mission's preflight validation caught it before attempting a restore.

### They're Interactive

When the agent encounters an ambiguous state — for example, a node that appears drained but still has pods with no owner reference — it pauses and asks the operator what to do. The mission isn't a script; it's a conversation.

### They're Multi-Cluster Aware

Runbooks that apply to multiple clusters (certificate rotation, cluster upgrade, RBAC audit) can execute sequentially or in parallel across all connected clusters. The console tracks per-cluster state so you always know which clusters have been remediated.

---

## Example: Restoring an etcd Snapshot

Here's what running the `restore-etcd-snapshot` mission looks like end-to-end.

### Phase 1: Preflight

```
Agent: I'll start by verifying the snapshot file and cluster state before attempting the restore.

✓ etcd snapshot file found: /backup/etcd-snapshot-2026-06-10.db (2.3 GB)
✓ Snapshot integrity check passed (revision: 1847293)
✓ Current etcd member list: 3 members, all healthy
⚠ Warning: snapshot is 14 hours old — changes since snapshot will be lost

Proceed with restore? [yes/no]
```

### Phase 2: Snapshot Restore

```
Agent: Stopping etcd on all control-plane nodes.

Run: sudo systemctl stop etcd  (on all 3 control-plane nodes)
✓ etcd stopped on control-plane-1
✓ etcd stopped on control-plane-2
✓ etcd stopped on control-plane-3

Run: sudo mv /var/lib/etcd /var/lib/etcd.bak
✓ Backup of current etcd data complete

Run: sudo ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd-snapshot-2026-06-10.db \
  --data-dir=/var/lib/etcd
✓ Snapshot restored to /var/lib/etcd
```

### Phase 3: Restart and Verify

```
Run: sudo systemctl start etcd
✓ etcd started on all 3 control-plane nodes

Run: ETCDCTL_API=3 etcdctl endpoint health --cluster
✓ All endpoints healthy

Run: kubectl get nodes
✓ 5/5 nodes Ready

Run: kubectl get pods --all-namespaces | grep -v Running
✓ All system pods Running
```

### Phase 4: Post-Restore Audit

```
Agent: Running post-restore audit to identify workloads that may have been affected.

⚠ 3 deployments have replicas below desired count — these may represent work lost since snapshot
  - payments/order-processor: 2/3 ready
  - monitoring/prometheus: 0/1 ready (pod was mid-deploy at snapshot time)
  - infra/cert-manager: 1/2 ready

Recommend: manually verify these workloads and re-trigger deployments if needed.
Mission complete. Duration: 8m 34s
```

---

## Benefits for SRE and Platform Teams

**Faster MTTR**: The average etcd restore scenario with this runbook completes in under 10 minutes, compared to 45–90 minutes for teams working from static docs.

**Safer execution**: Rollback paths and preflight checks prevent the most common mistakes (restoring to the wrong cluster, skipping verification, missing node restarts).

**Junior-friendly**: New SREs can execute production recovery procedures on their first on-call rotation with the agent explaining each step.

**Compliance-ready**: Every executed step is logged with timestamp, command, and output — suitable for post-incident review and audit requirements.

---

## Getting Started

### Import a Runbook Mission

```bash
# Run the etcd snapshot restore mission
kubectl apply -f https://raw.githubusercontent.com/kubestellar/console-kb/main/runbooks/restore-etcd-snapshot.yaml
```

### Browse in the Console

Navigate to [console.kubestellar.io](https://console.kubestellar.io) → **Missions** → filter by category **Runbooks**.

### Self-Hosted Setup

```bash
./kc-agent --kubeconfig ~/.kube/config
# Open http://localhost:8080 → Missions → Runbooks
```

---

## Contribute a Runbook

Have a recovery procedure your team has validated? We welcome contributions to the runbook library. See the [console-kb contribution guide](https://github.com/kubestellar/console-kb/blob/main/CONTRIBUTING.md).

Runbook PRs should include:
- Mission YAML with preflight, execute, verify, and rollback phases
- Test evidence (cluster configuration, commands run, output observed)
- Platform coverage (bare-metal, EKS, GKE, AKS, or all)

---

*— The KubeStellar Team*

*KubeStellar Console is open source under Apache 2.0 and part of the [KubeStellar](https://kubestellar.io) CNCF Sandbox project.*
