import React, { useState, useEffect } from "react";
import { API_BASE_URL, getAuthHeaders } from "../shared/api";

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

type UserStatus = "Vetting" | "Active" | "Suspended";
type UserRole = "Freelancer" | "Client";
type WorkroomStatus = "Active" | "Review" | "Suspended";

interface RecentUser {
  initials: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  bg: string;
  color: string;
}

interface AISystem {
  label: string;
  pct: number;
  color: string;
}

interface FlaggedItem {
  title: string;
  meta: string;
  color: string;
}

interface Workroom {
  id: string;
  client: string;
  freelancer: string;
  category: string;
  budget: string;
  status: WorkroomStatus;
  score: number;
}

interface PlatformStat {
  label: string;
  value: string | number;
  color?: string;
}

interface AdminStats {
  total_users: number;
  total_freelancers: number;
  total_clients: number;
  total_projects: number;
  total_proposals: number;
  total_contracts: number;
}

interface RecentAction {
  title: string;
  meta: string;
  color: string;
}

interface AdminUserItem {
  id: number;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface AdminVerification {
  id: number;
  user_id: number;
  email: string;
  document_type: string;
  document_url: string;
  status: string;
  submitted_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_USERS: RecentUser[] = [
  { initials: "AM", name: "Aisha Mwangi",  role: "Freelancer", status: "Vetting",   bg: "#2a2640",               color: "#7F77DD" },
  { initials: "TC", name: "TechCorp Ltd.", role: "Client",     status: "Active",    bg: "rgba(59,130,246,.15)",  color: "#3b82f6" },
  { initials: "RK", name: "Ravi Kumar",    role: "Freelancer", status: "Active",    bg: "rgba(34,197,94,.12)",   color: "#22c55e" },
  { initials: "MX", name: "MaxFlow Inc.",  role: "Client",     status: "Suspended", bg: "rgba(239,68,68,.1)",    color: "#ef4444" },
  { initials: "JL", name: "Ji-hoon Lee",   role: "Freelancer", status: "Vetting",   bg: "rgba(245,158,11,.1)",   color: "#f59e0b" },
];

const AI_SYSTEMS: AISystem[] = [
  { label: "Match Engine accuracy",       pct: 97, color: "#22c55e" },
  { label: "Vetting Gate pass rate",      pct: 68, color: "#7F77DD" },
  { label: "Trust Score confidence",      pct: 94, color: "#3b82f6" },
  { label: "Proposal AI acceptance rate", pct: 74, color: "#f59e0b" },
];

const FLAGGED: FlaggedItem[] = [
  { title: "Suspicious activity · Ji-hoon Lee",  meta: "Multiple failed vetting attempts", color: "#ef4444" },
  { title: "Review conflict · INV-0041",          meta: "Client dispute lodged",            color: "#f59e0b" },
  { title: "Low match confidence · MaxFlow",      meta: "Below threshold · manual review",  color: "#f59e0b" },
];

const WORKROOMS: Workroom[] = [
  { id: "#WR-009", client: "Nexora Labs",    freelancer: "Ahmad Samara", category: "ML Eng",   budget: "$24k", status: "Active",    score: 96 },
  { id: "#WR-007", client: "DataScale Inc.", freelancer: "Wael Omar",    category: "Data Sci", budget: "$18k", status: "Active",    score: 93 },
  { id: "#WR-012", client: "TechCorp Ltd.",  freelancer: "Majed Ali",    category: "Frontend", budget: "$12k", status: "Review",    score: 81 },
  { id: "#WR-004", client: "MaxFlow Inc.",   freelancer: "Priya Nair",   category: "LLM Ops",  budget: "$9k",  status: "Suspended", score: 42 },
];

const PLATFORM_STATS: PlatformStat[] = [
  { label: "Total freelancers", value: "1,604" },
  { label: "Total clients",     value: "814"   },
  { label: "Verified users",    value: "1,381" },
  { label: "Pending vetting",   value: "18",   color: "#f59e0b" },
  { label: "Open disputes",     value: "3",    color: "#ef4444" },
  { label: "Avg match score",   value: "91%",  color: "#7F77DD" },
];

const RECENT_ACTIONS: RecentAction[] = [
  { title: "MaxFlow Inc. suspended",    meta: "By system · 2h ago", color: "#ef4444" },
  { title: "18 vetting reviews queued", meta: "AI Gate · 4h ago",   color: "#22c55e" },
  { title: "Match engine retrained",    meta: "Auto · Apr 10",      color: "#7F77DD" },
];

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Vetting:   { bg: "rgba(245,158,11,.1)",  color: "#f59e0b", border: "rgba(245,158,11,.2)" },
  Active:    { bg: "rgba(34,197,94,.12)",  color: "#22c55e", border: "rgba(34,197,94,.2)"  },
  Suspended: { bg: "rgba(239,68,68,.1)",   color: "#ef4444", border: "rgba(239,68,68,.2)"  },
  Review:    { bg: "rgba(245,158,11,.1)",  color: "#f59e0b", border: "rgba(245,158,11,.2)" },
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

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconGrid    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const IconUsers   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;
const IconClip    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>;
const IconBulb    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3"/></svg>;
const IconShield  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944"/></svg>;
const IconList    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>;
const IconDollar  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
const IconAlert   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4M15 10h5"/></svg>;

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminDashboard: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("Overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [verifications, setVerifications] = useState<AdminVerification[]>([]);
  
  const c = getColors(darkMode);

  useEffect(() => {
    if (activeTab === "Overview") {
      fetch(`${API_BASE_URL}/admin/stats`, getAuthHeaders())
        .then(res => res.json())
        .then(data => setStats(data))
        .catch(err => console.error("Failed to fetch stats", err));
    } else if (activeTab === "Users") {
      fetchUsers();
    } else if (activeTab === "Vetting Gate") {
      fetchVerifications();
    }
  }, [activeTab]);

  const fetchUsers = () => {
    fetch(`${API_BASE_URL}/admin/users?limit=100`, getAuthHeaders())
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(err => console.error("Failed to fetch users", err));
  };

  const toggleUserStatus = async (userId: number, currentStatus: string) => {
    const endpoint = currentStatus === "suspended" ? "activate" : "suspend";
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/${endpoint}`, {
        method: "PATCH",
        ...getAuthHeaders()
      });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error("Failed to toggle status", err);
    }
  };

  const deleteUser = async (userId: number) => {
    if (!window.confirm("Are you sure you want to permanently delete this user? This action cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
        method: "DELETE",
        ...getAuthHeaders()
      });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error("Failed to delete user", err);
    }
  };

  const fetchVerifications = () => {
    fetch(`${API_BASE_URL}/admin/verifications`, getAuthHeaders())
      .then(res => res.json())
      .then(data => setVerifications(data))
      .catch(err => console.error("Failed to fetch verifications", err));
  };

  const processVerification = async (vId: number, action: "approve" | "reject") => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/verifications/${vId}/${action}`, {
        method: "PATCH",
        ...getAuthHeaders()
      });
      if (res.ok) fetchVerifications();
    } catch (err) {
      console.error(`Failed to ${action} verification`, err);
    }
  };

