# Orbit Demo Video Script (90 seconds)

## Video Title
**"Set It and Forget It: Proactive Cluster Maintenance with KubeStellar Console Orbit"**

---

## Script

**[00:00-00:10] Opening Hook**

> VISUAL: Screen recording of KubeStellar Console dashboard  
> NARRATOR: "Kubernetes certificates expire. Disks fill up. Security policies drift. By the time you notice, you're already firefighting. What if your console could catch these problems **before** they become incidents?"

---

**[00:10-00:25] Problem Statement**

> VISUAL: Split screen — traditional dashboard showing current state vs. Orbit showing proactive checks  
> NARRATOR: "Traditional dashboards show you what's broken **right now**. Orbit shows you what's **about to break**. It's cron for cluster operations — but smarter."

---

**[00:25-00:50] Demo Walkthrough**

> VISUAL: Navigate to Missions → Orbit → Create Recurring Mission  
> NARRATOR: "Here's how it works. Navigate to Orbit, create a recurring mission, and choose a template — like this TLS certificate expiry check."

> VISUAL: Fill in mission config:  
> - Name: `nightly-cert-check`  
> - Schedule: `0 2 * * *` (runs at 2am daily)  
> - Scope: All clusters  
> - Alert threshold: 30 days  

> NARRATOR: "Set a schedule — this one runs at 2am every night. Choose your scope — all clusters or just production. Set an alert threshold — 30 days for expiring certificates."

> VISUAL: Click Activate, show confirmation  
> NARRATOR: "Click Activate. That's it. Orbit takes over."

---

**[00:50-01:15] Results & Value**

> VISUAL: Show the next day — dashboard with an alert badge, click into alert  
> NARRATOR: "The next morning, you see an alert. Orbit found a certificate expiring in 28 days — cluster `prod-west`, namespace `istio-system`, secret `istio-ca-cert`."

> VISUAL: Show the alert detail with remediation steps and one-click rotation action  
> NARRATOR: "The alert includes full context and a one-click action to rotate the cert. You fix it **before** it expires. No downtime. No scrambling."

---

**[01:15-01:25] Positioning & CTA**

> VISUAL: Orbit mission list showing multiple recurring missions (cert checks, capacity scans, security drift detection)  
> NARRATOR: "This is AIOps — operations that anticipate problems instead of reacting to them. Orbit missions run on your schedule. TLS checks. Capacity scans. Security drift. All automated."

---

**[01:25-01:30] Closing**

> VISUAL: Console logo with URL overlay  
> NARRATOR: "Try it now at console.kubestellar.io. Set it. Forget it. Stay ahead of the alerts."

> TEXT OVERLAY:  
> **console.kubestellar.io**  
> **github.com/kubestellar/console**

---

## Production Notes

- **Total runtime**: 90 seconds
- **Format**: Screen recording with voiceover
- **Visual style**: Clean, focused UI recordings with minimal transitions
- **Voiceover tone**: Professional but approachable — confident problem-solver, not sales pitch
- **Key message**: Shift from reactive dashboards to proactive operations
- **CTA**: Visit console.kubestellar.io to try Orbit missions

---

## Distribution Channels

1. **CNCF Blog** — embedded video with blog post
2. **KubeStellar YouTube** — standalone video
3. **Twitter/LinkedIn** — 30-second teaser cut with link to full video
4. **KubeCon NA 2026 booth** — demo loop on screens
5. **Community Slack** — pinned in #announcements

---

## Assets Needed

- [ ] Screen recording of Orbit UI flow (high-res, no cursor jitter)
- [ ] Professional voiceover (or high-quality AI voice)
- [ ] Background music (subtle, non-distracting)
- [ ] Intro/outro graphics with KubeStellar branding
- [ ] Subtitles/captions for accessibility

---

## Timeline

- **Week 1**: Script approval, record screen flows
- **Week 2**: Voiceover recording, video editing
- **Week 3**: Review, revisions, final export
- **Week 4**: Publish and distribute
