#!/usr/bin/env python3
"""
GitHub Copilot License Manager with Entra ID (Azure AD) Integration

Identifies inactive Copilot seats (60d+ no activity), removes licenses via GitHub API,
and optionally reassigns licenses via Microsoft Entra ID.

Modes:
  --mock       Run with mock data (no real API calls) to preview the full flow
  --dry-run    Connect to real APIs but don't actually remove/reassign anything
  (default)    Live mode — removes and reassigns licenses

Requirements:
  pip install requests pyyaml msal

Environment variables (or pass via CLI):
  GITHUB_TOKEN          GitHub PAT with manage_billing:copilot + read:org scopes
  GITHUB_ORG            GitHub organization slug
  AZURE_TENANT_ID       Entra ID (Azure AD) tenant ID
  AZURE_CLIENT_ID       Entra ID app registration client ID
  AZURE_CLIENT_SECRET   Entra ID app registration client secret

Usage:
  # Mock mode — see the full flow with sample data
  python license_manager.py --mock

  # Dry run against real GitHub org
  python license_manager.py --org my-company --dry-run

  # Live — remove inactive Copilot seats and reassign via Entra ID
  python license_manager.py --org my-company

  # Export inactive seats to CSV
  python license_manager.py --org my-company --export inactive_seats.csv
"""

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)

# ── GitHub API ──────────────────────────────────────────────────────────────

GITHUB_API = "https://api.github.com"
INACTIVITY_THRESHOLD_DAYS = 60
MONITOR_THRESHOLD_DAYS = 30


def github_headers(token: str) -> dict:
    return {
        "Authorization": f"token {token}",
        "Accept": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def fetch_copilot_seats(token: str, org: str) -> list[dict]:
    """Paginate through all Copilot seat assignments for an org."""
    seats = []
    page = 1
    now_ms = time.time() * 1000

    while True:
        url = f"{GITHUB_API}/orgs/{org}/copilot/billing/seats?per_page=100&page={page}"
        resp = requests.get(url, headers=github_headers(token), timeout=30)

        if resp.status_code == 401:
            print(f"  ERROR: Token unauthorized. Check token scopes.")
            break
        if resp.status_code == 403:
            print(f"  ERROR: Forbidden — token needs manage_billing:copilot scope and org owner/billing manager role.")
            break
        if resp.status_code == 404:
            print(f"  ERROR: Org '{org}' not found or Copilot not enabled.")
            break
        if not resp.ok:
            print(f"  ERROR: Unexpected status {resp.status_code}: {resp.text[:200]}")
            break

        data = resp.json()
        seat_list = data.get("seats", [])
        if not seat_list:
            break

        for s in seat_list:
            last_activity = s.get("last_activity_at")
            if last_activity:
                last_dt = datetime.fromisoformat(last_activity.replace("Z", "+00:00"))
                days_since = (datetime.now(timezone.utc) - last_dt).days
            else:
                days_since = 999  # Never used

            login = s.get("assignee", {}).get("login", "unknown")

            if days_since >= INACTIVITY_THRESHOLD_DAYS:
                recommendation = "Reassign"
            elif days_since >= MONITOR_THRESHOLD_DAYS:
                recommendation = "Monitor"
            else:
                recommendation = "Active"

            seats.append({
                "login": login,
                "avatar_url": s.get("assignee", {}).get("avatar_url", ""),
                "last_activity_at": last_activity,
                "last_editor": s.get("last_activity_editor"),
                "created_at": s.get("created_at", ""),
                "plan_type": s.get("plan_type", "unknown"),
                "days_since_activity": days_since,
                "recommendation": recommendation,
            })

        if len(seat_list) < 100:
            break
        page += 1
        time.sleep(0.2)  # Rate limit courtesy

    return seats


def remove_copilot_seat(token: str, org: str, login: str, dry_run: bool = False) -> bool:
    """Remove a Copilot seat assignment for a user."""
    if dry_run:
        print(f"    [DRY RUN] Would remove Copilot seat for: {login}")
        return True

    url = f"{GITHUB_API}/orgs/{org}/copilot/billing/selected_users"
    resp = requests.delete(
        url,
        headers=github_headers(token),
        json={"selected_usernames": [login]},
        timeout=30,
    )

    if resp.ok or resp.status_code == 204:
        print(f"    REMOVED Copilot seat for: {login}")
        return True
    else:
        print(f"    FAILED to remove seat for {login}: {resp.status_code} {resp.text[:200]}")
        return False


def fetch_copilot_billing(token: str, org: str) -> Optional[dict]:
    """Get Copilot billing summary for an org."""
    url = f"{GITHUB_API}/orgs/{org}/copilot/billing"
    resp = requests.get(url, headers=github_headers(token), timeout=30)
    if not resp.ok:
        return None
    data = resp.json()
    return {
        "total": data.get("seat_breakdown", {}).get("total", 0),
        "active": data.get("seat_breakdown", {}).get("active_this_cycle", 0),
        "inactive": data.get("seat_breakdown", {}).get("inactive_this_cycle", 0),
        "pending_cancellation": data.get("seat_breakdown", {}).get("pending_cancellation", 0),
        "plan_type": data.get("seat_management_setting", "unknown"),
    }


# ── Entra ID (Azure AD) Integration ────────────────────────────────────────

def get_entra_token(tenant_id: str, client_id: str, client_secret: str) -> Optional[str]:
    """Get an access token from Entra ID using client credentials flow."""
    try:
        from msal import ConfidentialClientApplication
    except ImportError:
        print("  WARNING: 'msal' package not installed. Install with: pip install msal")
        print("  Falling back to direct HTTP token request...")
        return _get_entra_token_http(tenant_id, client_id, client_secret)

    app = ConfidentialClientApplication(
        client_id,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
        client_credential=client_secret,
    )
    result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])

    if "access_token" in result:
        return result["access_token"]
    else:
        print(f"  ERROR: Entra ID auth failed: {result.get('error_description', 'Unknown error')}")
        return None


