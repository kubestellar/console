# Cross-Repo README Freshness Protocol

*Addressing ecosystem-wide documentation drift*

## The Problem

KubeStellar Console is referenced across multiple repositories in the KubeStellar ecosystem:
- `kubestellar-mcp` (primary AI/ML practitioner entry point)
- `kubestellar/kubestellar` (main project repository)
- `kubestellar/console-marketplace` (community card presets)
- `kubestellar/console-kb` (knowledge base)

When these repositories contain outdated statistics (e.g., "160+ cards" when the console now ships 300+), it undersells the project to every developer who encounters those references.

## Impact

The `kubestellar-mcp` README is a high-traffic discovery path for:
- AI agent practitioners (Claude Code, Cursor, Windsurf users)
- Multi-cluster Kubernetes operators
- CNCF community members exploring MCP tooling

Stale card counts create the perception that KubeStellar Console is **half as mature** as it actually is.

## Freshness Protocol

### 1. Quarterly Audit Schedule

Cross-repo references should be audited and updated quarterly:
- **Q1 review**: January (before KubeCon EU CFP deadline)
- **Q2 review**: April (before summer conference season)
- **Q3 review**: July (before Hacktoberfest prep)
- **Q4 review**: October (before KubeCon NA)

### 2. Automated Checks

Add a monthly CI check that:
1. Counts current card components in `web/src/components/cards/`
2. Searches cross-repo references via GitHub API
3. Flags discrepancies > 20% drift from actual count
4. Opens issues in affected repos

**Example CI Job** (`.github/workflows/readme-freshness.yml`):
```yaml
name: Cross-Repo README Freshness

on:
  schedule:
    - cron: '0 9 1 * *'  # First day of each month
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Count current cards
        run: |
          card_count=$(find web/src/components/cards -name "*.tsx" -type f | wc -l)
          echo "CURRENT_CARDS=$card_count" >> $GITHUB_ENV
      
      - name: Check kubestellar-mcp README
        run: |
          # Fetch kubestellar-mcp README and grep for card count references
          # If drift > 20%, open issue
```

### 3. README Verification Comments

Add HTML comments to cross-repo references:
```markdown
<!-- Last verified: 2026-06 | Cards: 300+ | Verification: automated CI check -->
[KubeStellar Console](https://github.com/kubestellar/console) | Web dashboard — **300+ cards**, AI missions, GPU monitoring
```

This makes manual audits faster and signals last-update recency.

### 4. Update Checklist

When updating cross-repo references:

**kubestellar-mcp**:
- [ ] Update `README.md` ecosystem table card count
- [ ] Update verification comment timestamp
- [ ] Add note to changelog

**kubestellar/kubestellar**:
- [ ] Update main `README.md`
- [ ] Check `docs/` for stale console references
- [ ] Update any architecture diagrams showing card counts

**console-marketplace**:
- [ ] Update `README.md` intro text
- [ ] Sync card count in marketplace catalog header

**console-kb**:
- [ ] Update knowledge base stats
- [ ] Refresh FAQ entries referencing card counts

### 5. Ownership

| Repo | Freshness Owner | Escalation Path |
|------|----------------|-----------------|
| `kubestellar-mcp` | @clubanderson | CNCF slack #kubestellar |
| `kubestellar/kubestellar` | MAINTAINERS | GitHub Discussions |
| `console-marketplace` | Console team | Console repo issues |
| `console-kb` | Docs team | Docs repo PRs |

## Card Count History

Track major milestones to inform updates:

| Date | Card Count | Context |
|------|-----------|---------|
| 2024-08 | 160 | Initial public release |
| 2025-03 | 200+ | Post-marketplace integration |
| 2026-01 | 250+ | AI missions launch |
| 2026-06 | 300+ | Full CNCF project coverage |

**Current count** (as of 2026-06-17): **313 card components**

## Files to Audit

The following files are known to contain card count references:

| Repo | File | Last Updated | Stale? |
|------|------|--------------|--------|
| `kubestellar-mcp` | `README.md` | 2025-01 | ❌ (says 160+) |
| `kubestellar/kubestellar` | `README.md` | Unknown | ? |
| `console-marketplace` | `README.md` | 2026-05 | ✅ |
| `console-kb` | `docs/overview.md` | Unknown | ? |

## Proposed PR Template

When submitting cross-repo README updates:

```markdown
## README Freshness Update

**Type**: documentation / ecosystem-health

Updates stale KubeStellar Console references:
- Card count: 160+ → 300+
- Last verified: 2026-06

**Impact**: Corrects 2× undercount in primary AI/ML practitioner discovery path.

**Checklist**:
- [ ] Updated card count in ecosystem table
- [ ] Added verification comment
- [ ] Confirmed no other stale references
- [ ] Posted in CNCF Slack #kubestellar
```

---

## Next Actions

1. **File PR on `kubestellar-mcp`** to update 160+ → 300+ ([tracked in console#18719](https://github.com/kubestellar/console/issues/18719))
2. **Audit `kubestellar/kubestellar`** for stale card counts
3. **Implement CI freshness check** (monthly cron job)
4. **Post in CNCF Slack** `#kubestellar` announcing the freshness protocol

---

*Established June 2026 | Community health initiative*
