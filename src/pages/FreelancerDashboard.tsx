import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../shared/useAuth";
import { useProfile, useGitHubProfile } from "../api/hooks";
import type { FreelancerProfile } from "../api/types";
import { Skeleton, SkeletonCard, SkeletonMetric } from "../components/ui/Skeleton";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { API_BASE_URL, getAuthHeaders } from "../shared/api";

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
  const [matches, setMatches] = useState<MatchedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState(0);
  const [ran, setRan] = useState(false);

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
                    <div style={{ fontSize: 11, color: c.subtext, lineHeight: 1.5, marginBottom: 6, opacity: 0.85 }}>{p.description}</div>
                    {p.matched_skills.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {p.matched_skills.map(s => (
                          <span key={s} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: c.primarySoft, color: c.primary, fontWeight: 500 }}>{s}</span>
                        ))}
                      </div>
                    )}
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
  </div>
);

// ─── Skills Section ───────────────────────────────────────────────────────────

const SkillsSection: React.FC<{ skills: string[]; c: ThemeColors }> = ({ skills, c }) => {
  if (skills.length === 0) return null;
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
  const c = getColors(darkMode);

  const initials = user?.email ? user.email.split("@")[0].slice(0, 2).toUpperCase() : "…";
  const displayName = user?.email ?? "…";
  const firstName = user?.email ? user.email.split("@")[0] : "…";

  const toggleTheme = () => {
    setDarkMode((d) => { localStorage.setItem("skilllink-darkMode", JSON.stringify(!d)); return !d; });
  };

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
            <NavItem label="Messages"  badge={0} icon={<IconMsg />} colors={c} onClick={() => navigate("/messages")} />
            <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Skillink</div>
            <NavItem label="AI Matches"   badge="New" active={activeView === "AI Matches"} icon={<IconBulb />} colors={c} onClick={() => setActiveView("AI Matches")} />
            <NavItem label="Verification"         icon={<IconShield />}  colors={c} />
            <NavItem label="Workrooms"    badge="—" icon={<IconTeam />}   colors={c} />
            <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
              <NavItem label="Settings" icon={<IconSettings />} colors={c} onClick={() => navigate("/settings")} />
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>

            {activeView === "AI Matches" && <ProjectMatchView c={c} />}

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
                    badge={<Badge bg={c.primarySoft} color={c.primary} border="rgba(127,119,221,.2)">· Withdraw coming soon</Badge>}
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
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: c.primarySoft, color: c.primary }}>Coming soon</span>
                </div>
                <EmptyState label="No active projects yet" hint="Your workroom projects will appear here once you land your first contract." c={c} />
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
    </ErrorBoundary>
  );
};

export default FreelancerDashboard;
