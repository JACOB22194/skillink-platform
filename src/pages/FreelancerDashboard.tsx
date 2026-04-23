import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primarySoft: string;
}

interface Project {
  name: string;
  tag: string;
  room: string;
  pct: number;
  color: string;
}

interface Match {
  initials: string;
  name: string;
  sub: string;
  score: number;
  bg: string;
  color: string;
}

interface Review {
  initials: string;
  name: string;
  project: string;
  rating: number;
  comment: string;
  bg: string;
  color: string;
}

interface TimelineItem {
  title: string;
  meta: string;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECTS: Project[] = [
  { name: "ML Inference API", tag: "ML Eng", room: "Workroom #04", pct: 78, color: "#7F77DD" },
  { name: "TypeScript Design System", tag: "Frontend", room: "Workroom #07", pct: 62, color: "#3b82f6" },
  { name: "Data Pipeline Orchestration", tag: "Data Sci", room: "Workroom #02", pct: 45, color: "#a78bfa" },
  { name: "RAG Knowledge Base", tag: "LLM Ops", room: "Workroom #09", pct: 91, color: "#22c55e" },
];

const MATCHES: Match[] = [
  { initials: "DS", name: "DataScale Inc.", sub: "ML Engineering · Remote", score: 96, bg: "#2a2640", color: "#7F77DD" },
  { initials: "NX", name: "Nexora Labs", sub: "LLM Ops · Hybrid", score: 92, bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
  { initials: "VX", name: "Vextra AI", sub: "Data Science · Remote", score: 89, bg: "rgba(34,197,94,.12)", color: "#22c55e" },
  { initials: "QR", name: "Quorra Systems", sub: "Frontend TS · On-site", score: 87, bg: "rgba(245,158,11,.1)", color: "#f59e0b" },
  { initials: "AP", name: "Apex Robotics", sub: "ML Engineering · Remote", score: 85, bg: "rgba(239,68,68,.1)", color: "#ef4444" },
];

const REVIEWS: Review[] = [
  { initials: "AK", name: "Amir Khalid", project: "ML Inference API", rating: 5, comment: "Exceptional architecture, delivered ahead of schedule.", bg: "#2a2640", color: "#7F77DD" },
  { initials: "SM", name: "Sara Morin", project: "Design System", rating: 5, comment: "Best TS developer I've worked with.", bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
  { initials: "JT", name: "James Teo", project: "Data Pipeline", rating: 4, comment: "Minor latency issues resolved quickly.", bg: "rgba(34,197,94,.1)", color: "#22c55e" },
];

const TIMELINE: TimelineItem[] = [
  { title: "Vetting Call · System Design", meta: "Today · 3:00 PM UTC", color: "#7F77DD" },
  { title: "ML API Sprint Review", meta: "Tomorrow · Workroom #04", color: "#3b82f6" },
  { title: "RAG Base — Final Delivery", meta: "Apr 15 · Workroom #09", color: "#22c55e" },
  { title: "Trust Score Recalculation", meta: "Apr 20 · Auto event", color: "#f59e0b" },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE" };

// ─── Sub-components ───────────────────────────────────────────────────────────

const NavItem: React.FC<{ label: string; active?: boolean; badge?: number | string; icon: React.ReactNode; colors: ThemeColors; onClick?: () => void }> =
  ({ label, active, badge, icon, colors, onClick }) => (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 9, padding: "8px 16px",
      color: active ? colors.primary : colors.subtext,
      borderLeft: `2px solid ${active ? colors.primary : "transparent"}`,
      background: active ? colors.bg : "transparent",
      cursor: "pointer", fontSize: 12,
    }}>
      {icon}
      {label}
      {badge !== undefined && (
        <span style={{ marginLeft: "auto", background: colors.primary, color: "#fff", fontSize: 9, padding: "1px 5px", borderRadius: 20 }}>{badge}</span>
      )}
    </div>
  );

const MetricCard: React.FC<{ label: string; value: React.ReactNode; sub: string; badge: React.ReactNode; colors: ThemeColors }> =
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

const ProgressBar: React.FC<{ pct: number; color: string; colors: ThemeColors }> = ({ pct, color, colors }) => (
  <div style={{ height: 4, background: colors.bg, borderRadius: 20, overflow: "hidden", margin: "5px 0" }}>
    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 20 }} />
  </div>
);

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconGrid = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const IconUser = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconMsg = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
const IconBulb = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>;
const IconShield = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>;
const IconTeam = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>;

// ─── Main Component ───────────────────────────────────────────────────────────

const FreelancerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const c = getColors(darkMode);

  const toggleTheme = () => {
    setDarkMode((d) => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif", fontSize: 13 }}>

      {/* ── Top Bar ── */}
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
  <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>
    Skill<span style={{ color: c.primary }}>Link</span>
  </div>
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <button onClick={toggleTheme} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
      {darkMode ? "☀️" : "🌙"}
    </button>
    {/* Avatar dropdown */}
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setDropdownOpen((v) => !v)}
        style={{ width: 28, height: 28, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, border: `0.5px solid ${c.border}`, cursor: "pointer" }}
      >HJ</div>
      {dropdownOpen && (
        <div style={{ position: "absolute", right: 0, top: 36, background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "6px 0", minWidth: 180, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,.15)" }}>
          <div style={{ padding: "6px 14px 8px", borderBottom: `0.5px solid ${c.border}`, marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>Hugh Jordan</div>
            <div style={{ fontSize: 11, color: c.subtext }}>Freelancer</div>
          </div>
          <a href="/settings/profile" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: c.text, textDecoration: "none", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            👤 Profile settings
          </a>
          <a href="/settings/mfa" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: c.text, textDecoration: "none", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            🔐 Two-factor auth
          </a>
          <div
            onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: "#ef4444", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            → Sign out
          </div>
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
          <NavItem label="Dashboard" active icon={<IconGrid />} colors={c} />
          <NavItem label="Profile" icon={<IconUser />} colors={c} />
          <NavItem label="Messages" badge={4} icon={<IconMsg />} colors={c} onClick={() => navigate("/messages")} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Skillink</div>
          <NavItem label="AI Matches" badge={12} icon={<IconBulb />} colors={c} />
          <NavItem label="Verification" icon={<IconShield />} colors={c} />
          <NavItem label="Workrooms" badge={3} icon={<IconTeam />} colors={c} />
          <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>Switch theme</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>Contact us</div>
       
      </div>
      </aside>

        {/* ── Main Content ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>

          {/* Header */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Dashboard</div>
            <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Welcome back, Hugh — your AI match engine is active</div>
          </div>

          {/* Metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
            <MetricCard label="AI Match Score" value={<span style={{ color: c.primary }}>94%</span>} sub="Avg across 12 matches" badge={<Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">↑ +3.2% this week</Badge>} colors={c} />
            <MetricCard label="Vetting Status" value={<Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">✓ Verified</Badge>} sub="Score: 91 / 100" badge={<div style={{ fontSize: 10, color: c.subtext, marginTop: 4 }}>Comprehension Gate passed</div>} colors={c} />
            <MetricCard label="AI Trust Score" value="4.9" sub="48 AI-mediated reviews" badge={<Badge bg={c.primarySoft} color={c.primary} border="rgba(127,119,221,.2)">Top 2% percentile</Badge>} colors={c} />
            <MetricCard label="Completed Projects" value="27" sub="across 6 workrooms" badge={<Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">96% on-time</Badge>} colors={c} />
          </div>

          {/* Middle row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12, marginBottom: 12 }}>

            {/* Projects in Progress */}
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Projects in Progress</span>
                <span style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>See all →</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {PROJECTS.map((p) => (
                  <div key={p.name}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{p.name}</span>
                      <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: c.primarySoft, color: c.primary }}>{p.tag}</span>
                    </div>
                    <ProgressBar pct={p.pct} color={p.color} colors={c} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.subtext, marginTop: 2 }}>
                      <span>{p.room}</span><span>{p.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Matches */}
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Top AI Matches</span>
                <span style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>See all →</span>
              </div>
              {MATCHES.map((m) => (
                <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `0.5px solid ${c.border}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.bg, color: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{m.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: c.subtext }}>{m.sub}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: c.primary }}>{m.score}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Reviews table */}
          <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Recent Reviews</span>
              <span style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>See all →</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Client", "Project", "Rating", "Comment", "Status"].map((h) => (
                    <th key={h} style={{ fontSize: 10, color: c.subtext, textAlign: "left", padding: "0 8px 8px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500, borderBottom: `0.5px solid ${c.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {REVIEWS.map((r) => (
                  <tr key={r.name}>
                    <td style={{ padding: "9px 8px", fontSize: 12, color: c.text, borderBottom: `0.5px solid ${c.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: r.bg, color: r.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500 }}>{r.initials}</div>
                        {r.name}
                      </div>
                    </td>
                    <td style={{ padding: "9px 8px", fontSize: 12, color: c.text, borderBottom: `0.5px solid ${c.border}` }}>{r.project}</td>
                    <td style={{ padding: "9px 8px", fontSize: 12, color: "#f59e0b", borderBottom: `0.5px solid ${c.border}` }}>{"★".repeat(r.rating)}</td>
                    <td style={{ padding: "9px 8px", fontSize: 12, color: c.subtext, borderBottom: `0.5px solid ${c.border}` }}>{r.comment}</td>
                    <td style={{ padding: "9px 8px", borderBottom: `0.5px solid ${c.border}` }}>
                      <Badge bg={c.primarySoft} color={c.primary} border="rgba(127,119,221,.2)">AI-verified</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>

        {/* ── Right Panel ── */}
        <aside style={{ width: 220, borderLeft: `0.5px solid ${c.border}`, background: c.surface, padding: 16, overflowY: "auto", flexShrink: 0 }}>
          {/* Profile */}
          <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: `0.5px solid ${c.border}`, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 500, margin: "0 auto 8px" }}>HJ</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>Hugh Jordan</div>
            <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>Senior ML Engineer</div>
            <Badge bg={c.primarySoft} color={c.primary} border="rgba(127,119,221,.2)">✓ AI Gate Verified</Badge>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 12 }}>
              {[{ val: "94", label: "MATCH", color: c.primary }, { val: "27", label: "DONE", color: "#22c55e" }, { val: "4.9", label: "TRUST", color: c.text }].map((s) => (
                <div key={s.label} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 9, color: c.subtext }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 8 }}>Upcoming</div>
          {TIMELINE.map((t) => (
            <div key={t.title} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `0.5px solid ${c.border}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{t.title}</div>
                <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{t.meta}</div>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
};

export default FreelancerDashboard;
