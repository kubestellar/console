# Fix for #18953: Add bot actor type check to greetings workflow

## Required Change to .github/workflows/greetings.yml

Update the `greet` job condition from:
```yaml
if: ${{ github.event_name != 'pull_request_target' || github.event.pull_request.head.repo.full_name == github.repository }}
```

To:
```yaml
if: >
  github.actor_type != 'Bot' &&
  (github.event_name != 'pull_request_target' || github.event.pull_request.head.repo.full_name == github.repository)
```

This prevents the greetings workflow from running for bot-authored PRs, fixing the 30% failure rate on Copilot/bot-authored branches.
