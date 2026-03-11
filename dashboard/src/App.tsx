import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  Star,
  GitFork,
  AlertCircle,
  Lock,
  Shield,
  Clock,
  Users,
  Activity,
  Loader2,
  ExternalLink,
  GitCommit,
  GitPullRequest,
  Settings,
  X,
  RefreshCw,
  TrendingUp,
  UserCheck,
  UserX,
  HardDrive,
  GitBranch,
  FileText,
  Zap,
  ChevronRight,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import "./App.css";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface RepoData {
  full_name: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  default_branch: string;
  size: number;
  license: { spdx_id: string } | null;
  pushed_at: string;
  topics: string[];
  html_url: string;
}

interface TokenInfo {
  valid: boolean;
  user: string | null;
  scopes: string[];
  tokenType: string;
  expiry: string | null;
  daysRemaining: number | null;
  rateLimit: {
    limit: number;
    remaining: number;
    used: number;
    resetUtc: string;
  } | null;
  warnings: string[];
}

interface Contributor {
  login: string;
  avatar_url: string;
  lastCommit: string;
  daysInactive: number;
  inactive: boolean;
  lastActivity: string | null;
  lastActivityType: string | null;
  dayssinceActivity: number | null;
}

interface CommitEntry {
  sha: string;
  message: string;
  author: string;
  avatar: string;
  date: string;
}

interface CommitFrequency {
  day: string;
  count: number;
}

interface PullRequest {
  number: number;
  title: string;
  state: string;
  created_at: string;
  user: { login: string };
}

interface UserRepo {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  updated_at: string;
  size: number;
  html_url: string;
  _owner: string; // derived from full_name, tracks which account owns this repo
}

interface TokenEntry {
  token: string;
  user: string; // resolved username
  label: string; // display label
}

interface UserLicenseStatus {
  username: string;
  avatarUrl: string;
  totalRepos: number;
  activeRepos: number;
  monitorRepos: number;
  revokeRepos: number;
  lastPush: string | null;
  lastPushRepo: string | null;
  lastPR: string | null;
  lastPRRepo: string | null;
  lastActivity: string | null;
  lastActivityType: string | null;
  lastActivityRepo: string | null;
  daysSinceLastActivity: number;
  daysUntilRevoke: number; // 60 - daysSinceLastActivity (clamped to 0)
  recommendation: "Active" | "Monitor" | "Revoke License";
}

/* ─── Palette ────────────────────────────────────────────────────────── */

const COLORS = {
  bg: "#0d1117",
  surface: "#161b22",
  cardBg: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.08)",
  blue: "#58a6ff",
  green: "#3fb950",
  red: "#f85149",
  yellow: "#d29922",
  purple: "#bc8cff",
  orange: "#f0883e",
  textPrimary: "#e6edf3",
  textSecondary: "#8b949e",
  textMuted: "#484f58",
};

const glassCard: React.CSSProperties = {
  background: COLORS.cardBg,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: "16px",
  padding: "24px",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
};

const glassCardHover: React.CSSProperties = {
  transform: "translateY(-2px)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
};

/* ─── Hooks ──────────────────────────────────────────────────────────── */

function useHover() {
  const [hovered, setHovered] = useState(false);
  const bind = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };
  return [hovered, bind] as const;
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function GlassCard({
  children,
  className = "",
  delay = 0,
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const [hovered, bind] = useHover();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className={className}
      style={{
        ...glassCard,
        ...(hovered ? glassCardHover : {}),
        opacity: visible ? 1 : 0,
        transform: visible
          ? hovered
            ? "translateY(-2px)"
            : "translateY(0)"
          : "translateY(20px)",
        transition:
          "opacity 0.5s ease, transform 0.3s ease, box-shadow 0.2s ease",
        ...style,
      }}
      {...bind}
    >
      {children}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  delay?: number;
}) {
  return (
    <GlassCard delay={delay} style={{ padding: "20px", textAlign: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: color + "15",
          margin: "0 auto 12px",
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: COLORS.textPrimary,
          fontFamily: "'Syne', sans-serif",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: COLORS.textSecondary,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
    </GlassCard>
  );
}

function StatusDot({ days }: { days: number }) {
  const color =
    days < 30 ? COLORS.green : days < 60 ? COLORS.yellow : COLORS.red;
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color,
        marginRight: 8,
      }}
    />
  );
}

function ProgressBar({
  value,
  max,
  color = COLORS.blue,
  height = 8,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: height / 2,
        backgroundColor: "rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: color,
          transition: "width 1s ease",
        }}
      />
    </div>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        backgroundColor: "rgba(88,166,255,0.12)",
        color: COLORS.blue,
        border: "1px solid rgba(88,166,255,0.2)",
        marginRight: 6,
        marginBottom: 4,
      }}
    >
      {text}
    </span>
  );
}

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
      }}
    >
      {icon}
      <h2
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 18,
          fontWeight: 700,
          margin: 0,
          color: COLORS.textPrimary,
        }}
      >
        {title}
      </h2>
    </div>
  );
}

function LockedCard({
  title,
  description,
  scope,
  delay,
}: {
  title: string;
  description: string;
  scope: string;
  delay: number;
}) {
  return (
    <GlassCard
      delay={delay}
      style={{ opacity: 0.6, position: "relative", overflow: "hidden" }}
    >
      <div style={{ position: "absolute", top: 12, right: 12 }}>
        <Lock size={16} color={COLORS.textMuted} />
      </div>
      <h3
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 16,
          color: COLORS.textPrimary,
          margin: "0 0 8px 0",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          color: COLORS.textSecondary,
          margin: "0 0 12px 0",
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: COLORS.textMuted,
        }}
      >
        <Shield size={12} />
        <span>Requires: {scope}</span>
      </div>
    </GlassCard>
  );
}

/* ─── Settings Modal ─────────────────────────────────────────────────── */

