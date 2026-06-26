# GitOps Integration RFC

> Status: proposed
> Horizon: Mid-term (Q3–Q4 2026)
> Related issue: #16437

## Problem statement

KubeStellar Console already appeals to multi-cluster platform teams, but GitOps-first operators still hit a gap between the product story and day-2 workflows. Enterprises evaluating the Console commonly standardize on Argo CD or Flux for deployment, reconciliation, and auditability. Without a concrete GitOps milestone, the Console risks being seen as an observer beside the control plane instead of a first-class companion to it.

The roadmap currently mentions GitOps integration only as a long-term item. That is too late for the adoption reality of the CNCF ecosystem and too vague for implementation planning. The project needs a concrete plan that turns existing Argo CD and Flux foundations into a coherent GitOps milestone.

## Goals

1. Make GitOps a first-class Console story for both Flux and Argo CD users.
2. Give operators fleet-wide observability for GitOps resources, health, sync state, and drift signals.
3. Allow the Console itself to be bootstrapped and managed declaratively through GitOps-managed Kubernetes resources.
4. Connect GitOps objects to Mission Control so operators can move from insight to guided action.
5. Produce adoption evidence that helps enterprise evaluations and CNCF incubation positioning.

## Non-goals

- Replacing Argo CD or Flux as the source of truth or reconciliation engine.
- Building a generic Git repository browser or IDE inside the Console.
- Supporting every GitOps controller in the first milestone.
- Enabling write operations without explicit RBAC and operator opt-in.

## Current foundation

The Console already has enough building blocks to justify pulling this work forward:

- Argo CD application monitoring and ApplicationSet visibility exist today.
- Flux status surfaces have already started in the card system, giving the project a base for broader Flux coverage.
- Mission Control and card drill-down patterns already exist for guided operational workflows.
- Dashboard persistence and card preset systems provide a natural path toward declarative Console configuration.

The missing piece is not raw capability; it is a productized GitOps milestone with scope, sequencing, and success criteria.

## Proposed approach

Deliver GitOps integration as three coordinated tracks sharing a normalized GitOps domain model.

### Track 1: GitOps observability parity

Build first-class observability for the primary GitOps resources operators care about.

#### Argo CD scope

- Applications: sync state, health, revision, destination, last sync result.
- ApplicationSets: generator summary, managed application counts, rollout grouping, failures.
- Deep links from cards and drill-downs to related missions and cluster contexts.

#### Flux scope

- Kustomizations: readiness, suspension, last applied revision, dependency chain.
- HelmReleases: release status, upgrade failures, drift indicators, chart/source linkage.
- Sources: GitRepository, HelmRepository, OCIRepository, Bucket readiness and freshness.

#### Implementation direction

- Normalize controller-specific objects into a shared Console-facing GitOps status shape.
- Reuse existing card, cache, drill-down, and marketplace patterns instead of adding a parallel UI surface.
- Default to read-only observability first; keep mutating operations opt-in and clearly permissioned.

### Track 2: Declarative Console configuration

Allow platform teams to manage Console behavior through GitOps-managed Kubernetes resources.

#### Initial scope

- Dashboard layouts and default presets.
- Enabled card packs / marketplace presets.
- Global Console settings that are safe to declare centrally.
- Mission Control defaults related to GitOps navigation and grouping.

#### Configuration model

Phase 1 should use a Kubernetes-native representation with one of these options:

1. **Preferred:** `ConsoleConfiguration` CRD managed by Helm/Argo CD/Flux.
2. **Fallback:** versioned ConfigMap schema if CRD rollout cost proves too high.

The CRD path is preferred because it supports validation, status, future expansion, and clearer operator UX.

#### Key constraints

- Preserve local or per-user settings where central policy should not overwrite personal preferences.
- Keep secrets out of the declarative config surface.
- Ensure safe merge behavior between cluster-wide defaults and user-scoped customization.

### Track 3: Mission Control GitOps workflows

Connect GitOps objects to higher-level operational workflows.

#### Initial scope

- ApplicationSet-aware Mission Control views for grouped rollouts.
- Flux Kustomization and HelmRelease deep links into troubleshooting and drift analysis.
- Guided missions that explain controller health, blocked reconciliations, and dependency failures.

#### Why this matters

This is where the Console differentiates from a passive dashboard. Operators should be able to see a GitOps problem, open the right drill-down, and launch a guided mission without losing controller context.

## Phases and milestones

| Phase | Target window | Outcome |
| --- | --- | --- |
| 0. Discovery and schema alignment | Q3 2026 start | Finalize normalized GitOps resource model, RBAC requirements, and CRD vs ConfigMap decision. |
| 1. Observability parity | Q3 2026 | Ship Flux + Argo CD cards and drill-down parity for core resource types. |
| 2. Declarative Console bootstrap | Q3–Q4 2026 | Ship GitOps-managed Console configuration for dashboards, presets, and safe global settings. |
| 3. Mission Control integration | Q4 2026 | Add ApplicationSet and Flux deep links, grouped rollout context, and guided GitOps missions. |
| 4. GA hardening | Q4 2026 | Documentation, demo coverage, security review, adoption evidence, and upgrade guidance. |

