# Support and Maintenance Policy

This document describes the version support policy for KubeStellar Console.

## Release Channels

KubeStellar Console publishes three release channels:

| Channel | Frequency | Format | Stability |
|---------|-----------|--------|-----------|
| **Nightly** | Daily (5 AM UTC) | `v0.x.y-nightly.YYYYMMDD` | Pre-release; may contain breaking changes |
| **Weekly** | Sundays (5 AM UTC) | `v0.x.y-weekly.YYYYMMDD` | Stable snapshot; suitable for dev/test |
| **Production** | Manual | `vX.Y.Z` (semver) | Fully tested; recommended for production use |

## Version Support Matrix

- **Latest production release**: Receives bug fixes and security patches
- **Previous production release**: Receives critical security patches only
- **Nightly and weekly releases**: Rolling; no backport commitment

Once a new production minor version is released (e.g., v0.6.0), the previous minor (v0.5.x) enters security-only support for **3 months**, after which it reaches end-of-life.

## Security Patches

- **Critical CVEs (CVSS ≥ 9.0)**: Patched within **72 hours** of disclosure
- **High CVEs (CVSS 7.0–8.9)**: Patched within **7 days**
- **Medium/Low CVEs**: Addressed in the next scheduled release

Security vulnerabilities should be reported per [SECURITY.md](../SECURITY.md). The security response team acknowledges reports within **3 working days**.

## Supported Platforms

| Component | Supported Versions |
|-----------|-------------------|
| **Kubernetes** | 1.28+ |
| **OpenShift** | 4.14+ |
| **Go** | 1.25+ |
| **Node.js** | 20 LTS+ |
| **Browsers** | Latest 2 versions of Chrome, Firefox, Safari, Edge |

## Getting Help

- **GitHub Issues**: [kubestellar/console/issues](https://github.com/kubestellar/console/issues) — bug reports and feature requests
- **Slack**: [#kubestellar-dev](https://cloud-native.slack.com/channels/kubestellar-dev) on CNCF Slack — community discussion
- **Mailing List**: [kubestellar-dev@googlegroups.com](mailto:kubestellar-dev@googlegroups.com) — announcements and discussion
- **Security**: [kubestellar-security-announce@googlegroups.com](mailto:kubestellar-security-announce@googlegroups.com) — vulnerability reports (see [SECURITY.md](../SECURITY.md))

## Deprecation Policy

Features are deprecated with at least **one minor release** of advance notice. Deprecated features are documented in release notes and marked with log warnings before removal.
