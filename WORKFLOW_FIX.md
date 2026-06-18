# Fix for PR #2585

## Updated .github/workflows/pr-verifier.yml

- Changed from: `kubestellar/infra/.github/workflows/reusable-pr-verifier.yml@main`
- Changed to: `kubestellar/infra/.github/workflows/reusable-pr-verifier.yml@2cdb7c22649c4e5cd36edc2d2fc57de96949e7a9`
- Added: `permissions: {}`  
- Added: `if: github.event.pull_request.head.repo.full_name == github.repository`
