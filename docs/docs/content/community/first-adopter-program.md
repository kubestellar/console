---
title: "First Adopter Program"
linkTitle: "First Adopter Program"
weight: 10
description: >
  Join the KubeStellar Console First Adopter Program to get community recognition, early access to new features, a direct feedback channel to maintainers, and more.
keywords:
  - adopter
  - first adopter
  - community
  - recognition
  - early access
  - production
  - ADOPTERS.md
---

## Why Join?

The **KubeStellar Console First Adopter Program** celebrates organizations and individuals using the console in real environments. By self-identifying as an adopter, you:

| Benefit | Details |
|---------|---------|
| 🏅 **Community recognition** | Your organization listed in `ADOPTERS.md` and on the project website |
| 🚀 **Early access** | Preview releases and feature previews before public announcement |
| 💬 **Direct feedback channel** | Private Slack channel with maintainers for bug reports and feature requests |
| 📝 **Blog and social mentions** | Case study or spotlight post on kubestellar.io (opt-in) |
| 🛠️ **Prioritized support** | Faster triage of issues filed by registered adopters |
| 🎁 **Swag** | KubeStellar stickers, t-shirt, and digital badge (while supplies last) |

---

## Adopter Tiers

The program has three tiers based on how you are using the console.

### 🥇 Production Adopters

Running KubeStellar Console in a production environment to manage live workloads.

**Additional benefits:**
- Logo placement in the hero section of the project README
- Speaking opportunity at KubeStellar community calls
- Joint case study (opt-in)
- Priority feature requests considered for next milestone

### 🥈 Development Adopters

Using the console in a development, staging, or CI/CD environment to manage non-production workloads.

**Additional benefits:**
- Logo placement in `ADOPTERS.md` with tier badge
- Invitation to monthly adopter feedback session with the maintainer team

### 🥉 Evaluation Adopters

Actively evaluating the console for future adoption in your organization.

**Additional benefits:**
- Listed in `ADOPTERS.md` evaluation section
- Access to the `#adopters-early-feedback` Slack channel
- Guided onboarding session with a maintainer (30 minutes, by request)

---

## Eligibility

To qualify for the First Adopter Program you must meet **all** of the following criteria:

