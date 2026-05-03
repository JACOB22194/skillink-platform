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

interface SystemLog {
  log_id: number;
  action: string;
  performed_by: number;
  timestamp: string;
}

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
  const [recentUsers, setRecentUsers] = useState<AdminUserItem[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [aiMetrics, setAiMetrics] = useState<any>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [resolveModal, setResolveModal] = useState<{ id: number; contractId: number } | null>(null);
  const [resolveForm, setResolveForm] = useState({ resolution: "release_to_freelancer", note: "", split: "" });
  const [resolveLoading, setResolveLoading] = useState(false);

  const c = getColors(darkMode);

  useEffect(() => {
    // Fetch stats on mount and when activeTab changes
    fetch(`${API_BASE_URL}/admin/stats`, getAuthHeaders())
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error("Failed to fetch stats", err));

    // Fetch recent users for overview
    fetch(`${API_BASE_URL}/admin/users?limit=5`, getAuthHeaders())
      .then(res => res.json())
      .then(data => setRecentUsers(data))
      .catch(err => console.error("Failed to fetch recent users", err));

    // Fetch system logs for recent actions
    fetch(`${API_BASE_URL}/admin/logs?limit=3`, getAuthHeaders())
      .then(res => res.json())
      .then(data => setSystemLogs(data || []))
      .catch(err => console.error("Failed to fetch logs", err));

    // Fetch contracts for workrooms
    fetch(`${API_BASE_URL}/admin/contracts?limit=4`, getAuthHeaders())
      .then(res => res.json())
      .then(data => setContracts(data || []))
      .catch(err => console.error("Failed to fetch contracts", err));

    // Fetch projects
    fetch(`${API_BASE_URL}/admin/projects?limit=10`, getAuthHeaders())
      .then(res => res.json())
      .then(data => setProjects(data || []))
      .catch(err => console.error("Failed to fetch projects", err));

    // Fetch AI metrics
    fetch(`${API_BASE_URL}/admin/ai-metrics`, getAuthHeaders())
      .then(res => res.json())
      .then(data => setAiMetrics(data))
      .catch(err => console.error("Failed to fetch AI metrics", err));
  }, []);

  useEffect(() => {
    if (activeTab === "Users") {
      fetchUsers();
    } else if (activeTab === "Vetting Gate") {
      fetchVerifications();
    } else if (activeTab === "Audit Logs") {
      fetch(`${API_BASE_URL}/admin/logs?limit=50`, getAuthHeaders())
        .then(res => res.json())
        .then(data => setSystemLogs(data || []))
        .catch(err => console.error("Failed to fetch logs", err));
    } else if (activeTab === "Revenue") {
      fetch(`${API_BASE_URL}/admin/revenue`, getAuthHeaders())
        .then(res => res.json())
        .then(data => setRevenue(data))
        .catch(err => console.error("Failed to fetch revenue", err));
    } else if (activeTab === "Disputes") {
      fetch(`${API_BASE_URL}/admin/disputes`, getAuthHeaders())
        .then(res => res.json())
        .then(data => setDisputes(data || []))
        .catch(err => console.error("Failed to fetch disputes", err));
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

  const submitResolve = async () => {
    if (!resolveModal || !resolveForm.note.trim()) return;
    setResolveLoading(true);
    try {
      const body: any = { resolution: resolveForm.resolution, note: resolveForm.note };
      if (resolveForm.resolution === "split" && resolveForm.split) body.split_percentage = parseFloat(resolveForm.split);
      const res = await fetch(`${API_BASE_URL}/admin/disputes/${resolveModal.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders().headers },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setResolveModal(null);
        setResolveForm({ resolution: "release_to_freelancer", note: "", split: "" });
        const data = await fetch(`${API_BASE_URL}/admin/disputes`, getAuthHeaders()).then(r => r.json());
        setDisputes(data || []);
      }
    } catch (err) {
      console.error("Failed to resolve dispute", err);
    }
    setResolveLoading(false);
  };

  const toggleTheme = () => {
    setDarkMode((d) => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  // Helper to get initials from email
  const getInitials = (email: string): string => {
    const parts = email.split("@")[0].split(".");
    return parts.map((p: string) => p[0]).join("").toUpperCase().slice(0, 2);
  };

  // Helper to get user background color based on role/status
  const getUserBg = (role: string): { bg: string; color: string } => {
    if (role === "client") return { bg: "rgba(59,130,246,.15)", color: "#3b82f6" };
    return { bg: "#2a2640", color: "#7F77DD" };
  };

  // Helper to format time ago
  const formatTimeAgo = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
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
          <NavItem label="Vetting Gate" active={activeTab === "Vetting Gate"} onClick={() => setActiveTab("Vetting Gate")} badge={verifications.length} icon={<IconShield />} colors={c} />
          <NavItem label="Audit Logs" active={activeTab === "Audit Logs"} onClick={() => setActiveTab("Audit Logs")} icon={<IconList />} colors={c} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Finance</div>
          <NavItem label="Revenue" active={activeTab === "Revenue"} onClick={() => setActiveTab("Revenue")} icon={<IconDollar />} colors={c} />
          <NavItem label="Disputes" active={activeTab === "Disputes"} onClick={() => setActiveTab("Disputes")} badge={disputes.length} icon={<IconAlert />} colors={c} />
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
              { label: "Pending Vetting",  val: <span style={{ color: "#f59e0b" }}>{verifications.length}</span>, sub: "awaiting AI Gate review", badge: <Badge bg="rgba(245,158,11,.1)" color="#f59e0b" border="rgba(245,158,11,.2)">Action needed</Badge> },
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
                  {recentUsers.map((u) => {
                    const s = STATUS_COLORS[u.status === "suspended" ? "Suspended" : u.status === "active" ? "Active" : "Vetting"];
                    const userBg = getUserBg(u.role);
                    const isSuspended = u.status === "suspended";
                    return (
                      <tr key={u.id}>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 24, height: 24, borderRadius: "50%", background: userBg.bg, color: userBg.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500 }}>{getInitials(u.email)}</div>
                            {u.email}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: u.role === "client" ? "rgba(59,130,246,.15)" : c.primarySoft, color: u.role === "client" ? "#3b82f6" : c.primary }}>{u.role}</span>
                        </td>
                        <td style={tdStyle}><Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{u.status}</Badge></td>
                        <td style={tdStyle}>
                          <button style={{ fontSize: 10, padding: "2px 8px", background: "transparent", color: isSuspended ? "#ef4444" : c.text, border: `0.5px solid ${isSuspended ? "#ef4444" : c.border}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                            {u.status === "vetting" ? "Review" : isSuspended ? "Unsuspend" : "View"}
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
                {aiMetrics && [
                  { label: "Match Engine accuracy",       pct: aiMetrics.match_engine_accuracy, color: "#22c55e" },
                  { label: "Vetting Gate pass rate",      pct: aiMetrics.vetting_gate_pass_rate, color: "#7F77DD" },
                  { label: "Trust Score confidence",      pct: aiMetrics.trust_score_confidence, color: "#3b82f6" },
                  { label: "Proposal AI acceptance rate", pct: aiMetrics.proposal_acceptance_rate, color: "#f59e0b" },
                ].map((sys) => (
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
                  {[
                    { title: "Suspicious activity",  meta: "Multiple failed vetting attempts", color: "#ef4444" },
                    { title: "Review conflict",      meta: "Client dispute lodged",            color: "#f59e0b" },
                    { title: "Low match confidence", meta: "Below threshold · manual review",  color: "#f59e0b" },
                  ].map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `0.5px solid ${c.border}` }}>
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
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{...tdStyle, textAlign: "center", color: c.subtext}}>No active contracts yet.</td>
                  </tr>
                ) : (
                  contracts.map((w, i) => {
                    const s = STATUS_COLORS[w.status === "suspended" ? "Suspended" : w.status === "in_progress" ? "Active" : w.status === "completed" ? "Active" : "Review"];
                    const scoreColor = w.score >= 90 ? "#22c55e" : w.score >= 75 ? "#f59e0b" : "#ef4444";
                    return (
                      <tr key={i}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>#{w.id}</td>
                        <td style={tdStyle}>{w.client_name || "N/A"}</td>
                        <td style={tdStyle}>{w.freelancer_name || "N/A"}</td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: c.primarySoft, color: c.primary }}>{w.category || "General"}</span>
                        </td>
                        <td style={tdStyle}>${w.total_fee || 0}</td>
                        <td style={tdStyle}><Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{w.status || "pending"}</Badge></td>
                        <td style={{ ...tdStyle, fontWeight: 500, color: scoreColor }}>N/A</td>
                      </tr>
                    );
                  })
                )}
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
          
          {activeTab === "Match Engine" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 500, color: c.text }}>Match Engine</div>
                <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>AI-powered freelancer matching system health</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 12 }}>
                {aiMetrics ? [
                  { label: "Match Engine accuracy",       pct: aiMetrics.match_engine_accuracy, color: "#22c55e" },
                  { label: "Vetting Gate pass rate",      pct: aiMetrics.vetting_gate_pass_rate, color: "#7F77DD" },
                  { label: "Trust Score confidence",      pct: aiMetrics.trust_score_confidence, color: "#3b82f6" },
                  { label: "Proposal AI acceptance rate", pct: aiMetrics.proposal_acceptance_rate, color: "#f59e0b" },
                ].map(sys => (
                  <div key={sys.label} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: c.text }}>{sys.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: sys.color }}>{sys.pct}%</span>
                    </div>
                    <div style={{ height: 6, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${sys.pct}%`, background: sys.color, borderRadius: 20 }} />
                    </div>
                  </div>
                )) : (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", color: c.subtext }}>Loading metrics...</div>
                )}
              </div>
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 12 }}>System Stats</div>
                {aiMetrics && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
                    <div style={{ background: c.bg, padding: 12, borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: "#22c55e" }}>{aiMetrics.total_proposals}</div>
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>Total Proposals</div>
                    </div>
                    <div style={{ background: c.bg, padding: 12, borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: "#3b82f6" }}>{aiMetrics.accepted_proposals}</div>
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>Accepted</div>
                    </div>
                    <div style={{ background: c.bg, padding: 12, borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: "#7F77DD" }}>{aiMetrics.active_contracts}</div>
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>Active Contracts</div>
                    </div>
                    <div style={{ background: c.bg, padding: 12, borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: "#f59e0b" }}>{aiMetrics.approved_verifications}</div>
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>Verified Users</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "Projects" && (
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, marginBottom: 16 }}>Project Management</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["ID", "Title", "Client", "Status", "Budget", "Proposals", "Category", "Created"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {projects.map((p) => {
                    const statusColor = p.status === "open" ? "rgba(34,197,94,.12)" : p.status === "in_progress" ? "rgba(59,130,246,.15)" : "rgba(239,68,68,.1)";
                    const statusTextColor = p.status === "open" ? "#22c55e" : p.status === "in_progress" ? "#3b82f6" : "#ef4444";
                    return (
                      <tr key={p.id}>
                        <td style={tdStyle}>{p.id}</td>
                        <td style={tdStyle}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                        </td>
                        <td style={tdStyle}>{p.client_name}</td>
                        <td style={tdStyle}>
                          <Badge bg={statusColor} color={statusTextColor} border={statusColor} style={{ margin: 0 }}>
                            {p.status}
                          </Badge>
                        </td>
                        <td style={tdStyle}>${p.budget.toLocaleString()}</td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: c.primary }}>{p.proposal_count}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: c.primarySoft, color: c.primary }}>{p.category}</span>
                        </td>
                        <td style={tdStyle}>{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                  {projects.length === 0 && <tr><td colSpan={8} style={{...tdStyle, textAlign: "center", color: c.subtext}}>No projects found.</td></tr>}
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

          {activeTab === "Audit Logs" && (
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, marginBottom: 16 }}>System Audit Logs</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Timestamp", "Action", "Performed By", "Details"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {systemLogs.map((log) => (
                    <tr key={log.log_id}>
                      <td style={tdStyle}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{...tdStyle, fontSize: 11}}>{log.action}</td>
                      <td style={tdStyle}>{log.performed_by || "System"}</td>
                      <td style={{...tdStyle, fontSize: 10, color: c.subtext}}>{log.action.substring(0, 50)}...</td>
                    </tr>
                  ))}
                  {systemLogs.length === 0 && <tr><td colSpan={4} style={{...tdStyle, textAlign: "center", color: c.subtext}}>No logs found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "Revenue" && (
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, marginBottom: 16 }}>Revenue Analytics</div>
              {revenue ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  <div style={{ background: c.bg, padding: 16, borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 600, color: "#22c55e" }}>${(revenue.total_revenue || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>Total Revenue</div>
                  </div>
                  <div style={{ background: c.bg, padding: 16, borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 600, color: "#3b82f6" }}>${(revenue.monthly_revenue || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>This Month</div>
                  </div>
                  <div style={{ background: c.bg, padding: 16, borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 600, color: "#7F77DD" }}>${(revenue.pending_revenue || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>Pending</div>
                  </div>
                </div>
              ) : null}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Contract ID", "Amount", "Status", "Date"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {revenue?.transactions?.map((t: any) => (
                    <tr key={t.id}>
                      <td style={tdStyle}>{t.contract_id}</td>
                      <td style={tdStyle}>${t.amount.toLocaleString()}</td>
                      <td style={tdStyle}><Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)" style={{margin:0}}>{t.status}</Badge></td>
                      <td style={tdStyle}>{new Date(t.date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {!revenue?.transactions?.length && <tr><td colSpan={4} style={{...tdStyle, textAlign: "center", color: c.subtext}}>No transactions.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "Disputes" && (
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, marginBottom: 16 }}>Open Disputes</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["ID", "Contract", "Initiator", "Reason", "Status", "Opened", "Action"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {disputes.map((d: any) => (
                    <tr key={d.id}>
                      <td style={{...tdStyle, fontWeight: 500}}>{d.id}</td>
                      <td style={tdStyle}>{d.contract_id}</td>
                      <td style={tdStyle}>{d.initiator}</td>
                      <td style={{...tdStyle, fontSize: 11}}>{d.reason?.substring(0, 40) || "N/A"}</td>
                      <td style={tdStyle}><Badge bg={d.status==="open"?"rgba(239,68,68,.1)":"rgba(34,197,94,.12)"} color={d.status==="open"?"#ef4444":"#22c55e"} border={d.status==="open"?"rgba(239,68,68,.2)":"rgba(34,197,94,.2)"} style={{margin:0}}>{d.status}</Badge></td>
                      <td style={tdStyle}>{d.opened_at ? new Date(d.opened_at).toLocaleDateString() : "—"}</td>
                      <td style={tdStyle}>
                        {d.status === "open" && (
                          <button onClick={() => setResolveModal({ id: d.id, contractId: d.contract_id })} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: c.primarySoft, color: c.primary, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Resolve</button>
                        )}
                        {d.status === "resolved" && <span style={{ fontSize: 11, color: c.subtext }}>{d.resolution_note?.substring(0, 30) || "Resolved"}</span>}
                      </td>
                    </tr>
                  ))}
                  {disputes.length === 0 && <tr><td colSpan={7} style={{...tdStyle, textAlign: "center", color: c.subtext}}>No disputes.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* Resolve Dispute Modal */}
        {resolveModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 28, width: 420, maxWidth: "90vw" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 4 }}>Resolve Dispute #{resolveModal.id}</div>
              <div style={{ fontSize: 12, color: c.subtext, marginBottom: 20 }}>Contract #{resolveModal.contractId}</div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em" }}>Resolution</label>
                <select value={resolveForm.resolution} onChange={e => setResolveForm(f => ({...f, resolution: e.target.value}))} style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13 }}>
                  <option value="release_to_freelancer">Release to Freelancer</option>
                  <option value="refund_to_client">Refund to Client</option>
                  <option value="split">Split</option>
                </select>
              </div>
              {resolveForm.resolution === "split" && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em" }}>Freelancer % (0–100)</label>
                  <input type="number" min="0" max="100" value={resolveForm.split} onChange={e => setResolveForm(f => ({...f, split: e.target.value}))} placeholder="e.g. 50" style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13 }} />
                </div>
              )}
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em" }}>Resolution Note</label>
                <textarea value={resolveForm.note} onChange={e => setResolveForm(f => ({...f, note: e.target.value}))} placeholder="Explain the resolution decision..." rows={3} style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setResolveModal(null)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.subtext, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button onClick={submitResolve} disabled={resolveLoading || !resolveForm.note.trim()} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: resolveLoading || !resolveForm.note.trim() ? 0.6 : 1 }}>
                  {resolveLoading ? "Resolving…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

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
          {stats && [
            { label: "Total freelancers", value: stats.total_freelancers.toLocaleString() },
            { label: "Total clients", value: stats.total_clients.toLocaleString() },
            { label: "Verified users", value: stats.total_users.toLocaleString() },
            { label: "Pending vetting", value: verifications.length.toString(), color: "#f59e0b" },
            { label: "Open disputes", value: disputes.length.toString(), color: "#ef4444" },
            { label: "Avg match score", value: aiMetrics?.match_engine_accuracy ? `${aiMetrics.match_engine_accuracy}%` : "N/A", color: "#7F77DD" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `0.5px solid ${c.border}`, fontSize: 12 }}>
              <span style={{ color: c.subtext }}>{s.label}</span>
              <span style={{ fontWeight: 500, color: s.color ?? c.text }}>{s.value}</span>
            </div>
          ))}

          {/* Recent actions */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginTop: 16, marginBottom: 8 }}>Recent actions</div>
          {systemLogs.map((a) => {
            const actionColor = a.action.includes("suspended") ? "#ef4444" : a.action.includes("activated") ? "#22c55e" : "#7F77DD";
            return (
              <div key={a.log_id} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `0.5px solid ${c.border}` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: actionColor, marginTop: 4, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{a.action.split("[")[0]?.trim() || a.action}</div>
                  <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{formatTimeAgo(a.timestamp)}</div>
                </div>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
};

export default AdminDashboard;