# GitHub License Activity Dashboard

Accurate GitHub license usage tracking for Copilot (Business & Enterprise) and GitHub Enterprise members. Identifies inactive users for license recapture using a **60-day inactivity threshold**.

## Live Dashboard

A React dashboard (dark glassmorphic theme) that visualizes repo and license data in real time from the GitHub API. Supports multiple accounts in a single view.

### Features

- **Multi-Account Support** — Add multiple GitHub PATs to view repos from different accounts in one dashboard
- **70+ Repo Overview** — KPI cards showing total repos, private/public split, stars, active/moderate/inactive counts
- **User License Status Panel** — Per-user activity cards showing:
  - Last Push date and repo
  - Last PR date and repo
  - Last Activity (any type) with date, type, and repo
  - 60-day countdown timer with visual progress bar
  - Status badge: Active (<30d) / Monitor (30-60d) / Revoke License (60d+)
  - Repo breakdown (active / monitor / revoke counts)
- **License Recapture Summary** — Banner showing how many repos are inactive 60d+ and approaching threshold
- **Per-Repo Recommendations** — Color-coded table with Active / Monitor / Revoke License per repo
- **Drill-Down Detail View** — Click any repo for contributor activity, commit charts, PR list, repo health
- **Token Health** — Rate limit bar, scope list, expiry countdown

### Running the Dashboard Locally

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173`, enter your GitHub PAT(s) in the settings modal, and the dashboard loads automatically.

### Building for Production

```bash
cd dashboard
npm run build
# Output in dashboard/dist/
```

---

## Python Scripts (Repo-Level Testing)

These scripts work with personal access tokens and don't require org admin credentials.

### Token Inspector

Validates a PAT and shows expiry, scopes, and rate limit usage.

```bash
pip install -r requirements.txt
export GITHUB_TOKEN=ghp_xxx
python token_inspector.py
```

### Repo Smoke Test

Pulls contributor activity from a single repo.

```bash
export GITHUB_TOKEN=ghp_xxx
python repo_test.py --repo owner/repo-name
```

---

## Enterprise Org-Level License Capture

> **This section is for organizations with GitHub Enterprise or Copilot Business/Enterprise plans.**
> Requires an org admin token with elevated scopes.

### What This Unlocks

GitHub's built-in analytics are inaccurate — they use 30-day buckets, have 24-48h lag, and don't expose per-user last-active timestamps. The collector pulls directly from the APIs that back those dashboards to get exact timestamps.

| Signal | What It Provides | Required Scope |
|--------|-----------------|----------------|
| **Copilot Seats API** | Per-user `last_activity_at` — actual IDE usage timestamp | `manage_billing:copilot` |
| **Enterprise Member List** | All members across the enterprise | `read:enterprise` |
| **Audit Log** | Real auth events (web, SSH, API, CLI) — highest trust signal | `read:audit_log` |
| **Org Member List** | All org members | `read:org` |

### Required Token Scopes

Create a **Classic PAT** with these scopes:

| Scope | Used For |
|-------|----------|
| `manage_billing:copilot` | Copilot seat list + `last_activity_at` |
| `read:org` | Org member list |
| `read:enterprise` | Enterprise member list |
| `read:audit_log` | Audit log — the most accurate activity signal |

**Easiest setup:** Classic PAT with `admin:enterprise` + `read:org` covers all of the above.

### How to Create the Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Select scopes: `admin:enterprise`, `read:org`, `manage_billing:copilot`
4. The token owner must be an **org owner** or **billing manager**
5. Copy the token — you won't see it again

### Running the Full Collector

```bash
cp config.example.yaml config.yaml
# Edit config.yaml with your org admin token, org slug, enterprise slug
python collector.py --config config.yaml --output github_license_report.json
```

This produces `github_license_report.json` with per-user data including:
- `effective_last_active` — the most recent timestamp across all signals
- `days_inactive` — days since last activity
- `recapture_candidate` — `true` if inactive 60+ days
- `source` — which signal provided the most recent activity (audit_log, copilot, member_list)

### Signal Merge Logic

The collector merges three signals per user and takes the **most recent** as `effective_last_active`:

1. **Audit Log** — real auth events (web, SSH, API, CLI) — **highest trust**
2. **Copilot Seats API** — actual IDE usage timestamp
3. **Enterprise member list** — existence only, no timestamp

A user inactive in Copilot but active in the audit log is **NOT** flagged for recapture. Audit log wins.

### Recapture Threshold

**60 days** of zero activity across all signals = recapture candidate.

Configurable via `--threshold` CLI arg or `threshold_days` in config.yaml.

### Running the AI Agent (Optional)

Feeds the license report into Claude API for a prioritized recapture plan.

```bash
export ANTHROPIC_API_KEY=sk-ant-xxx
python agent.py --report github_license_report.json
```

### Enterprise Dashboard Integration (Future)

When org admin credentials are available, the React dashboard can be extended to show:

1. **Copilot License Panel** — All Copilot seats with `last_activity_at`, days since last IDE usage, recapture recommendations
2. **Enterprise Members Panel** — All members with last login from audit log, activity status
3. **Unified License View** — Merged signals per user showing which signal is most recent
4. **Bulk Recapture Actions** — Export list of inactive users for license revocation

The dashboard currently shows these as "Locked Signals" cards that will activate when an org admin token is provided.

---

## Known Limitations

- **Audit log requires Enterprise plan** — if the org is on Team plan, this signal will 404 gracefully
- **Copilot billing endpoint** requires the org to have Copilot enabled and the token owner to be an org owner or billing manager
- **Rate limits** — the collector paginates with 200ms delay between pages. For 1000+ users, expect 2-5 minutes runtime
- **GitHub Events API** — only returns ~90 days of history for personal account activity tracking
- **Service accounts** — logins matching `bot-`, `svc-`, `ci-`, `-deploy` are flagged as `enterprise_review` not auto-recapture
- **Fine-grained PATs** — scope validation is skipped since GitHub doesn't expose scopes in response headers for fine-grained tokens

---

## Security

- Tokens are stored in React state only — never persisted to localStorage or disk
- No tokens are committed to this repository
- Always expire tokens after testing

---

## Project Structure

```
github-license-dashboard/
  README.md                  # This file
  collector.py               # Full org/enterprise license collector
  agent.py                   # Claude AI recapture plan generator
  token_inspector.py         # PAT validation and diagnostics
  repo_test.py               # Single-repo smoke test
  config.example.yaml        # Config template
  requirements.txt           # Python dependencies
  dashboard/                 # React dashboard
    src/App.tsx              # Main dashboard application
    src/App.css              # Styles
    package.json             # Node dependencies
    vite.config.ts           # Build config
```

---

Built by Gregory Katz. Reach out before making changes to the recapture logic or auto-removal flow in `agent.py`.
