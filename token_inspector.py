#!/usr/bin/env python3
"""
token_inspector.py — Inspect a GitHub PAT for validity, scopes, expiration, and rate limits.

Usage:
    export GITHUB_TOKEN=ghp_xxx
    python token_inspector.py

Or pass inline:
    python token_inspector.py --token ghp_xxx
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import requests

REQUIRED_SCOPES_FULL = {
    "manage_billing:copilot": "Copilot seat list + last_activity_at",
    "read:org": "Org member list",
    "read:enterprise": "Enterprise member list",
    "read:audit_log": "Audit log — most accurate activity signal",
}

GITHUB_API = "https://api.github.com"


def _headers(token: str) -> dict:
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def inspect_token(token: str) -> dict:
    """Return a dict with token metadata: user, scopes, expiry, rate limit."""
    result = {
        "valid": False,
        "user": None,
        "token_type": None,
        "scopes": [],
        "missing_scopes": [],
        "expiry": None,
        "days_remaining": None,
        "rate_limit": None,
        "warnings": [],
    }

    # ── 1. Authenticate and read scopes ──────────────────────────────────
    resp = requests.get(f"{GITHUB_API}/user", headers=_headers(token), timeout=15)
    if resp.status_code == 401:
        result["warnings"].append("Token is invalid or revoked (HTTP 401).")
        return result

    result["valid"] = True
    user_data = resp.json()
    result["user"] = user_data.get("login")

    # Scope detection — classic PATs expose scopes, fine-grained do not
    scopes_header = resp.headers.get("X-OAuth-Scopes", "")
    if scopes_header:
        result["token_type"] = "classic"
        result["scopes"] = [s.strip() for s in scopes_header.split(",") if s.strip()]
    else:
        result["token_type"] = "fine-grained"
        result["warnings"].append(
            "Fine-grained PAT detected — scope validation skipped. "
            "Verify scopes manually at https://github.com/settings/tokens."
        )

    # ── 2. Check missing scopes (classic only) ───────────────────────────
    if result["token_type"] == "classic":
        present = set(result["scopes"])
        # admin:enterprise covers read:enterprise + read:audit_log
        if "admin:enterprise" in present:
            present.add("read:enterprise")
            present.add("read:audit_log")
        # admin:org covers read:org
        if "admin:org" in present:
            present.add("read:org")

        for scope, purpose in REQUIRED_SCOPES_FULL.items():
            if scope not in present:
                result["missing_scopes"].append({"scope": scope, "purpose": purpose})

    # ── 3. Token expiration ──────────────────────────────────────────────
    expiry_header = resp.headers.get("GitHub-Authentication-Token-Expiration")
    if expiry_header:
        try:
            exp_dt = datetime.strptime(expiry_header, "%Y-%m-%d %H:%M:%S %Z")
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            delta = exp_dt - now
            result["expiry"] = exp_dt.isoformat()
            result["days_remaining"] = max(0, delta.days)
            if delta.days <= 14:
                result["warnings"].append(
                    f"Token expires in {delta.days} day(s)! Rotate soon."
                )
        except ValueError:
            result["expiry"] = expiry_header
    else:
        result["expiry"] = "no-expiry"

    # ── 4. Rate limit ────────────────────────────────────────────────────
    rl_resp = requests.get(
        f"{GITHUB_API}/rate_limit", headers=_headers(token), timeout=15
    )
    if rl_resp.status_code == 200:
        core = rl_resp.json().get("resources", {}).get("core", {})
        result["rate_limit"] = {
            "limit": core.get("limit", 0),
            "remaining": core.get("remaining", 0),
            "used": core.get("used", 0),
            "reset_utc": datetime.fromtimestamp(
                core.get("reset", 0), tz=timezone.utc
            ).isoformat(),
        }

    return result


def print_report(info: dict) -> None:
    """Pretty-print the inspection results."""
    print("\n" + "=" * 60)
    print("  GitHub Token Inspector")
    print("=" * 60)

    if not info["valid"]:
        print("\n  [ERROR] Token is INVALID or revoked.\n")
        return

    print(f"\n  User          : {info['user']}")
    print(f"  Token type    : {info['token_type']}")
    print(f"  Expiry        : {info['expiry']}")
    if info["days_remaining"] is not None:
        print(f"  Days remaining: {info['days_remaining']}")

    # Scopes
    if info["scopes"]:
        print(f"\n  Scopes ({len(info['scopes'])}):")
        for s in info["scopes"]:
            print(f"    - {s}")
    else:
        print("\n  Scopes: (not exposed — fine-grained PAT)")

    # Missing scopes
    if info["missing_scopes"]:
        print(f"\n  Missing scopes for full collector ({len(info['missing_scopes'])}):")
        for m in info["missing_scopes"]:
            print(f"    [!] {m['scope']:30s} — {m['purpose']}")

    # Rate limit
    rl = info.get("rate_limit")
    if rl:
        pct = rl["remaining"] / rl["limit"] * 100 if rl["limit"] else 0
        bar_len = 30
        filled = int(bar_len * rl["remaining"] / rl["limit"]) if rl["limit"] else 0
        bar = "█" * filled + "░" * (bar_len - filled)
        print(f"\n  Rate Limit    : {rl['remaining']}/{rl['limit']} ({pct:.0f}%)")
        print(f"  [{bar}]")
        print(f"  Resets at     : {rl['reset_utc']}")

    # Warnings
    if info["warnings"]:
        print("\n  ⚠ Warnings:")
        for w in info["warnings"]:
            print(f"    - {w}")

    print("\n" + "=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Inspect a GitHub PAT")
    parser.add_argument(
        "--token",
        default=os.environ.get("GITHUB_TOKEN", ""),
        help="GitHub PAT (or set GITHUB_TOKEN env var)",
    )
    parser.add_argument(
        "--json", action="store_true", help="Output raw JSON instead of table"
    )
    args = parser.parse_args()

    if not args.token:
        print("Error: provide --token or set GITHUB_TOKEN env var.")
        sys.exit(1)

    info = inspect_token(args.token)

    if args.json:
        print(json.dumps(info, indent=2))
    else:
        print_report(info)

    sys.exit(0 if info["valid"] else 1)


if __name__ == "__main__":
    main()