1. You represent an organization (company, university, open-source project, government agency, or individual project) — not a personal fork or learning exercise.
2. You have deployed KubeStellar Console against at least one real Kubernetes cluster (local clusters such as kind/minikube qualify for the Evaluation tier).
3. You are authorized to speak on behalf of your organization for the purposes of this listing.
4. Your use case does not violate the [KubeStellar Code of Conduct](https://github.com/kubestellar/console/blob/main/CODE_OF_CONDUCT.md).

> ℹ️ Academic research, open-source projects, and non-profit organizations are warmly welcomed at all tiers.

---

## How to Join — Step-by-Step

### Step 1 — Choose Your Tier

Review the tier definitions above and decide which tier best describes your current usage.

### Step 2 — Fork the Repository

```bash
gh repo fork kubestellar/console --clone
cd console
```

### Step 3 — Add Your Entry to `ADOPTERS.md`

Open `ADOPTERS.md` at the repository root and add a row to the **Adopters List** table:

```markdown
| <Organization> | <Description of use case> | <Tier: Production / Development / Evaluation> | <Optional link> |
```

**Example entries:**

```markdown
| Acme Corp | Managing 12-cluster edge fleet with Orbit recurring missions and AI install missions | Production | [acme.example.com](https://acme.example.com) |
| State University | Evaluating for campus research cluster management | Evaluation | — |
| my-oss-project | Using KubeStellar Console to manage CI clusters for automated testing | Development | [github.com/my-oss-project](https://github.com/my-oss-project) |
```

### Step 4 — Open a Pull Request

Use the following PR title and body format exactly so the bot can auto-label and route your PR:

**PR title:**
```
📖 docs: add <Organization> to ADOPTERS.md [first-adopter]
```

**PR body template:**

```markdown
## First Adopter Program Submission

**Organization:** <name>
**Tier:** Production | Development | Evaluation
**Use case:** <one to three sentences describing how you use KubeStellar Console>
**Version in use:** <e.g. v0.19.2 or nightly>
**Cluster count:** <approximate number of clusters managed>
**Contact (optional):** <GitHub handle or email — not published>

### Checklist

- [ ] I have added my organization to the Adopters List table in `ADOPTERS.md`
- [ ] The entry follows the table schema (Organization | Description | Tier | Link)
- [ ] I am authorized to submit this on behalf of my organization
- [ ] I have read and agree to the [Code of Conduct](https://github.com/kubestellar/console/blob/main/CODE_OF_CONDUCT.md)

### Optional

- [ ] I consent to being mentioned in a blog post or community update
- [ ] I would like to schedule a maintainer onboarding call
- [ ] I am interested in speaking at a community call
```

### Step 5 — Await Review

A maintainer will review your PR within **5 business days**. They may ask a clarifying question or suggest a minor edit. Once merged:

- Your organization appears in `ADOPTERS.md` on the main branch immediately.
- The website at [console.kubestellar.io](https://console.kubestellar.io) updates within 24 hours.
- A maintainer will reach out via the PR thread with next steps (Slack invite, swag form, etc.).

---

## Adopter Responsibilities

Joining the program is lightweight. Adopters are asked to:

- Keep their `ADOPTERS.md` entry current (open a PR to update or remove it if your use case changes).
- Respond to the occasional adopter survey (1–2 times per year, completely optional).
- Engage constructively if they choose to participate in feedback sessions.
- Not represent themselves as official KubeStellar partners without a separate partnership agreement.

There is no minimum usage requirement and no penalty for removing yourself from the list.

---

## Maintainer Commitments

In exchange, the KubeStellar Console maintainer team commits to:

- Review adopter PRs within 5 business days.
- Notify registered adopters of breaking changes at least one release in advance.
- Prioritize bug reports from registered adopters in the issue backlog.
- Never publish identifying information beyond what is in the submitted PR without explicit written consent.
- Honor opt-out requests promptly — open a PR removing your entry and it will be merged within 48 hours.

---

## Frequently Asked Questions

### Can I join anonymously?

Partially. You may omit the optional contact field and link column from your entry. Your organization name will still be listed. Fully anonymous entries are not accepted because they cannot be verified.

### Does my cluster need to be online or publicly accessible?

No. Air-gapped, on-premises, and private clusters all qualify. We do not require access to your environment.

### Can a solo developer or independent consultant join?

Yes. List your name or project name as the "organization". Sole practitioners are welcome at all tiers.

### We evaluated the console but decided not to adopt it. Can we still give feedback?

Absolutely. Open a GitHub Discussion or reach out on Slack. You do not need to be listed in `ADOPTERS.md` to file issues or participate in discussions.

### We use KubeStellar Console as part of a managed service or product. Which tier applies?

If you are running the console in production as part of a service you offer to others, the Production tier applies. Please add a brief note in your PR description so maintainers can coordinate appropriately.

### What happens to our entry if we stop using the console?

Please open a PR to remove or update your entry. If a listed organization becomes unreachable for more than 12 months, maintainers may move the entry to an "Inactive" section after a public notice period.

### Is there a formal partnership or certification?

Not at this time. The First Adopter Program is a community recognition program, not a formal partnership or certification scheme. For commercial partnership inquiries, contact the KubeStellar project through the channels listed on [kubestellar.io](https://kubestellar.io).

---

## Community Channels

Connect with other adopters and the maintainer team:

| Channel | Link | Purpose |
|---------|------|---------|
| **Slack — #kubestellar-dev** | [CNCF Slack](https://cloud-native.slack.com/channels/kubestellar-dev) | General development and questions |
| **Slack — #adopters-early-feedback** | Invite via PR | Private adopter feedback (invite-only) |
| **GitHub Discussions** | [kubestellar/console/discussions](https://github.com/kubestellar/console/discussions) | Long-form questions and proposals |
| **Mailing List** | [kubestellar-dev@googlegroups.com](https://groups.google.com/g/kubestellar-dev) | Announcements and governance |
| **Community Calls** | [kubestellar.io/community](https://kubestellar.io/community) | Bi-weekly video calls |

---

## Related Resources

- [`ADOPTERS.md`](https://github.com/kubestellar/console/blob/main/ADOPTERS.md) — current adopter list
- [Contributing Guide](https://github.com/kubestellar/console/blob/main/CONTRIBUTING.md)
- [Code of Conduct](https://github.com/kubestellar/console/blob/main/CODE_OF_CONDUCT.md)
- [KubeStellar Community](https://kubestellar.io/community)
