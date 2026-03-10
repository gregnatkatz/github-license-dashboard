import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Star,
  GitFork,
  Eye,
  AlertCircle,
  Lock,
  Shield,
  Clock,
  Users,
  Activity,
  Search,
  Loader2,
  ExternalLink,
  GitCommit,
  Tag,
  ChevronRight,
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

/* ─── Styles ─────────────────────────────────────────────────────────── */

const COLORS = {
  bg: "#0d1117",
  cardBg: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.08)",
  blue: "#58a6ff",
  green: "#3fb950",
  red: "#f85149",
  yellow: "#d29922",
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
  boxShadow: `0 8px 32px rgba(0,0,0,0.3)`,
};

/* ─── Utility Hooks ──────────────────────────────────────────────────── */

function useHover() {
  const [hovered, setHovered] = useState(false);
  const bind = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };
  return [hovered, bind] as const;
}

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

/* ─── API Helpers ────────────────────────────────────────────────────── */

const API = "https://api.github.com";

function headers(token: string) {
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

  const resp = await fetch(`${API}/user`, { headers: headers(token) });
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
    info.warnings.push("Fine-grained PAT — scope validation skipped");
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
        info.warnings.push(`Token expires in ${diff} day(s)!`);
      }
    } catch {
      /* ignore parse errors */
    }
  } else {
    info.expiry = "No expiry set";
    info.daysRemaining = null;
  }

  const rlResp = await fetch(`${API}/rate_limit`, { headers: headers(token) });
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
  const resp = await fetch(`${API}/repos/${repo}`, {
    headers: headers(token),
  });
  if (!resp.ok) throw new Error(`Repo fetch failed: ${resp.status}`);
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
      { headers: headers(token) }
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
    { headers: headers(token) }
  );
  if (!resp.ok) return { commits: [], frequency: [] };
  const data = await resp.json();

  const commits: CommitEntry[] = data.map(
    (c: {
      sha: string;
      commit: {
        message: string;
        author: { date: string };
      };
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

  // Frequency by day
  const freq: Record<string, number> = {};
  for (const c of commits) {
    const day = c.date.slice(0, 10);
    freq[day] = (freq[day] || 0) + 1;
  }
  const frequency = Object.entries(freq)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return { commits, frequency };
}

async function fetchOpenPRs(
  token: string,
  repo: string
): Promise<PullRequest[]> {
  const resp = await fetch(
    `${API}/repos/${repo}/pulls?state=open&per_page=10`,
    { headers: headers(token) }
  );
  if (!resp.ok) return [];
  return resp.json();
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

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
        border: `1px solid rgba(88,166,255,0.2)`,
        marginRight: 6,
        marginBottom: 4,
      }}
    >
      {text}
    </span>
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
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
        }}
      >
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

/* ─── Main App ───────────────────────────────────────────────────────── */

