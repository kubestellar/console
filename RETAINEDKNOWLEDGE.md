# Resolution Memory System

> **Status**: Planned - Ready for implementation
> **Created**: 2026-01-28
> **Last Updated**: 2026-01-28

## Overview
Save successful resolutions from AI missions and automatically surface them in future missions, showing users that their past knowledge is being leveraged.

## Core Concept
When a user starts a new mission for an issue, the system:
1. Searches for similar past resolutions (personal + org-shared)
2. **Injects relevant context into the AI prompt** - AI knows your history
3. **Shows the user visible evidence** - left panel displays "Related Knowledge"
4. **AI explicitly acknowledges** - "I found 2 similar issues you've resolved before..."
5. After resolution, prompts "Did this fix work?" for feedback loop

### Key Principle: Transparency
The user must always see that their past missions are informing the current one:
- Left panel shows matched resolutions with success rates
- AI's first response references the history explicitly
- When user clicks "Apply", AI says "Applying your saved resolution from [date]..."

---

## Phase 1: MVP - Frontend-Only (localStorage)

### Data Structure
```typescript
// web/src/hooks/useResolutions.ts
interface Resolution {
  id: string
  missionId: string                    // Source mission
  userId: string                       // Creator
  title: string                        // User-editable title
  visibility: 'private' | 'shared'     // Personal or org-wide
  sharedBy?: string                    // Username if shared
  issueSignature: {
    type: string                       // CrashLoopBackOff, OOMKilled, etc.
    errorPattern?: string              // Regex or keywords from error
    resourceKind?: string              // Pod, Deployment, Service
    namespace?: string                 // Optional namespace pattern
  }
  resolution: {
    summary: string                    // Brief description of fix
    steps: string[]                    // Step-by-step commands/actions
    yaml?: string                      // Config snippets if applicable
  }
  context: {
    cluster?: string
    operators?: string[]               // Istio, OPA, Kyverno, etc.
    k8sVersion?: string
  }
  effectiveness: {
    timesUsed: number
    timesSuccessful: number
    lastUsed?: Date
  }
  createdAt: Date
  updatedAt: Date
}
```

### Files to Create/Modify

**New: `web/src/hooks/useResolutions.ts`**
- `saveResolution(mission, issueSignature, resolution)` - Save from completed mission
- `findSimilarResolutions(issueSignature)` - Search by issue type/pattern
- `recordUsage(resolutionId, success: boolean)` - Track effectiveness
- localStorage persistence with key `klaude_resolutions`

**Modify: `web/src/hooks/useMissions.tsx`**
- On `startMission()`: Call `findSimilarResolutions()` and inject into context
- Add `relatedResolutions?: Resolution[]` to Mission interface
- On mission complete with positive feedback: Prompt to save resolution

**Modify: `web/src/components/layout/MissionSidebar.tsx`**
- New component: `RelatedResolutions` panel
- Shows at mission start: "Based on 3 similar past missions..."
- Expandable to see resolution details
- Link to apply suggested fix

### UI Layout (Fullscreen Mode)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Mission: Fix CrashLoopBackOff in payment-service                    [X] │
├─────────────────────────────┬────────────────────────────────────────────┤
│  📚 Related Knowledge       │  💬 Chat                                   │
│                             │                                            │
│  From Your History (2)      │  [User] I'm seeing CrashLoopBackOff...    │
│  ┌────────────────────────┐ │                                            │
│  │ ⭐ Fix OOM in payment  │ │  [AI] I found 2 similar issues you've     │
│  │ 3/3 successful         │ │  resolved before. Based on your history:  │
│  │ [Apply] [View]         │ │  • Memory limits needed increase          │
│  └────────────────────────┘ │  • Resource requests were missing         │
│  ┌────────────────────────┐ │                                            │
│  │ Memory limit fix       │ │  Let me check if this applies here...     │
│  │ 1/2 successful         │ │                                            │
│  │ [Apply] [View]         │ │                                            │
│  └────────────────────────┘ │                                            │
│                             │                                            │
│  From Organization (1)      │                                            │
│  ┌────────────────────────┐ │                                            │
│  │ 🏢 Standard OOM fix    │ │                                            │
│  │ Shared by @alice       │ │                                            │
│  │ [Apply] [View]         │ │                                            │
│  └────────────────────────┘ │                                            │
│                             │  ┌────────────────────────────────────────┐│
│  [+ Save Current as New]    │  │ Type your message...           [Send] ││
│                             │  └────────────────────────────────────────┘│
└─────────────────────────────┴────────────────────────────────────────────┘
```

### User Flow (MVP)

```
1. User starts mission for CrashLoopBackOff issue
   └─> System searches for similar resolutions (personal + org)
   └─> Finds 2 personal + 1 org resolution

2. Left panel shows related knowledge:
   - Personal resolutions (starred, with success rates)
   - Organization shared resolutions (with author)
   - Sorted by effectiveness

