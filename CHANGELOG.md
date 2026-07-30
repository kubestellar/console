# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) tags for stable releases.

## [Unreleased]

## [v0.3.29] - 2026-05-31

### Added
- Added tests for Stellar API handlers, RBAC/client wrappers, and the Stellar SQLite store.

### Fixed
- Added retry logic to the GA4 Error Monitor for transient API failures.
- Fixed SSE `stellar/stream` demo responses to return the correct content type.
- Fixed blank pages in `LightweightShell` routes and improved unknown-route handling.
- Fixed the multi-tenancy sidebar navigation routing mismatch.
- Fixed settings toggles not persisting after navigation.

## [v0.3.28] - 2026-05-24

### Added
- Added Vitest coverage for `CardToolbar` and direct unit coverage for `CardLoadingState`.
- Upgraded `gh-aw` and refreshed compiled workflow assets.

### Changed
- Parallelized per-repository run fetching plus reward and pull-request data collection.

### Fixed
- Added a DNS lookup timeout and a kubectl request queue cap.
- Fixed kubectl proxy test failures caused by the queue-cap work.
- Fixed the pod count Playwright test to target the correct UI surface.

## [v0.3.27] - 2026-05-17

### Added
- Added new screenshots tied to recent UI issues and an E2E test for Stellar auto-start on console load.

### Changed
- Reorganized the Stellar console layout to match the UI improvement spec.
- Split several large frontend and backend modules into focused components and handlers.
- Moved additional user-facing strings to i18n.

### Fixed
- Cleared the SSE reconnect timer on unmount and wired missing `isRefreshing` state.
- Auto-started Stellar on console load and corrected the deploy project count.
- Corrected mission-control deploy-stage text and sidebar button behavior.
- Corrected mission status handling after successful rollback completion.
- Handled API 404s in the KB validation workflow.
- Prevented missions from being marked failed while waiting for user confirmation.
- Resolved stale-closure, topology cache-key, and abort-controller cleanup issues.
- Fixed i18next pluralization usage and WebSocket goroutine/write error handling.

### Security
- Added fork guards to multiple `pull_request_target` and related workflows.

[Unreleased]: https://github.com/kubestellar/console/compare/v0.3.29...HEAD
[v0.3.29]: https://github.com/kubestellar/console/releases/tag/v0.3.29
[v0.3.28]: https://github.com/kubestellar/console/releases/tag/v0.3.28
[v0.3.27]: https://github.com/kubestellar/console/releases/tag/v0.3.27
