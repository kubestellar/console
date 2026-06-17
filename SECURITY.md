# Security Policy

KubeStellar Console takes security reports seriously. This document describes how to report a vulnerability, what information to include, and how the project coordinates response and disclosure.

## Supported Scope

This policy applies to the KubeStellar Console codebase, release artifacts, hosted console experience, and project-managed integrations in the [`kubestellar/console`](https://github.com/kubestellar/console) repository.

## Reporting a Vulnerability

Please **do not file public GitHub issues** for suspected vulnerabilities.

Use one of these channels instead:

- **Primary:** [kubestellar-security-announce@googlegroups.com](mailto:kubestellar-security-announce@googlegroups.com)
- **Announcements:** [kubestellar-security-announce Google Group](https://groups.google.com/u/1/g/kubestellar-security-announce)

When reporting, include as much of the following as possible:

- affected component, feature, or endpoint,
- reproduction steps or proof of concept,
- expected impact and attack prerequisites,
- affected versions, deployment mode, or environment,
- any proposed mitigation or patch, if available.

If you are unsure whether something is a security issue, contact the security list first and the maintainers will help triage it.

## When to Use This Process

Use the private security process when:

- you believe you found a vulnerability in KubeStellar Console,
- you are unsure whether a bug has security impact,
- a dependency vulnerability may materially affect KubeStellar Console users.

Do not use this process for:

- general support requests,
- feature requests,
- non-security bugs,
- configuration help without a vulnerability component.

## Response Targets

The KubeStellar security response team aims to:

- acknowledge reports within **3 working days**, and
- keep reporters informed as triage, fix development, and disclosure planning proceed.

Confidential report details are shared only with the people needed to investigate and remediate the issue.

## Disclosure Process

The security response team coordinates disclosure timing with the reporter.

Our preferred process is:

1. validate the report,
2. identify mitigation or a fix,
3. prepare a coordinated disclosure,
4. publish the fix and advisory as soon as practical.

Disclosure timing can range from immediate disclosure for already-public issues to a short coordination window when a fix must be prepared and validated first. For straightforward vulnerabilities with a clear mitigation, the project targets disclosure within about one week of the initial report.

## Related Security Documentation

Additional security material lives in this repository:

- [GOVERNANCE.md](GOVERNANCE.md) — security response ownership and maintainer authority
- [SECURITY_CONTACTS](SECURITY_CONTACTS) — project security contacts
- [docs/INCIDENT-RESPONSE.md](docs/INCIDENT-RESPONSE.md) — incident-handling guidance
- [docs/security/HARDCODED_URLS.md](docs/security/HARDCODED_URLS.md) — credentials and hardcoded URL policy

## Security Announcements

Join the [kubestellar-security-announce](https://groups.google.com/u/1/g/kubestellar-security-announce) group for security advisories and major security-related project announcements.
