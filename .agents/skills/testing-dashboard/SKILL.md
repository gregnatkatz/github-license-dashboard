# Testing GitHub License Dashboard

## Overview
The GitHub License Dashboard is a React (Vite + TypeScript) frontend that visualizes GitHub license usage, contributor activity, and enterprise Copilot seat management. It also includes a Python script (`license_manager.py`) for automated license removal and Entra ID reassignment.

## Devin Secrets Needed
- `GITHUB_TOKEN_GREGNATKATZ` — GitHub PAT for gregnatkatz account (used for testing personal account features)
- `GITHUB_TOKEN_CODEBOARDER` — GitHub PAT for codeboarder account (used for multi-account testing)
- Note: Org admin tokens with `manage_billing:copilot` + `read:org` scopes are needed for full enterprise testing but may not be available. The dashboard handles missing scopes gracefully.

## Local Development
```bash
cd dashboard
npm install
npm run dev
# Opens at http://localhost:5173
```

## Building & Deploying
```bash
cd dashboard
npm run build
# Output in dashboard/dist/
# Deploy dist/ folder as a static frontend
```

## Type Checking
```bash
cd dashboard
npm run build  # tsc runs as part of the build
```
There is no separate lint or typecheck command — the build step includes TypeScript compilation.

## Testing the Dashboard UI

### Settings Modal
1. Navigate to the deployed URL or localhost:5173
2. The settings modal auto-opens on first load
3. Enter a GitHub PAT in the token field — it resolves the username automatically
4. Optionally enter an org slug in the Organization field
5. Click "Load Dashboard"

### Key Panels to Verify
- **KPI Cards row** — Total Repos, Private, Public, Stars, Active (<30d), Moderate (30-60d), Revoke Recommended (60d+)
- **License Recapture Summary** — Banner with counts of inactive repos
- **User License Status** — Per-user cards with 60-day countdown timer, last push/PR/activity dates, repo breakdown
- **Enterprise License Management** — Only appears when org slug is provided. Shows:
  - Error banners if token lacks required scopes (expected behavior without org admin token)
  - Org Members count and avatar grid (works with `read:org` scope)
  - Copilot billing KPIs and seats table (requires `manage_billing:copilot`)
- **All Repositories table** — Color-coded recommendations (green Active, yellow Monitor, red Revoke License)
- **Token Health** — Rate limit bar, scopes list

### Multi-Account Testing
Add multiple tokens via "+ Add another account" to see repos from both accounts merged in one view with Owner column.

### Enterprise Panel Testing Without Org Admin Token
Enter any public org slug (e.g. "microsoft") — the dashboard will:
- Show error banner about missing Copilot billing scope (expected)
- Still successfully load org members if the token has `read:org` scope
- Not crash or show JS errors — check browser console to verify

## Testing license_manager.py

### Mock Mode (No API Calls)
```bash
python3 license_manager.py --mock
```
Expected output:
- 20 mock seats categorized: ~9 active, ~4 monitor, ~7 reassign
- Mock Copilot seat removal for inactive users
- Mock Entra ID user lookup and license removal
- Summary with correct counts
- `license_report.json` generated (clean up after testing)

### Dry Run Mode (Real API, No Modifications)
```bash
python3 license_manager.py --org ORG_SLUG --dry-run
```
Requires a valid org admin token set as `GITHUB_TOKEN` env var.

### CSV Export
```bash
python3 license_manager.py --mock --export seats.csv
```

## Common Issues
- **Token expiry**: Personal tokens may expire. If the dashboard shows no data, verify the token is still valid with `curl -H "Authorization: token TOKEN" https://api.github.com/user`
- **Copilot billing 404**: Expected when using a personal token against an org — the token needs `manage_billing:copilot` scope AND the user must be an org owner or billing manager
- **Rate limits**: With multiple accounts and org member fetching, rate limits can be consumed quickly. Check the Token Health panel for remaining calls.
- **Build errors**: The main source file `dashboard/src/App.tsx` is 3200+ lines. Watch for missing `async` keywords on fetch functions and duplicate line numbers in the source.
