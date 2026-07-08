# Branch Protection Requirements

This document records the recommended branch protection settings for the `master` branch of `kubestellar/console-kb`.

## Recommended Settings

Enable these rules in **Settings → Branches → Branch protection rules** for `master`:

| Setting | Recommended Value |
|---------|-------------------|
| Require pull request reviews before merging | ✅ Enabled — at least 1 approving review |
| Dismiss stale reviews on new commits | ✅ Enabled |
| Require status checks to pass before merging | ✅ Enabled (CodeQL, actionlint) |
| Require conversation resolution before merging | ✅ Enabled |
| Restrict force pushes | ✅ Disabled for all non-admins |
| Require signed commits | ⚠️ Recommended but optional |
| Allow bypassing rules for admins | ❌ Not recommended |

## Why This Matters

Without branch protection:
- Maintainers with push access can force-push directly to `master`, rewriting history without audit trail
- PRs can be merged without passing required status checks
- PRs can be merged without required reviewer approvals

See OpenSSF Scorecard findings #1 (BranchProtectionID) and #58 (CodeReviewID) for background.

## Code Review Policy

At minimum one human reviewer must approve each PR before it merges. This addresses:
- Prevents a single contributor from merging their own changes without oversight
- Catches supply-chain or credential-compromise attacks before they land on `master`
- Ensures automated content-generation PRs receive spot-checks

For bot-generated content committed directly to `master` by CI workflows, consider routing commits through a `generated/` branch merged to `master` via reviewed PRs.

## References

- [GitHub Docs: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- OpenSSF Scorecard `Branch-Protection` check (alert #1)
- OpenSSF Scorecard `Code-Review` check (alert #58)
- Issues: [#2794](https://github.com/kubestellar/console-kb/issues/2794), [#2795](https://github.com/kubestellar/console-kb/issues/2795)
