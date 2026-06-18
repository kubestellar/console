# KubeStellar Ecosystem Cross-Reference Guide

> **Last verified**: June 2026  
> **Maintained by**: outreach agent + maintainers  
> **Purpose**: Track cross-repo references so card counts, feature lists, and links stay fresh

The KubeStellar ecosystem spans multiple repositories. Each has a README that references the others. This document tracks known cross-references and their current accuracy.

---

## Ecosystem Map (June 2026)

| Repository | Role | Current Status |
|------------|------|----------------|
| [kubestellar/kubestellar](https://github.com/kubestellar/kubestellar) | Core engine — BindingPolicy, WDS, ITS, WEC workload propagation | CNCF Sandbox |
| [kubestellar/console](https://github.com/kubestellar/console) | Web dashboard — **300+ cards**, AI missions, Stellar runtime, GPU monitoring | Active |
| [kubestellar/console-marketplace](https://github.com/kubestellar/console-marketplace) | Community card presets (GPU/AI/ML, ArgoCD, OPA, Falco, security) | 153+ presets |
| [kubestellar/console-kb](https://github.com/kubestellar/console-kb) | AI knowledge base — community missions and operational runbooks | Active |
| [kubestellar/kubestellar-mcp](https://github.com/kubestellar/kubestellar-mcp) | MCP server for Claude Code, Cursor, Windsurf, VS Code | v0.8 Stable |

---

## Known Stale Cross-References

### kubestellar-mcp → kubestellar/console

| File | Current text | Correct text | Issue |
|------|-------------|--------------|-------|
| `kubestellar-mcp/README.md` | "160+ cards" | "300+ cards" | [#18719](https://github.com/kubestellar/console/issues/18719) |

**Action needed**: Open a PR on `kubestellar/kubestellar-mcp` to update the ecosystem table.

---

## MCP Ecosystem Outreach Opportunities

With `kubestellar-mcp` v0.8 stable, the following registry submissions are pending (tracked in [#18720](https://github.com/kubestellar/console/issues/18720)):

| Registry | URL | Status |
|----------|-----|--------|
| Official MCP servers list | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | ⏳ Not submitted |
| Glama MCP directory | [glama.ai/mcp/servers](https://glama.ai/mcp/servers) | ⏳ Not submitted |
| GitHub topics | `mcp`, `model-context-protocol`, `kubernetes`, `multi-cluster` | ⏳ Not set |

### Submission checklist for `modelcontextprotocol/servers`

- [ ] Verify kubestellar-ops MCP tool list is documented
- [ ] Verify kubestellar-deploy MCP tool list is documented
- [ ] Open issue on modelcontextprotocol/servers proposing community listing
- [ ] Once approved, open PR with server entry (name, description, install command, GitHub URL)

---

## Console-Marketplace Contributor Funnel

Per the `CONTRIBUTING.md` in this repo:

> New monitoring cards for CNCF projects belong in **kubestellar/console-marketplace**, not in this repo.

The marketplace needs the following to function as an effective contribution landing zone (tracked in [#18721](https://github.com/kubestellar/console/issues/18721)):

- [ ] `good-first-issue` labeled issues in console-marketplace
- [ ] Card scaffold template using `createCachedHook` factory
- [ ] CONTRIBUTING.md in console-marketplace
- [ ] Hacktoberfest-compatible labels

---

## README Freshness Convention

To prevent future drift, cross-repo ecosystem tables should follow this convention:

```markdown
| [console](https://github.com/kubestellar/console) | Web dashboard — 300+ cards | <!-- verified: 2026-06 --> |
```

The `<!-- verified: YYYY-MM -->` comment makes staleness visible during quarterly ecosystem reviews.

---

*This document is maintained by the outreach agent. Update the "Last verified" date when reviewing cross-references.*
