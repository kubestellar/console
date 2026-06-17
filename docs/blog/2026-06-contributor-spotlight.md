# Contributor Spotlight: Our First External Contributors 🎉

*June 2026 · KubeStellar Console Team*

---

We have a milestone to celebrate: **KubeStellar Console received its first external code contributions this week.** Two community members — [@bmvinay7](https://github.com/bmvinay7) and [@AdeshDeshmukh](https://github.com/AdeshDeshmukh) — both opened pull requests on the same day, marking the beginning of what we hope will be a growing open-source contributor community.

## What They Built

*[Maintainer note: fill in PR summaries from #18264 and #18373 before publishing]*

**@bmvinay7** (PR #18264) contributed: *[description of contribution]*

**@AdeshDeshmukh** (PR #18373) contributed: *[description of contribution]*

---

## Why This Matters

KubeStellar Console has grown rapidly as a Hive-maintained AI-assisted project, but the goal has always been to build a **community-driven open-source project**. External contributors are the heartbeat of open source — they bring fresh perspectives, identify rough edges, and ultimately become maintainers.

When two contributors independently decide to open pull requests on the same day, that's a signal: the project is approachable. The contributing experience — the scaffolding, the tests, the AI-assisted review — is working.

---

## How to Join Them

Here's how you can make your first contribution to KubeStellar Console:

### 🃏 Add a New Dashboard Card (~30 minutes)

The console has 160+ dashboard cards covering the CNCF ecosystem. Adding a card for your favorite tool is one of the best-defined first contributions:

1. Pick a CNCF project from the [CNCF Landscape](https://landscape.cncf.io) that doesn't yet have a card
2. Use the card scaffold template in `web/src/components/cards/` as a starting point
3. Open a PR with the title `✨ feat: add <ProjectName> card`

**Skills needed**: Basic React + TypeScript

### 🌍 Translate the Console

We're kicking off localization support in v0.4. If English isn't your first language, help us bring the console to your community:

- Browse the `web/src/locales/en/` directory for string bundles
- Create a new locale file (e.g., `ja.json`, `ko.json`, `pt-BR.json`)
- Open a PR — no build required, just JSON editing

**Skills needed**: Bilingual — no coding required

### 📖 Improve Documentation

The `docs/` directory and `console-kb/` mission library always have room for improvement:

- Fix a typo or clarify confusing instructions
- Add a troubleshooting section to an existing mission
- Write a new guided runbook for a tool you know well

### 🔎 Find Good First Issues

Check our [good-first-issue list](https://github.com/kubestellar/console/labels/good-first-issue) for ready-to-go tasks with clear scope.

---

## Where to Get Help

- **CNCF Slack**: Join `#kubestellar` at [cloud-native.slack.com](https://cloud-native.slack.com)
- **GitHub Discussions**: Ask questions in the [kubestellar/console discussions](https://github.com/kubestellar/console/discussions)
- **AI-assisted review**: Every PR gets an automated AI review to catch common issues before human review

We aim to review and respond to all first-time contributor PRs within **7 days**.

---

## What's Next

With v0.4 focused on AI-Native Observability targeting Q3 2026, there are several high-impact areas where community contributions will shape the product:

- **llm-d and vLLM monitoring** — if you work with AI inference infrastructure, your domain expertise is invaluable
- **Drasi reactive pipelines** — real-time change-feed dashboards for cloud-native apps
- **Accessibility improvements** — ARIA labels, keyboard navigation, screen reader support

The door is open. We'd love to see your first PR.

---

*This post was drafted by the KubeStellar Hive outreach agent. Maintainers should fill in the PR summaries for #18264 and #18373 before publishing.*

*Related: [#18782](https://github.com/kubestellar/console/issues/18782) — First contributor recognition and outreach plan*
