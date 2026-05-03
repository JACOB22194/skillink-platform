import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../shared/useAuth";
import { useProfile, useGitHubProfile } from "../api/hooks";
import type { FreelancerProfile } from "../api/types";
import { Skeleton, SkeletonCard, SkeletonMetric } from "../components/ui/Skeleton";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { API_BASE_URL, getAuthHeaders } from "../shared/api";
import UpgradeNowSection from "../components/UpgradeNowSection";

// ─── Theme ────────────────────────────────────────────────────────────────────

interface ThemeColors {
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string;
}

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE" };

// ─── Sub-components ───────────────────────────────────────────────────────────

const NavItem: React.FC<{ label: string; active?: boolean; badge?: number | string; icon: React.ReactNode; colors: ThemeColors; onClick?: () => void }> =
  ({ label, active, badge, icon, colors, onClick }) => (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 16px", color: active ? colors.primary : colors.subtext, borderLeft: `2px solid ${active ? colors.primary : "transparent"}`, background: active ? colors.bg : "transparent", cursor: "pointer", fontSize: 12 }}>
      {icon}
      {label}
      {badge !== undefined && <span style={{ marginLeft: "auto", background: colors.primary, color: "#fff", fontSize: 9, padding: "1px 5px", borderRadius: 20 }}>{badge}</span>}
    </div>
  );

const MetricCard: React.FC<{ label: string; value: React.ReactNode; sub: string; badge?: React.ReactNode; colors: ThemeColors }> =
  ({ label, value, sub, badge, colors }) => (
    <div style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 10, color: colors.subtext, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500, color: colors.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.subtext, marginTop: 5 }}>{sub}</div>
      {badge}
    </div>
  );

const Badge: React.FC<{ children: React.ReactNode; bg: string; color: string; border: string }> =
  ({ children, bg, color, border }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 8px", borderRadius: 100, marginTop: 6, background: bg, color, border: `0.5px solid ${border}` }}>
      {children}
    </span>
  );

const EmptyState: React.FC<{ label: string; hint: string; c: ThemeColors }> = ({ label, hint, c }) => (
  <div style={{ padding: "28px 16px", textAlign: "center" }}>
    <div style={{ fontSize: 13, fontWeight: 500, color: c.subtext, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 12, color: c.subtext, opacity: .6 }}>{hint}</div>
  </div>
);

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconGrid = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const IconUser = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconMsg  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
const IconBulb = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>;
const IconShield = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>;
const IconTeam = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>;
const IconSettings = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
const IconDoc = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;

// ─── Notification Bell ────────────────────────────────────────────────────────

