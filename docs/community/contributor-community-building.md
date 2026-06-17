# Contributor Recognition and Community Building

> Recognizing external contributors, preparing for Hacktoberfest 2026, and building contributor pathways.

## External Contributor Recognition (Issue #18782)

### First External Contributors

The following community members have made contributions to KubeStellar Console:

| Contributor | Contribution | PR |
|------------|--------------|-----|
| @bmvinay7 | First external contribution | TBD |
| @ashnaaseth2325-oss | Helm release history fix | #18799 |

### Recognition Actions
- [ ] Add CONTRIBUTORS.md with all external contributors
- [ ] GitHub Discussion: "Welcome our first external contributors! 🎉"
- [ ] Social post recognizing first community PRs
- [ ] Add contributor badges to README

---

## Hacktoberfest 2026 Preparation (Issue #18785)

### Labels Required
- `hacktoberfest` — repository-level opt-in
- `good first issue` — beginner-friendly tasks
- `hacktoberfest-accepted` — for PRs that count

### Good First Issues to Seed (10 minimum)

| Title | Area | Difficulty |
|-------|------|-----------|
| Add unit test for {specific handler} | Go/testing | Easy |
| Translate 10 keys to {language} | i18n | Easy |
| Add demo data for {card} | Frontend | Easy |
| Document {API endpoint} | Docs | Easy |
| Fix {specific lint warning} | Frontend | Easy |
| Add card for {CNCF project} | Frontend | Medium |
| Improve error message in {handler} | Go | Easy |
| Add accessibility label to {component} | Frontend | Easy |
| Write Playwright test for {page} | Testing | Medium |
| Add OpenAPI annotation to {route} | Go | Easy |

### Preparation Checklist
- [ ] Add `hacktoberfest` topic to repository
- [ ] Create 10+ good-first-issues with clear descriptions
- [ ] Add CONTRIBUTING.md section about Hacktoberfest
- [ ] Prepare mentor availability (label: `mentor-available`)
- [ ] Set up auto-label for Hacktoberfest PRs
- [ ] Blog post: "Contribute to KubeStellar Console this Hacktoberfest"

### Timeline
- **August**: Seed issues, prepare docs
- **September**: Announce in community channels
- **October**: Hacktoberfest active period
- **November**: Recognize participants, merge remaining PRs

---

## i18n Contributor Recruitment (Issue #18787)

### Current State
- 10 locales configured in `lib/i18n.ts`
- English is 100% complete
- Other languages: fallback to English (0% translated)

### Recruitment Plan

1. **Create translation guide** in CONTRIBUTING.md
2. **Post in language-specific communities**:
   - r/japanese_translations, r/korean
   - Chinese K8s community (CNCF China)
   - European K8s meetup groups
3. **Tooling**: Set up Crowdin or Weblate for community translations
4. **Incentive**: "Translation contributor" badge in README

### Priority Languages (by K8s adoption)
1. Chinese (zh-CN) — largest non-English K8s community
2. Japanese (ja) — strong enterprise K8s adoption
3. Korean (ko) — active CNCF community
4. Spanish (es) — growing Latin American K8s community
5. German (de) — European enterprise market

---

## Console Marketplace Contributor Onboarding (Issue #18805)

### Card Development Quick Start

1. Fork `kubestellar/console-marketplace`
2. Use the card scaffold template:
   ```bash
   npx create-console-card my-card-name
   ```
3. Implement the card component following [Card Development Rules](../../CLAUDE.md)
4. Submit PR with demo data

### Onboarding Checklist for New Card Contributors
- [ ] Read card development rules in CLAUDE.md
- [ ] Review 2-3 existing cards for patterns
- [ ] Use `useCached*` hooks for data fetching
- [ ] Include demo data for offline mode
- [ ] Wire `isDemoData` and `isRefreshing`
- [ ] Add i18n keys for all user-facing strings
- [ ] Write at least one Playwright test

---

## Red Hat / OpenShift Co-promotion (Issue #18808)

### Console OpenShift Support
The console ships OpenShift-aware features:
- OpenShift route detection (`/api/openshift/*` handlers)
- Project-aware namespace listing
- DeploymentConfig support alongside Deployments

### Co-promotion Plan
- [ ] Blog: "KubeStellar Console: Multi-Cluster Observability for OpenShift"
- [ ] Submit to OpenShift Commons community
- [ ] Red Hat Partner Program listing
- [ ] OpenShift-specific demo mode data

---

## "AI-Native OSS Project" Story (Issue #18814)

### Pitch
KubeStellar Console is one of the first open-source projects built AI-native from day one:
- AI agent (Stellar) as first-class feature, not bolted on
- MCP bridge for tool interoperability
- LLM provider abstraction (Claude, OpenAI, Gemini, Ollama)
- AI-powered incident detection and remediation

### Blog Post Outline
1. "What does AI-native mean for an OSS project?"
2. Architecture decisions that enable AI (MCP, tool registry, provider abstraction)
3. Real examples: missions, Stellar investigations, auto-remediation
4. Implications for the CNCF ecosystem

### Distribution
- Hacker News (Show HN)
- r/kubernetes, r/devops, r/MachineLearning
- CNCF blog (submit via TAG App Delivery)
- Dev.to, Medium

---

## Security Practitioner Community (Issue #18822)

### Console Security Integrations
- **Kyverno** cards — policy compliance across clusters
- **Falco** integration — runtime security events
- **RBAC analysis** — identity and access findings
- **SPIFFE/SPIRE** — workload identity observability (planned)
- **TUF** — supply chain verification status (planned)

### Engagement Plan
- [ ] Post in CNCF TAG Security Slack
- [ ] Submit talk to CloudNativeSecurityCon
- [ ] Create "Security Posture" dashboard preset
- [ ] Mission: "Audit RBAC across multi-cluster fleet"
- [ ] Blog: "Multi-Cluster Security Observability"

## Related

- [COMMUNITY.md](../COMMUNITY.md)
- [ADOPTERS.md](../../ADOPTERS.md)
- [Card Development Rules](../../CLAUDE.md)
