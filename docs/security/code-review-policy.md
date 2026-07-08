# Code Review Policy

This document establishes the mandatory code review requirements for the `console-kb` repository.

## Policy Summary

All changes to the repository **must** undergo mandatory code review before merging. This applies to:
- Knowledge base content (missions, fixes, runbooks)
- CI/CD workflows and automation
- Repository configuration and infrastructure
- Documentation and policies

## Code Owner Requirements

### Enforcement via CODEOWNERS

The `.github/CODEOWNERS` file defines reviewers required for different paths:

```
# All knowledge base content requires review from designated owners
* @clubanderson

# CI/CD workflows require infrastructure team review
/.github/ @clubanderson
```

### Adding Code Owners

To add yourself or a team as a code owner:
1. Edit `.github/CODEOWNERS` file in a pull request
2. Follow the format: `<path> @<github-username>` or `<path> @<github-organization>/<team-name>`
3. Get approval from existing code owners
4. Merge the change

## Review Requirements

### Mandatory Reviews
- **All PRs** require at least 1 approval from a code owner
- **Workflow changes** (`.github/workflows/*`) require infrastructure team approval
- **Content changes** require content owner approval

### Review Standards

Reviewers should assess:
- **Correctness**: Does the change accomplish its stated goal?
- **Security**: Are there potential security implications?
- **Quality**: Does it follow repository standards and best practices?
- **Testing**: Are changes adequately tested?
- **Documentation**: Is the change properly documented?

### Stale Approval

Approvals become stale if new commits are pushed to the PR. Fresh approval is required to merge after updates.

## Special Cases

### Hotfixes

In case of critical security or availability issues:
1. Create a PR with a clear `[HOTFIX]` label
2. Request expedited review from available code owners
3. Document the emergency justification
4. After merge, conduct a post-incident review

### Documentation-Only Changes

Changes affecting only `.md` files may use a simplified review process:
- Still requires 1 code owner approval
- No requirement for full regression testing
- Can be expedited for typo/clarification fixes

## Compliance

- **Automated Enforcement**: GitHub branch protection rules enforce this policy
- **Audit Trail**: All reviews and approvals are tracked in PR history
- **Non-Compliance**: PRs that bypass this policy will be flagged for corrective action

## Related Documents

- [CODEOWNERS](../../CODEOWNERS) - Ownership configuration
- [Branch Protection Policy](./branch-protection.md) - Technical enforcement
- [Contributing Guide](../../CONTRIBUTING.md) - General contribution standards
