# Console KB

Console KB is the public KubeStellar Console knowledge base of guided AI missions. It provides reusable mission content that can be browsed, deep-linked, imported into the console, and executed as structured operational workflows.

## What Console KB contains

The knowledge base includes:

- CNCF project install and fix missions
- generated mission sets sourced from real upstream issues
- platform engineering and disaster-recovery runbooks
- security remediation content, including guided CVE fixes
- multi-cluster and troubleshooting workflows

As tracked in outreach work for this repository, the `kubestellar/console-kb` content includes **188 CNCF project mission sets** under `fixes/cncf-generated/`, giving the console broad public coverage across the cloud-native ecosystem.

## How KB content is exposed

The console exposes public knowledge-base content through:

- mission browsing via `/api/missions/browse`
- mission file retrieval via `/api/missions/file`
- mission landing pages such as `/missions/<slug>`

The landing page path supports shareable deep links for public content, including security and troubleshooting missions.

## Main content categories

Console KB content is organized into categories such as:

- `fixes/cncf-install/`
- `fixes/platform-install/`
- `fixes/cncf-generated/`
- `fixes/security/`
- `fixes/troubleshoot/`
- `fixes/multi-cluster/`
- `fixes/llm-d/`

This structure lets the console serve both curated installation flows and guided remediation for real-world problems.

## 188 CNCF project mission sets

The CNCF-generated area is a major differentiator. It contains mission sets derived from open issues across a large set of CNCF projects, giving operators and contributors:

- issue-driven guided fixes instead of blank-slate prompting
- public mission pages that can be shared with project communities
- a starting point for repeatable remediation and upstream contribution

This means the console can present guided workflows for many projects before a user writes a single custom prompt.

## Platform engineering runbooks

Console KB also includes platform engineering runbooks for operational scenarios that teams need during day-2 operations and recovery. Examples called out in repository outreach work include:

- full disaster recovery
- etcd snapshot restoration
- Velero backup restoration
- certificate rotation
- cluster upgrade
- node drain
- RBAC audit

These runbooks are valuable because they are more than static documentation: they are structured missions that can be followed step by step, validated, and reused across clusters.

## Guided CVE remediation

The knowledge base also includes guided security missions. A highlighted example is the NFS CSI path traversal remediation for **CVE-2026-3864**. That mission documents a practical flow for:

1. detecting whether the affected component is installed
2. gathering evidence about exposure or exploitation indicators
3. applying the recommended upgrade or patch
4. verifying that the fix is in place

This makes Console KB useful not only for installs and general operations, but also for time-sensitive security response.

## Why Console KB matters

Console KB gives KubeStellar Console a public library of reusable operational knowledge:

- operators get importable missions instead of ad hoc notes
- communities can share repeatable workflows with deep links
- platform teams can standardize runbooks across clusters
- security teams can publish guided remediation content for urgent fixes

In practice, Console KB is the content layer that turns the console from a UI into a reusable operations knowledge system.