def _get_entra_token_http(tenant_id: str, client_id: str, client_secret: str) -> Optional[str]:
    """Fallback: get Entra ID token via direct HTTP request."""
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    resp = requests.post(url, data={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://graph.microsoft.com/.default",
    }, timeout=30)

    if resp.ok:
        return resp.json().get("access_token")
    else:
        print(f"  ERROR: Entra ID token request failed: {resp.status_code} {resp.text[:200]}")
        return None


def find_entra_user(access_token: str, github_login: str, email_domain: Optional[str] = None) -> Optional[dict]:
    """
    Find an Entra ID user that matches a GitHub login.

    Strategy:
    1. Search by userPrincipalName matching github login
    2. Search by mail containing github login
    3. Search by displayName matching github login

    If email_domain is provided, tries {login}@{domain} first.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    # Strategy 1: Try exact UPN match with domain
    if email_domain:
        upn = f"{github_login}@{email_domain}"
        url = f"https://graph.microsoft.com/v1.0/users/{upn}"
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.ok:
            return resp.json()

    # Strategy 2: Search by mail or displayName
    filter_query = f"startswith(mail,'{github_login}') or startswith(displayName,'{github_login}') or startswith(userPrincipalName,'{github_login}')"
    url = f"https://graph.microsoft.com/v1.0/users?$filter={filter_query}&$top=5"
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.ok:
        users = resp.json().get("value", [])
        if users:
            return users[0]  # Best match

    return None


def get_user_licenses(access_token: str, user_id: str) -> list[dict]:
    """Get license assignments for an Entra ID user."""
    headers = {"Authorization": f"Bearer {access_token}"}
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/licenseDetails"
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.ok:
        return resp.json().get("value", [])
    return []


def remove_entra_license(access_token: str, user_id: str, sku_id: str, dry_run: bool = False) -> bool:
    """Remove a license from an Entra ID user."""
    if dry_run:
        print(f"    [DRY RUN] Would remove Entra license {sku_id} from user {user_id}")
        return True

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/assignLicense"
    resp = requests.post(url, headers=headers, json={
        "addLicenses": [],
        "removeLicenses": [sku_id],
    }, timeout=30)

    if resp.ok:
        print(f"    REMOVED Entra license {sku_id} from user {user_id}")
        return True
    else:
        print(f"    FAILED to remove Entra license: {resp.status_code} {resp.text[:200]}")
        return False


def assign_entra_license(access_token: str, user_id: str, sku_id: str, dry_run: bool = False) -> bool:
    """Assign a license to an Entra ID user."""
    if dry_run:
        print(f"    [DRY RUN] Would assign Entra license {sku_id} to user {user_id}")
        return True

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/assignLicense"
    resp = requests.post(url, headers=headers, json={
        "addLicenses": [{"skuId": sku_id, "disabledPlans": []}],
        "removeLicenses": [],
    }, timeout=30)

    if resp.ok:
        print(f"    ASSIGNED Entra license {sku_id} to user {user_id}")
        return True
    else:
        print(f"    FAILED to assign Entra license: {resp.status_code} {resp.text[:200]}")
        return False


# ── Mock Data ───────────────────────────────────────────────────────────────

def generate_mock_seats() -> list[dict]:
    """Generate realistic mock Copilot seat data for demo."""
    now = datetime.now(timezone.utc)
    mock_users = [
        {"login": "alice-dev", "days": 2, "editor": "vscode/1.85"},
        {"login": "bob-eng", "days": 5, "editor": "vscode/1.84"},
        {"login": "carol-pm", "days": 15, "editor": "jetbrains/2024.1"},
        {"login": "dave-ops", "days": 28, "editor": "vscode/1.83"},
        {"login": "eve-security", "days": 35, "editor": "vscode/1.82"},
        {"login": "frank-data", "days": 42, "editor": "jetbrains/2023.3"},
        {"login": "grace-ml", "days": 55, "editor": "vscode/1.81"},
        {"login": "hank-legacy", "days": 75, "editor": "vscode/1.79"},
        {"login": "ivy-contractor", "days": 90, "editor": None},
        {"login": "jack-intern", "days": 120, "editor": None},
        {"login": "kate-manager", "days": 180, "editor": None},
        {"login": "leo-departed", "days": 999, "editor": None},
        {"login": "mia-frontend", "days": 1, "editor": "vscode/1.85"},
        {"login": "noah-backend", "days": 8, "editor": "jetbrains/2024.1"},
        {"login": "olivia-mobile", "days": 62, "editor": "vscode/1.80"},
        {"login": "peter-devrel", "days": 45, "editor": "vscode/1.82"},
        {"login": "quinn-sre", "days": 3, "editor": "neovim/0.9"},
        {"login": "rachel-design", "days": 95, "editor": None},
        {"login": "sam-qa", "days": 22, "editor": "vscode/1.84"},
        {"login": "tina-lead", "days": 0, "editor": "vscode/1.85"},
    ]

    seats = []
    for u in mock_users:
        days = u["days"]
        if days >= INACTIVITY_THRESHOLD_DAYS:
            rec = "Reassign"
        elif days >= MONITOR_THRESHOLD_DAYS:
            rec = "Monitor"
        else:
            rec = "Active"

        last_activity = None
        if days < 999:
            from datetime import timedelta
            last_activity = (now - timedelta(days=days)).isoformat()

        seats.append({
            "login": u["login"],
            "avatar_url": f"https://github.com/{u['login']}.png",
            "last_activity_at": last_activity,
            "last_editor": u["editor"],
            "created_at": "2024-01-15T00:00:00Z",
            "plan_type": "business",
            "days_since_activity": days,
            "recommendation": rec,
        })

    return seats


def generate_mock_billing() -> dict:
    return {
        "total": 20,
        "active": 10,
        "inactive": 7,
        "pending_cancellation": 0,
        "plan_type": "assign_selected",
    }


# ── CSV Export ──────────────────────────────────────────────────────────────

def export_to_csv(seats: list[dict], filepath: str):
    """Export seat data to CSV for external processing."""
    if not seats:
        print("  No seats to export.")
        return

    fieldnames = [
        "login", "last_activity_at", "last_editor", "days_since_activity",
        "recommendation", "plan_type", "created_at",
    ]
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(seats)

    print(f"  Exported {len(seats)} seats to {filepath}")


# ── Main Flow ───────────────────────────────────────────────────────────────

def run_license_manager(args):
    print("=" * 70)
    print("  GitHub Copilot License Manager + Entra ID Integration")
    print("=" * 70)

    mock_mode = args.mock
    dry_run = args.dry_run
    org = args.org or os.environ.get("GITHUB_ORG", "")
    token = args.token or os.environ.get("GITHUB_TOKEN", "")

    if mock_mode:
        print("\n  MODE: MOCK (using sample data, no API calls)")
    elif dry_run:
        print("\n  MODE: DRY RUN (real API reads, no modifications)")
    else:
        print("\n  MODE: LIVE (will remove/reassign licenses)")

    # ── Step 1: Get Copilot seat data ──
    print(f"\n{'─' * 50}")
    print("  Step 1: Fetch Copilot Seat Assignments")
    print(f"{'─' * 50}")

    if mock_mode:
        seats = generate_mock_seats()
        billing = generate_mock_billing()
        org = "mock-enterprise-org"
        print(f"  Org: {org} (mock)")
        print(f"  Loaded {len(seats)} mock seats")
    else:
        if not token:
            print("  ERROR: No GitHub token provided. Set GITHUB_TOKEN or use --token.")
            sys.exit(1)
        if not org:
            print("  ERROR: No org provided. Set GITHUB_ORG or use --org.")
            sys.exit(1)

        print(f"  Org: {org}")
        print("  Fetching Copilot billing summary...")
        billing = fetch_copilot_billing(token, org)
        if billing:
            print(f"  Billing: {billing['total']} total seats, {billing['active']} active, {billing['inactive']} inactive")
        else:
            print("  WARNING: Could not fetch billing summary (may lack manage_billing:copilot scope)")

        print("  Fetching Copilot seat assignments (paginated)...")
        seats = fetch_copilot_seats(token, org)
        print(f"  Found {len(seats)} total seats")

    if not seats:
        print("  No seats found. Exiting.")
        return

    # ── Step 2: Categorize seats ──
    print(f"\n{'─' * 50}")
    print("  Step 2: Categorize Seats by Activity")
    print(f"{'─' * 50}")

    active = [s for s in seats if s["recommendation"] == "Active"]
    monitor = [s for s in seats if s["recommendation"] == "Monitor"]
    reassign = [s for s in seats if s["recommendation"] == "Reassign"]

    print(f"  Active   (<{MONITOR_THRESHOLD_DAYS}d):  {len(active)} seats")
    print(f"  Monitor  ({MONITOR_THRESHOLD_DAYS}-{INACTIVITY_THRESHOLD_DAYS}d): {len(monitor)} seats")
    print(f"  Reassign (>{INACTIVITY_THRESHOLD_DAYS}d):  {len(reassign)} seats")

    if reassign:
        print(f"\n  Seats eligible for reassignment:")
        for s in sorted(reassign, key=lambda x: -x["days_since_activity"]):
            days_str = "Never" if s["days_since_activity"] >= 999 else f"{s['days_since_activity']}d"
            editor_str = s["last_editor"] or "none"
            print(f"    {s['login']:<25} idle: {days_str:<8} editor: {editor_str}")

    if monitor:
        print(f"\n  Seats approaching threshold (monitor):")
        for s in sorted(monitor, key=lambda x: -x["days_since_activity"]):
            print(f"    {s['login']:<25} idle: {s['days_since_activity']}d    editor: {s['last_editor'] or 'none'}")

    # ── Step 3: Export if requested ──
    if args.export:
        print(f"\n{'─' * 50}")
        print("  Step 3: Export to CSV")
        print(f"{'─' * 50}")
        export_to_csv(seats, args.export)

    # ── Step 4: Remove Copilot seats ──
    if reassign and (not args.export_only):
        print(f"\n{'─' * 50}")
        print("  Step 4: Remove Inactive Copilot Seats")
        print(f"{'─' * 50}")

        if not mock_mode and not dry_run:
            confirm = input(f"  Remove {len(reassign)} Copilot seats? (yes/no): ").strip().lower()
            if confirm != "yes":
                print("  Skipped seat removal.")
                reassign_for_removal = []
            else:
                reassign_for_removal = reassign
        else:
            reassign_for_removal = reassign

        removed_count = 0
        for s in reassign_for_removal:
            if mock_mode:
                print(f"    [MOCK] Removed Copilot seat for: {s['login']}")
                removed_count += 1
            else:
                success = remove_copilot_seat(token, org, s["login"], dry_run=dry_run)
                if success:
                    removed_count += 1

        print(f"\n  {'Would remove' if (dry_run or mock_mode) else 'Removed'}: {removed_count}/{len(reassign)} seats")

    # ── Step 5: Entra ID License Reassignment ──
    print(f"\n{'─' * 50}")
    print("  Step 5: Entra ID License Reassignment")
    print(f"{'─' * 50}")

    tenant_id = args.tenant_id or os.environ.get("AZURE_TENANT_ID", "")
    client_id = args.client_id or os.environ.get("AZURE_CLIENT_ID", "")
    client_secret = args.client_secret or os.environ.get("AZURE_CLIENT_SECRET", "")
    email_domain = args.email_domain

    if mock_mode:
        print("  [MOCK] Entra ID Integration:")
        print(f"  [MOCK] Looking up {len(reassign)} users in Azure AD...")
        for s in reassign:
            upn = f"{s['login']}@contoso.com"
            print(f"    [MOCK] Found Entra user: {upn}")
            print(f"    [MOCK] Current licenses: Microsoft 365 E5, GitHub Enterprise")
            print(f"    [MOCK] Would disable GitHub Enterprise license for {upn}")
        print(f"\n  [MOCK] Entra ID reassignment complete for {len(reassign)} users")
        print("  [MOCK] Freed licenses can be assigned to new users in Azure Portal or via this script with --assign-to")

    elif tenant_id and client_id and client_secret:
        print("  Authenticating with Entra ID...")
        entra_token = get_entra_token(tenant_id, client_id, client_secret)

        if not entra_token:
            print("  ERROR: Could not authenticate with Entra ID. Skipping license reassignment.")
        else:
            print("  Entra ID authenticated successfully.")

            for s in reassign:
                login = s["login"]
                print(f"\n  Processing: {login}")

                # Find user in Entra ID
                user = find_entra_user(entra_token, login, email_domain)
                if not user:
                    print(f"    WARNING: Could not find Entra ID user matching '{login}'. Skipping.")
                    continue

                user_id = user["id"]
                upn = user.get("userPrincipalName", "unknown")
                print(f"    Found Entra user: {upn} (ID: {user_id})")

                # Get current licenses
                licenses = get_user_licenses(entra_token, user_id)
                github_licenses = [
                    lic for lic in licenses
                    if "github" in lic.get("skuPartNumber", "").lower()
                    or "copilot" in lic.get("skuPartNumber", "").lower()
                ]

                if github_licenses:
                    for lic in github_licenses:
                        sku_id = lic["skuId"]
                        sku_name = lic.get("skuPartNumber", sku_id)
                        print(f"    Found license: {sku_name}")
                        remove_entra_license(entra_token, user_id, sku_id, dry_run=dry_run)
                else:
                    print(f"    No GitHub/Copilot licenses found in Entra ID for this user.")

            print(f"\n  Entra ID license reassignment complete.")
    else:
        print("  Entra ID credentials not provided. Skipping license reassignment.")
        print("  To enable, set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET")
        print("  or pass --tenant-id, --client-id, --client-secret")

    # ── Summary ──
    print(f"\n{'=' * 70}")
    print("  Summary")
    print(f"{'=' * 70}")
    print(f"  Organization:     {org}")
    print(f"  Total seats:      {len(seats)}")
    print(f"  Active:           {len(active)}")
    print(f"  Monitor:          {len(monitor)}")
    print(f"  Reassign:         {len(reassign)}")
    if billing:
        print(f"  Billing total:    {billing['total']}")
        print(f"  Billing active:   {billing['active']}")
        print(f"  Billing inactive: {billing['inactive']}")
    mode_str = "MOCK" if mock_mode else ("DRY RUN" if dry_run else "LIVE")
    print(f"  Mode:             {mode_str}")
    print(f"{'=' * 70}")

    # ── Output JSON report ──
    report = {
        "org": org,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mode": mode_str.lower().replace(" ", "_"),
        "billing": billing,
        "total_seats": len(seats),
        "active_count": len(active),
        "monitor_count": len(monitor),
        "reassign_count": len(reassign),
        "seats": seats,
        "reassign_candidates": [s["login"] for s in reassign],
        "monitor_candidates": [s["login"] for s in monitor],
    }

    report_path = args.output or "license_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"\n  Report saved to: {report_path}")


def main():
    parser = argparse.ArgumentParser(
        description="GitHub Copilot License Manager with Entra ID Integration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python license_manager.py --mock                          # Demo with mock data
  python license_manager.py --org acme-corp --dry-run       # Read-only against real org
  python license_manager.py --org acme-corp                 # Live removal
  python license_manager.py --org acme-corp --export out.csv  # Export to CSV
  python license_manager.py --org acme-corp \\
    --tenant-id <tid> --client-id <cid> --client-secret <cs>  # With Entra ID
        """,
    )

    parser.add_argument("--mock", action="store_true", help="Run with mock data (no API calls)")
    parser.add_argument("--dry-run", action="store_true", help="Read real APIs but don't modify anything")
    parser.add_argument("--org", type=str, help="GitHub organization slug")
    parser.add_argument("--token", type=str, help="GitHub PAT (or set GITHUB_TOKEN env var)")
    parser.add_argument("--threshold", type=int, default=60, help="Inactivity threshold in days (default: 60)")
    parser.add_argument("--export", type=str, help="Export seats to CSV file")
    parser.add_argument("--export-only", action="store_true", help="Only export, don't remove seats")
    parser.add_argument("--output", type=str, help="Output JSON report path (default: license_report.json)")

    # Entra ID options
    parser.add_argument("--tenant-id", type=str, dest="tenant_id", help="Azure AD / Entra ID tenant ID")
    parser.add_argument("--client-id", type=str, dest="client_id", help="Entra ID app registration client ID")
    parser.add_argument("--client-secret", type=str, dest="client_secret", help="Entra ID app registration client secret")
    parser.add_argument("--email-domain", type=str, dest="email_domain",
                        help="Email domain for matching GitHub logins to Entra users (e.g. contoso.com)")

    args = parser.parse_args()

    # Override global threshold if specified
    global INACTIVITY_THRESHOLD_DAYS
    INACTIVITY_THRESHOLD_DAYS = args.threshold

    run_license_manager(args)


if __name__ == "__main__":
    main()
