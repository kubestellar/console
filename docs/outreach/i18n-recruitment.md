# i18n Contributor Recruitment Plan

This plan focuses on growing translator participation for KubeStellar Console and creating a low-friction workflow for community localization help.

## Target languages

Priority outreach languages for 2026:

- `ja`
- `ko`
- `zh-CN`
- `pt-BR`
- `de`
- `es`
- `fr`
- `hi`

These languages were chosen to match broad CNCF community participation and likely demand for a multi-cluster operations UI.

## Localization workflow for contributors

The preferred path should be approachable even for contributors who do not want to clone the repo locally.

### No-code path

1. Open the locale JSON file on GitHub.
2. Click the pencil icon to edit in the GitHub UI.
3. Translate only the values, not the JSON keys.
4. Submit a focused PR for one locale or one namespace at a time.

Examples of likely files:

- `web/src/locales/ja/common.json`
- `web/src/locales/es/cards.json`
- `web/src/locales/fr/errors.json`

### Contributor checklist

- [ ] Keep JSON valid
- [ ] Preserve placeholders such as `{{count}}` and `{{name}}`
- [ ] Preserve punctuation when it carries meaning
- [ ] Call out unclear English source strings in the PR description
- [ ] Ask for review if you are unsure about a term choice

## Maintainer workflow

- [ ] Tag translation issues with the target locale
- [ ] Link contributors to this guide, [CONTRIBUTING.md](../../CONTRIBUTING.md), and [docs/COMMUNITY.md](../COMMUNITY.md)
- [ ] Review for JSON validity, placeholder preservation, and scope
- [ ] Reconcile direct GitHub JSON edits with Crowdin if follow-up sync is needed
- [ ] Merge locale PRs quickly when they are accurate and limited in scope

## Community outreach plan

Use existing community channels instead of creating a parallel program:

- Post recruitment messages in **CNCF Slack**
- Share in **regional Kubernetes and cloud native communities**
- Ask KubeStellar community call hosts to include an i18n ask in announcements
- Invite bilingual maintainers and users to sponsor one locale each

Suggested message:

> KubeStellar Console is looking for help translating existing UI strings into `ja`, `ko`, `zh-CN`, `pt-BR`, `de`, `es`, `fr`, and `hi`. No local setup is required — you can edit JSON directly in the GitHub UI and submit a small PR.

## Success metrics

- **At least 2 locales reach 50%+ coverage by Q3 2026**
- At least 1 new translator joins from outside the core maintainer group
- Translation PR first response time stays under 48 hours
- A reusable glossary exists for common platform-engineering terms

## Quarterly execution plan

- **Q2 2026:** prepare issues, glossary seeds, and example PRs
- **Q3 2026:** run focused outreach and track coverage progress
- **Q4 2026:** highlight translated locales in release notes and recruit follow-on reviewers

---
Last updated: June 2026
