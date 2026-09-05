# Release Process

This document describes the automated release process for the KubeStellar Console project.

## Release Types

### Nightly Releases

- **Schedule**: Every day at midnight Eastern Time (5 AM UTC)
- **Version format**: `v0.x.y-nightly.YYYYMMDD`
- **Purpose**: Latest development builds for testing and early adopters
- **Artifacts**:
  - Binary releases via GoReleaser
  - Docker images tagged with `nightly` and `nightly-YYYYMMDD`
  - Homebrew tap formula update

### Weekly Releases

- **Schedule**: Every Sunday at midnight Eastern Time (5 AM UTC)
- **Version format**: `v0.x.y-weekly.YYYYMMDD`
- **Purpose**: More stable development snapshots for regular testing
- **Artifacts**:
  - Binary releases via GoReleaser
  - Docker images tagged with `weekly` and `weekly-YYYYMMDD`
  - Homebrew tap formula update

### Production Releases

Production releases are created manually and follow semantic versioning:

- **Patch** (`v0.x.Y`): Bug fixes only
- **Minor** (`v0.X.0`): New features, backward compatible
- **Major** (`vX.0.0`): Breaking changes

## Triggering Releases

### Automatic Releases

Nightly and weekly releases are triggered automatically via GitHub Actions scheduled workflows.

### Manual Releases

To trigger a release manually:

1. Go to the **Actions** tab in GitHub
2. Select the **Release** workflow
3. Click **Run workflow**
4. Choose the release type:
   - `nightly` - Creates a nightly pre-release
   - `weekly` - Creates a weekly pre-release
   - `patch` - Bumps patch version (0.0.X)
   - `minor` - Bumps minor version (0.X.0)
   - `major` - Bumps major version (X.0.0)
5. Optionally enable **Dry run** to test without creating a release

## Release Artifacts

### Binary Distributions

GoReleaser creates binaries for:

| OS      | Architecture |
|---------|--------------|
| Linux   | amd64, arm64 |
| macOS   | amd64, arm64 |
| Windows | amd64        |

Binaries are distributed as:
- Compressed archives (`.tar.gz`, `.zip`)
- Checksums file (`checksums.txt`)

### Docker Images

Images are pushed to GitHub Container Registry (`ghcr.io`):

```
ghcr.io/kubestellar/kubestellar-console:latest
ghcr.io/kubestellar/kubestellar-console:v0.1.0
ghcr.io/kubestellar/kubestellar-console:nightly
ghcr.io/kubestellar/kubestellar-console:weekly
```

### Homebrew Tap

The Homebrew formula is automatically updated in the [kubestellar/homebrew-tap](https://github.com/kubestellar/homebrew-tap) repository.

Installation:
```bash
brew tap kubestellar/tap
brew install kc-agent
```

### Helm Charts

Helm charts are published to both GitHub Pages and the GHCR OCI registry on every release.

**Option 1: Helm repository (GitHub Pages)**

```bash
helm repo add kubestellar-console https://kubestellar.github.io/console
helm repo update
helm install kc kubestellar-console/kubestellar-console
```

**Option 2: OCI registry (GHCR)**

```bash
helm install kc oci://ghcr.io/kubestellar/charts/kubestellar-console
```

## Workflow Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | Automatically provided by GitHub Actions |
| `GORELEASER_TOKEN` | GitHub token for GoReleaser |

### Required Secrets

- `HOMEBREW_TAP_TOKEN` - Token with write access to the homebrew tap repository

## Version Calculation

The release workflow automatically calculates the next version based on:

1. The latest Git tag
2. The release type selected

For pre-release versions (nightly/weekly), the current version is used with a pre-release suffix.

For production releases, the appropriate version component is bumped:
- `patch`: 0.1.0 → 0.1.1
- `minor`: 0.1.0 → 0.2.0
- `major`: 0.1.0 → 1.0.0

## Rollback Procedures

This section covers how to revert a bad release for each distribution path
above. There was previously no rollback guidance in this document.

### Helm repository / OCI registry deployments

Helm keeps a revision history for the release (see `--history-max` on
`helm install`/`helm upgrade`, default 10):

```bash
# List revisions and find the last known-good one
helm history kc -n <namespace>

# Roll back to a specific revision
helm rollback kc <revision> -n <namespace> --wait --timeout 5m
```

This is the same mechanism `.github/workflows/console-live-promote.yml` uses
to automatically revert `console-live` on a failed canary deploy or smoke
test (`helm rollback "$LIVE_RELEASE" ... --wait --timeout 5m`).

### Kustomize deployments

`deploy/kustomize` pins an explicit image tag rather than tracking a Helm
release. Roll back by re-applying the manifests with the previous known-good
tag (or, if the Deployment's rollout history is intact and no other spec
fields changed since, `kubectl rollout undo deployment/<name> -n <namespace>`).

### In-place self-upgrade (`POST /api/self-upgrade/trigger`)

The self-upgrade feature (`pkg/api/handlers/self_upgrade.go`) patches the
running Deployment's container image directly — it does **not** call Helm
and has **no dedicated rollback endpoint or automatic revert on failure**.
Because it is a plain `Deployment` image patch, standard Kubernetes rollout
history still applies:

```bash
# Revert the most recent self-upgrade
kubectl rollout undo deployment/<deploymentName> -n <namespace>

# Or check history and pick a specific revision
kubectl rollout history deployment/<deploymentName> -n <namespace>
kubectl rollout undo deployment/<deploymentName> -n <namespace> --to-revision=<n>
```

`GET /api/self-upgrade/status` returns the deployment's `currentImage` before
and after a trigger, so confirm the image tag reverted after running
`rollout undo`. If the pod fails to reach ready state post-rollback, see
[`runbooks/backend-health-degraded.md`](runbooks/backend-health-degraded.md)
to triage `/health` vs `/healthz` vs `/watchdog/ready` signals.

## Notifications

Release notifications are sent to:
- GitHub release notes (auto-generated from commits)
- Repository discussions (for production releases)

## Troubleshooting

### Release Failed

1. Check the GitHub Actions logs for errors
2. Common issues:
   - GoReleaser configuration errors
   - Docker build failures
   - Network timeouts

### Homebrew Formula Not Updated

1. Verify the `HOMEBREW_TAP_TOKEN` secret is valid
2. Check if the tap repository workflow completed successfully

### Docker Image Not Published

1. Verify the package permissions in repository settings
2. Check if the image build step completed successfully

## Local Development

To test the release process locally:

```bash
# Install GoReleaser
brew install goreleaser

# Test release build (no publish)
goreleaser release --snapshot --clean

# Check artifacts
ls dist/
```

## Related Files

- `.github/workflows/release.yml` - Main release workflow
- `.github/workflows/helm-release.yml` - Helm chart publishing
- `.goreleaser.yaml` - GoReleaser configuration
- `charts/kubestellar-console/` - Helm chart source