interface AppNotif {
  notification_id: number;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const NotificationBell: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const [open, setOpen]   = React.useState(false);
  const [notifs, setNotifs] = React.useState<AppNotif[]>([]);
  const [unread, setUnread] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  const fetchCount = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/unread-count`, getAuthHeaders());
      if (res.ok) { const d = await res.json(); setUnread(d.count ?? 0); }
    } catch {}
  };

  const fetchNotifs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications?limit=15`, getAuthHeaders());
      if (res.ok) setNotifs(await res.json());
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await fetch(`${API_BASE_URL}/notifications/read-all`, { method: "PATCH", ...(getAuthHeaders() as object) });
      setUnread(0);
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (open) { fetchNotifs(); markAllRead(); }
  }, [open]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{ width: 32, height: 32, borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: unread > 0 ? c.primary : c.subtext }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 100, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: `1.5px solid ${c.surface}` }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </div>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 38, width: 300, background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, zIndex: 300, boxShadow: "0 8px 30px rgba(0,0,0,.2)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `0.5px solid ${c.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Notifications</span>
            <span onClick={markAllRead} style={{ fontSize: 11, color: c.primary, cursor: "pointer" }}>Mark all read</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {notifs.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: c.subtext, fontSize: 12 }}>No notifications yet</div>
            ) : notifs.map(n => (
              <div key={n.notification_id} style={{ display: "flex", gap: 10, padding: "10px 14px", borderBottom: `0.5px solid ${c.border}`, background: n.is_read ? "transparent" : c.primarySoft + "60" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: c.text, lineHeight: 1.4 }}>{n.message}</div>
                  <div style={{ fontSize: 10, color: c.subtext, marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                </div>
                {!n.is_read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.primary, flexShrink: 0, marginTop: 4 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchedProject {
  project_id:     number;
  title:          string;
  description:    string;
  budget:         number;
  match_score:    number;
  matched_skills: string[];
  text_score:     number;
  skill_score:    number;
  quality_score:  number;
}

// ─── Project Match View ───────────────────────────────────────────────────────

const MATCH_PALETTE = [
  { bg: "#2a2640", color: "#7F77DD" },
  { bg: "rgba(34,197,94,.12)", color: "#22c55e" },
  { bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
  { bg: "rgba(245,158,11,.1)", color: "#f59e0b" },
  { bg: "rgba(239,68,68,.1)", color: "#ef4444" },
];

const ProjectMatchView: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState(0);
  const [ran, setRan] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/recommend/my-matches?top_k=10`, getAuthHeaders());
        if (res.ok) {
          const data = await res.json();
          setMatches(data.matches || []);
          setLatency(data.latency_ms || 0);
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.detail || "Failed to load matches.");
        }
      } catch {
        setError("Could not reach the recommendation service.");
      } finally {
        setLoading(false);
        setRan(true);
      }
    })();
  }, []);

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>AI Matches</div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Open projects matched to your profile by TF-IDF · skill overlap · GitHub quality.</div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: c.subtext }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Loading your matches...</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Querying cached recommendations</div>
        </div>
      )}

      {!loading && error && (
        <div style={{ background: "rgba(239,68,68,.08)", color: "#ef4444", padding: "12px 16px", borderRadius: 10, fontSize: 13, border: "1px solid rgba(239,68,68,.15)" }}>⚠ {error}</div>
      )}

      {!loading && !error && ran && matches.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: c.subtext }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: c.text, marginBottom: 8 }}>No matches yet</div>
          <div style={{ fontSize: 13, maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>
            Matches appear here once clients run AI scoring for their projects. Make sure your GitHub profile is connected and your skills are up to date.
          </div>
        </div>
      )}

      {!loading && matches.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: c.subtext, marginBottom: 12 }}>
            Found <strong style={{ color: c.text }}>{matches.length}</strong> matching project{matches.length !== 1 ? "s" : ""} in <strong style={{ color: c.primary }}>{latency.toFixed(0)}ms</strong>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {matches.map((p, i) => {
              const pal = MATCH_PALETTE[i % MATCH_PALETTE.length];
              const pct = Math.round(p.match_score * 100);
              return (
                <div key={p.project_id} style={{ display: "flex", alignItems: "flex-start", padding: 16, border: `0.5px solid ${i === 0 ? c.primary + "40" : c.border}`, borderRadius: 12, background: i === 0 ? c.primarySoft + "20" : c.surface }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: pal.bg, color: pal.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, marginRight: 14 }}>📋</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{p.title}</span>
                      {i === 0 && <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 20, background: c.primary, color: "#fff", fontWeight: 600 }}>BEST FIT</span>}
                    </div>
                    <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5 }}>
                      Budget: <strong style={{ color: c.text }}>${p.budget.toLocaleString()}</strong>
                    </div>
                    {expandedId === p.project_id ? (
                      <>
                        <div style={{ fontSize: 11, color: c.subtext, lineHeight: 1.5, marginBottom: 10 }}>{p.description}</div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Score Breakdown</div>
                          {[
                            { label: "Text Relevance", val: p.text_score },
                            { label: "Skill Match",    val: p.skill_score },
                            { label: "GitHub Quality", val: p.quality_score },
                          ].map(({ label, val }) => (
                            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                              <div style={{ fontSize: 10, color: c.subtext, width: 100, flexShrink: 0 }}>{label}</div>
                              <div style={{ flex: 1, height: 4, background: c.border, borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${Math.round(val * 100)}%`, height: "100%", background: c.primary, borderRadius: 4 }} />
                              </div>
                              <div style={{ fontSize: 10, color: c.primary, width: 28, textAlign: "right" }}>{Math.round(val * 100)}%</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: c.subtext, lineHeight: 1.5, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{p.description}</div>
                    )}
                    {p.matched_skills.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                        {p.matched_skills.map(s => (
                          <span key={s} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: c.primarySoft, color: c.primary, fontWeight: 500 }}>{s}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                      <button
                        onClick={() => navigate(`/proposals?apply=${p.project_id}`)}
                        style={{ fontSize: 11, padding: "5px 14px", borderRadius: 8, background: c.primary, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}
                      >Apply →</button>
                      <button
                        onClick={() => setExpandedId(expandedId === p.project_id ? null : p.project_id)}
                        style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, background: "transparent", color: c.subtext, border: `0.5px solid ${c.border}`, cursor: "pointer", fontFamily: "inherit" }}
                      >{expandedId === p.project_id ? "Show less" : "View details"}</button>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: pct >= 50 ? c.primary : c.subtext, lineHeight: 1 }}>{pct}%</div>
                    <div style={{ fontSize: 9, color: c.subtext, marginTop: 3 }}>match</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Metric Skeletons ─────────────────────────────────────────────────────────

const MetricSkeletons: React.FC<{ dark: boolean }> = ({ dark }) => (
  <>
    {[0, 1, 2, 3].map((i) => <SkeletonMetric key={i} dark={dark} />)}
  </>
);

// ─── Profile Panel ────────────────────────────────────────────────────────────

const AvatarCircle: React.FC<{ src: string; initials: string; size: number; primary: string; surface: string }> = ({ src, initials, size, primary, surface }) => {
  const [err, setErr] = React.useState(false);
  if (src && !err) {
    return <img src={src} alt="avatar" onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `2px solid ${surface}`, display: "block", margin: "0 auto 8px" }} />;
  }
  return <div style={{ width: size, height: size, borderRadius: "50%", background: primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 600, margin: "0 auto 8px" }}>{initials}</div>;
};

