# Community Signal Analysis: Forks vs Stars

> Understanding and leveraging the unusual forks > stars ratio across KubeStellar repositories.

## Signal Summary

| Repository | Stars | Forks | Ratio | Signal |
|-----------|-------|-------|-------|--------|
| kubestellar/console | 117 | 119 | 1.02:1 | Forks exceed stars — active builders |
| kubestellar/kubestellar | 687 | ~150 | 0.22:1 | Normal ratio |
| kubestellar/docs | 27 | 89 | 3.30:1 | Extreme fork ratio — contributors |
| console-marketplace | ~10 | 13 | 1.30:1 | Silent builders |

## Analysis

### Why Forks > Stars is Unusual

Most GitHub projects have a stars:forks ratio of 5:1 to 10:1. When forks exceed stars, it signals:

1. **Active builders over passive observers** — people are forking to contribute or build on top
2. **Undiscovered project** — contributors found it but the broader community hasn't starred
3. **Developer tool pattern** — infrastructure tools get forked more than starred (people use, don't bookmark)

### What This Means for KubeStellar Console

The 119 forks represent **119 people who downloaded our code to do something with it**. This is stronger engagement signal than stars. These forkers are:
- Potential contributors (already have the code)
- Evaluators building internal demos
- Integrators adapting for their use case
- Students/learners studying multi-cluster patterns

## Engagement Strategy

### Phase 1: Identify Active Forkers

```bash
# Find forkers with recent commits on their fork
gh api repos/kubestellar/console/forks --paginate \
  --jq '.[] | select(.pushed_at > "2026-01-01") | .owner.login'
```

### Phase 2: Convert Forkers to Contributors

1. **GitHub Discussion post**: "Building with KubeStellar Console? We'd love to feature your work"
2. **Good-first-issues tagged `forker-welcome`**: Low-barrier PRs for existing forkers
3. **Marketplace cards**: Invite forkers to contribute cards to console-marketplace

### Phase 3: Convert Builders to Stargazers

- Add "If you find this useful, please ★ star" to README
- Include star prompt in installation success message
- Monthly "Community Spotlight" recognizing active forkers

## Star Gap: kubestellar vs console (687★ vs 117★)

### Root Cause
- Main repo appeared first (2+ years head start)
- Main repo listed in CNCF Landscape
- Console is newer and less visible

### Cross-Pollination Plan
1. Add console badge to main repo README
2. "Powered by KubeStellar" section in console docs
3. Blog post: "From CLI to Console — the KubeStellar observability story"
4. Conference demos always show console (visual > CLI)

## kubestellar/docs Fork Ratio (89 forks / 27 stars)

The 3.3:1 fork ratio on docs signals:
- Docs contributors (typical for doc repos)
- International translators creating forks
- Organizations mirroring for internal use

**Action**: Add CONTRIBUTING.md to docs repo encouraging PRs over forks.

## console-marketplace Silent Forkers (13)

These 13 forkers are building custom cards. They represent:
- Potential marketplace contributors
- Organizations evaluating the card system
- Card developers who haven't PR'd back

**Action**: Create issue template "Share your card" with low-friction submission.

## Metrics to Track

| Metric | Current | Target (Q4 2026) |
|--------|---------|-------------------|
| Console stars | 117 | 250 |
| Fork-to-PR conversion | ~5% | 15% |
| Active forkers (pushed last 90d) | TBD | Track monthly |
| Marketplace card submissions | 0 | 10 |

## Related

- [ADOPTERS.md](../../ADOPTERS.md)
- [COMMUNITY.md](../COMMUNITY.md)
