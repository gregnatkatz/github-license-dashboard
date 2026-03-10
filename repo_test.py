#!/usr/bin/env python3
"""
repo_test.py — Smoke test against a single GitHub repo.
No org admin required — uses a personal token to pull contributor activity.

Usage:
    export GITHUB_TOKEN=ghp_xxx
    python repo_test.py --repo owner/repo-name
"""

import argparse
import os
import sys
from datetime import datetime, timezone

import requests

from token_inspector import inspect_token, print_report

GITHUB_API = "https://api.github.com"
DEFAULT_THRESHOLD_DAYS = 60
INACTIVE_THRESHOLD_DAYS = DEFAULT_THRESHOLD_DAYS


def _headers(token: str) -> dict:
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def get_repo_info(token: str, repo: str) -> dict | None:
    """Fetch basic repo metadata."""
    resp = requests.get(f"{GITHUB_API}/repos/{repo}", headers=_headers(token), timeout=15)
    if resp.status_code != 200:
        print(f"  [ERROR] Could not fetch repo '{repo}': HTTP {resp.status_code}")
        return None
    return resp.json()


def get_contributors(token: str, repo: str) -> list[dict]:
    """Fetch contributors with their latest commit date."""
    contributors = []
    page = 1
    now = datetime.now(timezone.utc)

    while True:
        resp = requests.get(
            f"{GITHUB_API}/repos/{repo}/commits",
            headers=_headers(token),
            params={"per_page": 100, "page": page},
            timeout=30,
        )
        if resp.status_code != 200:
            break

        commits = resp.json()
        if not commits:
            break

        for c in commits:
            author = c.get("author") or {}
            login = author.get("login", "unknown")
            avatar = author.get("avatar_url", "")
            commit_date_str = (
                c.get("commit", {}).get("committer", {}).get("date", "")
            )
            if not commit_date_str:
                continue

            commit_date = datetime.fromisoformat(commit_date_str.replace("Z", "+00:00"))

            # Keep only the most recent commit per author
            existing = next((x for x in contributors if x["login"] == login), None)
            if existing:
                if commit_date > datetime.fromisoformat(existing["last_commit"]):
                    existing["last_commit"] = commit_date.isoformat()
                    existing["days_inactive"] = (now - commit_date).days
            else:
                days = (now - commit_date).days
                contributors.append(
                    {
                        "login": login,
                        "avatar_url": avatar,
                        "last_commit": commit_date.isoformat(),
                        "days_inactive": days,
                        "inactive": days >= INACTIVE_THRESHOLD_DAYS,
                    }
                )

        page += 1
        if len(commits) < 100:
            break

    contributors.sort(key=lambda x: x["days_inactive"])
    return contributors


def print_repo_info(info: dict) -> None:
    """Pretty-print repo metadata."""
    print("\n" + "-" * 60)
    print("  Repo Information")
    print("-" * 60)
    print(f"  Name        : {info.get('full_name')}")
    print(f"  Description : {info.get('description', 'N/A')}")
    print(f"  Visibility  : {'Private' if info.get('private') else 'Public'}")
    print(f"  Language    : {info.get('language', 'N/A')}")
    print(f"  Stars       : {info.get('stargazers_count', 0)}")
    print(f"  Forks       : {info.get('forks_count', 0)}")
    print(f"  Open Issues : {info.get('open_issues_count', 0)}")
    print(f"  Default Br  : {info.get('default_branch', 'N/A')}")
    print(f"  License     : {(info.get('license') or {}).get('spdx_id', 'N/A')}")
    print(f"  Last Push   : {info.get('pushed_at', 'N/A')}")
    print("-" * 60)


def print_contributors(contributors: list[dict]) -> None:
    """Pretty-print contributor table."""
    active = [c for c in contributors if not c["inactive"]]
    inactive = [c for c in contributors if c["inactive"]]

    print("\n" + "-" * 60)
    print("  Contributor Activity")
    print("-" * 60)
    print(f"  Total: {len(contributors)}  |  Active (<{INACTIVE_THRESHOLD_DAYS}d): {len(active)}  |  Inactive (≥{INACTIVE_THRESHOLD_DAYS}d): {len(inactive)}")
    print("-" * 60)
    print(f"  {'Login':<25} {'Last Commit':<22} {'Days':>5}  Status")
    print(f"  {'─' * 25} {'─' * 22} {'─' * 5}  {'─' * 10}")

    for c in contributors:
        days = c["days_inactive"]
        if days < 30:
            status = "🟢 Active"
        elif days < INACTIVE_THRESHOLD_DAYS:
            status = "🟡 Warning"
        else:
            status = "🔴 Inactive"

        last = c["last_commit"][:10]
        print(f"  {c['login']:<25} {last:<22} {days:>5}  {status}")

    print("-" * 60)


def print_blocked_signals() -> None:
    """Show what's locked without org admin."""
    print("\n" + "-" * 60)
    print("  Signals Blocked (requires org admin token)")
    print("-" * 60)
    blocked = [
        ("Copilot seat list", "manage_billing:copilot", "IDE usage timestamps per user"),
        ("Enterprise member list", "read:enterprise", "Full member enumeration"),
        ("Audit log", "read:audit_log", "Auth events — highest trust signal"),
    ]
    for name, scope, desc in blocked:
        print(f"  [LOCKED] {name}")
        print(f"           Scope needed : {scope}")
        print(f"           Provides     : {desc}")
        print()
    print("-" * 60 + "\n")


def _update_threshold(days: int) -> None:
    global INACTIVE_THRESHOLD_DAYS
    INACTIVE_THRESHOLD_DAYS = days


def main():
    parser = argparse.ArgumentParser(
        description="Smoke test — validate token and pull repo contributor activity"
    )
    parser.add_argument(
        "--repo",
        required=True,
        help="Repository in owner/repo format (e.g. microsoft/vscode)",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("GITHUB_TOKEN", ""),
        help="GitHub PAT (or set GITHUB_TOKEN env var)",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=INACTIVE_THRESHOLD_DAYS,
        help=f"Days of inactivity to flag (default: {INACTIVE_THRESHOLD_DAYS})",
    )
    args = parser.parse_args()

    # Update module-level threshold
    _update_threshold(args.threshold)

    if not args.token:
        print("Error: provide --token or set GITHUB_TOKEN env var.")
        sys.exit(1)

    # Step 1 — Token inspection
    print("\n🔍 Step 1: Inspecting token...")
    token_info = inspect_token(args.token)
    print_report(token_info)

    if not token_info["valid"]:
        print("Cannot continue with an invalid token.")
        sys.exit(1)

    # Step 2 — Repo info
    print("📦 Step 2: Fetching repo metadata...")
    repo_info = get_repo_info(args.token, args.repo)
    if repo_info:
        print_repo_info(repo_info)

    # Step 3 — Contributor activity
    print("\n👥 Step 3: Fetching contributor activity...")
    contributors = get_contributors(args.token, args.repo)
    if contributors:
        print_contributors(contributors)
    else:
        print("  No contributors found (repo may be empty or token lacks access).")

    # Step 4 — Blocked signals
    print_blocked_signals()


if __name__ == "__main__":
    main()
