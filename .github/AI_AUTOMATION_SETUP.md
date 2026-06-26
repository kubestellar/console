# AI Issue Automation Setup

This document describes how to set up the AI-powered issue automation system for the KubeStellar Console.

## Overview

The automation system allows users to submit bug reports and feature requests through the Console UI. These requests are automatically converted to GitHub issues with the `ai-fix-requested` label, which triggers a GitHub Actions workflow that uses Claude Code to generate fixes and create pull requests.

## Architecture

```
User submits request in UI
  ↓
API creates GitHub issue with ai-fix-requested label
  ↓
GitHub Actions workflow triggered
  ↓
Claude Code analyzes and implements fix
  ↓
PR created automatically
  ↓
Netlify creates preview deployment
  ↓
Webhooks notify user when preview is ready
  ↓
User tests and provides feedback
```

## Required GitHub Secrets

Configure the following secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

### 1. `ANTHROPIC_API_KEY` (Required)
- **Purpose**: Allows GitHub Actions to use Claude Code for generating fixes
- **How to get**: Create an API key at https://console.anthropic.com/settings/keys
- **Permissions**: Needs access to Claude models

### 2. `FEEDBACK_GITHUB_TOKEN` (Required for backend)
- **Purpose**: Allows the Console backend to create GitHub issues
- **How to get**: Create a Personal Access Token (classic) at https://github.com/settings/tokens
- **Required scopes**:
  - `repo` (Full control of private repositories)
  - `write:discussion` (Read and write team discussions)
- **Usage**: Set as environment variable when running the backend

### 3. `GITHUB_WEBHOOK_SECRET` (Optional but recommended)
- **Purpose**: Secures webhook payloads from GitHub
- **How to generate**:
  ```bash
  openssl rand -hex 32
  ```
- **Usage**: Set as environment variable for the backend AND in GitHub webhook configuration

## GitHub Webhook Configuration

To receive notifications about PR status, deployment previews, and issue updates:

1. Go to your repository → Settings → Webhooks → Add webhook

2. **Payload URL**: `https://your-console-domain.com/api/webhooks/github`

3. **Content type**: `application/json`

4. **Secret**: The value from `GITHUB_WEBHOOK_SECRET` (if configured)

5. **Events to trigger**:
   - [x] Issues
   - [x] Pull requests
   - [x] Deployment statuses

6. **Active**: ✓ Enabled

## Backend Environment Variables

Set these environment variables when running the Console backend:

```bash
# Required - GitHub API access for creating issues
export FEEDBACK_GITHUB_TOKEN="ghp_xxxxxxxxxxxxx"

# Optional - Webhook signature verification
export GITHUB_WEBHOOK_SECRET="your-webhook-secret"

# Optional - Repository configuration (defaults shown)
export FEEDBACK_REPO_OWNER="kubestellar"
export FEEDBACK_REPO_NAME="console"
```

## Database Schema

The automation system uses the following tables (automatically created):

- `feature_requests` - User-submitted requests
- `pr_feedback` - User feedback on AI-generated PRs
- `notifications` - User notifications about request status

## Testing the Automation

### 1. Submit a Test Request

```bash
curl -X POST https://your-console-domain.com/api/feedback/requests \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test bug report",
    "description": "This is a test of the AI automation system. Please fix the typo in the README.",
    "request_type": "bug"
  }'
```

### 2. Verify Issue Creation

- Check that a GitHub issue was created with the `ai-fix-requested` label
- Verify the issue contains the request ID in the body

### 3. Monitor Workflow Execution

- Go to Actions tab in GitHub
- Watch the "AI Fix with Claude Code" workflow run
- Check workflow logs for any errors

### 4. Verify PR Creation

- If the workflow succeeds, a PR should be created
- PR title should start with 🤖 emoji
- PR should have `ai-generated` label
- PR body should contain the Console Request ID

### 5. Test Webhooks

- Make a change to the PR (comment, merge, close)
- Check backend logs for webhook events
- Verify user receives notifications in the Console

## Workflow Customization

The workflow can be customized by editing `.github/workflows/ai-fix.yml`:

### Trigger Conditions

Change which label triggers the workflow:

```yaml
if: github.event.label.name == 'ai-fix-requested'
```

### Claude Code Instructions

Modify the prompt to change how Claude Code approaches fixes:

```yaml
- name: Run Claude Code
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    # Modify the prompt in /tmp/claude-prompt.txt
```

### Build Steps

Add or modify build verification steps:

```yaml
- name: Build frontend
  run: cd web && npm run build

- name: Run tests
  run: cd web && npm test
```

## Troubleshooting

### Issue not triggering workflow

- Verify the issue has the `ai-fix-requested` label
- Check that `ANTHROPIC_API_KEY` secret is set
- Review Actions tab for workflow runs

### Workflow fails during Claude Code step

- Check that the API key is valid and has credits
- Review Claude Code output in workflow logs
- Verify the codebase compiles before the workflow runs

### No PR created

- Check if `steps.check_changes.outputs.has_changes == 'true'`
- Review the "Check for changes" step output
- Claude Code may not have made any file modifications

### Webhooks not working

- Verify webhook is configured correctly in GitHub
- Check webhook delivery history in GitHub settings
- Review backend logs for webhook processing errors
- Verify `GITHUB_WEBHOOK_SECRET` matches in both places

### User not receiving notifications

- Check that webhook events are being processed
- Verify the Console Request ID is embedded in the PR body
- Check the `notifications` table in the database

## Security Considerations

1. **API Key Protection**: Never commit `ANTHROPIC_API_KEY` to the repository
2. **Webhook Validation**: Always use `GITHUB_WEBHOOK_SECRET` in production
3. **Token Permissions**: Use minimum required scopes for GitHub tokens
4. **User Authentication**: Ensure all API endpoints require valid JWT tokens
5. **Rate Limiting**: Consider implementing rate limits on request submission

## Cost Management

- Claude API calls cost money per token
- Set usage limits in your Anthropic account
- Monitor API usage in the Anthropic console
- Consider implementing daily/weekly request limits

## Future Enhancements

- [ ] Add support for multiple Claude models (Haiku for simple fixes, Opus for complex)
- [ ] Implement PR review by Claude before auto-submitting
- [ ] Add tests verification before creating PR
- [ ] Support for draft PRs that require human approval
- [ ] Integration with Slack/Discord for notifications
- [ ] Analytics dashboard for AI fix success rates
