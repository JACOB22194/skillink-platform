import React, { useState } from "react";

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

interface ActiveProject {
  name: string;
  freelancer: string;
  status: "On Track" | "At Risk" | "Delayed";
  pct: number;
  color: string;
}

interface RecommendedTalent {
  initials: string;
  name: string;
  sub: string;
  score: number;
  bg: string;
  color: string;
}

interface Invoice {
  id: string;
  freelancer: string;
  project: string;
  amount: string;
  due: string;
  status: "Pending" | "Paid" | "Overdue";
}

interface SpendItem {
  label: string;
  amount: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVE_PROJECTS: ActiveProject[] = [
  { name: "AI Content Pipeline", freelancer: "Hugh Jordan · ML Eng", status: "On Track", pct: 72, color: "#22c55e" },
  { name: "Customer Data Platform", freelancer: "Sara Morin · Data Sci", status: "At Risk", pct: 38, color: "#f59e0b" },
  { name: "Next.js Rebrand", freelancer: "James Teo · Frontend", status: "On Track", pct: 85, color: "#7F77DD" },
  { name: "Vector DB Integration", freelancer: "Priya Nair · LLM Ops", status: "Delayed", pct: 22, color: "#ef4444" },
];

const TALENT: RecommendedTalent[] = [
  { initials: "HJ", name: "Hugh Jordan", sub: "ML Engineering · ✓ Verified", score: 96, bg: "#2a2640", color: "#7F77DD" },
  { initials: "LM", name: "Lena Müller", sub: "Data Science · ✓ Verified", score: 93, bg: "rgba(34,197,94,.12)", color: "#22c55e" },
  { initials: "KO", name: "Kwame Osei", sub: "Frontend TS · ✓ Verified", score: 91, bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
  { initials: "PN", name: "Priya Nair", sub: "LLM Ops · ✓ Verified", score: 88, bg: "rgba(245,158,11,.1)", color: "#f59e0b" },
];

const INVOICES: Invoice[] = [
  { id: "#INV-0041", freelancer: "Hugh Jordan", project: "ML Inference API", amount: "$4,200", due: "Apr 15", status: "Pending" },
  { id: "#INV-0040", freelancer: "Lena Müller", project: "Data Pipeline", amount: "$3,100", due: "Apr 10", status: "Paid" },
  { id: "#INV-0039", freelancer: "Kwame Osei", project: "Next.js Rebrand", amount: "$2,800", due: "Apr 5", status: "Paid" },
  { id: "#INV-0038", freelancer: "Priya Nair", project: "Vector DB Integration", amount: "$1,900", due: "Apr 18", status: "Overdue" },
];

const SPEND: SpendItem[] = [
  { label: "ML Engineering", amount: "$18.4k" },
  { label: "Data Science", amount: "$12.1k" },
  { label: "Frontend TS", amount: "$9.8k" },
  { label: "LLM Ops", amount: "$7.9k" },
];

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  "On Track": { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" },
  "At Risk":  { bg: "rgba(245,158,11,.1)", color: "#f59e0b",  border: "rgba(245,158,11,.2)" },
  "Delayed":  { bg: "rgba(239,68,68,.1)",  color: "#ef4444",  border: "rgba(239,68,68,.2)"  },
  "Pending":  { bg: "rgba(245,158,11,.1)", color: "#f59e0b",  border: "rgba(245,158,11,.2)" },
  "Paid":     { bg: "rgba(34,197,94,.12)", color: "#22c55e",  border: "rgba(34,197,94,.2)"  },
  "Overdue":  { bg: "rgba(239,68,68,.1)",  color: "#ef4444",  border: "rgba(239,68,68,.2)"  },
};

// ─── Helper ───────────────────────────────────────────────────────────────────

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE" };

// ─── Sub-components ───────────────────────────────────────────────────────────

const Badge: React.FC<{ bg: string; color: string; border: string; children: React.ReactNode; style?: React.CSSProperties }> =
  ({ bg, color, border, children, style }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 8px", borderRadius: 100, background: bg, color, border: `0.5px solid ${border}`, ...style }}>
      {children}
    </span>
  );

const NavItem: React.FC<{ label: string; active?: boolean; badge?: number | string; icon: React.ReactNode; colors: ThemeColors }> =
  ({ label, active, badge, icon, colors }) => (
    <div style={{
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

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconGrid   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const IconUser   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconMsg    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
const IconSearch = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
const IconClip   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>;
const IconTeam   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>;
const IconInv    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4M15 10h5M15 6h3a2 2 0 012 2v8a2 2 0 01-2 2h-3"/></svg>;

// ─── Main Component ───────────────────────────────────────────────────────────

const ClientDashboard: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const c = getColors(darkMode);

  const toggleTheme = () => {
    setDarkMode((d) => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, ...style }}>{children}</div>
  );

  const sectionHeader = (title: string, action?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{title}</span>
      {action}
    </div>
  );

  const thBorder: React.CSSProperties = { fontSize: 10, color: c.subtext, textAlign: "left", padding: "0 8px 8px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500, borderBottom: `0.5px solid ${c.border}` };
  const tdBorder: React.CSSProperties = { padding: "9px 8px", fontSize: 12, color: c.text, borderBottom: `0.5px solid ${c.border}` };

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
              style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(59,130,246,.2)", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, border: `0.5px solid ${c.border}`, cursor: "pointer" }}
            >NX</div>
            {dropdownOpen && (
              <div style={{ position: "absolute", right: 0, top: 36, background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "6px 0", minWidth: 180, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,.15)" }}>
                <div style={{ padding: "6px 14px 8px", borderBottom: `0.5px solid ${c.border}`, marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>Nexora Labs</div>
                  <div style={{ fontSize: 11, color: c.subtext }}>Client</div>
                </div>
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

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 200, borderRight: `0.5px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", padding: "16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Main</div>
          <NavItem label="Dashboard" active icon={<IconGrid />} colors={c} />
          <NavItem label="Company Profile" icon={<IconUser />} colors={c} />
          <NavItem label="Messages" badge={7} icon={<IconMsg />} colors={c} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Hiring</div>
          <NavItem label="Find Talent" badge="New" icon={<IconSearch />} colors={c} />
          <NavItem label="Active Projects" icon={<IconClip />} colors={c} />
          <NavItem label="Workrooms" icon={<IconTeam />} colors={c} />
          <NavItem label="Invoices" icon={<IconInv />} colors={c} />
          <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>Switch theme</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>Contact us</div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Dashboard</div>
            <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Nexora Labs · AI-assisted hiring overview</div>
          </div>

          {/* Metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
            {[
              { label: "Active Projects", val: "8", sub: "across 4 workrooms", badge: <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">3 on track</Badge> },
              { label: "Talent Hired", val: "14", sub: "verified freelancers", badge: <Badge bg="#2a2640" color="#7F77DD" border="rgba(127,119,221,.2)">AI-matched</Badge> },
              { label: "Avg Match Quality", val: <span style={{ color: c.primary }}>91%</span>, sub: "across all hires", badge: <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">↑ +5% vs last month</Badge> },
              { label: "Total Spent", val: "$48.2k", sub: "this quarter", badge: <Badge bg="rgba(245,158,11,.1)" color="#f59e0b" border="rgba(245,158,11,.2)">3 pending invoices</Badge> },
            ].map((m) => (
              <div key={m.label} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 10, color: c.subtext, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 500, color: c.text, lineHeight: 1 }}>{m.val}</div>
                <div style={{ fontSize: 11, color: c.subtext, marginTop: 5 }}>{m.sub}</div>
                {m.badge}
              </div>
            ))}
          </div>

          {/* Middle row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>

            {/* Active Projects */}
            {card(
              <>
                {sectionHeader("Active Projects",
                  <button style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>+ Post Project</button>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {ACTIVE_PROJECTS.map((p) => {
                    const s = STATUS_COLORS[p.status];
                    return (
                      <div key={p.name}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{p.name}</span>
                          <Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{p.status}</Badge>
                        </div>
                        <div style={{ height: 4, background: c.bg, borderRadius: 20, overflow: "hidden", margin: "5px 0" }}>
                          <div style={{ height: "100%", width: `${p.pct}%`, background: p.color, borderRadius: 20 }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.subtext, marginTop: 2 }}>
                          <span>{p.freelancer}</span><span>{p.pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Recommended Talent */}
            {card(
              <>
                {sectionHeader("AI Recommended Talent", <span style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>Browse all →</span>)}
                {TALENT.map((t) => (
                  <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `0.5px solid ${c.border}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: t.bg, color: t.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{t.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: c.subtext }}>{t.sub}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: c.primary }}>{t.score}%</div>
                      <button style={{ fontSize: 10, padding: "3px 8px", marginTop: 4, background: "transparent", color: c.text, border: `0.5px solid ${c.border}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", display: "block" }}>Invite</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Invoices */}
          {card(
            <>
              {sectionHeader("Recent Invoices", <span style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>View all →</span>)}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["Invoice", "Freelancer", "Project", "Amount", "Due", "Status"].map((h) => <th key={h} style={thBorder}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {INVOICES.map((inv) => {
                    const s = STATUS_COLORS[inv.status];
                    return (
                      <tr key={inv.id}>
                        <td style={{ ...tdBorder, color: c.subtext }}>{inv.id}</td>
                        <td style={tdBorder}>{inv.freelancer}</td>
                        <td style={tdBorder}>{inv.project}</td>
                        <td style={{ ...tdBorder, fontWeight: 500 }}>{inv.amount}</td>
                        <td style={{ ...tdBorder, color: c.subtext }}>{inv.due}</td>
                        <td style={tdBorder}><Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{inv.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </main>

        {/* ── Right Panel ── */}
        <aside style={{ width: 220, borderLeft: `0.5px solid ${c.border}`, background: c.surface, padding: 16, overflowY: "auto", flexShrink: 0 }}>
          {/* Company profile */}
          <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: `0.5px solid ${c.border}`, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(59,130,246,.2)", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, margin: "0 auto 8px" }}>NX</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>Nexora Labs</div>
            <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>Verified Client</div>
            <Badge bg="rgba(59,130,246,.1)" color="#3b82f6" border="rgba(59,130,246,.2)" style={{ marginTop: 8 }}>✓ Identity Verified</Badge>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 12 }}>
              {[{ val: "8", label: "PROJECTS", color: c.text }, { val: "14", label: "HIRED", color: "#22c55e" }].map((s) => (
                <div key={s.label} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 9, color: c.subtext }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 8 }}>Upcoming</div>
          {[
            { title: "Talent interview · Hugh J.", meta: "Today · 2:00 PM", color: c.primary },
            { title: "Invoice #INV-0041 due", meta: "Apr 15", color: "#f59e0b" },
            { title: "Project kickoff · AI Pipeline", meta: "Apr 14 · Workroom #03", color: "#3b82f6" },
            { title: "Vector DB review — delayed", meta: "Apr 18 · Action needed", color: "#ef4444" },
          ].map((t) => (
            <div key={t.title} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `0.5px solid ${c.border}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{t.title}</div>
                <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{t.meta}</div>
              </div>
            </div>
          ))}

          {/* Spend breakdown */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginTop: 16, marginBottom: 8 }}>Spend breakdown</div>
          {SPEND.map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `0.5px solid ${c.border}`, fontSize: 12 }}>
              <span style={{ color: c.subtext }}>{s.label}</span>
              <span style={{ fontWeight: 500, color: c.text }}>{s.amount}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
};

export default ClientDashboard;
