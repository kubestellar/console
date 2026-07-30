# Reflections Log

AI agent lessons learned from working on this repository. Each entry records
a non-obvious pattern, mistake, or insight so future sessions start smarter.

This file satisfies the ACMM L5 `acmm:reflection-log` criterion.

---

## 2026-03-15 — isDemoData wiring is mandatory

**Context:** Cards using `useCached*` hooks were silently showing demo data
without the yellow Demo badge or outline.

**Lesson:** Every card that uses a `useCached*` hook MUST destructure
`isDemoData` from the hook return value and pass it to `useCardLoadingState()`.
Without this wiring, the card renders demo data indistinguishably from live
data — a silent regression that users cannot detect visually.

**PR:** #1281

---

## 2026-02-20 — DCO signing is non-negotiable

**Context:** Commits created via the GitHub API (Contents API or Git API) use
GitHub's `web-flow` as the committer, which does not match the `Signed-off-by`
line. The DCO bot rejects these.

**Lesson:** Always commit locally with `git commit -s` so the local git config
supplies both author and committer. Never use the GitHub API to create commits
on repos with DCO enforcement. When squashing fork PRs, always
`git reset --soft upstream/main` (not `origin/main`) before re-committing.

---

## 2026-03-01 — Always use worktrees for feature branches

**Context:** Multiple Claude Code sessions run concurrently on the same
repository checkout. A direct `git checkout -b feature` in the main worktree
causes merge conflicts and lost work when another session is active.

**Lesson:** Always use `git worktree add /tmp/<repo>-<slug> -b <branch>` for
every feature branch. This isolates file changes per branch and lets parallel
sessions coexist safely.

---

## 2026-04-10 — Guard .join() and iterators against undefined

**Context:** Hook return values (`useCached*`) can be `undefined` when API
endpoints return 500 errors or the network is down. A bare `.join()` call on
an undefined array crashed the search index in production.

**Lesson:** Always guard array methods: `(arr || []).join(', ')`,
`for (const x of (data || []))`. This applies to `.map()`, `.filter()`,
`.forEach()` as well. The defensive pattern costs nothing and prevents
production crashes.

**PR:** #1281