3. AI prompt includes context:
   "Previous successful resolutions for similar issues:
    1. [Personal] Increased memory limits from 256Mi to 512Mi (3/3 success)
    2. [Org] Standard memory tuning procedure from @alice"

4. User can click [Apply] to inject resolution into chat
   └─> AI acknowledges: "Applying your saved resolution..."

5. After mission completes successfully:
   ┌─────────────────────────────────────────────┐
   │ ✅ Mission completed                        │
   │ Save this resolution for future reference? │
   │ [Save Private] [Share to Org] [Skip]       │
   └─────────────────────────────────────────────┘

6. If saved, prompt for issue signature:
   - Auto-detected: CrashLoopBackOff
   - Resource: Pod
   - User can edit/refine
```

---

## Phase 2: Backend Persistence + Sharing

### Database Schema (pkg/store/sqlite.go)

```sql
CREATE TABLE resolutions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mission_id TEXT,
  title TEXT NOT NULL,
  visibility TEXT DEFAULT 'private',  -- 'private' or 'shared'
  shared_by TEXT,                      -- Username when shared
  issue_type TEXT NOT NULL,
  error_pattern TEXT,
  resource_kind TEXT,
  namespace_pattern TEXT,
  summary TEXT NOT NULL,
  steps TEXT NOT NULL,           -- JSON array
  yaml_snippets TEXT,            -- JSON object
  cluster TEXT,
  operators TEXT,                -- JSON array
  k8s_version TEXT,
  times_used INTEGER DEFAULT 0,
  times_successful INTEGER DEFAULT 0,
  last_used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_resolutions_user ON resolutions(user_id);
CREATE INDEX idx_resolutions_issue ON resolutions(issue_type);
CREATE INDEX idx_resolutions_visibility ON resolutions(visibility);
CREATE INDEX idx_resolutions_effectiveness ON resolutions(times_successful DESC);
```

### API Endpoints (pkg/api/handlers/resolutions.go)

```
GET    /api/resolutions              - List user's private resolutions
GET    /api/resolutions/shared       - List org-wide shared resolutions
GET    /api/resolutions/search       - Search by issue signature (private + shared)
POST   /api/resolutions              - Create resolution (visibility in body)
PUT    /api/resolutions/:id          - Update resolution
DELETE /api/resolutions/:id          - Delete resolution (own only)
POST   /api/resolutions/:id/share    - Publish private resolution to org
POST   /api/resolutions/:id/usage    - Record usage + success/failure
```

---

## Phase 3: Advanced Features

### Import/Export
- Export resolution library as JSON/YAML
- Import resolution packs from other users/teams
- Version control integration (store in git repo)

### Greptile Integration
- Sync shared resolutions to Greptile custom context
- Enable AI to access resolutions without explicit prompt injection
- Organization-wide search via Greptile API

### Smart Suggestions
- Auto-detect issue type from mission context
- Proactive suggestions before user describes issue
- Pattern learning from mission conversations

---

## Implementation Order

### Step 1: Create useResolutions hook
- Resolution interface and types
- localStorage CRUD operations
- Search by issue type

### Step 2: Integrate with mission start
- Modify `startMission()` to search for related resolutions
- Add `relatedResolutions` to Mission context
- Inject into AI prompt

### Step 3: Add UI for related resolutions
- Banner/panel in MissionSidebar showing matches
- Expandable details view
- "Apply this fix" action

### Step 4: Save resolution flow
- Post-mission prompt on success
- Issue signature detection (auto-extract from mission)
- Save dialog with editable fields

### Step 5: Feedback loop
- "Did this fix work?" prompt after applying saved resolution
- Update effectiveness metrics
- Surface most effective first

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `web/src/hooks/useResolutions.ts` | NEW - Resolution storage and search |
| `web/src/hooks/useMissions.tsx` | Add resolution lookup on start, save on complete |
| `web/src/components/layout/MissionSidebar.tsx` | Integrate left panel in fullscreen mode |
| `web/src/components/missions/ResolutionKnowledgePanel.tsx` | NEW - Left panel showing related resolutions |
| `web/src/components/missions/SaveResolutionDialog.tsx` | NEW - Save flow with visibility choice |
| `web/src/components/missions/ResolutionCard.tsx` | NEW - Individual resolution display |
| `pkg/store/sqlite.go` | Add resolutions table and queries |
| `pkg/api/handlers/resolutions.go` | NEW - Resolution API endpoints |
| `pkg/models/resolution.go` | NEW - Resolution model |

---

## Verification Plan

1. **Save flow**: Complete a mission, save resolution, verify in localStorage
2. **Retrieval**: Start new mission with similar issue, verify banner appears
3. **AI context**: Check that resolution is included in AI prompt
4. **Feedback**: Apply resolution, respond to "did it work?", verify metrics update
5. **Effectiveness**: Verify successful resolutions sort first
