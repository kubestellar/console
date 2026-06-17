# KubeStellar Console Project Governance

KubeStellar Console is a sub-project of [KubeStellar](https://github.com/kubestellar/kubestellar). This document describes how the Console project makes decisions, delegates responsibilities, and maintains a healthy community as it prepares for CNCF Sandbox and incubation reviews.

## Governance Goals

The project is governed to keep technical direction, community stewardship, and operational responsibility transparent.

We prioritize:

- **Openness** — discussion, design, and roadmap work happen in public wherever possible.
- **Fairness** — contributors are evaluated on the quality of their work and collaboration.
- **Community over any single vendor** — maintainers act in the interest of the project and its users.
- **Inclusion** — the project follows the [Code of Conduct](CODE_OF_CONDUCT.md) and aims to create a welcoming environment.
- **Merit with accountability** — additional responsibility is earned through sustained contribution and trusted stewardship.

## Project Scope

KubeStellar Console covers the source, documentation, release process, website-hosted console experience, and related community workflows in the [`kubestellar/console`](https://github.com/kubestellar/console) repository.

## Roles

### Contributors

Anyone who reports issues, proposes improvements, reviews code, improves documentation, or submits pull requests is a contributor.

### Reviewers

Reviewers are trusted contributors who regularly provide technical or documentation feedback. Reviewers help maintain code quality, validate architectural direction, and mentor new contributors.

### Maintainers

Maintainers are the project stewards for KubeStellar Console. They are responsible for:

- reviewing and merging pull requests,
- curating the roadmap and release priorities,
- triaging issues and community escalations,
- protecting security-sensitive and conduct-sensitive workflows,
- keeping documentation, governance, and operational practices current.

The current maintainer roster is recorded in:

- [OWNERS](OWNERS) for repository approval rights, and
- [MAINTAINERS.md](MAINTAINERS.md) for public maintainer names and affiliations.

### Security Response Team

The maintainers appoint a Security Response Team to coordinate confidential reports and disclosure. The team may consist of the maintainers themselves. Its operating policy is defined in [SECURITY.md](SECURITY.md).

## Decision-Making Process

### Day-to-Day Decisions

KubeStellar Console uses **lazy consensus** for routine decisions. A change may proceed when it is proposed publicly, receives appropriate review, and no maintainer raises a blocking concern within a reasonable review window.

Examples include:

- routine bug fixes,
- documentation updates,
- refactors that do not materially change project direction,
- issue triage and release housekeeping.

### Escalated Decisions

A maintainer should call for explicit consensus when a proposal affects project direction, compatibility, governance, release policy, security posture, or community process.

Examples include:

- adopting or removing major dependencies,
- changing contributor or release policy,
- altering governance or maintainer expectations,
- making roadmap commitments tied to CNCF milestones.

### Voting

When consensus is unclear, maintainers may hold a vote on the public developer mailing list or, for sensitive matters, the private maintainer list.

- **Simple majority of maintainers** is required for routine formal votes.
- **Two-thirds majority of maintainers** is required to remove a maintainer or amend this governance document.

## Maintainer Expectations

Maintainers are expected to:

- act in the best interests of the project and its community,
- review code and documentation constructively and promptly,
- keep the main branch healthy and release processes reliable,
- handle conflicts, security reports, and conduct matters responsibly,
- help the project maintain CNCF-ready governance and community evidence.

Maintainers may merge their own changes when normal review expectations are satisfied, but they should seek review from another maintainer for substantial or policy-sensitive changes.

## Becoming a Maintainer

A prospective maintainer should demonstrate:

- sustained contributions for at least three months,
- at least five non-trivial pull requests merged,
- at least five non-trivial pull request reviews,
- strong collaboration and communication habits,
- familiarity with project architecture, testing expectations, and documentation standards.

A new maintainer is proposed by an existing maintainer on the [developer mailing list](https://groups.google.com/g/kubestellar-dev). Appointment requires a simple majority vote of current maintainers.

## Maintainer Inactivity or Removal

Maintainers may resign at any time.

A maintainer may be considered inactive after roughly one year of minimal or no project activity without a communicated return plan. Maintainers may also be removed for failure to fulfill responsibilities, Code of Conduct violations, or other serious cause. Removal requires a two-thirds vote of the remaining maintainers.

## Community Meetings and Records

KubeStellar Console participates in the broader KubeStellar community process.

- Community discussion happens through [docs/COMMUNITY.md](docs/COMMUNITY.md).
- Public agenda items may be proposed on Slack, GitHub, or the mailing list.
- Sensitive conduct and security matters may be handled in private maintainer channels.

Where possible, decisions and rationale should be recorded in issues, pull requests, mailing-list threads, roadmap updates, or public meeting notes.

## Code of Conduct Enforcement

All participants are expected to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Conduct reports for the project may be sent to the [private KubeStellar maintainers list](mailto:kubestellar-dev-private@googlegroups.com). Maintainers will review reports promptly and coordinate with CNCF processes when required.

## Security Coordination

Security reports must follow [SECURITY.md](SECURITY.md). Public issues should not be used for undisclosed vulnerabilities.

## Amendments

Changes to this governance document require a two-thirds vote of maintainers.
