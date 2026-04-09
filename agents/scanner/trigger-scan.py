#!/usr/bin/env python3
"""
Trigger a single scan cycle of the KubeStellar Issue Scanner.

Usage:
  python trigger-scan.py                    # Run once
  python trigger-scan.py --watch            # Run every 15 minutes
  python trigger-scan.py --repos console    # Scan only one repo

Prerequisites:
  pip install anthropic
  export ANTHROPIC_API_KEY=...
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime
from anthropic import Anthropic

# Scan interval in seconds
SCAN_INTERVAL_SECONDS = 15 * 60  # 15 minutes

def load_config():
    config_path = os.path.join(os.path.dirname(__file__), "scanner-config.json")
    if not os.path.exists(config_path):
        print("Error: scanner-config.json not found. Run create-agent.py first.")
        sys.exit(1)
    with open(config_path) as f:
        return json.load(f)


def run_scan(client, config, repos=None):
    """Create a session and run a single scan cycle."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S %Z")

    # Build the scan prompt
    repo_list = repos or ["console", "console-kb", "docs", "console-marketplace"]
    repo_instructions = "\n".join(
        f"  {i+1}. kubestellar/{r}" for i, r in enumerate(repo_list)
    )

    prompt = f"""SCANNER FIRED — {timestamp}

Scan these repos sequentially:
{repo_instructions}

For each repo:
1. `gh issue list --repo kubestellar/<repo> --state open --limit 100`
2. `gh pr list --repo kubestellar/<repo> --state open`
3. Verify each issue against actual code
4. Fix real bugs/enhancements immediately (create worktree, fix, commit, PR, merge)
5. Close false positives with code evidence
6. Review PRs against quality criteria

Report what you fixed, closed, and what's still open."""

    print(f"\n{'='*60}")
    print(f"SCAN STARTED — {timestamp}")
    print(f"{'='*60}")

    # Create a new session for this scan
    session = client.beta.sessions.create(
        agent=config["agent_id"],
        environment_id=config["environment_id"],
    )
    print(f"Session: {session.id}")

    # Send the scan prompt and stream results
    with client.beta.sessions.events.stream(session.id) as stream:
        client.beta.sessions.events.send(
            session.id,
            events=[{
                "type": "user.message",
                "content": [{"type": "text", "text": prompt}],
            }],
        )

        for event in stream:
            if event.type == "agent.message":
                for block in event.content:
                    if hasattr(block, "text"):
                        print(block.text, end="", flush=True)
            elif event.type == "agent.tool_use":
                tool_name = event.name if hasattr(event, "name") else "tool"
                print(f"\n  [🔧 {tool_name}]", end="", flush=True)
            elif event.type == "session.status_idle":
                print(f"\n\nScan complete.")
                break
            elif event.type == "session.error":
                print(f"\n\n❌ Session error: {event}")
                break

    print(f"{'='*60}\n")
    return session.id


def main():
    parser = argparse.ArgumentParser(description="KubeStellar Issue Scanner")
    parser.add_argument("--watch", action="store_true", help="Run continuously every 15 minutes")
    parser.add_argument("--repos", nargs="+", help="Specific repos to scan (default: all 4)")
    parser.add_argument("--interval", type=int, default=SCAN_INTERVAL_SECONDS,
                        help="Scan interval in seconds (default: 900)")
    args = parser.parse_args()

    client = Anthropic()
    config = load_config()

    print(f"Agent: {config['agent_id']}")
    print(f"Environment: {config['environment_id']}")

    if args.watch:
        print(f"Watch mode — scanning every {args.interval}s")
        while True:
            try:
                run_scan(client, config, args.repos)
            except Exception as e:
                print(f"Scan failed: {e}")
            print(f"Next scan in {args.interval}s...")
            time.sleep(args.interval)
    else:
        run_scan(client, config, args.repos)


if __name__ == "__main__":
    main()
