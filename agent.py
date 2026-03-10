#!/usr/bin/env python3
"""
agent.py — Feed a github_license_report.json into Claude API
           to produce a prioritized recapture plan.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-xxx
    python agent.py --report github_license_report.json

The agent will:
  1. Load the report
  2. Summarize recapture candidates
  3. Call Claude to generate a prioritized action plan
  4. Output the plan to stdout and optionally to a file
"""

import argparse
import json
import os
import sys

import requests

ANTHROPIC_API = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 4096


def load_report(path: str) -> dict:
    """Load and validate the license report JSON."""
    if not os.path.exists(path):
        print(f"Error: report file '{path}' not found.")
        sys.exit(1)

    with open(path) as f:
        report = json.load(f)

    required = ["summary", "users"]
    for key in required:
        if key not in report:
            print(f"Error: report missing required key '{key}'.")
            sys.exit(1)

    return report


def build_prompt(report: dict) -> str:
    """Build the Claude prompt from the report data."""
    summary = report["summary"]
    config = report.get("config", {})

    recapture = [u for u in report["users"] if u.get("recommendation") == "recapture_candidate"]
    svc_accounts = [u for u in report["users"] if u.get("recommendation") == "enterprise_review"]

    prompt = f"""You are a GitHub license optimization advisor. Analyze this license usage report and produce a prioritized recapture plan.

## Organization Context
- Org: {config.get('org', 'N/A')}
- Enterprise: {config.get('enterprise', 'N/A')}
- Inactivity threshold: {config.get('threshold_days', 60)} days

## Summary
- Total users: {summary['total_users']}
- Active: {summary['active']}
- Recapture candidates: {summary['recapture_candidates']}
- Service accounts (needs review): {summary['service_accounts']}
- No activity data: {summary['no_activity_data']}

## Recapture Candidates ({len(recapture)} users)
"""

    for u in recapture[:50]:  # Cap at 50 for token limits
        prompt += f"- {u['login']}: {u.get('days_inactive', '?')} days inactive, "
        prompt += f"sources: {', '.join(u.get('sources', []))}, "
        prompt += f"copilot_last: {u.get('copilot_last_active', 'N/A')}, "
        prompt += f"audit_last: {u.get('audit_last_active', 'N/A')}\n"

    if len(recapture) > 50:
        prompt += f"... and {len(recapture) - 50} more.\n"

    if svc_accounts:
        prompt += f"\n## Service Accounts Flagged for Review ({len(svc_accounts)})\n"
        for u in svc_accounts[:20]:
            prompt += f"- {u['login']}: sources: {', '.join(u.get('sources', []))}\n"

    prompt += """
## Instructions
1. Prioritize recapture by estimated cost savings (Copilot seats ~$19/user/mo, Enterprise seats vary).
2. Group users into tiers:
   - Tier 1: Remove immediately (90+ days, no signals)
   - Tier 2: Send warning email (60-90 days)
   - Tier 3: Watch list (30-60 days if near threshold)
3. Flag any service accounts that should NOT be removed without manual review.
4. Estimate monthly savings for each tier.
5. Provide a specific action plan with timelines.

Output as a structured markdown plan."""

    return prompt


def call_claude(prompt: str, api_key: str) -> str:
    """Send prompt to Claude API and return the response."""
    resp = requests.post(
        ANTHROPIC_API,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": MODEL,
            "max_tokens": MAX_TOKENS,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=120,
    )

    if resp.status_code != 200:
        print(f"Error: Claude API returned HTTP {resp.status_code}")
        print(resp.text)
        sys.exit(1)

    data = resp.json()
    content_blocks = data.get("content", [])
    return "\n".join(b.get("text", "") for b in content_blocks)


def main():
    parser = argparse.ArgumentParser(
        description="Generate recapture plan from license report using Claude"
    )
    parser.add_argument(
        "--report",
        required=True,
        help="Path to github_license_report.json",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional file path to save the plan (default: stdout only)",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("ANTHROPIC_API_KEY", ""),
        help="Anthropic API key (or set ANTHROPIC_API_KEY env var)",
    )
    args = parser.parse_args()

    if not args.api_key:
        print("Error: provide --api-key or set ANTHROPIC_API_KEY env var.")
        sys.exit(1)

    # Load report
    print("\n📄 Loading report...")
    report = load_report(args.report)
    print(f"  Users: {report['summary']['total_users']}")
    print(f"  Recapture candidates: {report['summary']['recapture_candidates']}")

    # Build prompt
    print("\n🧠 Building prompt for Claude...")
    prompt = build_prompt(report)

    # Call Claude
    print("📡 Calling Claude API...")
    plan = call_claude(prompt, args.api_key)

    # Output
    print("\n" + "=" * 60)
    print("  RECAPTURE PLAN")
    print("=" * 60 + "\n")
    print(plan)

    if args.output:
        with open(args.output, "w") as f:
            f.write(plan)
        print(f"\n  Plan saved to: {args.output}")


if __name__ == "__main__":
    main()
