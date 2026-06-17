# 🌟 KubeStellar Console First Adopter Program

Welcome to the KubeStellar Console Adopter Program! This guide explains how to add your organization to [ADOPTERS.md](../../ADOPTERS.md) and what you get in return.

## Why List Your Organization?

Adding your organization signals to the broader community that KubeStellar Console is production-ready, battle-tested, and trusted. In return, your organization gets:

| Benefit | Details |
|---------|--------|
| 📣 **Community recognition** | Your org listed on console.kubestellar.io and ADOPTERS.md |
| 🏷️ **Early feature access** | Invite to the private preview channel for upcoming features |
| 📝 **Blog spotlight** | Optional co-authored case study on the KubeStellar blog |
| 🎤 **KubeCon co-presence** | Opportunity to co-present at KubeStellar community day |
| 🐛 **Priority issue queue** | Your bug reports and feature requests get adopter-tier priority |

## How to Add Your Organization

### Step 1: Fork and Clone

```bash
gh repo fork kubestellar/console --clone
cd console
```

### Step 2: Edit ADOPTERS.md

Open `ADOPTERS.md` and add a row to the **Adopters List** table:

```markdown
| Your Org | Brief description | How you use the console | [your-site.com](https://your-site.com) |
```

**Use Case Examples** (pick the closest fit):
- Multi-cluster monitoring across edge + cloud
- AI/ML workload orchestration dashboard
- Platform engineering team console
- GitOps deployment visibility
- Compliance and security posture monitoring
- Development/staging environment management

### Step 3: Open a Pull Request

Create a PR with the title:
```
📖 docs: add <Your Organization> to ADOPTERS.md
```

In the PR description, tell us:
- How many clusters you manage
- Which dashboard cards are most useful
- Any features you'd love to see next

### Step 4: Join the Community

After your PR merges:
- Join [CNCF Slack](https://slack.cncf.io/) → `#kubestellar`
- Introduce yourself in the channel with a link to your ADOPTERS.md entry
- Watch for invitations to the adopter preview channel

## Adopter Tiers

### 🥇 Production Adopters
Running KubeStellar Console in production — serving real users with real clusters.

**How to qualify**: Describe your production use case in the ADOPTERS.md PR.

### 🥈 Development Adopters
Using KubeStellar Console in development, staging, or CI environments.

**How to qualify**: Any active non-evaluation use qualifies.

### 🥉 Evaluation Adopters
Actively evaluating KubeStellar Console for a future production deployment.

**How to qualify**: Running a proof-of-concept or conducting a technical evaluation.

## Anonymous / Confidential Adopters

Not ready to go public? We understand. You can still:
- Open a GitHub issue with the label `adopter-confidential` to share your use case privately
- Email the maintainers at kubestellar@cncf.io
- Fill in the [anonymous adopter form](https://console.kubestellar.io/adopters)

Confidential adopter feedback still counts toward CNCF incubation metrics.

## FAQ

**Q: Do I need a public cluster or a large deployment?**  
A: No. Even a local development setup or a 1-cluster deployment counts.

**Q: Is the adopter list public?**  
A: Yes, ADOPTERS.md is public. Use the confidential option if you need privacy.

**Q: Can I list my personal homelab?**  
A: Absolutely! Individual adopters are just as valuable as enterprises.

**Q: What if my organization uses a modified fork?**  
A: Still list yourself! Forks count as adoption and we'd love to know what you changed.

## Questions?

Open an issue with the label `community` or ask in [CNCF Slack](https://slack.cncf.io/) → `#kubestellar`.

---

*First Adopter Program launched June 2026 · Maintained by the KubeStellar Console outreach team*
