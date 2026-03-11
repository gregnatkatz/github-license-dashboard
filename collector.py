#!/usr/bin/env python3
"""
collector.py — Pull GitHub Copilot + Enterprise license usage data.

Merges three signals per user:
  1. Audit log (highest trust — real auth events)
  2. Copilot seats API (IDE usage timestamps)
  3. Enterprise/org member list (existence only)

Outputs a JSON report with per-user effective_last_active and recapture flags.

Usage:
    cp config.example.yaml config.yaml
    # Fill in token, org, enterprise slugs
    python collector.py --config config.yaml --output github_license_report.json

Required token scopes (classic PAT):
    admin:enterprise + read:org   (covers all four needed scopes)
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests
import yaml

from token_inspector import inspect_token

GITHUB_API = "https://api.github.com"
PAGE_DELAY = 0.2  # seconds between paginated requests

SERVICE_ACCOUNT_PATTERNS = ("bot-", "svc-", "ci-", "-deploy")


def _headers(token: str) -> dict:
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _paginate(url: str, token: str, params: dict | None = None) -> list:
    """Fetch all pages from a paginated GitHub endpoint."""
    results = []
    params = params or {}
    params.setdefault("per_page", 100)
    page = 1

    while True:
        params["page"] = page
        resp = requests.get(url, headers=_headers(token), params=params, timeout=30)
        if resp.status_code != 200:
            print(f"  [WARN] {url} returned HTTP {resp.status_code} — skipping.")
            break

        data = resp.json()
        if not data:
            break

        if isinstance(data, list):
            results.extend(data)
            if len(data) < params["per_page"]:
                break
        else:
            # Some endpoints return objects with a list inside
            results.append(data)
            break

        page += 1
        time.sleep(PAGE_DELAY)

    return results


# ── Data source fetchers ─────────────────────────────────────────────────


def fetch_copilot_seats(token: str, org: str) -> list[dict]:
    """Fetch Copilot Business/Enterprise seat assignments."""
    print(f"  Fetching Copilot seats for org '{org}'...")
    url = f"{GITHUB_API}/orgs/{org}/copilot/billing/seats"
    seats = []
    page = 1

    while True:
        resp = requests.get(
            url,
            headers=_headers(token),
            params={"per_page": 100, "page": page},
            timeout=30,
        )
        if resp.status_code == 404:
            print("  [SKIP] Copilot not enabled or insufficient permissions (404).")
            return []
        if resp.status_code == 403:
            print("  [SKIP] Token lacks manage_billing:copilot scope (403).")
            return []
        if resp.status_code != 200:
            print(f"  [WARN] Copilot seats endpoint returned HTTP {resp.status_code}.")
            return []

        body = resp.json()
        page_seats = body.get("seats", [])
        seats.extend(page_seats)

        if len(page_seats) < 100:
            break
        page += 1
        time.sleep(PAGE_DELAY)

    print(f"  Found {len(seats)} Copilot seat(s).")
    return seats


def fetch_org_members(token: str, org: str) -> list[dict]:
    """Fetch organization members."""
    print(f"  Fetching org members for '{org}'...")
    url = f"{GITHUB_API}/orgs/{org}/members"
    members = _paginate(url, token)
    print(f"  Found {len(members)} org member(s).")
    return members


def fetch_enterprise_members(token: str, enterprise: str) -> list[dict]:
    """Fetch enterprise members via GraphQL."""
    print(f"  Fetching enterprise members for '{enterprise}'...")
    query = """
    query($enterprise: String!, $cursor: String) {
      enterprise(slug: $enterprise) {
        members(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            ... on EnterpriseUserAccount {
              login
              name
              createdAt
            }
          }
        }
      }
    }
    """
    members = []
    cursor = None

    while True:
        resp = requests.post(
            "https://api.github.com/graphql",
            headers=_headers(token),
            json={"query": query, "variables": {"enterprise": enterprise, "cursor": cursor}},
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"  [WARN] Enterprise GraphQL returned HTTP {resp.status_code}.")
            break

        data = resp.json().get("data", {})
        ent = data.get("enterprise")
        if not ent:
            errors = resp.json().get("errors", [])
            if errors:
                print(f"  [SKIP] Enterprise query failed: {errors[0].get('message', '')}")
            break

        nodes = ent["members"]["nodes"]
        members.extend(nodes)

        page_info = ent["members"]["pageInfo"]
        if not page_info["hasNextPage"]:
            break
        cursor = page_info["endCursor"]
        time.sleep(PAGE_DELAY)

    print(f"  Found {len(members)} enterprise member(s).")
    return members


def fetch_audit_log(token: str, enterprise: str, days_back: int = 90) -> list[dict]:
    """Fetch enterprise audit log entries (requires Enterprise plan)."""
    print(f"  Fetching audit log for enterprise '{enterprise}' (last {days_back}d)...")
    cutoff = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    cutoff_iso = cutoff.isoformat()

    url = f"{GITHUB_API}/enterprises/{enterprise}/audit-log"
    entries = []
    page = 1

    while True:
        resp = requests.get(
            url,
            headers=_headers(token),
            params={
                "per_page": 100,
                "page": page,
                "include": "all",
                "after": cutoff_iso,
            },
            timeout=30,
        )
        if resp.status_code == 404:
            print("  [SKIP] Audit log not available (requires Enterprise plan).")
            return []
        if resp.status_code == 403:
            print("  [SKIP] Token lacks read:audit_log scope (403).")
            return []
        if resp.status_code != 200:
            print(f"  [WARN] Audit log returned HTTP {resp.status_code}.")
            return []

        data = resp.json()
        if not data:
            break
        entries.extend(data)

        if len(data) < 100:
            break
        page += 1
        time.sleep(PAGE_DELAY)

    print(f"  Found {len(entries)} audit log entries.")
    return entries


# ── Merge & analysis ─────────────────────────────────────────────────────


def _is_service_account(login: str) -> bool:
    login_lower = login.lower()
    return any(pattern in login_lower for pattern in SERVICE_ACCOUNT_PATTERNS)


def merge_signals(
    copilot_seats: list[dict],
    org_members: list[dict],
    enterprise_members: list[dict],
    audit_entries: list[dict],
    threshold_days: int,
) -> list[dict]:
    """Merge all signals into a per-user report."""
    users: dict[str, dict] = {}
    now = datetime.now(timezone.utc)

    # Seed from org members
    for m in org_members:
        login = m.get("login", "")
        if not login:
            continue
        users.setdefault(login, {
            "login": login,
            "avatar_url": m.get("avatar_url", ""),
            "sources": [],
            "copilot_last_active": None,
            "audit_last_active": None,
            "effective_last_active": None,
            "days_inactive": None,
            "is_service_account": _is_service_account(login),
            "recommendation": None,
        })
        users[login]["sources"].append("org_member")

    # Enterprise members
    for m in enterprise_members:
        login = m.get("login", "")
        if not login:
            continue
        users.setdefault(login, {
            "login": login,
            "avatar_url": "",
            "sources": [],
            "copilot_last_active": None,
            "audit_last_active": None,
            "effective_last_active": None,
            "days_inactive": None,
            "is_service_account": _is_service_account(login),
            "recommendation": None,
        })
        if "enterprise_member" not in users[login]["sources"]:
            users[login]["sources"].append("enterprise_member")

    # Copilot seats — includes last_activity_at
    for seat in copilot_seats:
        assignee = seat.get("assignee", {})
        login = assignee.get("login", "")
        if not login:
            continue
        users.setdefault(login, {
            "login": login,
            "avatar_url": assignee.get("avatar_url", ""),
            "sources": [],
            "copilot_last_active": None,
            "audit_last_active": None,
            "effective_last_active": None,
            "days_inactive": None,
            "is_service_account": _is_service_account(login),
            "recommendation": None,
        })
        users[login]["sources"].append("copilot_seat")

        last_active = seat.get("last_activity_at")
        if last_active:
            users[login]["copilot_last_active"] = last_active

    # Audit log — group by actor, take most recent
    for entry in audit_entries:
        login = entry.get("actor", "")
        if not login:
            continue
        ts = entry.get("created_at") or entry.get("@timestamp")
        if not ts:
            continue

        if login in users:
            current = users[login]["audit_last_active"]
            if not current or ts > current:
                users[login]["audit_last_active"] = ts

    # Compute effective_last_active and recommendations
    for login, u in users.items():
        timestamps = []
        if u["copilot_last_active"]:
            timestamps.append(u["copilot_last_active"])
        if u["audit_last_active"]:
            timestamps.append(u["audit_last_active"])

        if timestamps:
            effective = max(timestamps)
            u["effective_last_active"] = effective
            try:
                dt = datetime.fromisoformat(effective.replace("Z", "+00:00"))
                u["days_inactive"] = (now - dt).days
            except (ValueError, TypeError):
                u["days_inactive"] = None
        else:
            u["effective_last_active"] = None
            u["days_inactive"] = None

        # Recommendation
        if u["is_service_account"]:
            u["recommendation"] = "enterprise_review"
        elif u["days_inactive"] is not None and u["days_inactive"] >= threshold_days:
            u["recommendation"] = "recapture_candidate"
        elif u["days_inactive"] is not None:
            u["recommendation"] = "active"
        else:
            u["recommendation"] = "no_activity_data"

    return sorted(users.values(), key=lambda x: x.get("days_inactive") or 9999, reverse=True)


# ── Main ─────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Collect GitHub Copilot + Enterprise license usage data"
    )
    parser.add_argument(
        "--config",
        default="config.yaml",
        help="Path to config YAML (default: config.yaml)",
    )
    parser.add_argument(
        "--output",
        default="github_license_report.json",
        help="Output JSON path (default: github_license_report.json)",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=None,
        help="Override threshold_days from config",
    )
    args = parser.parse_args()

    # Load config
    if not os.path.exists(args.config):
        print(f"Error: config file '{args.config}' not found.")
        print("Copy config.example.yaml to config.yaml and fill in credentials.")
        sys.exit(1)

    with open(args.config) as f:
        config = yaml.safe_load(f)

    token = config.get("github_token") or os.environ.get("GITHUB_TOKEN", "")
    org = config.get("org", "")
    enterprise = config.get("enterprise", "")
    threshold_days = args.threshold or config.get("threshold_days", 60)

    if not token:
        print("Error: github_token not set in config or GITHUB_TOKEN env var.")
        sys.exit(1)

    if not org:
        print("Error: 'org' slug is required in config.yaml.")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("  GitHub License Activity Collector")
    print("=" * 60)

    # Validate token
    print("\n🔍 Validating token...")
    token_info = inspect_token(token)
    if not token_info["valid"]:
        print("  Token is invalid. Aborting.")
        sys.exit(1)
    print(f"  Authenticated as: {token_info['user']}")

    # Fetch all signals
    copilot_seats = fetch_copilot_seats(token, org)
    org_members = fetch_org_members(token, org)

    enterprise_members = []
    audit_entries = []
    if enterprise:
        enterprise_members = fetch_enterprise_members(token, enterprise)
        audit_entries = fetch_audit_log(token, enterprise)
    else:
        print("  [SKIP] No enterprise slug configured — skipping enterprise signals.")

    # Merge
    print("\n📊 Merging signals...")
    report_users = merge_signals(
        copilot_seats, org_members, enterprise_members, audit_entries, threshold_days
    )

    # Summary
    recapture = [u for u in report_users if u["recommendation"] == "recapture_candidate"]
    active = [u for u in report_users if u["recommendation"] == "active"]
    svc = [u for u in report_users if u["recommendation"] == "enterprise_review"]
    no_data = [u for u in report_users if u["recommendation"] == "no_activity_data"]

    print(f"\n  Total users    : {len(report_users)}")
    print(f"  Active         : {len(active)}")
    print(f"  Recapture      : {len(recapture)}")
    print(f"  Svc accounts   : {len(svc)}")
    print(f"  No activity    : {len(no_data)}")

    # Build output
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "org": org,
            "enterprise": enterprise or None,
            "threshold_days": threshold_days,
        },
        "token": {
            "user": token_info["user"],
            "type": token_info["token_type"],
            "expiry": token_info["expiry"],
        },
        "summary": {
            "total_users": len(report_users),
            "active": len(active),
            "recapture_candidates": len(recapture),
            "service_accounts": len(svc),
            "no_activity_data": len(no_data),
        },
        "users": report_users,
    }

    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n  Report written to: {args.output}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
