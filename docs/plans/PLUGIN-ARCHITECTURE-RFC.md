# RFC: Plugin Architecture for KubeStellar Console

## Status

- **Status:** Draft
- **Target horizon:** Mid-term roadmap item (Q3–Q4 2026)
- **Related issue:** [#16441](https://github.com/kubestellar/console/issues/16441)
- **Related roadmap item:** `ROADMAP.md` → **Plugin architecture**

## Problem statement

KubeStellar Console already proves the value of modular dashboard experiences: the core product ships 160+ built-in cards, and the broader ecosystem already has 45+ marketplace templates. Today, however, all extension logic is effectively in-tree. External contributors can submit cards and presets, but they cannot ship installable, versioned extensions with a stable contract.

That gap creates three problems:

1. **Core bottleneck** — third-party projects must wait for mainline review and release cycles.
2. **Unclear boundaries** — there is no documented contract for out-of-tree cards, missions, or supporting assets.
3. **Marketplace ceiling** — `console-marketplace` can distribute curated presets, but not executable extensions with lifecycle management.

This RFC defines the first concrete scope for a plugin architecture so the roadmap item can move from aspiration to phased delivery.

## Goals

- Define what counts as a Console plugin.
- Establish an initial plugin API that is small enough to implement incrementally.
- Identify extension points for cards, missions, and related UI metadata.
- Set security constraints up front, especially around sandboxing and permissions.
- Clarify how plugin distribution relates to `console-marketplace`.

## Non-goals

This RFC does **not** propose:

- Arbitrary runtime patching of core React components.
- Direct plugins for authentication, session management, or RBAC internals.
- Unrestricted backend code execution inside the main Console server process.
- A fully general “run any JavaScript from the internet” model.
- GA-level SDK details for every future plugin type.

## Scope definition

### What is a plugin?

A **Console plugin** is a versioned bundle that declares metadata, extension points, required permissions, and one or more user-visible capabilities that the Console runtime can discover and load through a stable contract.

A plugin may eventually contain one or more of the following:

- **Card bundle** — frontend card UI, card metadata, optional demo data, and data-fetch configuration.
- **Mission bundle** — mission definitions, forms, validation rules, and optional UI assets.
- **Backend companion** — a separately deployed service or function that a plugin calls through approved Console APIs.

### Initial in-scope plugin types

Phase 1 scope is intentionally narrow:

1. **Frontend-only card plugins** loaded through a manifest + dynamic import model.
2. **Mission content plugins** that package mission definitions and metadata, but do not inject arbitrary backend logic.
3. **Static assets and metadata** required to render, catalog, and configure those plugins.

### Explicitly out of scope for the initial rollout

The following are **not** plugins in the first implementation:

- Core dashboard layout primitives.
- Authentication providers.
- Low-level Kubernetes transport adapters.
- Direct Fiber middleware injection.
- Arbitrary database migrations owned by plugins.
- Plugins that require unrestricted file system or shell access.

Those capabilities can be revisited later, but they would materially increase operational and security complexity.

## Proposed plugin model

The proposal splits plugins into two layers:

1. **Manifest contract** — portable metadata used by Console, CI, and marketplace services.
2. **Runtime entrypoints** — typed frontend modules loaded only for supported extension points.

### Manifest

Each plugin ships a `console-plugin.json` manifest:

```json
{
  "apiVersion": "console.kubestellar.io/v1alpha1",
  "kind": "ConsolePlugin",
  "metadata": {
    "name": "cncf-flux-observability",
    "displayName": "Flux Observability",
    "version": "0.1.0",
    "publisher": "fluxcd",
    "description": "Adds Flux-focused dashboard cards and missions"
  },
  "spec": {
    "runtime": "frontend-module",
    "extensionPoints": ["card", "mission"],
    "entry": "./dist/index.js",
    "permissions": {
      "network": ["/api/card-proxy", "https://artifacthub.io"],
      "storage": ["plugin.localState"],
      "kubernetes": []
    },
    "compatibility": {
      "console": ">=0.3.0",
      "pluginApi": "v1alpha1"
    },
    "integrity": {
      "sha256": "<bundle-digest>",
      "signature": "<publisher-signature>"
    }
  }
}
```

### Frontend runtime interface

The first SDK should expose a minimal TypeScript contract:

```ts
export interface ConsolePluginModule {
  manifest: ConsolePluginManifest
  register(context: ConsolePluginContext): ConsolePluginRegistration
}

export interface ConsolePluginRegistration {
  cards?: ConsoleCardPlugin[]
  missions?: ConsoleMissionPlugin[]
}

export interface ConsoleCardPlugin {
  id: string
  title: string
  component: React.ComponentType<ConsoleCardProps>
  categories: string[]
  defaultSize?: 'sm' | 'md' | 'lg'
  demoData?: unknown
  requiredPermissions?: ConsolePermission[]
}

export interface ConsoleMissionPlugin {
  id: string
  title: string
  loader: () => Promise<ConsoleMissionDefinition>
  requiredPermissions?: ConsolePermission[]
}
```

### Host context

Plugins should receive a constrained host context instead of raw global access:

```ts
export interface ConsolePluginContext {
  api: {
    fetchJSON<T>(path: string, init?: RequestInit): Promise<T>
  }
  ui: {
    openDrillDown(input: ConsoleDrillDownRequest): void
    registerRoute?(route: ConsolePluginRoute): void
  }
  cache: {
    createKey(input: string): string
  }
  telemetry: {
    track(event: ConsolePluginTelemetryEvent): void
  }
  permissions: {
    has(permission: ConsolePermission): boolean
  }
}
```

The design principle is that plugins integrate through **approved host services**, not by reaching into internal implementation details.

## Extension points

The plugin system should evolve around explicit extension points rather than a generic hook bag.

### 1. Dashboard cards

Plugins can contribute cards that:

- appear in the add-card catalog,
- participate in card registry metadata,
- use approved cached data helpers,
- declare demo-data behavior,
- render inside the existing `CardWrapper` and drill-down patterns.

### 2. Mission catalog entries

Plugins can contribute missions that:

- appear in browse/install flows,
- declare prerequisites and supported environments,
- reuse the existing mission runner and validation primitives,
- stay content-focused in the first phase.

### 3. Marketplace metadata

Plugins can publish metadata for:

- category tags,
- screenshots,
- install source,
- publisher identity,
- version compatibility,
- trust level / verification state.

### 4. Optional future extension points

These are plausible later additions, but are not phase-1 requirements:

- plugin settings panes,
- plugin-provided drill-down views,
- plugin routes under a constrained namespace,
- backend companion services registered through a sidecar contract,
- plugin-specific alert rules.

## Security considerations

Plugin architecture changes the trust model. The default posture must be **deny by default, explicitly grant by policy**.

### Sandboxing

- Frontend plugins should load in a constrained runtime boundary and only receive the `ConsolePluginContext` surface.
- Remote bundles must never execute without integrity verification.
- Untrusted third-party UI should be isolated where possible; if full iframe isolation is too restrictive for phase 1, the host contract must still prohibit raw access to auth state, DOM mutation outside the plugin mount, and internal stores.

### Permissions

Plugins must declare permissions up front. Initial permission classes:

- **Network** — outbound fetch destinations or approved Console proxy routes.
- **Storage** — plugin-scoped local persistence only.
- **Kubernetes-derived data** — access only through approved host APIs, never direct kubeconfig or token access.
- **UI integration** — ability to add cards, missions, drill-downs, or routes.

The Console host should show these permissions before install and persist an allow/deny decision.

### Supply chain and provenance

- Every installable bundle should have a content digest.
- Verified publishers should sign released bundles.
- Marketplace ingestion should validate manifest schema, compatibility range, and signature status.
- CI should scan plugin bundles for known-bad patterns before listing them as trusted.

### Operational guardrails

- Plugins must not execute shell commands from the browser.
- Plugins must not receive raw GitHub OAuth tokens, kubeconfigs, or backend secrets.
- Backend companion logic should run out-of-process behind a narrow API contract.
- Plugin failures should degrade gracefully and not block core dashboard rendering.

## Implementation phases

### Phase 0 — Documentation and contract shaping

- Publish this RFC.
- Normalize the existing card development guidance into plugin-oriented documentation.
- Inventory current in-tree extension patterns in `web/src/cards/`, missions, and marketplace presets.
- Define the `v1alpha1` manifest schema.

**Exit criteria:** Maintainers agree on initial plugin scope and manifest fields.

### Phase 1 — Frontend-only card plugins

- Implement manifest discovery and validation.
- Add a plugin loader based on dynamic imports.
- Register plugin cards in the existing add-card flow.
- Reuse core card shell patterns for loading, demo state, and error handling.

**Exit criteria:** A third-party card bundle can be installed and rendered without changing core source files.

### Phase 2 — Mission content plugins

- Allow plugin-packaged mission definitions and metadata.
- Validate prerequisites and supported environments.
- Integrate plugin missions into browse/install UX.

**Exit criteria:** A third-party mission package can appear in the mission catalog and run through existing mission orchestration.

### Phase 3 — Distribution, trust, and lifecycle

- Add install, update, disable, and remove flows.
- Add signature verification and trust badges.
- Expose compatibility warnings and rollback paths.

**Exit criteria:** Plugins behave like managed extensions rather than manual assets.

### Phase 4 — Backend companion model

- Define a sidecar/service contract for approved backend companion functionality.
- Add policy checks, rate limits, and deployment guidance.
- Keep backend execution opt-in and explicitly separated from the core process.

**Exit criteria:** Select plugins can ship backend integrations without compromising host isolation.

## Relationship to marketplace

`console-marketplace` should evolve from a repository of curated presets into the **distribution and discovery layer** for plugins.

### Near-term relationship

Before installable plugins exist, marketplace content remains:

- curated card presets,
- screenshots and catalog metadata,
- community discovery for supported projects.

### Target relationship

After the plugin API exists, the marketplace should additionally provide:

- signed plugin manifests,
- plugin bundle metadata and compatibility ranges,
- publisher trust signals,
- version history and changelogs,
- install / update / remove workflows from within the Console UI.

This preserves the marketplace’s existing community role while giving it a concrete runtime artifact to distribute.

## Open questions

- Should the first loader support only local/self-hosted plugin sources, or also remote URLs?
- Should plugin routes be allowed in phase 1, or deferred until a stronger sandbox exists?
- How much of the current in-tree card registry should become public SDK surface versus remain internal host plumbing?
- What is the minimum signing and verification bar for “verified publisher” status?
- Should mission plugins remain purely declarative, or allow limited custom UI components in phase 2?

## Recommended next steps

1. Approve this RFC as the scoping baseline for the roadmap item.
2. Document the public subset of the existing card pattern as plugin author guidance.
3. Prototype one frontend-only card plugin using the proposed manifest and registration model.
4. Pilot the prototype with one ecosystem partner before broadening scope.

## Summary

The key scoping decision is to start with **frontend card bundles and declarative mission packages**, not a fully general extension runtime. That keeps the first implementation achievable, aligns with the existing card and marketplace patterns, and creates a credible path from curated templates to installable ecosystem extensions.