const ProfilePanel: React.FC<{
  profile: FreelancerProfile | null; ghProfile: any; loading: boolean; ghLoading: boolean;
  initials: string; displayName: string; c: ThemeColors; dark: boolean;
}> = ({ profile, ghProfile, loading, ghLoading, initials, displayName, c, dark }) => (
  <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: `0.5px solid ${c.border}`, marginBottom: 16 }}>
    <AvatarCircle
      src={ghProfile?.avatar_url ?? ghProfile?.github_stats?.avatar_url ?? ""}
      initials={initials}
      size={44}
      primary={c.primary}
      surface={c.surface}
    />
    <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>{ghProfile?.name || displayName}</div>
    {(loading || ghLoading)
      ? <Skeleton width={100} height={11} dark={dark} style={{ margin: "6px auto 8px" }} />
      : <div style={{ fontSize: 11, color: c.subtext, marginTop: 2, marginBottom: 6 }}>{ghProfile?.professional_title || (profile?.bio ? profile.bio.slice(0, 36) + (profile.bio.length > 36 ? "…" : "") : "Freelancer")}</div>
    }
    <Badge bg={c.primarySoft} color={c.primary} border="rgba(127,119,221,.2)">✓ AI Gate Verified</Badge>

    {/* Stats */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 12 }}>
      {loading || ghLoading
        ? [0, 1, 2].map((i) => (
            <div key={i} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 4px" }}>
              <Skeleton width={36} height={16} dark={dark} style={{ margin: "0 auto 4px" }} />
              <Skeleton width={28} height={9} dark={dark} style={{ margin: "0 auto" }} />
            </div>
          ))
        : [
            { val: ghProfile?.github_score ? `${ghProfile.github_score}` : profile?.success_score?.toFixed(0) ?? "—", label: "GH SCORE", color: c.primary },
            { val: profile?.hourly_rate ? `$${profile.hourly_rate}` : "—", label: "RATE",   color: "#22c55e" },
            { val: profile?.wallet_balance != null ? `$${profile.wallet_balance.toFixed(0)}` : "—", label: "WALLET", color: c.text },
          ].map((s) => (
            <div key={s.label} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 9, color: c.subtext }}>{s.label}</div>
            </div>
          ))
      }
    </div>

    {/* GitHub mini stats */}
    {ghProfile?.github_stats && (
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, textAlign: "left" }}>
        {[
          { label: "⭐ Stars",   val: ghProfile.github_stats.total_stars ?? 0 },
          { label: "📦 Repos",  val: ghProfile.github_stats.public_repos ?? 0 },
          { label: "👥 Followers", val: ghProfile.github_stats.followers ?? 0 },
          { label: "🔧 Skills", val: profile?.skills?.length ?? 0 },
        ].map(({ label, val }) => (
          <div key={label} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 7, padding: "6px 8px" }}>
            <div style={{ fontSize: 11, color: c.subtext }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{val}</div>
          </div>
        ))}
      </div>
    )}

    {/* Profile completion bar */}
    {!loading && !ghLoading && (() => {
      const items = [!!profile?.bio, (profile?.skills?.length ?? 0) > 0, !!ghProfile?.github_score, !!profile?.hourly_rate];
      const done = items.filter(Boolean).length;
      const pct  = Math.round((done / items.length) * 100);
      return (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.subtext, marginBottom: 5 }}>
            <span>Profile complete</span>
            <span style={{ color: pct === 100 ? "#22c55e" : c.primary, fontWeight: 600 }}>{pct}%</span>
          </div>
          <div style={{ height: 4, background: c.border, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#22c55e" : c.primary, borderRadius: 4, transition: "width .5s ease" }} />
          </div>
          {pct < 100 && (
            <div style={{ fontSize: 10, color: c.subtext, marginTop: 5, opacity: .8 }}>
              {[!profile?.bio && "Add bio", !(profile?.skills?.length) && "Add skills", !ghProfile?.github_score && "Connect GitHub", !profile?.hourly_rate && "Set rate"].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      );
    })()}

    {/* Update GitHub shortcut */}
    <a href="/github/review"
      style={{ display: "block", marginTop: 12, textAlign: "center", fontSize: 11, padding: "7px 0", borderRadius: 8, border: `0.5px solid ${c.border}`, color: c.subtext, textDecoration: "none", transition: "all .2s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = c.primary; (e.currentTarget as HTMLElement).style.borderColor = c.primary; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = c.subtext; (e.currentTarget as HTMLElement).style.borderColor = c.border; }}
    >🐙 Update GitHub</a>
  </div>
);

// ─── Skills Section ───────────────────────────────────────────────────────────

const SkillsSection: React.FC<{ skills: string[]; c: ThemeColors }> = ({ skills, c }) => {
  if (skills.length === 0) return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 6 }}>Skills</div>
      <div style={{ fontSize: 11, color: c.subtext, lineHeight: 1.6 }}>
        No skills yet.{" "}
        <a href="/settings" style={{ color: c.primary, textDecoration: "none" }}>Add skills to get matched →</a>
      </div>
    </div>
  );
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 8 }}>Skills</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {skills.slice(0, 10).map((s) => (
          <span key={s} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 100, background: c.primarySoft, color: c.primary, border: `0.5px solid rgba(127,119,221,.3)` }}>{s}</span>
        ))}
        {skills.length > 10 && <span style={{ fontSize: 10, color: c.subtext }}>+{skills.length - 10} more</span>}
      </div>
    </div>
  );
};

// ─── Verification View ────────────────────────────────────────────────────────

type VerifStatus = "not_submitted" | "pending" | "approved" | "rejected";