function App() {
  const [token, setToken] = useState("");
  const [repoSlug, setRepoSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [repoData, setRepoData] = useState<RepoData | null>(null);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [commitData, setCommitData] = useState<{
    commits: CommitEntry[];
    frequency: CommitFrequency[];
  }>({ commits: [], frequency: [] });
  const [openPRs, setOpenPRs] = useState<PullRequest[]>([]);

  const loadData = useCallback(async () => {
    if (!token || !repoSlug) return;
    setLoading(true);
    setError(null);

    try {
      const [ti, repo, contribs, cm, prs] = await Promise.all([
        fetchTokenInfo(token),
        fetchRepo(token, repoSlug),
        fetchContributors(token, repoSlug),
        fetchCommits(token, repoSlug),
        fetchOpenPRs(token, repoSlug),
      ]);

      if (!ti.valid) {
        setError("Token is invalid or revoked.");
        setLoading(false);
        return;
      }

      setTokenInfo(ti);
      setRepoData(repo);
      setContributors(contribs);
      setCommitData(cm);
      setOpenPRs(prs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [token, repoSlug]);

  const activeCount = contributors.filter((c) => !c.inactive).length;
  const inactiveCount = contributors.filter((c) => c.inactive).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: COLORS.bg,
        color: COLORS.textPrimary,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* Google Fonts */}
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Syne:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      {/* ── Input Bar ─────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "rgba(13,17,23,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${COLORS.cardBorder}`,
          padding: "16px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Activity size={20} color={COLORS.blue} />
          <span
            style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700,
              fontSize: 18,
              color: COLORS.textPrimary,
              marginRight: 16,
            }}
          >
            GitHub License Dashboard
          </span>

          <input
            type="password"
            placeholder="GitHub Token (ghp_...)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{
              flex: "1 1 200px",
              minWidth: 180,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${COLORS.cardBorder}`,
              backgroundColor: "rgba(255,255,255,0.04)",
              color: COLORS.textPrimary,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              outline: "none",
            }}
          />

          <input
            type="text"
            placeholder="owner/repo"
            value={repoSlug}
            onChange={(e) => setRepoSlug(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadData()}
            style={{
              flex: "1 1 160px",
              minWidth: 140,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${COLORS.cardBorder}`,
              backgroundColor: "rgba(255,255,255,0.04)",
              color: COLORS.textPrimary,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              outline: "none",
            }}
          />

          <button
            onClick={loadData}
            disabled={loading || !token || !repoSlug}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              backgroundColor: COLORS.blue,
              color: "#fff",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? "wait" : "pointer",
              opacity: loading || !token || !repoSlug ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            {loading ? "Loading..." : "Inspect"}
          </button>
        </div>

        {error && (
          <div
            style={{
              maxWidth: 1400,
              margin: "8px auto 0",
              padding: "8px 14px",
              borderRadius: 8,
              backgroundColor: "rgba(248,81,73,0.12)",
              border: `1px solid rgba(248,81,73,0.3)`,
              color: COLORS.red,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* ── Dashboard Content ─────────────────────────── */}
      {repoData && tokenInfo && (
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "24px 24px 48px",
          }}
        >
          {/* Header */}
          <GlassCard delay={0} className="mb-6" style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div style={{ flex: "1 1 400px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <h1
                    style={{
                      fontFamily: "'Syne', sans-serif",
                      fontSize: 28,
                      fontWeight: 800,
                      margin: 0,
                      color: COLORS.textPrimary,
                    }}
                  >
                    {repoData.full_name}
                  </h1>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      backgroundColor: repoData.private
                        ? "rgba(248,81,73,0.12)"
                        : "rgba(63,185,80,0.12)",
                      color: repoData.private ? COLORS.red : COLORS.green,
                      border: `1px solid ${repoData.private ? "rgba(248,81,73,0.3)" : "rgba(63,185,80,0.3)"}`,
                    }}
                  >
                    {repoData.private ? "Private" : "Public"}
                  </span>
                  {repoData.language && (
                    <span
                      style={{
                        fontSize: 12,
                        color: COLORS.textSecondary,
                      }}
                    >
                      {repoData.language}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: 14,
                    margin: "0 0 12px 0",
                    lineHeight: 1.5,
                  }}
                >
                  {repoData.description || "No description"}
                </p>
                {repoData.topics?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {repoData.topics.map((t) => (
                      <Pill key={t} text={t} />
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 24,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {[
                  {
                    icon: <Star size={16} color={COLORS.yellow} />,
                    label: "Stars",
                    value: repoData.stargazers_count,
                  },
                  {
                    icon: <GitFork size={16} color={COLORS.textSecondary} />,
                    label: "Forks",
                    value: repoData.forks_count,
                  },
                  {
                    icon: <Eye size={16} color={COLORS.blue} />,
                    label: "Watchers",
                    value: repoData.watchers_count,
                  },
                  {
                    icon: <AlertCircle size={16} color={COLORS.red} />,
                    label: "Issues",
                    value: repoData.open_issues_count,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {stat.icon}
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: COLORS.textPrimary,
                      }}
                    >
                      {stat.value.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Main Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
              gap: 20,
            }}
          >
            {/* ── Contributor Activity ─────────────────── */}
            <GlassCard delay={100}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <Users size={18} color={COLORS.blue} />
                <h2
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: 18,
                    fontWeight: 700,
                    margin: 0,
                  }}
                >
                  Contributor Activity
                </h2>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginBottom: 16,
                  fontSize: 13,
                }}
              >
                <span>
                  Total:{" "}
                  <strong style={{ color: COLORS.textPrimary }}>
                    {contributors.length}
                  </strong>
                </span>
                <span>
                  Active:{" "}
                  <strong style={{ color: COLORS.green }}>
                    {activeCount}
                  </strong>
                </span>
                <span>
                  Inactive:{" "}
                  <strong style={{ color: COLORS.red }}>
                    {inactiveCount}
                  </strong>
                </span>
              </div>

              <div
                style={{
                  maxHeight: 320,
                  overflowY: "auto",
                  overflowX: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: `1px solid ${COLORS.cardBorder}`,
                        fontSize: 11,
                        color: COLORS.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      <th style={{ textAlign: "left", padding: "8px 4px" }}>
                        User
                      </th>
                      <th style={{ textAlign: "left", padding: "8px 4px" }}>
                        Last Commit
                      </th>
                      <th style={{ textAlign: "right", padding: "8px 4px" }}>
                        Days
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contributors.map((c) => (
                      <tr
                        key={c.login}
                        style={{
                          borderBottom: `1px solid rgba(255,255,255,0.03)`,
                          backgroundColor:
                            c.daysInactive >= 60
                              ? "rgba(248,81,73,0.04)"
                              : c.daysInactive >= 30
                                ? "rgba(210,153,34,0.04)"
                                : "transparent",
                        }}
                      >
                        <td
                          style={{
                            padding: "8px 4px",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {c.avatar_url && (
                            <img
                              src={c.avatar_url}
                              alt=""
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                              }}
                            />
                          )}
                          <span
                            style={{
                              fontSize: 13,
                              color: COLORS.textPrimary,
                            }}
                          >
                            {c.login}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "8px 4px",
                            fontSize: 12,
                            color: COLORS.textSecondary,
                          }}
                        >
                          {c.lastCommit.slice(0, 10)}
                        </td>
                        <td
                          style={{
                            padding: "8px 4px",
                            textAlign: "right",
                          }}
                        >
                          <StatusDot days={c.daysInactive} />
                          <span
                            style={{
                              fontSize: 12,
                              color:
                                c.daysInactive >= 60
                                  ? COLORS.red
                                  : c.daysInactive >= 30
                                    ? COLORS.yellow
                                    : COLORS.green,
                            }}
                          >
                            {c.daysInactive}d
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>

            {/* ── Commit Activity ──────────────────────── */}
            <GlassCard delay={200}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <GitCommit size={18} color={COLORS.green} />
                <h2
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: 18,
                    fontWeight: 700,
                    margin: 0,
                  }}
                >
                  Commit Activity
                </h2>
              </div>

              {/* Frequency chart */}
              {commitData.frequency.length > 0 && (
                <div style={{ marginBottom: 20, height: 120 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={commitData.frequency}>
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: COLORS.textMuted }}
                        tickFormatter={(v: string) => v.slice(5)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#161b22",
                          border: `1px solid ${COLORS.cardBorder}`,
                          borderRadius: 8,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 12,
                          color: COLORS.textPrimary,
                        }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {commitData.frequency.map((_, i) => (
                          <Cell
                            key={i}
                            fill={
                              i === commitData.frequency.length - 1
                                ? COLORS.green
                                : "rgba(63,185,80,0.3)"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div
                style={{
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {commitData.commits.map((c) => (
                  <div
                    key={c.sha}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom: `1px solid rgba(255,255,255,0.03)`,
                    }}
                  >
                    {c.avatar && (
                      <img
                        src={c.avatar}
                        alt=""
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          marginTop: 2,
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: COLORS.textPrimary,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.message}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: COLORS.textMuted,
                          marginTop: 2,
                        }}
                      >
                        <span style={{ color: COLORS.textSecondary }}>
                          {c.author}
                        </span>{" "}
                        · {c.date.slice(0, 10)} ·{" "}
                        <code
                          style={{
                            color: COLORS.blue,
                            backgroundColor: "rgba(88,166,255,0.08)",
                            padding: "1px 4px",
                            borderRadius: 3,
                          }}
                        >
                          {c.sha}
                        </code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* ── Repo Health ──────────────────────────── */}
            <GlassCard delay={300}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <Activity size={18} color={COLORS.blue} />
                <h2
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: 18,
                    fontWeight: 700,
                    margin: 0,
                  }}
                >
                  Repo Health
                </h2>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px 24px",
                }}
              >
                {[
                  {
                    label: "Open Issues",
                    value: repoData.open_issues_count.toString(),
                    icon: <AlertCircle size={14} color={COLORS.red} />,
                  },
                  {
                    label: "Open PRs",
                    value: openPRs.length.toString(),
                    icon: <GitCommit size={14} color={COLORS.green} />,
                  },
                  {
                    label: "Last Push",
                    value: repoData.pushed_at?.slice(0, 10) || "N/A",
                    icon: <Clock size={14} color={COLORS.yellow} />,
                  },
                  {
                    label: "License",
                    value: repoData.license?.spdx_id || "None",
                    icon: <Shield size={14} color={COLORS.textSecondary} />,
                  },
                  {
                    label: "Default Branch",
                    value: repoData.default_branch,
                    icon: <GitFork size={14} color={COLORS.textSecondary} />,
                  },
                  {
                    label: "Size",
                    value:
                      repoData.size >= 1024
                        ? `${(repoData.size / 1024).toFixed(1)} MB`
                        : `${repoData.size} KB`,
                    icon: <Tag size={14} color={COLORS.textSecondary} />,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 0",
                    }}
                  >
                    {item.icon}
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: COLORS.textMuted,
                          marginBottom: 2,
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          color: COLORS.textPrimary,
                          fontWeight: 500,
                        }}
                      >
                        {item.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Open PRs list */}
              {openPRs.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLORS.textMuted,
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Recent Open PRs
                  </div>
                  {openPRs.slice(0, 5).map((pr) => (
                    <div
                      key={pr.number}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 0",
                        borderBottom: `1px solid rgba(255,255,255,0.03)`,
                        fontSize: 12,
                      }}
                    >
                      <ChevronRight size={12} color={COLORS.green} />
                      <span style={{ color: COLORS.textSecondary }}>
                        #{pr.number}
                      </span>
                      <span
                        style={{
                          color: COLORS.textPrimary,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          flex: 1,
                        }}
                      >
                        {pr.title}
                      </span>
                      <span style={{ color: COLORS.textMuted }}>
                        {pr.user.login}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* ── Token Inspector ──────────────────────── */}
            <GlassCard delay={400}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <Shield size={18} color={COLORS.yellow} />
                <h2
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: 18,
                    fontWeight: 700,
                    margin: 0,
                  }}
                >
                  Token Inspector
                </h2>
              </div>

              {tokenInfo.daysRemaining !== null &&
                tokenInfo.daysRemaining <= 14 && (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      backgroundColor: "rgba(248,81,73,0.12)",
                      border: `1px solid rgba(248,81,73,0.3)`,
                      color: COLORS.red,
                      fontSize: 12,
                      marginBottom: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <AlertCircle size={14} />
                    Token expires in {tokenInfo.daysRemaining} day(s) — rotate
                    soon!
                  </div>
                )}

              <div
                style={{
                  display: "grid",
                  gap: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.textMuted,
                      marginBottom: 4,
                    }}
                  >
                    Authenticated As
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: COLORS.textPrimary,
                      fontWeight: 600,
                    }}
                  >
                    {tokenInfo.user}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: COLORS.textMuted,
                        marginBottom: 4,
                      }}
                    >
                      Token Type
                    </div>
                    <div style={{ fontSize: 13, color: COLORS.textPrimary }}>
                      {tokenInfo.tokenType}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: COLORS.textMuted,
                        marginBottom: 4,
                      }}
                    >
                      Expiry
                    </div>
                    <div style={{ fontSize: 13, color: COLORS.textPrimary }}>
                      {tokenInfo.expiry}
                      {tokenInfo.daysRemaining !== null && (
                        <span
                          style={{
                            marginLeft: 8,
                            color:
                              tokenInfo.daysRemaining <= 14
                                ? COLORS.red
                                : COLORS.green,
                            fontSize: 12,
                          }}
                        >
                          ({tokenInfo.daysRemaining}d left)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Scopes */}
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.textMuted,
                      marginBottom: 6,
                    }}
                  >
                    Scopes
                  </div>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
                  >
                    {tokenInfo.scopes.length > 0
                      ? tokenInfo.scopes.map((s) => <Pill key={s} text={s} />)
                      : (
                          <span
                            style={{
                              fontSize: 12,
                              color: COLORS.textSecondary,
                            }}
                          >
                            {tokenInfo.tokenType === "fine-grained"
                              ? "Not exposed (fine-grained PAT)"
                              : "No scopes"}
                          </span>
                        )}
                  </div>
                </div>

                {/* Rate Limit */}
                {tokenInfo.rateLimit && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: COLORS.textMuted,
                        marginBottom: 6,
                      }}
                    >
                      Rate Limit
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 13, color: COLORS.textPrimary }}>
                        {tokenInfo.rateLimit.remaining.toLocaleString()} /{" "}
                        {tokenInfo.rateLimit.limit.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                        (
                        {(
                          (tokenInfo.rateLimit.remaining /
                            tokenInfo.rateLimit.limit) *
                          100
                        ).toFixed(0)}
                        % remaining)
                      </span>
                    </div>
                    <ProgressBar
                      value={tokenInfo.rateLimit.remaining}
                      max={tokenInfo.rateLimit.limit}
                      color={
                        tokenInfo.rateLimit.remaining /
                          tokenInfo.rateLimit.limit <
                        0.2
                          ? COLORS.red
                          : COLORS.green
                      }
                    />
                    <div
                      style={{
                        fontSize: 11,
                        color: COLORS.textMuted,
                        marginTop: 4,
                      }}
                    >
                      Resets:{" "}
                      {new Date(tokenInfo.rateLimit.resetUtc).toLocaleTimeString()}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {tokenInfo.warnings.length > 0 && (
                  <div style={{ marginTop: 4 }}>
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
          </div>

          {/* ── What's Locked ──────────────────────────── */}
          <div style={{ marginTop: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Lock size={18} color={COLORS.textMuted} />
              <h2
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                  margin: 0,
                  color: COLORS.textSecondary,
                }}
              >
                Locked Signals
              </h2>
              <span
                style={{
                  fontSize: 12,
                  color: COLORS.textMuted,
                  marginLeft: 8,
                }}
              >
                Requires org admin token to unlock
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 16,
              }}
            >
              <LockedCard
                title="Copilot Seats"
                description="Per-user IDE usage timestamps from GitHub Copilot Business/Enterprise. Shows exact last_activity_at for each assigned seat."
                scope="manage_billing:copilot"
                delay={500}
              />
              <LockedCard
                title="Enterprise Members"
                description="Full enumeration of all enterprise user accounts. Provides membership data across all orgs in the enterprise."
                scope="read:enterprise"
                delay={600}
              />
              <LockedCard
                title="Audit Log"
                description="Real authentication events — web, SSH, API, CLI logins. Highest-trust activity signal for license recapture decisions."
                scope="read:audit_log"
                delay={700}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: 40,
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
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: COLORS.blue,
                textDecoration: "none",
              }}
            >
              View on GitHub <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!repoData && !loading && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            textAlign: "center",
            padding: 24,
          }}
        >
          <Activity
            size={48}
            color={COLORS.textMuted}
            style={{ marginBottom: 16 }}
          />
          <h2
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              color: COLORS.textSecondary,
              margin: "0 0 8px 0",
            }}
          >
            GitHub License Dashboard
          </h2>
          <p
            style={{
              fontSize: 14,
              color: COLORS.textMuted,
              maxWidth: 400,
              lineHeight: 1.6,
            }}
          >
            Enter your GitHub token and a repository slug above to inspect
            license usage, contributor activity, and token health in real time.
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
