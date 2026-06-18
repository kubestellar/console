# KubeStellar Console — First Adopter Program Guide

**Related Issue**: #18819

---

## Welcome to the KubeStellar Console First Adopter Program

Thank you for your interest in being an early adopter of KubeStellar Console! This guide explains
what the program is, who it's for, what you get by participating, and how to join.

---

## What is the First Adopter Program?

The First Adopter Program is a community initiative to recognize organizations and individuals who
are running KubeStellar Console in real-world environments — whether in production, a staging
cluster, a lab setup, or an ongoing evaluation.

When you add yourself to [ADOPTERS.md](../ADOPTERS.md), you're signaling to the broader community
that KubeStellar Console has real-world traction. This matters more than you might think:

- **Enterprise evaluators** check ADOPTERS.md when assessing OSS project maturity and production
  readiness. A growing list of adopters dramatically improves their confidence.
- **CNCF graduation** applications weight adopter count heavily — your listing directly helps
  KubeStellar Console's path through the CNCF ecosystem.
- **Other users** in your position see they're not alone, reducing risk perception.

Your entry is a small action with outsized community impact.

---

## Who Should Join?

You qualify for the First Adopter Program if you are:

- **Running KubeStellar Console** in any environment: production, staging, lab, or evaluation
- **Using KubeStellar Console features** such as multi-cluster dashboards, Orbit missions,
  AI-assisted troubleshooting, or security posture cards
- **An individual contributor** who has deployed the console personally or professionally
- **An organization** that has deployed the console as part of their platform engineering or
  multi-cluster Kubernetes strategy

You do **not** need to be using every feature. Any meaningful usage qualifies.

---

## What You Get

Joining the First Adopter Program is free and comes with recognition and benefits:

### Community Recognition
- Your name or organization listed in [ADOPTERS.md](../ADOPTERS.md) — the canonical adopter
  record for KubeStellar Console
- A shout-out in the KubeStellar community newsletter and community call when you join

### Early Access & Influence
- **Early access** to new features before general availability (where applicable)
- A direct channel to provide feedback that shapes the product roadmap
- Priority consideration for community support questions in the KubeStellar Slack

### Optional Marketing
- **Blog mention**: If you'd like to share your use case publicly, we'll feature your story in a
  blog post on kubestellar.io (optional — your listing in ADOPTERS.md doesn't require this)
- **Case study**: For organizations with a compelling use case, we'll collaborate on a joint
  case study or demo for KubeCon or CNCF Day events

### Swag (While Supplies Last)
- A KubeStellar **sticker pack** mailed to the first 50 adopters who submit a PR
- Digital badge for use in your GitHub profile or organization README

---

## How to Join

### Step 1: Fork the Repository

Fork [kubestellar/console](https://github.com/kubestellar/console) on GitHub.

### Step 2: Add Your Entry to ADOPTERS.md

Open [ADOPTERS.md](../ADOPTERS.md) at the root of the repository and add an entry in the
appropriate section. The format is:

```markdown
| [Your Name or Org](https://your-website.com) | Brief description of how you use KubeStellar Console | Since YYYY-MM |
```

**Example entries**:

```markdown
| [Acme Platform Team](https://acme.example.com) | Multi-cluster monitoring dashboard for 12 production clusters across 3 cloud providers | Since 2026-03 |
| Jane Doe (individual) | Lab setup for learning multi-cluster K8s operations with AI-assisted troubleshooting | Since 2025-11 |
```

**Guidelines**:
- Keep the description to 1–2 sentences
- The "Since" date is approximate — no need to be exact
- Linking to a GitHub profile, company website, or blog post is encouraged but optional
- You may use a pseudonym or "Anonymous" if you prefer

### Step 3: Open a Pull Request

Open a PR against the `main` branch of `kubestellar/console`. Use the title format:

```
📣 Add [Your Name/Org] to ADOPTERS.md — First Adopter Program
```

The PR will be reviewed and merged promptly by a maintainer. You'll receive a comment confirming
your recognition and next steps for any swag or optional blog mention.

---

## Privacy & Anonymity

- You can list yourself as "Anonymous" or use a pseudonym — we respect privacy preferences
- If you're an organization and prefer not to publicize your KubeStellar usage externally, you can
  request a "private adopter" status (contact a maintainer) — you'll receive the program benefits
  without a public listing
- We never share contact details without explicit permission

---

## Frequently Asked Questions

**Do I need to be in production to join?**  
No. Any real-world deployment — including evaluation and lab environments — qualifies.

**I forked the repo but never deployed it. Does that count?**  
Not quite — we're looking for actual deployments, even in a personal lab. But if you've been
evaluating and haven't deployed yet, give it a try! The `./start-dev.sh` script makes it easy.

**Can I remove my entry later?**  
Yes. Open a PR removing your entry at any time, no questions asked.

**I'm already listed — can I update my entry?**  
Absolutely. Just open a PR with your updated entry.

**My organization is cautious about public disclosure. What are our options?**  
Contact a maintainer in the KubeStellar Slack — we can arrange private adopter recognition that
keeps your listing off the public ADOPTERS.md while still giving you program benefits.

---

## Contact

- **KubeStellar Slack**: `#kubestellar` channel on CNCF Slack
- **GitHub Issues**: Open an issue tagged `community` on kubestellar/console
- **Maintainers**: See [MAINTAINERS.md](../MAINTAINERS.md)

---

## Related

- [ADOPTERS.md](../ADOPTERS.md) — the live adopter registry
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to contribute code and docs
- [README.md](../README.md) — project overview and quick start

---

*This guide was created as part of the First Adopter Program launch — issue #18819.*
