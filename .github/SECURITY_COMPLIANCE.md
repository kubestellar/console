# GitHub Actions Security Compliance

This repository follows OpenSSF Scorecard security best practices for GitHub Actions workflows.

## Token Permissions (Scorecard Check: Token-Permissions)

All workflows implement least-privilege access control:
- **Top-level permissions**: Set to minimal scope (`contents: read` or `{}`)
- **Job-level permissions**: Explicitly granted only what each job needs
- **Write permissions**: Scoped to specific jobs, never workflow-wide default

## Pinned Dependencies (Scorecard Check: Pinned-Dependencies)

All dependencies are pinned for supply chain security:
- **GitHub Actions**: Pinned to full 40-character SHA hashes
- **External tools**: Downloaded with SHA256 verification
- **No pipe-to-shell**: All downloads save to file, verify, then execute

## Workflow Security Patterns

### Safe Patterns ✓
```yaml
permissions:
  contents: read  # Minimal top-level

jobs:
  my-job:
    permissions:
      pull-requests: write  # Explicit job-level grant
```

### Actions Pinning ✓
```yaml
- uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0  # v7.0.0
```

### Tool Installation ✓
```yaml
- run: |
    curl -fsSL "https://example.com/tool.tar.gz" -o tool.tar.gz
    echo "${SHA256SUM}  tool.tar.gz" | sha256sum -c -
    tar xzf tool.tar.gz
```

## References

- [OpenSSF Scorecard](https://github.com/ossf/scorecard)
- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [OSSF Security Best Practices](https://best.openssf.org/)

---
*Last updated: 2025-01-26*
*Addresses: #2686 (Token-Permissions), #2687 (Pinned-Dependencies)*
