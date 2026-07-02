# Change Classification

This document defines risk tiers for changes to the KubeStellar Console to guide autonomous agent operations and ensure governance boundaries.

## Risk Tiers

### Tier 0: Safe (Auto-Merge)

Changes that can be autonomously merged without human review:

- Documentation updates (README, CHANGELOG, comments)
- Dependency updates (minor/patch versions)
- Test additions (no production code changes)
- Localization/translation files
- Code formatting (automated linting)

### Tier 1: Low Risk (Review Required)

Changes requiring one maintainer approval:

- Bug fixes with tests
- New card components (following established patterns)
- UI styling improvements
- Non-critical API endpoints
- Demo data updates

### Tier 2: Medium Risk (Two Reviews Required)

Changes requiring two maintainer approvals:

- New dashboard features
- API contract changes
- Authentication/authorization modifications
- Database schema changes
- Multi-cluster operations
- WebSocket protocol changes

### Tier 3: High Risk (Architecture Review)

Changes requiring architecture review and multiple maintainer sign-off:

- Core authentication mechanisms
- Agent/LLM integration surface expansion
- Security-critical paths
- Breaking API changes
- Data migration procedures
- Production deployment configuration

## Autonomous Agent Boundaries

Agents operating on this repository MUST:

- Only auto-merge Tier 0 changes
- Request human review for Tier 1+ changes
- Include risk tier classification in PR descriptions
- Run full test suite before proposing changes
- Never bypass security policies or commit secrets

## Change Detection

Risk tier is determined by:

1. **File path patterns** (e.g., `docs/*` → Tier 0, `pkg/auth/*` → Tier 3)
2. **Diff analysis** (e.g., new API routes → Tier 2+)
3. **Explicit PR labels** (`risk:low`, `risk:medium`, `risk:high`)

## Escalation

When in doubt, escalate to the next tier. Human judgment supersedes automated classification.
