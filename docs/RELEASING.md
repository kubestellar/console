# Release Process

This document describes the automated release process for the Klaude Console project.

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
ghcr.io/kubestellar/klaude-console:latest
ghcr.io/kubestellar/klaude-console:v0.1.0
ghcr.io/kubestellar/klaude-console:nightly
ghcr.io/kubestellar/klaude-console:weekly
```

### Homebrew Tap

The Homebrew formula is automatically updated in the [kubestellar/homebrew-tap](https://github.com/kubestellar/homebrew-tap) repository.

Installation:
```bash
brew tap kubestellar/tap
brew install kkc-agent
```

### Helm Charts

Helm charts are published to GitHub Pages and can be added as a repository:

```bash
helm repo add klaude https://kubestellar.github.io/console
helm repo update
helm install klaude-console klaude/klaude-console
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
- `charts/klaude-console/` - Helm chart source
