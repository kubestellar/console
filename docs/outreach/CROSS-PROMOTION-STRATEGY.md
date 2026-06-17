# Cross-Promotion Strategy: Closing the KubeStellar ⭐ Gap

**Goal**: Close the 5× star gap between kubestellar/kubestellar (687★) and console (117★) by increasing console visibility within the existing KubeStellar community.

## The Gap

- `kubestellar/kubestellar`: 687 ⭐ / 293 🍴
- `kubestellar/console`: ~117 ⭐ / ~119 🍴

**Issue**: The console has nearly the same number of forks as the main project, showing strong practitioner interest, but only 17% of the star count. This indicates that ~570 stars-worth of users who know KubeStellar have likely never heard of the console or haven't connected the console as the canonical UI/AI layer for their clusters.

## Actions

### 1. Audit kubestellar/kubestellar README
- [ ] Check if the console is prominently mentioned
- [ ] Verify that links and screenshots are accurate
- [ ] Ensure the console is positioned as "the canonical UI/AI layer" for multi-cluster management

### 2. Update kubestellar/kubestellar README
Add a "Console" section:
```markdown
## KubeStellar Console

The **KubeStellar Console** provides a web-based AI-powered dashboard for managing 
your multi-cluster environment. It includes:

- 313+ dashboard cards for CNCF ecosystem monitoring
- AI-powered missions for operational automation
- GPU scheduling and workload visibility
- Multi-cluster resource management

[Get started →](https://console.kubestellar.io)
```

### 3. Update console README
Add cross-repo notice:
```markdown
## Part of the KubeStellar Ecosystem

This console is a first-class UI layer for the 
[KubeStellar multi-cluster orchestration platform](https://github.com/kubestellar/kubestellar).
```

### 4. Pin Console Repo in Organization
- [ ] Pin `kubestellar/console` in the KubeStellar GitHub organization's profile repos
- [ ] Move it to position 2 or 3 (after the main project)

### 5. Slack Announcement
Post in the kubestellar Slack channel:
```
🚀 Did you know KubeStellar Console now has:
- 313+ monitoring cards for CNCF projects
- AI-powered missions for automation
- GPU scheduling & workload visibility
- Full multi-cluster support

Try it at console.kubestellar.io or deploy it yourself!
```

### 6. Release Notes Cross-Linking
- [ ] When kubestellar/kubestellar cuts a release, mention console compatibility
- [ ] Link to console release notes from kubestellar/kubestellar releases
- [ ] Include console feature highlights in release announcements

### 7. Social Media Co-Promotion
- [ ] KubeStellar Twitter account: announce console milestones
- [ ] Console Twitter account: highlight integration with main project
- [ ] LinkedIn: post about "360° visibility" story (KubeStellar + Console)

## Success Metrics

- **30 days**: ≥50 new console stars (gap narrows from 17% to 25%)
- **60 days**: ≥100 new console stars (gap narrows to 30%)
- **90 days**: console reaches ≥250 stars (gap narrows to 36%)

## Implementation Checklist

- [ ] README audit complete
- [ ] kubestellar/kubestellar README updated with Console section
- [ ] kubestellar/console README updated with ecosystem notice
- [ ] Console repo pinned in GitHub organization
- [ ] Slack announcement posted
- [ ] Release notes template updated for cross-linking
- [ ] Twitter/social media strategy activated
- [ ] Monitor star growth weekly

## Notes

- This is zero-cost, zero-friction marketing — both repos are already in the KubeStellar org
- The console genuinely deserves more visibility (160+ cards, AI missions, GPU support)
- v0.4 positions the console as the canonical AI/ML workload visibility layer
