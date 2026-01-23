# GitHub Activity Monitoring Card

## Overview

The GitHub Activity Monitoring card provides comprehensive activity metrics for GitHub repositories and organizations directly in the KubeStellar Console dashboard.

## Features

### Core Capabilities

1. **PR Trends** - Track pull request activity over time
   - View open, merged, and closed PRs
   - Identify stale PRs (>30 days without updates)
   - See PR status with color-coded indicators
   - Draft PR identification

2. **Issue Trends** - Monitor issue creation, resolution, and aging patterns
   - Track open and closed issues
   - Highlight stale issues
   - Show comment activity
   - Direct links to GitHub

3. **Star History** - Display repository star count in stats grid

4. **Contributor Activity** - Show active contributors and contribution patterns
   - View contributor avatars
   - See contribution counts
   - Sort by contributions

5. **Release Tracking** - Display recent releases
   - Show version tags and release names
   - Identify pre-releases
   - Track release dates
   - Link to release notes

### Scope Support

- **Repository Mode** - Monitor a single repository in detail
- **Organization Mode** - Aggregate metrics across all repos in an org (planned)
- **Multi-repo Mode** - Track specific repos across different orgs (planned)

### Additional Features

- **Time Range Selector** - Filter by 7d, 30d, 90d, or 1y
- **Activity Stats Grid** - Quick overview with:
  - Open PRs (with stale count)
  - Merged PRs
  - Open Issues (with stale count)
  - Star count
- **View Mode Tabs** - Switch between PRs, Issues, Releases, and Contributors
- **Sorting Options** - Sort by date, activity, or status
- **Pagination** - Handle large result sets efficiently
- **Refresh Control** - Manual refresh with last update timestamp
- **Error Handling** - Clear error messages with retry options

## Quick Start Guide

### Prerequisites

1. A GitHub account
2. Access to at least one GitHub repository (public or private)
3. Optional: GitHub Personal Access Token for private repos or higher rate limits

### Step-by-Step Setup

#### 1. Add the Card to Your Dashboard

1. Open the KubeStellar Console
2. Navigate to the Dashboard page
3. Click the **"+ Add Card"** button
4. Search for "GitHub Activity"
5. Click on the card to add it to your dashboard

#### 2. Configure the Card

Click the settings icon on the card and configure:

```json
{
  "repos": ["kubestellar/console"],
  "timeRange": "30d"
}
```

Replace `"kubestellar/console"` with your repository in the format `"owner/repo"`.

#### 3. (Optional) Add a GitHub Token

For private repositories or to increase API rate limits:

**Generate Token:**
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token"
3. Select scope: `repo` (Full control of private repositories)
4. Generate and copy the token (starts with `ghp_`)

**Add Token to Console:**
1. Open browser developer console (F12)
2. Execute: `localStorage.setItem('github_token', 'ghp_your_token_here')`
3. Refresh the card

**Security Note:** Tokens are stored in localStorage. For production use, consider implementing server-side token management.

#### 4. Start Using the Card

- **Switch Views:** Click tabs at the top (PRs, Issues, Releases, Contributors)
- **Filter by Time:** Click time range buttons (7d, 30d, 90d, 1y)
- **Sort:** Use the sort dropdown for different ordering
- **Navigate:** Use pagination at the bottom
- **Refresh:** Click the refresh button to update data

## Configuration

### Card Configuration

The card accepts the following configuration options:

```typescript
interface GitHubActivityConfig {
  repos?: string[]      // Array of repos in "owner/repo" format
  org?: string          // Organization name
  mode?: 'repo' | 'org' | 'multi-repo'
  token?: string        // GitHub API token (optional, can also use localStorage)
  timeRange?: '7d' | '30d' | '90d' | '1y'
}
```

### Example Configuration

```json
{
  "card_type": "github_activity",
  "title": "GitHub Activity",
  "config": {
    "repos": ["kubestellar/console"],
    "timeRange": "30d"
  }
}
```

### GitHub API Token

For private repositories or to increase API rate limits:

1. **Generate a GitHub Personal Access Token**:
   - Go to GitHub → Settings → Developer settings → Personal access tokens
   - Generate new token with `repo` scope
   - Copy the token

2. **Configure the token**:
   - Store in localStorage: `localStorage.setItem('github_token', 'ghp_...')`
   - Or pass in config: `{ token: 'ghp_...' }`

