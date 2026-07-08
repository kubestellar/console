# Branch Protection Policy

This document describes the branch protection settings recommended for the `console-kb` repository to maintain code quality and security.

## Overview

Branch protection ensures that all changes to the repository are properly reviewed and tested before merging. This is critical for maintaining the integrity of the knowledge base content and CI/CD automation.

## Recommended Settings for Default Branch (master)

### Require Pull Request Reviews
- **Enabled**: Yes
- **Dismiss stale pull request approvals when new commits are pushed**: Yes
- **Require code owner reviews**: Yes (CODEOWNERS file must be present)
- **Required number of dismissal reviews before merging**: 1

### Require Status Checks to Pass
- **Enabled**: Yes
- **Require branches to be up to date before merging**: Yes
- **Required status checks**:
  - `actionlint` (workflow validation)
  - `codeql` (security analysis)
  - `quality-check` (knowledge base quality enforcement)

### Additional Protection
- **Require code owner reviews**: Yes (for files in CODEOWNERS)
- **Restrict who can push to matching branches**: Admins only for force pushes
- **Allow force pushes**: No
- **Allow deletions**: No

## Implementation Notes

1. **CODEOWNERS Configuration**: Requires at least one code owner approval for:
   - `.github/workflows/*` (CI/CD changes)
   - `*` (all KB content)

2. **Status Check Enforcement**: Prevents merge until all required workflows pass:
   - Catches workflow issues before deployment
   - Ensures security scanning passes
   - Validates content quality

3. **Admin Bypass**: While admins can bypass branch protection in emergencies:
   - All merges should go through the normal review process
   - Emergency bypasses must be documented
   - Require justification in commit messages

## Configuration via GitHub UI

Settings can be configured at:
1. Repository Settings → Branches
2. Select the default branch
3. Configure rules under "Branch protection rules"

## Automation

Consider using `@github/branch-protection-bot` or similar tools to:
- Automatically enforce these settings across the organization
- Audit branch protection compliance
- Alert on protection changes
