# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project records changes in a human-curated changelog. Commit history is expected to use conventional, descriptive summaries so release notes stay easier to assemble.

This is the initial version of `CHANGELOG.md`; older changes may not yet be fully backfilled.

## [Unreleased]

### Added
- Created `docs/README.md` to index repository documentation by audience and task.
- Added maintenance guidance at the top of `INVENTORY.md` so contributors know it is manually maintained.
- Added a direct developer-guide link from `README.md` to `CLAUDE.md`.
- Created this changelog file using the Keep a Changelog structure.

### Changed
- Documented the current documentation-entry points so contributors can find README, CONTRIBUTING, AGENTS, and CLAUDE guidance more quickly.

### Fixed
- Improved repository documentation discoverability after the docs index, inventory-maintenance, and developer-guide gaps reported in issues #16407 through #16410.
- Recent work on `main` includes fixes for cache-test Playwright reliability, deploy-test regression handling, and dependency-audit path stability.
