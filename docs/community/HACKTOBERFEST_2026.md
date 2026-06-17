# Hacktoberfest 2026 Guide

Welcome to KubeStellar Console's Hacktoberfest 2026 prep guide. This repository uses the `hacktoberfest` label to highlight issues that are well-scoped for October contributions, and the standard GitHub `good first issue` label (sometimes written as `good-first-issue`) for beginner-friendly tasks that are especially suitable for first-time contributors.

## Start here

1. Read [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full contribution workflow.
2. Browse open issues labeled `hacktoberfest`, `good first issue`, or `help wanted`.
3. Leave a short comment on the issue you want to work on so maintainers know it is in progress.
4. Ask for clarification early if the acceptance criteria, screenshots, or test expectations are not clear.

## Good first issues in this repo

Maintainers reserve `good first issue` for work that has:

- a clearly bounded scope
- specific files or directories called out in the issue
- a documented validation path
- no dependency on secrets, production-only infrastructure, or broad architectural changes
- a reasonable path to review in a single focused pull request

Common Hacktoberfest-friendly issue types include:

- focused documentation improvements
- Playwright or unit test additions for existing behavior
- i18n key additions or hardcoded-string cleanup
- demo-data improvements and other low-risk polish tasks

## Important repo-specific notes

- New CNCF project cards belong in [kubestellar/console-marketplace](https://github.com/kubestellar/console-marketplace), not in this repository.
- Keep pull requests tightly scoped. Smaller PRs get faster review, especially during October.
- Sign off commits with DCO: `git commit -s -m "Your message"`.
- CI validates the full build and lint steps on the pull request. Run the smallest targeted checks you can locally before opening the PR.

## Suggested local workflow

```bash
git clone https://github.com/YOUR_USERNAME/console.git
cd console
git checkout -b hacktoberfest/my-change
./start-dev.sh
```

Then run the smallest verification step that matches your change. Examples:

```bash
bash scripts/api-contract-test.sh
bash scripts/consistency-test.sh
cd web && npx playwright test --grep "your-test-name"
cd web && npm test -- src/components/YourComponent.test.tsx
```

## Pull request checklist

Before you open a PR:

- [ ] rebase or merge the latest `main` into your branch if it has drifted
- [ ] keep the diff focused on one issue
- [ ] include screenshots for visible UI changes
- [ ] describe exactly how you tested the change
- [ ] link the issue in the PR body so maintainers can track it

## Where to get help

- GitHub Issues: <https://github.com/kubestellar/console/issues>
- CNCF Slack: `#kubestellar-dev`
- Project docs: <https://kubestellar.io/docs/console/overview/>

If you are unsure whether something is still a good first issue after you start, ask in the issue before investing a large amount of time.
