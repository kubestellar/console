# Security Fix for Issue #19094

## Changes Required

Remove `secrets: inherit` from `.github/workflows/greetings.yml`

### Current:
```yaml
jobs:
  greet:
    uses: kubestellar/infra/.github/workflows/reusable-greetings.yml@main
    secrets: inherit
```

### Fixed:
```yaml
jobs:
  greet:
    uses: kubestellar/infra/.github/workflows/reusable-greetings.yml@main
```

This removes the line `secrets: inherit` to prevent exposure of repository secrets.