  const toggleTheme = () => {
    setDarkMode((d) => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  const thStyle: React.CSSProperties = { fontSize: 10, color: c.subtext, textAlign: "left", padding: "0 8px 8px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500, borderBottom: `0.5px solid ${c.border}` };
  const tdStyle: React.CSSProperties = { padding: "9px 8px", fontSize: 12, color: c.text, borderBottom: `0.5px solid ${c.border}` };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif", fontSize: 13 }}>

      {/* ── Top Bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>
          Skill<span style={{ color: c.primary }}>Link</span>
          <span style={{ fontSize: 10, color: c.subtext, marginLeft: 8, letterSpacing: ".08em" }}>ADMIN</span>
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
            >AD</div>
            {dropdownOpen && (
              <div style={{ position: "absolute", right: 0, top: 36, background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "6px 0", minWidth: 180, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,.15)" }}>
                <div style={{ padding: "6px 14px 8px", borderBottom: `0.5px solid ${c.border}`, marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>Admin Panel</div>
                  <div style={{ fontSize: 11, color: c.subtext }}>Super Admin</div>
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
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Platform</div>
          <NavItem label="Overview" active={activeTab === "Overview"} onClick={() => setActiveTab("Overview")} icon={<IconGrid />} colors={c} />
          <NavItem label="Users" active={activeTab === "Users"} onClick={() => setActiveTab("Users")} badge={stats ? stats.total_users : undefined} icon={<IconUsers />} colors={c} />
          <NavItem label="Projects" active={activeTab === "Projects"} onClick={() => setActiveTab("Projects")} badge={stats ? stats.total_projects : undefined} icon={<IconClip />} colors={c} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>AI Systems</div>
          <NavItem label="Match Engine" active={activeTab === "Match Engine"} onClick={() => setActiveTab("Match Engine")} icon={<IconBulb />} colors={c} />
          <NavItem label="Vetting Gate" active={activeTab === "Vetting Gate"} onClick={() => setActiveTab("Vetting Gate")} badge={18} icon={<IconShield />} colors={c} />
          <NavItem label="Audit Logs" active={activeTab === "Audit Logs"} onClick={() => setActiveTab("Audit Logs")} icon={<IconList />} colors={c} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Finance</div>
          <NavItem label="Revenue" active={activeTab === "Revenue"} onClick={() => setActiveTab("Revenue")} icon={<IconDollar />} colors={c} />
          <NavItem label="Disputes" active={activeTab === "Disputes"} onClick={() => setActiveTab("Disputes")} badge={3} icon={<IconAlert />} colors={c} />
          <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
            <div onClick={toggleTheme} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>Switch theme</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>Contact us</div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>
          {activeTab === "Overview" && (
            <>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Admin Overview</div>
              <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Platform health · Real-time · Apr 11, 2026</div>
            </div>
            <button style={{ background: "transparent", color: c.text, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Export report
            </button>
          </div>

          {/* Metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
            {[
              { label: "Total Users",      val: stats ? stats.total_users.toLocaleString() : "...", sub: stats ? `${stats.total_freelancers} freelancers · ${stats.total_clients} clients` : "Loading...", badge: <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">Live</Badge> },
              { label: "Active Projects",  val: stats ? stats.total_projects.toLocaleString() : "...",   sub: "Across the platform", badge: <Badge bg="#2a2640" color="#7F77DD" border="rgba(127,119,221,.2)">Active</Badge> },
              { label: "Contracts",        val: stats ? stats.total_contracts.toLocaleString() : "...",sub: "Total signed contracts", badge: <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">Active</Badge> },
              { label: "Pending Vetting",  val: <span style={{ color: "#f59e0b" }}>18</span>, sub: "awaiting AI Gate review", badge: <Badge bg="rgba(245,158,11,.1)" color="#f59e0b" border="rgba(245,158,11,.2)">Action needed</Badge> },
            ].map((m, i) => (
              <div key={i} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 10, color: c.subtext, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 500, color: c.text, lineHeight: 1 }}>{m.val}</div>
                <div style={{ fontSize: 11, color: c.subtext, marginTop: 5 }}>{m.sub}</div>
                {m.badge}
              </div>
            ))}
          </div>

          {/* Middle row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>

            {/* User management */}
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Recent User Signups</span>
                <span style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>Manage all →</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["User", "Role", "Status", "Action"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {RECENT_USERS.map((u) => {
                    const s = STATUS_COLORS[u.status];
                    const isSuspended = u.status === "Suspended";
                    return (
                      <tr key={u.name}>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 24, height: 24, borderRadius: "50%", background: u.bg, color: u.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500 }}>{u.initials}</div>
                            {u.name}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: u.role === "Client" ? "rgba(59,130,246,.15)" : c.primarySoft, color: u.role === "Client" ? "#3b82f6" : c.primary }}>{u.role}</span>
                        </td>
                        <td style={tdStyle}><Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{u.status}</Badge></td>
                        <td style={tdStyle}>
                          <button style={{ fontSize: 10, padding: "2px 8px", background: "transparent", color: isSuspended ? "#ef4444" : c.text, border: `0.5px solid ${isSuspended ? "#ef4444" : c.border}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                            {u.status === "Vetting" ? "Review" : isSuspended ? "Unsuspend" : "View"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* AI System Health */}
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>AI System Health</span>
                <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)" style={{ margin: 0 }}>All operational</Badge>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {AI_SYSTEMS.map((sys) => (
                  <div key={sys.label}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: c.text }}>{sys.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: sys.color }}>{sys.pct}%</span>
                    </div>
                    <div style={{ height: 5, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${sys.pct}%`, background: sys.color, borderRadius: 20 }} />
                    </div>
                  </div>
                ))}

                <div style={{ borderTop: `0.5px solid ${c.border}`, paddingTop: 12, marginTop: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: c.text, marginBottom: 8 }}>Flagged Items</div>
                  {FLAGGED.map((f) => (
                    <div key={f.title} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `0.5px solid ${c.border}` }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: f.color, marginTop: 4, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{f.title}</div>
                        <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{f.meta}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Workrooms table */}
          <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Top Workrooms by Activity</span>
              <span style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>Full analytics →</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["Workroom", "Client", "Freelancer", "Category", "Budget", "Status", "AI Score"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {WORKROOMS.map((w) => {
                  const s = STATUS_COLORS[w.status];
                  const scoreColor = w.score >= 90 ? "#22c55e" : w.score >= 75 ? "#f59e0b" : "#ef4444";
                  return (
                    <tr key={w.id}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{w.id}</td>
                      <td style={tdStyle}>{w.client}</td>
                      <td style={tdStyle}>{w.freelancer}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: c.primarySoft, color: c.primary }}>{w.category}</span>
                      </td>
                      <td style={tdStyle}>{w.budget}</td>
                      <td style={tdStyle}><Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{w.status}</Badge></td>
                      <td style={{ ...tdStyle, fontWeight: 500, color: scoreColor }}>{w.score}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
          )}
          
          {activeTab === "Users" && (
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, marginBottom: 16 }}>User Management</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["ID", "Email", "Role", "Status", "Joined", "Action"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {users.map((u) => {
                    const isSuspended = u.status === "suspended";
                    return (
                      <tr key={u.id}>
                        <td style={tdStyle}>{u.id}</td>
                        <td style={tdStyle}>{u.email}</td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: u.role === "client" ? "rgba(59,130,246,.15)" : c.primarySoft, color: u.role === "client" ? "#3b82f6" : c.primary }}>{u.role}</span>
                        </td>
                        <td style={tdStyle}>
                          <Badge bg={isSuspended ? "rgba(239,68,68,.1)" : "rgba(34,197,94,.12)"} color={isSuspended ? "#ef4444" : "#22c55e"} border={isSuspended ? "rgba(239,68,68,.2)" : "rgba(34,197,94,.2)"} style={{ margin: 0 }}>
                            {u.status}
                          </Badge>
                        </td>
                        <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td style={tdStyle}>
                          {u.role !== "admin" && (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => toggleUserStatus(u.id, u.status)} style={{ fontSize: 10, padding: "4px 10px", background: "transparent", color: isSuspended ? c.text : "#ef4444", border: `0.5px solid ${isSuspended ? c.border : "rgba(239,68,68,.4)"}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                                {isSuspended ? "Activate" : "Suspend"}
                              </button>
                              <button onClick={() => deleteUser(u.id)} style={{ fontSize: 10, padding: "4px 10px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && <tr><td colSpan={6} style={{...tdStyle, textAlign: "center", color: c.subtext}}>Loading users...</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          
          {activeTab === "Vetting Gate" && (
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, marginBottom: 16 }}>Vetting Gate: Identity Verifications</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["User", "Document Type", "Link", "Submitted", "Actions"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {verifications.map((v) => (
                    <tr key={v.id}>
                      <td style={tdStyle}>{v.email}</td>
                      <td style={tdStyle}>{v.document_type}</td>
                      <td style={tdStyle}>
                        <a href={v.document_url} target="_blank" rel="noopener noreferrer" style={{ color: c.primary, fontSize: 11 }}>View Document</a>
                      </td>
                      <td style={tdStyle}>{new Date(v.submitted_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => processVerification(v.id, "approve")} style={{ fontSize: 10, padding: "4px 10px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>Approve</button>
                          <button onClick={() => processVerification(v.id, "reject")} style={{ fontSize: 10, padding: "4px 10px", background: "transparent", color: "#ef4444", border: "0.5px solid rgba(239,68,68,.4)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {verifications.length === 0 && <tr><td colSpan={5} style={{...tdStyle, textAlign: "center", color: c.subtext}}>No pending verifications found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* ── Right Panel ── */}
        <aside style={{ width: 220, borderLeft: `0.5px solid ${c.border}`, background: c.surface, padding: 16, overflowY: "auto", flexShrink: 0 }}>
          {/* Admin profile */}
          <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: `0.5px solid ${c.border}`, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 500, margin: "0 auto 8px" }}>AD</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>Admin Panel</div>
            <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>SkillLink Platform</div>
            <Badge bg={c.primarySoft} color={c.primary} border="rgba(127,119,221,.2)" style={{ marginTop: 8 }}>Super Admin</Badge>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 12 }}>
              {[{ val: stats ? stats.total_users.toLocaleString() : "...", label: "USERS", color: c.text }, { val: stats ? stats.total_projects.toLocaleString() : "...", label: "PROJECTS", color: "#22c55e" }].map((s) => (
                <div key={s.label} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 9, color: c.subtext }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform stats */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 8 }}>Platform stats</div>
          {PLATFORM_STATS.map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `0.5px solid ${c.border}`, fontSize: 12 }}>
              <span style={{ color: c.subtext }}>{s.label}</span>
              <span style={{ fontWeight: 500, color: s.color ?? c.text }}>{s.value}</span>
            </div>
          ))}

          {/* Recent actions */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginTop: 16, marginBottom: 8 }}>Recent actions</div>
          {RECENT_ACTIONS.map((a) => (
            <div key={a.title} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `0.5px solid ${c.border}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{a.title}</div>
                <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{a.meta}</div>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
};

export default AdminDashboard;