## Usage

### Adding to Dashboard

1. Click the "+" button to add a new card
2. Select "GitHub Activity" from the card list
3. Configure repository details
4. The card will immediately start fetching data

### Interacting with the Card

- **Click on any PR/Issue/Release** - Opens in GitHub in a new tab
- **Change view mode** - Click tabs at the top (PRs, Issues, Releases, Contributors)
- **Adjust time range** - Click time range buttons (7d, 30d, 90d, 1y)
- **Sort results** - Use the sort dropdown
- **Paginate** - Use pagination controls at the bottom
- **Refresh** - Click the refresh button in the header

## Visual Design

The card uses:
- GitHub-style accent colors for different states:
  - 🟢 Green for open PRs and merged items
  - 🟣 Purple for merged PRs
  - 🔴 Red for closed PRs
  - 🟠 Orange for issues
  - 🟡 Yellow for stale items
  - 🔵 Blue for releases
- Dark mode optimized with secondary backgrounds
- Clean, data-dense layout similar to GitHub Insights
- Avatar images for contributors and PR/issue authors
- Status indicators and badges

## API Integration

The card uses the GitHub REST API v3:

- `GET /repos/{owner}/{repo}` - Repository info
- `GET /repos/{owner}/{repo}/pulls` - Pull requests
- `GET /repos/{owner}/{repo}/issues` - Issues
- `GET /repos/{owner}/{repo}/releases` - Releases
- `GET /repos/{owner}/{repo}/contributors` - Contributors

Rate limits:
- Unauthenticated: 60 requests/hour
- Authenticated: 5,000 requests/hour

## Technical Details

### Component Structure

- **Location**: `web/src/components/cards/GitHubActivity.tsx`
- **Registry**: Added to `cardRegistry.ts`
- **Width**: 8 columns (wide card)
- **Category**: External Integration

### State Management

- Local state for UI controls (sorting, pagination, view mode)
- Custom hook `useGitHubActivity` for data fetching
- Client-side GitHub API integration (no backend required)
- localStorage for GitHub token persistence

### Dependencies

- Uses existing UI components: `CardControls`, `Pagination`, `RefreshButton`, `Skeleton`
- Lucide icons for visual indicators
- Standard fetch API for GitHub integration
- No additional npm packages required

## Future Enhancements

Potential improvements for future versions:

1. **Activity Heatmap** - GitHub contribution-style calendar view
2. **Advanced Contributor Leaderboard** - Detailed stats and charts
3. **Configurable Refresh Interval** - Auto-refresh every X minutes
4. **Organization Mode** - Aggregate stats across org repos
5. **Multi-repo Mode** - Track multiple repos with combined metrics
6. **PR Review Metrics** - Time to review, approval counts
7. **Commit Activity** - Commit frequency and patterns
8. **Branch Protection Status** - Security compliance indicators
9. **Dependency Alerts** - Security vulnerabilities from Dependabot
10. **GitHub Actions Status** - CI/CD workflow status

## Troubleshooting

### "Failed to fetch GitHub data"

**Cause**: Network error, rate limit, or invalid repository

**Solutions**:
1. Check repository name format (`owner/repo`)
2. Add GitHub token to increase rate limits
3. Verify network connectivity
4. Check browser console for detailed error

### "No repositories or organization configured"

**Cause**: Card has no `repos` or `org` in config

**Solution**: Configure the card with at least one repository:
```json
{
  "repos": ["kubestellar/console"]
}
```

### Rate Limit Exceeded

**Cause**: Too many unauthenticated API requests

**Solution**: Add a GitHub Personal Access Token to increase limit from 60 to 5,000 requests/hour

## Examples

### Monitoring KubeStellar Console Repository

```json
{
  "card_type": "github_activity",
  "config": {
    "repos": ["kubestellar/console"],
    "timeRange": "30d"
  }
}
```

### Tracking Multiple Repositories

```json
{
  "card_type": "github_activity",
  "config": {
    "repos": [
      "kubestellar/console",
      "kubestellar/kubestellar"
    ],
    "mode": "multi-repo"
  }
}
```

### Organization Overview (Planned)

```json
{
  "card_type": "github_activity",
  "config": {
    "org": "kubestellar",
    "mode": "org",
    "timeRange": "90d"
  }
}
```