interface VerifState {
  status: VerifStatus;
  document_type: string | null;
  rejection_note: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

const DOC_TYPES = [
  { value: "national_id",       label: "🪪 National ID" },
  { value: "passport",          label: "🛂 Passport" },
  { value: "drivers_license",   label: "🚗 Driver's License" },
  { value: "residence_permit",  label: "🏠 Residence Permit" },
  { value: "other",             label: "📄 Other" },
];

const VerificationView: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const [verifState, setVerifState]   = useState<VerifState | null>(null);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [cancelling, setCancelling]   = useState(false);
  const [docType, setDocType]         = useState("national_id");
  const [file, setFile]               = useState<File | null>(null);
  const [feedback, setFeedback]       = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/verification/status`, getAuthHeaders());
      const data = await res.json();
      setVerifState(data);
    } catch {
      setFeedback({ ok: false, msg: "Could not load verification status." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (!file) { setFeedback({ ok: false, msg: "Please select a document file." }); return; }
    setSubmitting(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append("document_type", docType);
      form.append("file", file);
      const headers = getAuthHeaders() as RequestInit;
      // Remove Content-Type so browser sets multipart boundary
      const res = await fetch(`${API_BASE_URL}/verification/submit`, {
        method: "POST",
        headers: { Authorization: (headers.headers as Record<string, string>)["Authorization"] },
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ ok: true, msg: data.message });
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        load();
      } else {
        setFeedback({ ok: false, msg: data.detail || "Submission failed." });
      }
    } catch {
      setFeedback({ ok: false, msg: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel your pending verification?")) return;
    setCancelling(true);
    setFeedback(null);
    try {
      const headers = getAuthHeaders() as RequestInit;
      const res = await fetch(`${API_BASE_URL}/verification/cancel`, {
        method: "DELETE",
        headers: headers.headers as Record<string, string>,
      });
      const data = await res.json();
      if (res.ok) { setFeedback({ ok: true, msg: data.message }); load(); }
      else setFeedback({ ok: false, msg: data.detail || "Could not cancel." });
    } catch {
      setFeedback({ ok: false, msg: "Network error." });
    } finally {
      setCancelling(false);
    }
  };

  const statusInfo: Record<VerifStatus, { icon: string; label: string; color: string; bg: string }> = {
    not_submitted: { icon: "○", label: "Not Submitted",  color: c.subtext,   bg: "transparent" },
    pending:       { icon: "⏳", label: "Under Review",  color: "#f59e0b",   bg: "rgba(245,158,11,.1)" },
    approved:      { icon: "✓",  label: "Verified",      color: "#22c55e",   bg: "rgba(34,197,94,.1)" },
    rejected:      { icon: "✕",  label: "Rejected",      color: "#ef4444",   bg: "rgba(239,68,68,.1)" },
  };

  const status = verifState?.status ?? "not_submitted";
  const si     = statusInfo[status];

  return (
    <div style={{ animation: "fadeIn 0.5s ease", maxWidth: 600 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Identity Verification</div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Verify your identity to unlock the Verified badge and build trust with clients.</div>
      </div>

      {/* Status card */}
      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Current Status</div>
        {loading ? (
          <div style={{ height: 24, background: c.border, borderRadius: 6, width: 140, animation: "pulse 1.5s infinite" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 100, background: si.bg, color: si.color, border: `0.5px solid ${si.color}33` }}>
              {si.icon} {si.label}
            </span>
            {verifState?.document_type && (
              <span style={{ fontSize: 11, color: c.subtext }}>
                · {DOC_TYPES.find(d => d.value === verifState.document_type)?.label ?? verifState.document_type}
              </span>
            )}
            {verifState?.created_at && (
              <span style={{ fontSize: 11, color: c.subtext, marginLeft: "auto" }}>
                Submitted {new Date(verifState.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {/* Rejection note */}
        {status === "rejected" && verifState?.rejection_note && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(239,68,68,.08)", border: "0.5px solid rgba(239,68,68,.2)", borderRadius: 8, fontSize: 12, color: "#ef4444" }}>
            <strong>Reason:</strong> {verifState.rejection_note}
          </div>
        )}

        {/* Approved info */}
        {status === "approved" && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(34,197,94,.08)", border: "0.5px solid rgba(34,197,94,.2)", borderRadius: 8, fontSize: 12, color: "#22c55e" }}>
            ✓ Your identity has been verified. The <strong>✓ AI Gate Verified</strong> badge is now active on your profile.
          </div>
        )}

        {/* Pending cancel */}
        {status === "pending" && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: c.subtext }}>Your document is being reviewed by our team. This usually takes 1–2 business days.</span>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={{ marginLeft: 16, flexShrink: 0, fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "0.5px solid rgba(239,68,68,.4)", background: "transparent", color: "#ef4444", cursor: "pointer" }}
            >{cancelling ? "Cancelling…" : "Cancel"}</button>
          </div>
        )}
      </div>

      {/* Upload form — show if not submitted or rejected */}
      {(status === "not_submitted" || status === "rejected") && (
        <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 16 }}>
            {status === "rejected" ? "Resubmit Document" : "Submit Document"}
          </div>

          {/* Document type picker */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: c.subtext, display: "block", marginBottom: 6 }}>Document Type</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
            >
              {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          {/* File picker */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, color: c.subtext, display: "block", marginBottom: 6 }}>Document File <span style={{ opacity: .6 }}>(PDF, JPEG, PNG, Word · max 10 MB)</span></label>
            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: `1.5px dashed ${file ? c.primary : c.border}`, borderRadius: 10, padding: "20px 16px", textAlign: "center", cursor: "pointer", transition: "border-color .2s", background: file ? c.primarySoft : "transparent" }}
            >
              {file ? (
                <div>
                  <div style={{ fontSize: 13, color: c.primary, fontWeight: 500 }}>📎 {file.name}</div>
                  <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB · Click to change</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: c.subtext }}>Click to select file</div>
                  <div style={{ fontSize: 11, color: c.subtext, opacity: .6, marginTop: 4 }}>or drag and drop</div>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              style={{ display: "none" }}
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Feedback */}
          {feedback && (
            <div style={{ marginBottom: 14, padding: "9px 14px", borderRadius: 8, fontSize: 12, background: feedback.ok ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: `0.5px solid ${feedback.ok ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`, color: feedback.ok ? "#22c55e" : "#ef4444" }}>
              {feedback.msg}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !file}
            style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "none", background: submitting || !file ? c.border : c.primary, color: submitting || !file ? c.subtext : "#fff", fontSize: 13, fontWeight: 600, cursor: submitting || !file ? "not-allowed" : "pointer", transition: "background .2s", fontFamily: "inherit" }}
          >
            {submitting ? "Uploading…" : status === "rejected" ? "Resubmit for Review" : "Submit for Review"}
          </button>

          <div style={{ marginTop: 12, fontSize: 11, color: c.subtext, lineHeight: 1.6, opacity: .8 }}>
            Your document is reviewed by our team and never shared publicly. We verify identity only — no financial data is stored.
          </div>
        </div>
      )}

      {/* Feedback outside form (cancel feedback) */}
      {feedback && (status === "pending" || status === "approved") && (
        <div style={{ marginTop: 12, padding: "9px 14px", borderRadius: 8, fontSize: 12, background: feedback.ok ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: `0.5px solid ${feedback.ok ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`, color: feedback.ok ? "#22c55e" : "#ef4444" }}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
};

// ─── Workrooms View ───────────────────────────────────────────────────────────

interface WorkMilestone {
  milestone_id: number;
  title:        string | null;
  amount:       number;
  status:       string;
  due_date:     string | null;
}

interface WorkContract {
  contract_id:   number;
  status:        string;
  created_at:    string;
  project?: {
    project_id:  number;
    title:       string;
    description: string;
    budget:      number;
    status:      string;
  };
  milestones?: WorkMilestone[];
}

const contractStatusColor: Record<string, { color: string; bg: string }> = {
  active:    { color: "#22c55e",  bg: "rgba(34,197,94,.1)" },
  completed: { color: "#7F77DD", bg: "rgba(127,119,221,.12)" },
  disputed:  { color: "#ef4444", bg: "rgba(239,68,68,.1)" },
};

const milestoneStatusColor: Record<string, { color: string; bg: string }> = {
  pending:  { color: "#f59e0b",  bg: "rgba(245,158,11,.1)" },
  approved: { color: "#22c55e",  bg: "rgba(34,197,94,.1)" },
  paid:     { color: "#7F77DD", bg: "rgba(127,119,221,.12)" },
};

const WorkroomsView: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const [contracts, setContracts] = useState<WorkContract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [filter, setFilter]       = useState<"all" | "active" | "completed">("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/contracts/my`, getAuthHeaders());
        if (res.ok) {
          const data: WorkContract[] = await res.json();
          setContracts(data);
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.detail || "Failed to load workrooms.");
        }
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id: number) => setExpanded(prev => prev === id ? null : id);

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Workrooms</div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Your active and completed contracts with clients.</div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["all", "active", "completed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 11, padding: "5px 14px", borderRadius: 20, border: `0.5px solid ${filter === f ? c.primary : c.border}`, background: filter === f ? c.primarySoft : "transparent", color: filter === f ? c.primary : c.subtext, cursor: "pointer", fontFamily: "inherit", fontWeight: filter === f ? 600 : 400 }}
          >{f.charAt(0).toUpperCase() + f.slice(1)}{f !== "all" && ` (${contracts.filter(ct => ct.status === f).length})`}</button>
        ))}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 72, background: c.surface, borderRadius: 12, border: `0.5px solid ${c.border}`, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "#ef4444", fontSize: 13 }}>{error}</div>
      )}

      {!loading && !error && contracts.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", color: c.subtext }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>🏗️</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>No workrooms yet</div>
          <div style={{ fontSize: 12, color: c.subtext, maxWidth: 280, textAlign: "center", lineHeight: 1.6 }}>
            Workrooms appear here once a client accepts your proposal and a contract is created.
          </div>
        </div>
      )}

      {!loading && !error && contracts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contracts.filter(ct => filter === "all" || ct.status === filter).map(ct => {
            const cs   = contractStatusColor[ct.status] ?? { color: c.subtext, bg: "transparent" };
            const isEx = expanded === ct.contract_id;
            const msList = ct.milestones ?? [];
            const paid = msList.filter((m: { status: string }) => m.status === "paid").length;
            const total = msList.length;
            const pct  = total > 0 ? Math.round((paid / total) * 100) : 0;

            return (
              <div key={ct.contract_id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
                {/* Contract header row */}
                <div
                  onClick={() => toggle(ct.contract_id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
                >
                  {/* Project title + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ct.project?.title ?? `Contract #${ct.contract_id}`}
                    </div>
                    <div style={{ fontSize: 11, color: c.subtext }}>
                      Started {new Date(ct.created_at).toLocaleDateString()} · ${ct.project?.budget?.toLocaleString() ?? "—"} budget
                    </div>
                  </div>

                  {/* Progress */}
                  {total > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 80 }}>
                      <div style={{ fontSize: 10, color: c.subtext }}>{paid}/{total} milestones paid</div>
                      <div style={{ width: 80, height: 4, background: c.border, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#22c55e" : c.primary, borderRadius: 4, transition: "width .4s" }} />
                      </div>
                    </div>
                  )}

                  {/* Status badge */}
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 100, background: cs.bg, color: cs.color, border: `0.5px solid ${cs.color}33`, flexShrink: 0 }}>
                    {ct.status.charAt(0).toUpperCase() + ct.status.slice(1)}
                  </span>

                  {/* Chevron */}
                  <span style={{ color: c.subtext, fontSize: 11, flexShrink: 0, transition: "transform .2s", transform: isEx ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                </div>

                {/* Expanded milestones */}
                {isEx && (
                  <div style={{ borderTop: `0.5px solid ${c.border}`, padding: "12px 16px" }}>
                    {ct.project?.description && (
                      <p style={{ fontSize: 12, color: c.subtext, margin: "0 0 12px", lineHeight: 1.6 }}>{ct.project.description}</p>
                    )}

                    {msList.length === 0 ? (
                      <div style={{ fontSize: 12, color: c.subtext, opacity: .7 }}>No milestones added yet.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Milestones</div>
                        {msList.map((m, i) => {
                          const ms = milestoneStatusColor[m.status] ?? { color: c.subtext, bg: "transparent" };
                          return (
                            <div key={m.milestone_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: c.bg, borderRadius: 8, border: `0.5px solid ${c.border}` }}>
                              <span style={{ fontSize: 11, color: c.subtext, minWidth: 18 }}>#{i + 1}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>{m.title || `Milestone #${i + 1}`}</div>
                                {m.due_date && <div style={{ fontSize: 10, color: c.subtext, marginTop: 2 }}>Due {new Date(m.due_date).toLocaleDateString()}</div>}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 500, color: c.text }}>${m.amount?.toLocaleString()}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 100, background: ms.bg, color: ms.color }}>
                                {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                              </span>
                            </div>
                          );
                        })}
                        <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                          <span style={{ fontSize: 12, color: c.subtext }}>
                            Total: <strong style={{ color: c.text }}>${msList.reduce((s, m) => s + (m.amount || 0), 0).toLocaleString()}</strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Earnings Chart ───────────────────────────────────────────────────────────

const EarningsChart: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const [bars, setBars] = useState<{ label: string; amount: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/contracts/my`, getAuthHeaders());
        if (res.ok) {
          const contracts: WorkContract[] = await res.json();
          const byMonth: Record<string, number> = {};
          contracts.forEach(ct =>
            (ct.milestones ?? []).filter((m: WorkMilestone) => m.status === "paid").forEach((m: WorkMilestone) => {
              const key = new Date(m.due_date ?? ct.created_at).toLocaleDateString("en", { month: "short", year: "2-digit" });
              byMonth[key] = (byMonth[key] || 0) + (m.amount || 0);
            })
          );
          const sorted = Object.entries(byMonth).slice(-6).map(([label, amount]) => ({ label, amount }));
          setBars(sorted);
          setTotal(sorted.reduce((s, d) => s + d.amount, 0));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const max = Math.max(...bars.map(b => b.amount), 1);

  return (
    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Earnings</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#22c55e" }}>${total.toLocaleString()}</span>
      </div>
      {loading ? (
        <div style={{ height: 80, background: c.border, borderRadius: 6, animation: "pulse 1.5s infinite" }} />
      ) : bars.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: c.subtext, opacity: .7 }}>
          Earnings will appear here once milestones are paid.
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
          {bars.map(({ label, amount }) => (
            <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div title={`$${amount}`} style={{ width: "100%", minHeight: 4, height: Math.max(4, (amount / max) * 64), background: c.primary, borderRadius: "3px 3px 0 0", opacity: 0.85 }} />
              <div style={{ fontSize: 9, color: c.subtext }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const FreelancerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth<FreelancerProfile>();
  const { data: profile, isLoading: profileLoading, isError: profileError } = useProfile();
  const { data: ghProfile, isLoading: ghLoading } = useGitHubProfile();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeView, setActiveView] = useState("Dashboard");
  const [unreadCount, setUnreadCount] = useState(0);
  const [proposalStats, setProposalStats] = useState<{ sent: number; accepted: number; rejected: number; response_rate: number } | null>(null);
  const [activeContracts, setActiveContracts] = useState<WorkContract[]>([]);
  const [showWallet, setShowWallet] = useState(false);
  const [walletAmount, setWalletAmount] = useState("");
  const [walletMsg, setWalletMsg] = useState("");
  const [walletTx, setWalletTx] = useState<any[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const c = getColors(darkMode);

  const initials = user?.email ? user.email.split("@")[0].slice(0, 2).toUpperCase() : "…";
  const displayName = user?.email ?? "…";
  const firstName = user?.email ? user.email.split("@")[0] : "…";

  const toggleTheme = () => {
    setDarkMode((d) => { localStorage.setItem("skilllink-darkMode", JSON.stringify(!d)); return !d; });
  };

  const openWallet = async () => {
    setShowWallet(true);
    setWalletMsg("");
    const data = await fetch(`${API_BASE_URL}/wallet/transactions`, getAuthHeaders()).then(r => r.json()).catch(() => []);
    setWalletTx(Array.isArray(data) ? data : []);
  };

  const doWithdraw = async () => {
    const amt = parseFloat(walletAmount);
    if (!amt || amt < 5) { setWalletMsg("Minimum $5.00"); return; }
    setWalletLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/wallet/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders().headers },
        body: JSON.stringify({ amount: amt }),
      });
      const d = await res.json();
      setWalletMsg(d.message || d.detail || "Done");
      setWalletAmount("");
      const tx = await fetch(`${API_BASE_URL}/wallet/transactions`, getAuthHeaders()).then(r => r.json()).catch(() => []);
      setWalletTx(Array.isArray(tx) ? tx : []);
    } catch { setWalletMsg("Request failed"); }
    setWalletLoading(false);
  };

  // Fetch unread message count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/messages/inbox`, getAuthHeaders());
        if (response.ok) {
          const conversations = await response.json();
          const total = conversations.reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0);
          setUnreadCount(total);
        }
      } catch (err) {
        console.error("Failed to fetch unread count:", err);
      }
    };
    fetchUnreadCount();
  }, []);

  // Fetch proposal stats
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/proposals/my/stats`, getAuthHeaders());
        if (res.ok) setProposalStats(await res.json());
      } catch { /* silent */ }
    })();
  }, []);

  // Fetch active contracts for dashboard
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/contracts/my`, getAuthHeaders());
        if (res.ok) {
          const all: WorkContract[] = await res.json();
          setActiveContracts(all.filter(ct => ct.status === "active"));
        }
      } catch { /* silent */ }
    })();
  }, []);

  return (
    <ErrorBoundary>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif", fontSize: 13 }}>

        {/* ── Top Bar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Skill<span style={{ color: c.primary }}>Link</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={toggleTheme} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
              {darkMode ? "☀️" : "🌙"}
            </button>
            <NotificationBell c={c} />
            <div style={{ position: "relative" }}>
              <div onClick={() => setDropdownOpen((v) => !v)} style={{ width: 28, height: 28, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, border: `0.5px solid ${c.border}`, cursor: "pointer" }}>
                {initials}
              </div>
              {dropdownOpen && (
                <div style={{ position: "absolute", right: 0, top: 36, background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "6px 0", minWidth: 180, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,.15)" }}>
                  <div style={{ padding: "6px 14px 8px", borderBottom: `0.5px solid ${c.border}`, marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{displayName}</div>
                    <div style={{ fontSize: 11, color: c.subtext }}>Freelancer</div>
                  </div>
                  {[
                    { href: "/settings",     label: "⚙️ Settings" },
                    { href: "/settings/mfa", label: "🔐 Two-factor auth" },
                    { href: "/github/review",label: "🐙 Update GitHub" },
                  ].map(({ href, label }) => (
                    <a key={href} href={href} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: c.text, textDecoration: "none" }}
                      onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >{label}</a>
                  ))}
                  <div onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: "#ef4444", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >→ Sign out</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── Sidebar ── */}
          <aside style={{ width: 200, borderRight: `0.5px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", padding: "16px 0", flexShrink: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Main</div>
            <NavItem label="Dashboard" active={activeView === "Dashboard"} icon={<IconGrid />} colors={c} onClick={() => setActiveView("Dashboard")} />
            <NavItem label="Profile"   icon={<IconUser />} colors={c} onClick={() => navigate("/settings")} />
            <NavItem label="Messages"  badge={unreadCount} icon={<IconMsg />} colors={c} onClick={() => navigate("/messages")} />
            <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Skillink</div>
            <NavItem label="Proposals" icon={<IconDoc />} colors={c} onClick={() => navigate("/proposals")} />
            <NavItem label="AI Matches"   badge="New" active={activeView === "AI Matches"} icon={<IconBulb />} colors={c} onClick={() => setActiveView("AI Matches")} />
            <NavItem label="Verification" active={activeView === "Verification"} icon={<IconShield />} colors={c} onClick={() => setActiveView("Verification")} />
            <NavItem label="Workrooms" active={activeView === "Workrooms"} icon={<IconTeam />} colors={c} onClick={() => setActiveView("Workrooms")} />
            {/* ── Upgrade Banner ── */}
            <div style={{ margin: "10px 12px 0" }}>
              <div
                onClick={() => setActiveView("Upgrade")}
                style={{
                  background: "linear-gradient(135deg, #2a1f4a 0%, #3d2566 100%)",
                  border: `0.5px solid rgba(127,119,221,0.4)`,
                  borderRadius: 10,
                  padding: "12px 12px",
                  cursor: "pointer",
                  transition: "all .2s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 20px rgba(127,119,221,0.25)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
              >
                <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#c4b5fd", marginBottom: 4 }}>⭐ Premium</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Upgrade Now</div>
                <div style={{ fontSize: 10, color: "#c4b5fd", lineHeight: 1.4 }}>Unlimited proposals, AI scoring & more.</div>
                <div style={{ marginTop: 8, fontSize: 10, fontWeight: 600, color: "#7F77DD", background: "rgba(127,119,221,0.2)", borderRadius: 6, padding: "4px 8px", display: "inline-block" }}>
                  View Plans →
                </div>
              </div>
            </div>
            <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
              <NavItem label="Settings" icon={<IconSettings />} colors={c} onClick={() => navigate("/settings")} />
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>

            {activeView === "AI Matches" && <ProjectMatchView c={c} />}

            {activeView === "Verification" && <VerificationView c={c} />}

            {activeView === "Workrooms" && <WorkroomsView c={c} />}

            {activeView === "Upgrade" && <UpgradeNowSection roleType="freelancer" colors={c} />}

            {activeView === "Dashboard" && <>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Dashboard</div>
              <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Welcome back, {firstName} — your AI match engine is active</div>
            </div>

            {/* Metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
              {profileLoading ? (
                <MetricSkeletons dark={darkMode} />
              ) : profileError ? (
                <div style={{ gridColumn: "1/-1", fontSize: 13, color: "#ef4444", padding: 16 }}>Failed to load profile data. <button onClick={() => window.location.reload()} style={{ color: c.primary, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>Retry</button></div>
              ) : (
                <>
                  <MetricCard
                    label="GitHub Score"
                    value={
                      ghLoading
                        ? <span style={{ color: c.subtext }}>…</span>
                        : ghProfile?.github_score
                          ? <span style={{ color: c.primary }}>{ghProfile.github_score}<span style={{ fontSize: 14, fontWeight: 400 }}>/100</span></span>
                          : <span style={{ color: c.subtext }}>—</span>
                    }
                    sub={ghProfile?.professional_title ?? "Connect GitHub to score"}
                    badge={
                      ghProfile?.github_score
                        ? ghProfile.github_score >= 70
                          ? <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">✓ Strong profile</Badge>
                          : <Badge bg="rgba(245,158,11,.1)" color="#f59e0b" border="rgba(245,158,11,.2)">Needs work</Badge>
                        : <Badge bg={c.primarySoft} color={c.primary} border="rgba(127,119,221,.2)">→ Connect GitHub</Badge>
                    }
                    colors={c}
                  />
                  <MetricCard
                    label="Hourly Rate"
                    value={profile?.hourly_rate ? <span style={{ color: "#22c55e" }}>${profile.hourly_rate}</span> : "—"}
                    sub="Per hour · USD"
                    colors={c}
                  />
                  <MetricCard
                    label="Wallet Balance"
                    value={`$${profile?.wallet_balance?.toFixed(2) ?? "0.00"}`}
                    sub="Available balance"
                    badge={
                      <button onClick={openWallet} style={{ marginTop: 4, padding: "4px 10px", borderRadius: 6, border: "none", background: c.primarySoft, color: c.primary, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        Withdraw →
                      </button>
                    }
                    colors={c}
                  />
                  <MetricCard
                    label="Skills Listed"
                    value={profile?.skills?.length ?? 0}
                    sub={profile?.skills?.length ? "Active skills on profile" : "Add skills in Settings"}
                    badge={!profile?.skills?.length ? <Badge bg="rgba(245,158,11,.1)" color="#f59e0b" border="rgba(245,158,11,.2)">Add skills →</Badge> : undefined}
                    colors={c}
                  />
                </>
              )}
            </div>

            {/* Proposals / Activity Stats row */}
            {!profileLoading && !profileError && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(127,119,221,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📨</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: c.primary, lineHeight: 1 }}>{proposalStats ? proposalStats.sent : "—"}</div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 3 }}>Proposals Sent</div>
                  </div>
                </div>
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(34,197,94,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>✅</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: "#22c55e", lineHeight: 1 }}>{proposalStats ? proposalStats.accepted : "—"}</div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 3 }}>Accepted</div>
                  </div>
                </div>
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(239,68,68,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>❌</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: "#ef4444", lineHeight: 1 }}>{proposalStats ? proposalStats.rejected : "—"}</div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 3 }}>Rejected</div>
                  </div>
                </div>
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(245,158,11,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📊</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: "#f59e0b", lineHeight: 1 }}>{proposalStats ? `${proposalStats.response_rate}%` : "—"}</div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 3 }}>Response Rate</div>
                  </div>
                </div>
              </div>
            )}

            {/* Middle row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12, marginBottom: 12 }}>

              {/* Bio / Profile card */}
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Your Profile</span>
                  <a href="/settings" style={{ fontSize: 11, color: c.subtext, cursor: "pointer", textDecoration: "none" }}>Edit →</a>
                </div>
                {profileLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Skeleton width="100%" height={12} dark={darkMode} />
                    <Skeleton width="90%" height={12} dark={darkMode} />
                    <Skeleton width="75%" height={12} dark={darkMode} />
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: c.subtext, lineHeight: 1.6, margin: "0 0 12px" }}>
                      {profile?.bio ?? <span style={{ opacity: .5 }}>No bio yet. <a href="/settings" style={{ color: c.primary, textDecoration: "none" }}>Add one →</a></span>}
                    </p>
                    {profile?.skills && <SkillsSection skills={profile.skills} c={c} />}
                  </>
                )}
              </div>

              {/* AI Matches preview card */}
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Top AI Matches</span>
                  <span onClick={() => setActiveView("AI Matches")} style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>View all →</span>
                </div>
                <EmptyState label="Click 'AI Matches' in the sidebar" hint="The engine surfaces best-fit projects once clients run matching for their jobs." c={c} />
              </div>
            </div>

            {/* Bottom row — Projects + Reviews */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Projects in Progress</span>
                  {activeContracts.length > 0 && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: "rgba(34,197,94,.1)", color: "#22c55e" }}>{activeContracts.length} active</span>
                  )}
                </div>
                {activeContracts.length === 0 ? (
                  <EmptyState label="No active projects yet" hint="You'll see your active contracts here once a client accepts your proposal." c={c} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {activeContracts.map((ct: WorkContract) => {
                      const msList = ct.milestones ?? [];
                      const paid = msList.filter((m: { status: string }) => m.status === "paid").length;
                      const total = msList.length;
                      return (
                        <div key={ct.contract_id} onClick={() => navigate(`/contract/${ct.contract_id}`)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: c.bg, border: `0.5px solid ${c.border}`, cursor: "pointer" }}
                          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = c.primary + "66"}
                          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = c.border}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ct.project?.title ?? `Contract #${ct.contract_id}`}</div>
                            <div style={{ fontSize: 11, color: c.subtext, marginTop: 1 }}>{total > 0 ? `${paid}/${total} milestones paid` : "No milestones yet"}</div>
                          </div>
                          <span style={{ fontSize: 11, color: c.primary }}>→</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Recent Reviews</span>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: c.primarySoft, color: c.primary }}>Coming soon</span>
                </div>
                <EmptyState label="No reviews yet" hint="Client reviews will appear here after you complete your first project." c={c} />
              </div>
            </div>
            </>}
          </main>

          {/* ── Right Panel ── */}
          <aside style={{ width: 220, borderLeft: `0.5px solid ${c.border}`, background: c.surface, padding: 16, overflowY: "auto", flexShrink: 0 }}>
            <ProfilePanel
              profile={profile}
              ghProfile={ghProfile}
              loading={profileLoading}
              ghLoading={ghLoading}
              initials={initials}
              displayName={displayName}
              c={c}
              dark={darkMode}
            />

            {/* Upcoming */}
            <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 8 }}>Upcoming</div>
            <EmptyState label="No upcoming events" hint="Scheduled calls and deadlines will appear here." c={c} />

            {/* Quick actions */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 8 }}>Quick Links</div>
              {[
                { label: "Update GitHub",   href: "/github/review" },
                { label: "Settings",        href: "/settings" },
                { label: "Setup MFA",       href: "/settings/mfa" },
              ].map(({ label, href }) => (
                <a key={href} href={href} style={{ display: "block", fontSize: 12, color: c.subtext, padding: "6px 0", borderBottom: `0.5px solid ${c.border}`, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget.style.color = c.primary)}
                  onMouseLeave={e => (e.currentTarget.style.color = c.subtext)}
                >
                  {label} →
                </a>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {/* Wallet Modal */}
      {showWallet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 18, padding: 28, width: 420, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: c.text }}>Wallet</div>
              <button onClick={() => setShowWallet(false)} style={{ background: "none", border: "none", color: c.subtext, fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>${profile?.wallet_balance?.toFixed(2) ?? "0.00"}</div>
            <div style={{ fontSize: 12, color: c.subtext, marginBottom: 20 }}>Available balance</div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em" }}>Withdraw Amount (min $5)</label>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input type="number" min="5" value={walletAmount} onChange={e => setWalletAmount(e.target.value)} placeholder="0.00" style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 14 }} />
                <button onClick={doWithdraw} disabled={walletLoading} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#22c55e", color: "#fff", fontWeight: 700, cursor: walletLoading ? "not-allowed" : "pointer", opacity: walletLoading ? 0.6 : 1, fontSize: 13 }}>
                  {walletLoading ? "…" : "Withdraw"}
                </button>
              </div>
              {walletMsg && <div style={{ marginTop: 8, fontSize: 12, color: walletMsg.includes("fail") || walletMsg.includes("Min") ? "#ef4444" : "#22c55e" }}>{walletMsg}</div>}
            </div>
            <div style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Transaction History</div>
            {walletTx.length === 0 ? (
              <div style={{ fontSize: 12, color: c.subtext, opacity: .6 }}>No transactions yet.</div>
            ) : walletTx.map((tx: any) => (
              <div key={tx.transaction_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `0.5px solid ${c.border}` }}>
                <div>
                  <div style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>{tx.description || (tx.type === "deposit" ? "Payment received" : "Withdrawal")}</div>
                  <div style={{ fontSize: 10, color: c.subtext }}>{tx.created_at ? new Date(tx.created_at).toLocaleDateString() : ""}</div>
                </div>
                <div style={{ fontWeight: 700, color: tx.type === "deposit" ? "#22c55e" : "#ef4444", fontSize: 13 }}>{tx.type === "deposit" ? "+" : "−"}${tx.amount?.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
};

export default FreelancerDashboard;