## Milestone detail

### Phase 0 — Discovery and schema alignment

Deliverables:
- Inventory existing Argo CD and Flux coverage in UI, backend, and mocks.
- Define a normalized GitOps resource contract for cards, drill-downs, and missions.
- Decide whether declarative Console config starts with a CRD or ConfigMap schema.
- Document required read and optional write RBAC for both controller families.

Exit criteria:
- Written schema and API contract approved.
- Security review completed for read-only and opt-in write paths.
- Demo-mode data model defined for both controllers.

### Phase 1 — Observability parity

Deliverables:
- Flux cards and drill-downs for Kustomizations, HelmReleases, and Sources.
- Argo CD parity improvements for Applications and ApplicationSets.
- Cross-controller status summaries so operators can compare GitOps posture across clusters.
- Marketplace and dashboard templates for GitOps-focused operator views.

Exit criteria:
- Operators can add a GitOps dashboard for either Argo CD or Flux without custom setup.
- Core GitOps states are visible in cards, drill-downs, and cluster dashboards.

### Phase 2 — Declarative Console bootstrap

Deliverables:
- Kubernetes-native config resource for dashboard layouts, presets, and selected settings.
- Reconciliation rules between centrally managed config and user-level preferences.
- Operator guide for bootstrapping the Console through Argo CD or Flux.

Exit criteria:
- A fresh Console installation can be initialized from a GitOps-managed manifest set.
- Teams can version and review Console dashboard changes through pull requests.

### Phase 3 — Mission Control integration

Deliverables:
- Mission Control grouping by ApplicationSet and Flux resource hierarchy.
- Guided missions for failed syncs, stalled reconciliations, and dependency bottlenecks.
- Context-preserving deep links between GitOps cards, drill-downs, and mission flows.

Exit criteria:
- An operator can move from a GitOps alert or degraded card into a targeted mission in one step.
- Grouped rollouts are visible as an operational story rather than isolated controller objects.

### Phase 4 — GA hardening

Deliverables:
- End-user docs for Flux and Argo CD workflows.
- Demo-mode coverage and example manifests.
- Upgrade and migration notes.
- Adoption reporting and release messaging.

Exit criteria:
- Feature is ready to market as first-class GitOps support.
- Maintainers have metrics showing real usage and evaluation impact.

## Dependencies and prerequisites

### Product and architecture

- Agreement on the normalized GitOps domain model shared by cards, APIs, and missions.
- Decision on CRD versus ConfigMap for declarative Console configuration.
- Clear boundaries between centrally managed config and user preferences.

### Backend and API

- Reliable multi-cluster discovery for Argo CD and Flux CRDs.
- Shared aggregation endpoints or adapters that can expose controller-neutral status data.
- Audit-friendly handling for any future sync/resume/reconcile actions.

### Security and RBAC

- Read-only mode must work with minimal cluster permissions.
- Any write path must be explicitly enabled and separately permissioned.
- Security review for controller-triggered actions and declarative config ingestion.

### UX and demo readiness

- GitOps card presets and marketplace entries.
- Demo data and mocks for Flux and Argo CD scenarios.
- Drill-down and mission copy that explains controller-specific failures in operator language.

### Documentation and adoption

- Operator guides for both controllers.
- Example manifests for bootstrapping the Console through GitOps.
- Proof points for adopter conversations and CNCF positioning.

## Success metrics

### Product metrics

- GitOps dashboard coverage for both Argo CD and Flux in the default card catalog.
- Declarative bootstrap documented and working for a clean install.
- Mission Control deep-link coverage for both ApplicationSet and Flux reconciliation flows.

### Adoption metrics

- Reduction in adoption feedback citing missing GitOps support as a blocker.
- At least two public adopter or evaluator references using the GitOps workflow.
- Increased inclusion of GitOps screenshots and docs in demos, talks, and evaluator guides.

### Quality metrics

- Demo mode coverage for all shipped GitOps cards and drill-downs.
- Stable multi-cluster rendering for mixed Argo CD and Flux environments.
- No critical security findings in the GitOps write-path review.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| GitOps scope expands too broadly | Delays delivery | Keep v1 focused on core resource types and read-only observability first. |
| Controller data models diverge too much | Inconsistent UX | Normalize shared status concepts and keep controller-specific details in drill-downs. |
| Declarative config overwrites user preferences | Poor operator experience | Define clear precedence rules and separate team defaults from personal state. |
| Write-path actions increase security exposure | Adoption friction | Ship read-only first and gate writes behind explicit opt-in RBAC. |

## Recommendation

Move GitOps integration from the long-term roadmap into a named mid-term milestone and execute it as a structured three-track program:

1. Flux + Argo CD observability parity.
2. Declarative Console configuration for GitOps bootstrap.
3. Mission Control deep links and guided workflows.

This change aligns the roadmap with real adopter expectations and converts an ecosystem requirement into a concrete delivery plan.