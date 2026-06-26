# Policies

Machine-enforceable policy definitions for the KubeStellar Console repository.

These YAML files express governance rules as code so they can be consumed by
CI workflows, AI agents, and merge-queue automation. They are the source of
truth for merge requirements, AI agent boundaries, and branch protection
rules that are otherwise only described in prose.

See `merge-policy.yaml` for PR acceptance rules and `ai-boundaries.yaml` for
AI agent guardrails.
