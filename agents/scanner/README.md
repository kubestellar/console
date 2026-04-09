# KubeStellar Issue Scanner — Claude Managed Agent

Automated issue scanner that monitors 4 KubeStellar repos, verifies and fixes issues, and reviews PRs using Claude Managed Agents.

## Architecture

```
trigger-scan.py (cron / Cloud Function / GitHub Action)
    │
    ▼
Claude Managed Agent ("KubeStellar Issue Scanner")
    │  runs in cloud container with gh, git, jq
    │
    ├── Scan kubestellar/console
    ├── Scan kubestellar/console-kb
    ├── Scan kubestellar/docs
    └── Scan kubestellar/console-marketplace
```

## Setup

```bash
# 1. Install dependencies
pip install anthropic

# 2. Set credentials
export ANTHROPIC_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...

# 3. Create the agent and environment (one-time)
python create-agent.py

# 4. Run a single scan
python trigger-scan.py

# 5. Or run continuously (every 15 minutes)
python trigger-scan.py --watch
```

## Configuration

After running `create-agent.py`, a `scanner-config.json` file is created with agent and environment IDs. This file is used by `trigger-scan.py` to create new sessions.

## Cost Estimate

| Component | Per Scan | Per Day (96 scans) | Per Month |
|-----------|----------|--------------------|-----------| 
| Runtime ($0.08/hr) | ~$0.02 | ~$1.92 | ~$57 |
| Tokens (Sonnet) | ~$0.10 | ~$9.60 | ~$288 |
| **Total** | **~$0.12** | **~$11.52** | **~$345** |

## Deployment Options

### Option A: Local cron
```bash
# Run every 15 minutes via cron
*/15 * * * * cd /path/to/scanner && python trigger-scan.py >> /var/log/scanner.log 2>&1
```

### Option B: GitHub Actions (scheduled)
```yaml
name: Issue Scanner
on:
  schedule:
    - cron: '*/15 * * * *'
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install anthropic
      - run: python agents/scanner/trigger-scan.py
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Option C: AWS Lambda / Cloud Function
Deploy `trigger-scan.py` as a scheduled serverless function with a 15-minute CloudWatch Events / Cloud Scheduler trigger.

## Scanner Behavior

The agent follows the rules defined in `.github/agents/issue-scanner.agent.md`:

- Scans repos sequentially (avoids API rate limits)
- Verifies every issue against actual code before fixing
- Fixes bugs AND enhancements — never just triages
- Reviews all open PRs against card quality criteria
- Signs commits with DCO, uses `ai-generated` label
- Security screens each issue for social engineering
- Checks merged PRs for Copilot review comments