function SettingsModal({
  open,
  onClose,
  tokenInputs,
  setTokenInputs,
  onSubmit,
  loading,
  error,
  resolvedTokens,
}: {
  open: boolean;
  onClose: () => void;
  tokenInputs: string[];
  setTokenInputs: (v: string[]) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  resolvedTokens: TokenEntry[];
}) {
  if (!open) return null;

  const updateToken = (idx: number, val: string) => {
    const next = [...tokenInputs];
    next[idx] = val;
    setTokenInputs(next);
  };

  const addToken = () => {
    setTokenInputs([...tokenInputs, ""]);
  };

  const removeToken = (idx: number) => {
    if (tokenInputs.length <= 1) return;
    setTokenInputs(tokenInputs.filter((_, i) => i !== idx));
  };

  const hasAnyToken = tokenInputs.some((t) => t.trim().length > 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          ...glassCard,
          width: "100%",
          maxWidth: 480,
          padding: "32px",
          position: "relative",
          border: `1px solid ${COLORS.cardBorder}`,
          backgroundColor: COLORS.surface,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: COLORS.textSecondary,
            padding: 4,
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <Settings size={20} color={COLORS.blue} />
          <h2
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 20,
              fontWeight: 700,
              margin: 0,
              color: COLORS.textPrimary,
            }}
          >
            Dashboard Settings
          </h2>
        </div>

        <label
          style={{
            display: "block",
            fontSize: 12,
            color: COLORS.textSecondary,
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          GitHub Tokens
        </label>
        <p
          style={{
            fontSize: 11,
            color: COLORS.textMuted,
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          Add one or more GitHub PATs to view repos from multiple accounts.
        </p>

        {tokenInputs.map((tk, idx) => {
          const resolved = resolvedTokens.find((rt) => rt.token === tk);
          return (
            <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type="password"
                  placeholder={`Token ${idx + 1} — ghp_...`}
                  value={tk}
                  onChange={(e) => updateToken(idx, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    paddingRight: resolved ? 100 : 14,
                    borderRadius: 10,
                    border: `1px solid ${resolved ? "rgba(63,185,80,0.3)" : COLORS.cardBorder}`,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    color: COLORS.textPrimary,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {resolved && (
                  <span
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 11,
                      color: COLORS.green,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <User size={10} />
                    {resolved.user}
                  </span>
                )}
              </div>
              {tokenInputs.length > 1 && (
                <button
                  onClick={() => removeToken(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: `1px solid rgba(248,81,73,0.3)`,
                    backgroundColor: "rgba(248,81,73,0.08)",
                    color: COLORS.red,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                  title="Remove token"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}

        <button
          onClick={addToken}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px dashed ${COLORS.cardBorder}`,
            backgroundColor: "transparent",
            color: COLORS.textSecondary,
            cursor: "pointer",
            fontSize: 12,
            marginBottom: 20,
            width: "100%",
            justifyContent: "center",
          }}
        >
          <Plus size={14} />
          Add another account
        </button>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              backgroundColor: "rgba(248,81,73,0.1)",
              border: "1px solid rgba(248,81,73,0.3)",
              color: COLORS.red,
              fontSize: 13,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <button
          onClick={onSubmit}
          disabled={loading || !hasAnyToken}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 10,
            border: "none",
            backgroundColor: COLORS.blue,
            color: "#fff",
            fontFamily: "'Syne', sans-serif",
            fontWeight: 600,
            fontSize: 14,
            cursor: loading || !hasAnyToken ? "not-allowed" : "pointer",
            opacity: loading || !hasAnyToken ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="spin" /> Loading...
            </>
          ) : (
            <>
              <Zap size={16} /> Load Dashboard
            </>
          )}
        </button>

        <p
          style={{
            fontSize: 11,
            color: COLORS.textMuted,
            marginTop: 14,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Tokens are stored in memory only and never persisted.
        </p>
      </div>
    </div>
  );
}

/* ─── API Helpers ────────────────────────────────────────────────────── */

const API = "https://api.github.com";

function hdrs(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
  };
}

async function fetchTokenInfo(token: string): Promise<TokenInfo> {
  const info: TokenInfo = {
    valid: false,
    user: null,
    scopes: [],
    tokenType: "unknown",
    expiry: null,
    daysRemaining: null,
    rateLimit: null,
    warnings: [],
  };

  const resp = await fetch(`${API}/user`, { headers: hdrs(token) });
  if (resp.status === 401) {
    info.warnings.push("Token is invalid or revoked");
    return info;
  }

  info.valid = true;
  const data = await resp.json();
  info.user = data.login;

  const scopesHeader = resp.headers.get("X-OAuth-Scopes") || "";
  if (scopesHeader) {
    info.tokenType = "classic";
    info.scopes = scopesHeader
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  } else {
    info.tokenType = "fine-grained";
    info.warnings.push("Fine-grained PAT -- scope validation skipped");
  }

  const expiryHeader = resp.headers.get(
    "GitHub-Authentication-Token-Expiration"
  );
  if (expiryHeader) {
    info.expiry = expiryHeader;
    try {
      const expDate = new Date(expiryHeader);
      const now = new Date();
      const diff = Math.floor(
        (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      info.daysRemaining = Math.max(0, diff);
      if (diff <= 14) {
        info.warnings.push("Token expires in " + diff + " day(s)!");
      }
    } catch {
      /* ignore parse errors */
    }
  } else {
    info.expiry = "No expiry set";
    info.daysRemaining = null;
  }

  const rlResp = await fetch(`${API}/rate_limit`, { headers: hdrs(token) });
  if (rlResp.ok) {
    const rlData = await rlResp.json();
    const core = rlData.resources?.core;
    if (core) {
      info.rateLimit = {
        limit: core.limit,
        remaining: core.remaining,
        used: core.used,
        resetUtc: new Date(core.reset * 1000).toISOString(),
      };
    }
  }

  return info;
}

async function fetchRepo(token: string, repo: string): Promise<RepoData> {
  const resp = await fetch(`${API}/repos/${repo}`, { headers: hdrs(token) });
  if (!resp.ok) throw new Error("Repo fetch failed: " + resp.status);
  return resp.json();
}

async function fetchContributors(
  token: string,
  repo: string
): Promise<Contributor[]> {
  const now = new Date();
  const contributors: Map<string, Contributor> = new Map();

  for (let page = 1; page <= 5; page++) {
    const resp = await fetch(
      `${API}/repos/${repo}/commits?per_page=100&page=${page}`,
      { headers: hdrs(token) }
    );
    if (!resp.ok) break;
    const commits = await resp.json();
    if (!commits.length) break;

    for (const c of commits) {
      const login = c.author?.login || c.commit?.author?.name || "unknown";
      const avatar = c.author?.avatar_url || "";
      const dateStr = c.commit?.committer?.date || c.commit?.author?.date;
      if (!dateStr) continue;

      const commitDate = new Date(dateStr);
      const existing = contributors.get(login);

      if (!existing || commitDate > new Date(existing.lastCommit)) {
        const days = Math.floor(
          (now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        contributors.set(login, {
          login,
          avatar_url: avatar,
          lastCommit: commitDate.toISOString(),
          daysInactive: days,
          inactive: days >= 60,
          lastActivity: null,
          lastActivityType: null,
          dayssinceActivity: null,
        });
      }
    }

    if (commits.length < 100) break;
  }

  return Array.from(contributors.values()).sort(
    (a, b) => a.daysInactive - b.daysInactive
  );
}

async function fetchCommits(
  token: string,
  repo: string
): Promise<{ commits: CommitEntry[]; frequency: CommitFrequency[] }> {
  const resp = await fetch(
    `${API}/repos/${repo}/commits?per_page=30&page=1`,
    { headers: hdrs(token) }
  );
  if (!resp.ok) return { commits: [], frequency: [] };
  const data = await resp.json();

  const commits: CommitEntry[] = data.map(
    (c: {
      sha: string;
      commit: { message: string; author: { date: string } };
      author?: { login: string; avatar_url: string };
    }) => ({
      sha: c.sha.slice(0, 7),
      message:
        c.commit.message.length > 72
          ? c.commit.message.slice(0, 72) + "..."
          : c.commit.message.split("\n")[0],
      author: c.author?.login || "unknown",
      avatar: c.author?.avatar_url || "",
      date: c.commit.author.date,
    })
  );

  const freq: Record<string, number> = {};
  for (const cm of commits) {
    const day = cm.date.slice(0, 10);
    freq[day] = (freq[day] || 0) + 1;
  }
  const frequency = Object.entries(freq)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return { commits, frequency };
}

interface UserActivity {
  login: string;
  lastActivity: string;
  activityType: string;
}

const EVENT_LABELS: Record<string, string> = {
  PushEvent: "Push",
  PullRequestEvent: "PR",
  IssueCommentEvent: "Comment",
  IssuesEvent: "Issue",
  PullRequestReviewEvent: "Review",
  PullRequestReviewCommentEvent: "Review Comment",
  CreateEvent: "Create",
  DeleteEvent: "Delete",
  ForkEvent: "Fork",
  WatchEvent: "Star",
  CommitCommentEvent: "Commit Comment",
  ReleaseEvent: "Release",
  MemberEvent: "Member",
  GollumEvent: "Wiki",
};

async function fetchRepoEvents(
  token: string,
  repo: string
): Promise<Map<string, UserActivity>> {
  const activityMap = new Map<string, UserActivity>();

  for (let page = 1; page <= 10; page++) {
    const resp = await fetch(
      `${API}/repos/${repo}/events?per_page=100&page=${page}`,
      { headers: hdrs(token) }
    );
    if (!resp.ok) break;
    const events = await resp.json();
    if (!events.length) break;

    for (const evt of events) {
      const login = evt.actor?.login;
      if (!login) continue;
      const date = evt.created_at;
      const type = evt.type || "Unknown";

      const existing = activityMap.get(login);
      if (!existing || new Date(date) > new Date(existing.lastActivity)) {
        activityMap.set(login, {
          login,
          lastActivity: date,
          activityType: EVENT_LABELS[type] || type.replace("Event", ""),
        });
      }
    }

    if (events.length < 100) break;
  }

  return activityMap;
}

async function fetchOpenPRs(
  token: string,
  repo: string
): Promise<PullRequest[]> {
  const resp = await fetch(
    `${API}/repos/${repo}/pulls?state=open&per_page=10`,
    { headers: hdrs(token) }
  );
  if (!resp.ok) return [];
  return resp.json();
}

async function fetchAllUserRepos(token: string): Promise<UserRepo[]> {
  const allRepos: UserRepo[] = [];
  for (let page = 1; page <= 10; page++) {
    const resp = await fetch(
      `${API}/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner`,
      { headers: hdrs(token) }
    );
    if (!resp.ok) break;
    const repos = await resp.json();
    if (!repos.length) break;
    allRepos.push(...repos);
    if (repos.length < 100) break;
  }
  return allRepos;
}

async function fetchUserPRActivity(token: string, username: string): Promise<{ lastPR: string | null; lastPRRepo: string | null; lastActivity: string | null; lastActivityType: string | null; lastActivityRepo: string | null; avatarUrl: string }> {
  let lastPR: string | null = null;
  let lastPRRepo: string | null = null;
  let lastActivity: string | null = null;
  let lastActivityType: string | null = null;
  let lastActivityRepo: string | null = null;
  let avatarUrl = `https://github.com/${username}.png`;

  for (let page = 1; page <= 3; page++) {
    const resp = await fetch(
      `${API}/users/${username}/events?per_page=100&page=${page}`,
      { headers: hdrs(token) }
    );
    if (!resp.ok) break;
    const events = await resp.json();
    if (!events.length) break;
    for (const evt of events) {
      const date = evt.created_at;
      const repoName = evt.repo?.name || "";
      if (evt.actor?.avatar_url) avatarUrl = evt.actor.avatar_url;
      // Track overall last activity
      if (!lastActivity || new Date(date) > new Date(lastActivity)) {
        lastActivity = date;
        lastActivityType = EVENT_LABELS[evt.type] || evt.type?.replace("Event", "") || "Unknown";
        lastActivityRepo = repoName;
      }
      // Track last PR specifically
      if (evt.type === "PullRequestEvent" && (!lastPR || new Date(date) > new Date(lastPR))) {
        lastPR = date;
        lastPRRepo = repoName;
      }
    }
    if (events.length < 100) break;
  }
  return { lastPR, lastPRRepo, lastActivity, lastActivityType, lastActivityRepo, avatarUrl };
}

async function fetchUserEvents(token: string, username: string): Promise<Map<string, { date: string; type: string; repo: string }>> {
  const activityMap = new Map<string, { date: string; type: string; repo: string }>();
  for (let page = 1; page <= 3; page++) {
    const resp = await fetch(
      `${API}/users/${username}/events?per_page=100&page=${page}`,
      { headers: hdrs(token) }
    );
    if (!resp.ok) break;
    const events = await resp.json();
    if (!events.length) break;
    for (const evt of events) {
      const repoName = evt.repo?.name || "";
      if (!activityMap.has(repoName)) {
        activityMap.set(repoName, {
          date: evt.created_at,
          type: EVENT_LABELS[evt.type] || evt.type?.replace("Event", "") || "Unknown",
          repo: repoName,
        });
      }
    }
    if (events.length < 100) break;
  }
  return activityMap;
}

/* ─── Main App ───────────────────────────────────────────────────────── */

function App() {
  const [tokenInputs, setTokenInputs] = useState<string[]>([""]);
  const [resolvedTokens, setResolvedTokens] = useState<TokenEntry[]>([]);
  const [ownerTokenMap, setOwnerTokenMap] = useState<Map<string, string>>(new Map());
  const [repoSlug, setRepoSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "detail">("overview");

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [repoData, setRepoData] = useState<RepoData | null>(null);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [commitData, setCommitData] = useState<{
    commits: CommitEntry[];
    frequency: CommitFrequency[];
  }>({ commits: [], frequency: [] });
  const [openPRs, setOpenPRs] = useState<PullRequest[]>([]);
  const [allRepos, setAllRepos] = useState<UserRepo[]>([]);
  const [userEventsMap, setUserEventsMap] = useState<Map<string, { date: string; type: string; repo: string }>>(new Map());
  const [userLicenseStatuses, setUserLicenseStatuses] = useState<UserLicenseStatus[]>([]);

  // Helper: get the token for a given repo owner
  const getTokenForOwner = useCallback((owner: string): string => {
    return ownerTokenMap.get(owner) || resolvedTokens[0]?.token || tokenInputs[0] || "";
  }, [ownerTokenMap, resolvedTokens, tokenInputs]);

  const loadOverview = useCallback(async () => {
    const validInputs = tokenInputs.filter((t) => t.trim().length > 0);
    if (validInputs.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      // Validate all tokens in parallel
      const tokenInfos = await Promise.all(validInputs.map((t) => fetchTokenInfo(t)));
      const validPairs: { token: string; info: TokenInfo }[] = [];
      const errors: string[] = [];

      tokenInfos.forEach((ti, i) => {
        if (ti.valid) {
          validPairs.push({ token: validInputs[i], info: ti });
        } else {
          errors.push(`Token ${i + 1} is invalid or revoked.`);
        }
      });

      if (validPairs.length === 0) {
        setError(errors.join(" "));
        setLoading(false);
        return;
      }

      // Use first valid token's info for display
      setTokenInfo(validPairs[0].info);

      // Build resolved tokens list
      const resolved: TokenEntry[] = validPairs.map((p) => ({
        token: p.token,
        user: p.info.user || "unknown",
        label: p.info.user || "unknown",
      }));
      setResolvedTokens(resolved);

      // Fetch repos and events from all accounts in parallel
      const allResults = await Promise.all(
        validPairs.map(async (p) => {
          const [repos, evtMap] = await Promise.all([
            fetchAllUserRepos(p.token),
            fetchUserEvents(p.token, p.info.user || ""),
          ]);
          return { token: p.token, user: p.info.user || "", repos, evtMap };
        })
      );

      // Merge all repos, tag with owner, build owner→token map
      const mergedRepos: UserRepo[] = [];
      const mergedEvents = new Map<string, { date: string; type: string; repo: string }>();
      const newOwnerTokenMap = new Map<string, string>();

      for (const result of allResults) {
        for (const repo of result.repos) {
          mergedRepos.push({ ...repo, _owner: result.user });
          const owner = repo.full_name.split("/")[0];
          if (!newOwnerTokenMap.has(owner)) {
            newOwnerTokenMap.set(owner, result.token);
          }
        }
        // Merge events
        result.evtMap.forEach((val, key) => {
          if (!mergedEvents.has(key)) {
            mergedEvents.set(key, val);
          }
        });
      }

      // Sort by pushed_at descending
      mergedRepos.sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime());

      // Build per-user license status
      const nowMs = Date.now();
      const userStatuses: UserLicenseStatus[] = await Promise.all(
        validPairs.map(async (p) => {
          const username = p.info.user || "unknown";
          const userRepos = mergedRepos.filter((r) => r._owner === username);
          const prActivity = await fetchUserPRActivity(p.token, username);

          // Find latest push across all user's repos
          let latestPush: string | null = null;
          let latestPushRepo: string | null = null;
          for (const r of userRepos) {
            if (!latestPush || new Date(r.pushed_at) > new Date(latestPush)) {
              latestPush = r.pushed_at;
              latestPushRepo = r.full_name;
            }
          }

          // Determine most recent activity (push vs event activity)
          const pushDate = latestPush ? new Date(latestPush).getTime() : 0;
          const actDate = prActivity.lastActivity ? new Date(prActivity.lastActivity).getTime() : 0;
          const mostRecentMs = Math.max(pushDate, actDate);
          const daysSince = mostRecentMs > 0 ? Math.floor((nowMs - mostRecentMs) / 86400000) : 999;
          const daysUntil = Math.max(0, 60 - daysSince);

          const activeCount = userRepos.filter((r) => Math.floor((nowMs - new Date(r.pushed_at).getTime()) / 86400000) < 30).length;
          const monitorCount = userRepos.filter((r) => {
            const d = Math.floor((nowMs - new Date(r.pushed_at).getTime()) / 86400000);
            return d >= 30 && d < 60;
          }).length;
          const revokeCount = userRepos.filter((r) => Math.floor((nowMs - new Date(r.pushed_at).getTime()) / 86400000) >= 60).length;

          const recommendation: "Active" | "Monitor" | "Revoke License" =
            daysSince < 30 ? "Active" : daysSince < 60 ? "Monitor" : "Revoke License";

          return {
            username,
            avatarUrl: prActivity.avatarUrl,
            totalRepos: userRepos.length,
            activeRepos: activeCount,
            monitorRepos: monitorCount,
            revokeRepos: revokeCount,
            lastPush: latestPush,
            lastPushRepo: latestPushRepo,
            lastPR: prActivity.lastPR,
            lastPRRepo: prActivity.lastPRRepo,
            lastActivity: prActivity.lastActivity || latestPush,
            lastActivityType: prActivity.lastActivityType || (latestPush ? "Push" : null),
            lastActivityRepo: prActivity.lastActivityRepo || latestPushRepo,
            daysSinceLastActivity: daysSince,
            daysUntilRevoke: daysUntil,
            recommendation,
          };
        })
      );

      setOwnerTokenMap(newOwnerTokenMap);
      setAllRepos(mergedRepos);
      setUserEventsMap(mergedEvents);
      setUserLicenseStatuses(userStatuses);
      setLastRefresh(new Date());
      setSettingsOpen(false);
      setViewMode("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [tokenInputs]);

  const loadRepoDetail = useCallback(async (slug: string) => {
    const owner = slug.split("/")[0];
    const tkn = getTokenForOwner(owner);
    if (!tkn || !slug) return;
    setLoading(true);
    setError(null);
    setRepoSlug(slug);

    try {
      const [repo, contribs, cm, prs, eventsMap] = await Promise.all([
        fetchRepo(tkn, slug),
        fetchContributors(tkn, slug),
        fetchCommits(tkn, slug),
        fetchOpenPRs(tkn, slug),
        fetchRepoEvents(tkn, slug),
      ]);

      // Merge events activity into contributors
      const now = new Date();
      const enriched = contribs.map((c) => {
        const evt = eventsMap.get(c.login);
        if (evt) {
          const actDate = new Date(evt.lastActivity);
          const daysSince = Math.floor(
            (now.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return {
            ...c,
            lastActivity: evt.lastActivity,
            lastActivityType: evt.activityType,
            dayssinceActivity: daysSince,
          };
        }
        return c;
      });

      setRepoData(repo);
      setContributors(enriched);
      setCommitData(cm);
      setOpenPRs(prs);
      setLastRefresh(new Date());
      setViewMode("detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [getTokenForOwner]);

  // Load overview from settings
  const loadData = useCallback(async () => {
    await loadOverview();
  }, [loadOverview]);

  // Auto-load overview on mount when tokens are present
  useEffect(() => {
    const hasToken = tokenInputs.some((t) => t.trim().length > 0);
    if (hasToken && allRepos.length === 0 && !loading) {
      loadOverview();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = contributors.filter((c) => !c.inactive).length;
  const inactiveCount = contributors.filter((c) => c.inactive).length;

  const activityBreakdown = [
    { name: "Active (<30d)", value: contributors.filter((c) => c.daysInactive < 30).length, color: COLORS.green },
    { name: "Moderate (30-60d)", value: contributors.filter((c) => c.daysInactive >= 30 && c.daysInactive < 60).length, color: COLORS.yellow },
    { name: "Inactive (60d+)", value: contributors.filter((c) => c.daysInactive >= 60).length, color: COLORS.red },
  ].filter((d) => d.value > 0);

  const now = new Date();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: COLORS.bg,
        color: COLORS.textPrimary,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Syne:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => { if (allRepos.length > 0 || repoData) setSettingsOpen(false); }}
        tokenInputs={tokenInputs}
        setTokenInputs={setTokenInputs}
        onSubmit={loadData}
        loading={loading}
        error={error}
        resolvedTokens={resolvedTokens}
      />

      {/* Top Nav Bar */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "rgba(13,17,23,0.88)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${COLORS.cardBorder}`,
          padding: "12px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Activity size={22} color={COLORS.blue} />
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 700,
                fontSize: 18,
                color: COLORS.textPrimary,
              }}
            >
              License Dashboard
            </span>
            {viewMode === "detail" && repoData && (
              <>
                <button
                  onClick={() => setViewMode("overview")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 10px",
                    borderRadius: 9999,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: COLORS.textSecondary,
                    fontSize: 11,
                    border: "1px solid rgba(255,255,255,0.1)",
                    cursor: "pointer",
                  }}
                >
                  ← All Repos
                </button>
                <a
                  href={repoData.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 9999,
                    backgroundColor: "rgba(88,166,255,0.12)",
                    color: COLORS.blue,
                    fontSize: 12,
                    textDecoration: "none",
                    border: "1px solid rgba(88,166,255,0.2)",
                  }}
                >
                  {repoData.full_name}
                  {repoData.language && (
                    <span
                      style={{
                        marginLeft: 4,
                        padding: "1px 6px",
                        borderRadius: 4,
                        backgroundColor: "rgba(188,140,255,0.15)",
                        color: COLORS.purple,
                        fontSize: 10,
                      }}
                    >
                      {repoData.language}
                    </span>
                  )}
                  <ExternalLink size={10} />
                </a>
              </>
            )}
            {viewMode === "overview" && allRepos.length > 0 && (
              <>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 9999,
                    backgroundColor: "rgba(63,185,80,0.12)",
                    color: COLORS.green,
                    fontSize: 12,
                    border: "1px solid rgba(63,185,80,0.2)",
                  }}
                >
                  {allRepos.length} Repos
                </span>
                {resolvedTokens.length > 1 && (
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 9999,
                      backgroundColor: "rgba(88,166,255,0.12)",
                      color: COLORS.blue,
                      fontSize: 11,
                      border: "1px solid rgba(88,166,255,0.2)",
                    }}
                  >
                    {resolvedTokens.map((rt) => rt.user).join(" + ")}
                  </span>
                )}
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {lastRefresh && (
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            {(repoData || allRepos.length > 0) && (
              <button
                onClick={viewMode === "detail" ? () => loadRepoDetail(repoSlug) : loadOverview}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.cardBorder}`,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  color: COLORS.textSecondary,
                  cursor: "pointer",
                  fontSize: 12,
                }}
                title="Refresh data"
              >
                <RefreshCw size={14} className={loading ? "spin" : ""} />
                Refresh
              </button>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 8,
                border: `1px solid ${COLORS.cardBorder}`,
                backgroundColor: "rgba(255,255,255,0.04)",
                color: COLORS.textSecondary,
                cursor: "pointer",
              }}
              title="Settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* Overview Mode - All Repos */}
      {viewMode === "overview" && allRepos.length > 0 && (
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px" }}>
          {/* Overview KPI Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <KpiCard
              icon={<HardDrive size={20} color={COLORS.blue} />}
              label="Total Repos"
              value={allRepos.length}
              color={COLORS.blue}
              delay={0}
            />
            <KpiCard
              icon={<Lock size={20} color={COLORS.orange} />}
              label="Private"
              value={allRepos.filter((r) => r.private).length}
              color={COLORS.orange}
              delay={50}
            />
            <KpiCard
              icon={<ExternalLink size={20} color={COLORS.green} />}
              label="Public"
              value={allRepos.filter((r) => !r.private).length}
              color={COLORS.green}
              delay={100}
            />
            <KpiCard
              icon={<Star size={20} color={COLORS.yellow} />}
              label="Total Stars"
              value={allRepos.reduce((s, r) => s + r.stargazers_count, 0)}
              color={COLORS.yellow}
              delay={150}
            />
            <KpiCard
              icon={<Zap size={20} color={COLORS.green} />}
              label="Active (<30d)"
              value={allRepos.filter((r) => {
                const d = Math.floor((now.getTime() - new Date(r.pushed_at).getTime()) / 86400000);
                return d < 30;
              }).length}
              color={COLORS.green}
              delay={200}
            />
            <KpiCard
              icon={<Clock size={20} color={COLORS.yellow} />}
              label="Moderate"
              value={allRepos.filter((r) => {
                const d = Math.floor((now.getTime() - new Date(r.pushed_at).getTime()) / 86400000);
                return d >= 30 && d < 60;
              }).length}
              color={COLORS.yellow}
              delay={250}
            />
            <KpiCard
              icon={<AlertCircle size={20} color={COLORS.red} />}
              label="Revoke Recommended"
              value={allRepos.filter((r) => {
                const d = Math.floor((now.getTime() - new Date(r.pushed_at).getTime()) / 86400000);
                return d >= 60;
              }).length}
              color={COLORS.red}
              delay={300}
            />
            {resolvedTokens.length > 1 && (
              <KpiCard
                icon={<Users size={20} color={COLORS.purple} />}
                label="Accounts"
                value={resolvedTokens.length}
                color={COLORS.purple}
                delay={350}
              />
            )}
          </div>

          {/* License Recapture Summary Banner */}
          {(() => {
            const revokeCount = allRepos.filter((r) => {
              const d = Math.floor((now.getTime() - new Date(r.pushed_at).getTime()) / 86400000);
              return d >= 60;
            }).length;
            const monitorCount = allRepos.filter((r) => {
              const d = Math.floor((now.getTime() - new Date(r.pushed_at).getTime()) / 86400000);
              return d >= 30 && d < 60;
            }).length;
            if (revokeCount === 0 && monitorCount === 0) return null;
            return (
              <GlassCard delay={50}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                  <AlertCircle size={20} color={COLORS.red} />
                  <div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: COLORS.textPrimary, marginBottom: 4 }}>
                      License Recapture Summary
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                      <span style={{ color: COLORS.red, fontWeight: 600 }}>{revokeCount} repos</span> inactive 60+ days — recommend license revoke.
                      {monitorCount > 0 && (
                        <> <span style={{ color: COLORS.yellow, fontWeight: 600 }}>{monitorCount} repos</span> approaching threshold (30-60d) — monitor closely.</>
                      )}
                      {" "}Threshold: <span style={{ color: COLORS.blue }}>60 days</span> of no push activity.
                    </div>
                  </div>
                </div>
              </GlassCard>
            );
          })()}

          {/* User License Status Panel */}
          {userLicenseStatuses.length > 0 && (
            <>
              <div style={{ height: 16 }} />
              <GlassCard delay={75}>
                <SectionHeader icon={<Users size={18} />} title="User License Status" />
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(userLicenseStatuses.length, 3)}, 1fr)`, gap: 16, marginTop: 12 }}>
                  {userLicenseStatuses.map((u) => {
                    const statusColor = u.recommendation === "Active" ? COLORS.green : u.recommendation === "Monitor" ? COLORS.yellow : COLORS.red;
                    const timerColor = u.daysUntilRevoke <= 0 ? COLORS.red : u.daysUntilRevoke <= 14 ? COLORS.yellow : COLORS.green;
                    const timerPercent = Math.min(100, Math.max(0, ((60 - u.daysSinceLastActivity) / 60) * 100));
                    const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }) : "—";
                    const fmtRepo = (r: string | null) => r ? r.split("/").pop() || r : "";

                    return (
                      <div
                        key={u.username}
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          borderRadius: 12,
                          border: `1px solid ${statusColor}33`,
                          padding: 16,
                        }}
                      >
                        {/* User header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                          <img
                            src={u.avatarUrl}
                            alt={u.username}
                            style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${statusColor}` }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: COLORS.textPrimary }}>{u.username}</div>
                            <div style={{ fontSize: 11, color: COLORS.textMuted }}>{u.totalRepos} repos</div>
                          </div>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "3px 10px",
                              borderRadius: 9999,
                              fontSize: 11,
                              fontWeight: 600,
                              backgroundColor: `${statusColor}18`,
                              color: statusColor,
                              border: `1px solid ${statusColor}44`,
                            }}
                          >
                            {u.recommendation === "Active" && <UserCheck size={12} />}
                            {u.recommendation === "Monitor" && <Clock size={12} />}
                            {u.recommendation === "Revoke License" && <AlertCircle size={12} />}
                            {u.recommendation}
                          </span>
                        </div>

                        {/* 60-day timer */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>60-Day License Timer</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: timerColor }}>
                              {u.daysUntilRevoke <= 0 ? "EXPIRED" : `${u.daysUntilRevoke}d remaining`}
                            </span>
                          </div>
                          <div style={{ width: "100%", height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.06)" }}>
                            <div
                              style={{
                                width: `${Math.max(timerPercent, 0)}%`,
                                height: "100%",
                                borderRadius: 3,
                                backgroundColor: timerColor,
                                transition: "width 0.6s ease",
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                            <span style={{ fontSize: 10, color: COLORS.textMuted }}>Last activity: {u.daysSinceLastActivity}d ago</span>
                            <span style={{ fontSize: 10, color: COLORS.textMuted }}>Threshold: 60d</span>
                          </div>
                        </div>

                        {/* Activity details */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
                          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px" }}>
                            <div style={{ color: COLORS.textMuted, marginBottom: 3, textTransform: "uppercase", fontSize: 9, letterSpacing: "0.05em" }}>Last Push</div>
                            <div style={{ color: COLORS.textPrimary, fontWeight: 600 }}>{fmtDate(u.lastPush)}</div>
                            {u.lastPushRepo && <div style={{ color: COLORS.blue, fontSize: 10, marginTop: 2 }}>{fmtRepo(u.lastPushRepo)}</div>}
                          </div>
                          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px" }}>
                            <div style={{ color: COLORS.textMuted, marginBottom: 3, textTransform: "uppercase", fontSize: 9, letterSpacing: "0.05em" }}>Last PR</div>
                            <div style={{ color: COLORS.textPrimary, fontWeight: 600 }}>{fmtDate(u.lastPR)}</div>
                            {u.lastPRRepo && <div style={{ color: COLORS.blue, fontSize: 10, marginTop: 2 }}>{fmtRepo(u.lastPRRepo)}</div>}
                          </div>
                          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px" }}>
                            <div style={{ color: COLORS.textMuted, marginBottom: 3, textTransform: "uppercase", fontSize: 9, letterSpacing: "0.05em" }}>Last Activity</div>
                            <div style={{ color: COLORS.textPrimary, fontWeight: 600 }}>{fmtDate(u.lastActivity)}</div>
                            {u.lastActivityType && <div style={{ color: COLORS.blue, fontSize: 10, marginTop: 2 }}>{u.lastActivityType}{u.lastActivityRepo ? ` \u2022 ${fmtRepo(u.lastActivityRepo)}` : ""}</div>}
                          </div>
                          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px" }}>
                            <div style={{ color: COLORS.textMuted, marginBottom: 3, textTransform: "uppercase", fontSize: 9, letterSpacing: "0.05em" }}>Repo Breakdown</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                              <span style={{ color: COLORS.green, fontWeight: 600 }}>{u.activeRepos} <span style={{ fontWeight: 400, fontSize: 9 }}>active</span></span>
                              <span style={{ color: COLORS.yellow, fontWeight: 600 }}>{u.monitorRepos} <span style={{ fontWeight: 400, fontSize: 9 }}>monitor</span></span>
                              <span style={{ color: COLORS.red, fontWeight: 600 }}>{u.revokeRepos} <span style={{ fontWeight: 400, fontSize: 9 }}>revoke</span></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            </>
          )}

          <div style={{ height: 16 }} />

          {/* Repos Table */}
          <GlassCard delay={100}>
            <SectionHeader icon={<HardDrive size={18} />} title="All Repositories" />
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: `1px solid ${COLORS.cardBorder}`,
                    }}
                  >
                    {["", "Repository", "Owner", "Language", "Stars", "Forks", "Issues", "Last Push", "Days", "Last Activity", "Type", "Recommendation"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: h === "Repository" ? "left" : "center",
                            padding: "10px 8px",
                            color: COLORS.textMuted,
                            fontWeight: 500,
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {allRepos.map((repo) => {
                    const daysSincePush = Math.floor(
                      (now.getTime() - new Date(repo.pushed_at).getTime()) / 86400000
                    );
                    const statusColor =
                      daysSincePush >= 60
                        ? COLORS.red
                        : daysSincePush >= 30
                        ? COLORS.yellow
                        : COLORS.green;
                    const evt = userEventsMap.get(repo.full_name);
                    return (
                      <tr
                        key={repo.full_name}
                        onClick={() => {
                          setRepoSlug(repo.full_name);
                          loadRepoDetail(repo.full_name);
                        }}
                        style={{
                          borderBottom: `1px solid rgba(255,255,255,0.04)`,
                          cursor: "pointer",
                          transition: "background-color 0.15s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "rgba(255,255,255,0.04)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = "transparent")
                        }
                      >
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          <StatusDot days={daysSincePush} />
                        </td>
                        <td style={{ padding: "10px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: COLORS.blue, fontWeight: 500 }}>
                              {repo.name}
                            </span>
                            {repo.private && (
                              <Lock size={10} color={COLORS.textMuted} />
                            )}
                            <ChevronRight size={12} color={COLORS.textMuted} />
                          </div>
                          {repo.description && (
                            <div
                              style={{
                                fontSize: 11,
                                color: COLORS.textMuted,
                                marginTop: 2,
                                maxWidth: 400,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {repo.description}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            fontSize: 12,
                            color: COLORS.blue,
                          }}
                        >
                          {repo._owner || repo.full_name.split("/")[0]}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          {repo.language ? (
                            <Pill text={repo.language} />
                          ) : (
                            <span style={{ color: COLORS.textMuted }}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            color: COLORS.yellow,
                          }}
                        >
                          {repo.stargazers_count > 0
                            ? repo.stargazers_count.toLocaleString()
                            : "—"}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            color: COLORS.textSecondary,
                          }}
                        >
                          {repo.forks_count > 0 ? repo.forks_count : "—"}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            color:
                              repo.open_issues_count > 0
                                ? COLORS.orange
                                : COLORS.textMuted,
                          }}
                        >
                          {repo.open_issues_count > 0
                            ? repo.open_issues_count
                            : "—"}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            color: COLORS.textSecondary,
                            fontSize: 12,
                          }}
                        >
                          {new Date(repo.pushed_at).toLocaleDateString()}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            fontWeight: 600,
                            color: statusColor,
                          }}
                        >
                          {daysSincePush}d
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            color: COLORS.textSecondary,
                            fontSize: 12,
                          }}
                        >
                          {evt
                            ? new Date(evt.date).toLocaleDateString()
                            : "—"}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            fontSize: 11,
                            color: COLORS.textMuted,
                          }}
                        >
                          {evt ? evt.type : "—"}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {daysSincePush >= 60 ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "3px 10px",
                                borderRadius: 9999,
                                backgroundColor: "rgba(248,81,73,0.12)",
                                color: COLORS.red,
                                fontSize: 11,
                                fontWeight: 600,
                                border: "1px solid rgba(248,81,73,0.25)",
                              }}
                            >
                              <AlertCircle size={10} />
                              Revoke License
                            </span>
                          ) : daysSincePush >= 30 ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "3px 10px",
                                borderRadius: 9999,
                                backgroundColor: "rgba(210,153,34,0.12)",
                                color: COLORS.yellow,
                                fontSize: 11,
                                fontWeight: 600,
                                border: "1px solid rgba(210,153,34,0.25)",
                              }}
                            >
                              <Clock size={10} />
                              Monitor
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "3px 10px",
                                borderRadius: 9999,
                                backgroundColor: "rgba(63,185,80,0.12)",
                                color: COLORS.green,
                                fontSize: 11,
                                fontWeight: 600,
                                border: "1px solid rgba(63,185,80,0.25)",
                              }}
                            >
                              <UserCheck size={10} />
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Token Health in Overview */}
          {tokenInfo && tokenInfo.rateLimit && (
            <div style={{ marginTop: 24 }}>
              <GlassCard delay={200}>
                <SectionHeader icon={<Shield size={18} />} title="Token Health" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>
                      Rate Limit
                    </div>
                    <ProgressBar
                      value={tokenInfo.rateLimit.remaining}
                      max={tokenInfo.rateLimit.limit}
                      color={
                        tokenInfo.rateLimit.remaining / tokenInfo.rateLimit.limit > 0.5
                          ? COLORS.green
                          : tokenInfo.rateLimit.remaining / tokenInfo.rateLimit.limit > 0.2
                          ? COLORS.yellow
                          : COLORS.red
                      }
                    />
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                      {tokenInfo.rateLimit.remaining.toLocaleString()} / {tokenInfo.rateLimit.limit.toLocaleString()} remaining
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>
                      Scopes
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {tokenInfo.scopes.map((s) => (
                        <Pill key={s} text={s} />
                      ))}
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          )}
        </div>
      )}

      {/* Detail Mode - Single Repo Dashboard */}
      {viewMode === "detail" && repoData && tokenInfo && (
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px" }}>
          {/* KPI Cards Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <KpiCard
              icon={<Star size={20} color={COLORS.yellow} />}
              label="Stars"
              value={repoData.stargazers_count}
              color={COLORS.yellow}
              delay={0}
            />
            <KpiCard
              icon={<GitFork size={20} color={COLORS.blue} />}
              label="Forks"
              value={repoData.forks_count}
              color={COLORS.blue}
              delay={50}
            />
            <KpiCard
              icon={<Users size={20} color={COLORS.purple} />}
              label="Contributors"
              value={contributors.length}
              color={COLORS.purple}
              delay={100}
            />
            <KpiCard
              icon={<UserCheck size={20} color={COLORS.green} />}
              label="Active"
              value={activeCount}
              color={COLORS.green}
              delay={150}
            />
            <KpiCard
              icon={<UserX size={20} color={COLORS.red} />}
              label={"Inactive 60d+"}
              value={inactiveCount}
              color={COLORS.red}
              delay={200}
            />
            <KpiCard
              icon={<AlertCircle size={20} color={COLORS.orange} />}
              label="Open Issues"
              value={repoData.open_issues_count}
              color={COLORS.orange}
              delay={250}
            />
            <KpiCard
              icon={<GitPullRequest size={20} color={COLORS.green} />}
              label="Open PRs"
              value={openPRs.length}
              color={COLORS.green}
              delay={300}
            />
          </div>

          {/* Charts Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: 16,
              marginBottom: 28,
            }}
          >
            {/* Commit Frequency Bar Chart */}
            <GlassCard delay={100}>
              <SectionHeader
                icon={<TrendingUp size={18} color={COLORS.blue} />}
                title="Commit Frequency"
              />
              {commitData.frequency.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={commitData.frequency}>
                    <XAxis
                      dataKey="day"
                      tick={{ fill: COLORS.textMuted, fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5)}
                      axisLine={{ stroke: COLORS.cardBorder }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: COLORS.textMuted, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: COLORS.surface,
                        border: `1px solid ${COLORS.cardBorder}`,
                        borderRadius: 8,
                        color: COLORS.textPrimary,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {commitData.frequency.map((_, i) => (
                        <Cell key={i} fill={COLORS.blue} fillOpacity={0.7 + (i / commitData.frequency.length) * 0.3} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textMuted }}>
                  No commit data
                </div>
              )}
            </GlassCard>

            {/* Activity Breakdown Donut */}
            <GlassCard delay={150}>
              <SectionHeader
                icon={<Users size={18} color={COLORS.purple} />}
                title="Activity Breakdown"
              />
              {activityBreakdown.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie
                        data={activityBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {activityBreakdown.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: COLORS.surface,
                          border: `1px solid ${COLORS.cardBorder}`,
                          borderRadius: 8,
                          color: COLORS.textPrimary,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
                    {activityBreakdown.map((d) => (
                      <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: COLORS.textSecondary }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: d.color, display: "inline-block" }} />
                        {d.name} ({d.value})
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ height: 170, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textMuted }}>
                  No contributors
                </div>
              )}
            </GlassCard>
          </div>

          {/* Data Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
              gap: 16,
              marginBottom: 28,
            }}
          >
            {/* Contributor Activity Table */}
            <GlassCard delay={200}>
              <SectionHeader
                icon={<Users size={18} color={COLORS.green} />}
                title="Contributor Activity"
              />
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12, display: "flex", gap: 16 }}>
                <span>Total: {contributors.length}</span>
                <span style={{ color: COLORS.green }}>Active: {activeCount}</span>
                <span style={{ color: COLORS.red }}>Inactive: {inactiveCount}</span>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${COLORS.cardBorder}` }}>
                      <th style={{ textAlign: "left", padding: "8px 4px", color: COLORS.textMuted, fontWeight: 500 }}>User</th>
                      <th style={{ textAlign: "left", padding: "8px 4px", color: COLORS.textMuted, fontWeight: 500 }}>Last Commit</th>
                      <th style={{ textAlign: "left", padding: "8px 4px", color: COLORS.textMuted, fontWeight: 500 }}>Last Activity</th>
                      <th style={{ textAlign: "left", padding: "8px 4px", color: COLORS.textMuted, fontWeight: 500 }}>Type</th>
                      <th style={{ textAlign: "right", padding: "8px 4px", color: COLORS.textMuted, fontWeight: 500 }}>Idle</th>
                      <th style={{ textAlign: "center", padding: "8px 4px", color: COLORS.textMuted, fontWeight: 500 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contributors.map((c) => {
                      // Use most recent of commit or activity for idle/status
                      const effectiveDays = c.dayssinceActivity !== null
                        ? Math.min(c.daysInactive, c.dayssinceActivity)
                        : c.daysInactive;
                      return (
                      <tr
                        key={c.login}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                          backgroundColor: effectiveDays >= 60
                            ? "rgba(248,81,73,0.04)"
                            : effectiveDays >= 30
                            ? "rgba(210,153,34,0.04)"
                            : "transparent",
                        }}
                      >
                        <td style={{ padding: "8px 4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {c.avatar_url && (
                              <img
                                src={c.avatar_url}
                                alt=""
                                style={{ width: 22, height: 22, borderRadius: "50%" }}
                              />
                            )}
                            <a
                              href={"https://github.com/" + c.login}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: COLORS.blue, textDecoration: "none" }}
                            >
                              {c.login}
                            </a>
                          </div>
                        </td>
                        <td style={{ padding: "8px 4px", color: COLORS.textSecondary }}>
                          {new Date(c.lastCommit).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "8px 4px", color: c.lastActivity ? COLORS.textPrimary : COLORS.textMuted }}>
                          {c.lastActivity
                            ? new Date(c.lastActivity).toLocaleDateString()
                            : "—"}
                        </td>
                        <td style={{ padding: "8px 4px" }}>
                          {c.lastActivityType ? (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                backgroundColor: "rgba(88,166,255,0.1)",
                                color: COLORS.blue,
                                border: "1px solid rgba(88,166,255,0.2)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c.lastActivityType}
                            </span>
                          ) : (
                            <span style={{ color: COLORS.textMuted }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "right", color: COLORS.textSecondary }}>
                          {effectiveDays}d
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                          <StatusDot days={effectiveDays} />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>

            {/* Recent Commits */}
            <GlassCard delay={250}>
              <SectionHeader
                icon={<GitCommit size={18} color={COLORS.blue} />}
                title="Recent Commits"
              />
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {commitData.commits.map((cm) => (
                  <div
                    key={cm.sha}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      alignItems: "flex-start",
                    }}
                  >
                    {cm.avatar && (
                      <img
                        src={cm.avatar}
                        alt=""
                        style={{ width: 24, height: 24, borderRadius: "50%", marginTop: 2 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: COLORS.textPrimary,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {cm.message}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: COLORS.textMuted,
                          marginTop: 4,
                          display: "flex",
                          gap: 12,
                        }}
                      >
                        <span style={{ color: COLORS.blue }}>{cm.author}</span>
                        <span>{new Date(cm.date).toLocaleDateString()}</span>
                        <code
                          style={{
                            padding: "1px 6px",
                            borderRadius: 4,
                            backgroundColor: "rgba(255,255,255,0.06)",
                            fontSize: 10,
                          }}
                        >
                          {cm.sha}
                        </code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Repo Health */}
            <GlassCard delay={300}>
              <SectionHeader
                icon={<HardDrive size={18} color={COLORS.green} />}
                title="Repo Health"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { icon: <AlertCircle size={14} color={COLORS.orange} />, label: "Open Issues", val: String(repoData.open_issues_count) },
                  { icon: <GitPullRequest size={14} color={COLORS.green} />, label: "Open PRs", val: String(openPRs.length) },
                  { icon: <Clock size={14} color={COLORS.blue} />, label: "Last Push", val: new Date(repoData.pushed_at).toLocaleDateString() },
                  { icon: <FileText size={14} color={COLORS.textSecondary} />, label: "License", val: repoData.license?.spdx_id || "None" },
                  { icon: <GitBranch size={14} color={COLORS.purple} />, label: "Default Branch", val: repoData.default_branch },
                  { icon: <HardDrive size={14} color={COLORS.textSecondary} />, label: "Size", val: (repoData.size / 1024).toFixed(1) + " MB" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      backgroundColor: "rgba(255,255,255,0.02)",
                    }}
                  >
                    {item.icon}
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase" }}>{item.label}</div>
                      <div style={{ fontSize: 13, color: COLORS.textPrimary, fontWeight: 500 }}>{item.val}</div>
                    </div>
                  </div>
                ))}
              </div>

              {repoData.topics && repoData.topics.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Topics</div>
                  <div style={{ display: "flex", flexWrap: "wrap" }}>
                    {repoData.topics.map((t) => (
                      <Pill key={t} text={t} />
                    ))}
                  </div>
                </div>
              )}

              {openPRs.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Recent Open PRs</div>
                  {openPRs.slice(0, 5).map((pr) => (
                    <div
                      key={pr.number}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                        fontSize: 12,
                      }}
                    >
                      <GitPullRequest size={12} color={COLORS.green} />
                      <span style={{ color: COLORS.textMuted }}>#{pr.number}</span>
                      <span
                        style={{
                          color: COLORS.textPrimary,
                          flex: 1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {pr.title}
                      </span>
                      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{pr.user.login}</span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>

          {/* Token Health + Locked Signals Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: 16,
              marginBottom: 28,
            }}
          >
            {/* Token Health */}
            <GlassCard delay={350}>
              <SectionHeader
                icon={<Shield size={18} color={COLORS.blue} />}
                title="Token Health"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: COLORS.textMuted }}>Type</span>
                  <span style={{ color: COLORS.textPrimary, textTransform: "capitalize" }}>{tokenInfo.tokenType}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: COLORS.textMuted }}>User</span>
                  <span style={{ color: COLORS.blue }}>{tokenInfo.user}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: COLORS.textMuted }}>Expiry</span>
                  <span
                    style={{
                      color:
                        tokenInfo.daysRemaining !== null && tokenInfo.daysRemaining <= 14
                          ? COLORS.red
                          : COLORS.textPrimary,
                    }}
                  >
                    {tokenInfo.expiry}
                    {tokenInfo.daysRemaining !== null && (" (" + tokenInfo.daysRemaining + "d)")}
                  </span>
                </div>

                {tokenInfo.scopes.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 6 }}>Scopes</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {tokenInfo.scopes.map((s) => (
                        <span
                          key={s}
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            backgroundColor: "rgba(63,185,80,0.1)",
                            color: COLORS.green,
                            border: "1px solid rgba(63,185,80,0.2)",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {tokenInfo.rateLimit && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                      <span style={{ color: COLORS.textMuted }}>Rate Limit</span>
                      <span style={{ color: COLORS.textPrimary }}>
                        {tokenInfo.rateLimit.remaining.toLocaleString()} / {tokenInfo.rateLimit.limit.toLocaleString()}
                      </span>
                    </div>
                    <ProgressBar
                      value={tokenInfo.rateLimit.remaining}
                      max={tokenInfo.rateLimit.limit}
                      color={
                        tokenInfo.rateLimit.remaining / tokenInfo.rateLimit.limit < 0.2
                          ? COLORS.red
                          : COLORS.green
                      }
                    />
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
                      Resets: {new Date(tokenInfo.rateLimit.resetUtc).toLocaleTimeString()}
                    </div>
                  </div>
                )}

                {tokenInfo.warnings.length > 0 && (
                  <div>
                    {tokenInfo.warnings.map((w, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12,
                          color: COLORS.yellow,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <AlertCircle size={12} />
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GlassCard>

            {/* Locked Signals */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Lock size={18} color={COLORS.textMuted} />
                <h2
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: 18,
                    fontWeight: 700,
                    margin: 0,
                    color: COLORS.textSecondary,
                  }}
                >
                  Locked Signals
                </h2>
                <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8 }}>
                  Requires org admin token
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 16,
                }}
              >
                <LockedCard
                  title="Copilot Seats"
                  description="Per-user IDE usage timestamps from GitHub Copilot Business/Enterprise. Shows exact last_activity_at for each assigned seat."
                  scope="manage_billing:copilot"
                  delay={400}
                />
                <LockedCard
                  title="Enterprise Members"
                  description="Full enumeration of all enterprise user accounts. Provides membership data across all orgs in the enterprise."
                  scope="read:enterprise"
                  delay={450}
                />
                <LockedCard
                  title="Audit Log"
                  description="Real authentication events -- web, SSH, API, CLI logins. Highest-trust activity signal for license recapture."
                  scope="read:audit_log"
                  delay={500}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: 16,
              padding: "16px 0",
              borderTop: `1px solid ${COLORS.cardBorder}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12,
              color: COLORS.textMuted,
            }}
          >
            <span>GitHub License Activity Dashboard</span>
            <a
              href={repoData.html_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 4, color: COLORS.blue, textDecoration: "none" }}
            >
              View on GitHub <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      {/* Empty / Welcome State */}
      {!repoData && !loading && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "80vh",
            textAlign: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              backgroundColor: "rgba(88,166,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Activity size={36} color={COLORS.blue} />
          </div>
          <h2
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 28,
              fontWeight: 700,
              color: COLORS.textPrimary,
              margin: "0 0 8px 0",
            }}
          >
            License Dashboard
          </h2>
          <p
            style={{
              fontSize: 14,
              color: COLORS.textSecondary,
              maxWidth: 420,
              lineHeight: 1.7,
              margin: "0 0 24px 0",
            }}
          >
            Analyze GitHub license usage, contributor activity, and token health.
            Click the gear icon to configure your token and repository.
          </p>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 24px",
              borderRadius: 10,
              border: "none",
              backgroundColor: COLORS.blue,
              color: "#fff",
              fontFamily: "'Syne', sans-serif",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <Settings size={16} /> Open Settings
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !repoData && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            gap: 16,
          }}
        >
          <Loader2 size={32} color={COLORS.blue} className="spin" />
          <span style={{ color: COLORS.textSecondary, fontSize: 14 }}>
            Loading dashboard data...
          </span>
        </div>
      )}
    </div>
  );
}

export default App;
