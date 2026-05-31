import React, { useState, useEffect } from "react";
import { API_BASE_URL, getAuthHeaders, logout } from "../shared/api";
import { useLanguage, LangToggle } from "../shared/LanguageContext";

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

interface RoleConfig {
  id: number;
  role_name: string;
  display_name: string;
  description: string;
  permissions: string; // JSON array string
  updated_at: string;
}

interface SystemHealthData {
  uptime_seconds: number;
  uptime_pct: number;
  db_latency_ms: number;
  error_rate_pct: number;
  errors_24h: number;
  total_logs_24h: number;
  recent_transactions: Array<{
    id: number;
    freelancer_id: number;
    amount: number;
    type: string;
    description: string;
    timestamp: string;
  }>;
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Vetting:   { bg: "rgba(245,158,11,.1)",  color: "#f59e0b", border: "rgba(245,158,11,.2)" },
  Active:    { bg: "rgba(34,197,94,.12)",  color: "#22c55e", border: "rgba(34,197,94,.2)"  },
  Suspended: { bg: "rgba(239,68,68,.1)",   color: "#ef4444", border: "rgba(239,68,68,.2)"  },
  Review:    { bg: "rgba(245,158,11,.1)",  color: "#f59e0b", border: "rgba(245,158,11,.2)" },
};

// ─── Helper ───────────────────────────────────────────────────────────────────

const KNOWN_PERMISSIONS = [
  { key: "submit_proposals",    label: "Submit Proposals" },
  { key: "view_projects",       label: "View Projects" },
  { key: "manage_milestones",   label: "Manage Milestones" },
  { key: "withdraw_wallet",     label: "Withdraw Wallet" },
  { key: "view_ai_matches",     label: "View AI Matches" },
  { key: "post_projects",       label: "Post Projects" },
  { key: "accept_proposals",    label: "Accept Proposals" },
  { key: "fund_escrow",         label: "Fund Escrow" },
  { key: "open_disputes",       label: "Open Disputes" },
  { key: "review_freelancers",  label: "Review Freelancers" },
  { key: "manage_users",        label: "Manage Users" },
  { key: "manage_roles",        label: "Manage Roles" },
  { key: "resolve_disputes",    label: "Resolve Disputes" },
  { key: "view_analytics",      label: "View Analytics" },
  { key: "configure_ai",        label: "Configure AI" },
  { key: "manage_verifications",label: "Manage Verifications" },
];

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
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "8px 16px",
        color: active ? colors.primary : colors.subtext,
        borderLeft: `2px solid ${active ? colors.primary : "transparent"}`,
        background: active ? colors.bg : "transparent",
        cursor: "pointer", fontSize: 12,
      }}
    >
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
const IconKey     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="15" r="4"/><path d="M11.828 11.172l8.586-8.586M19.5 3l1.5 1.5-1.5 1.5-1.5-1.5zm-3 3l1.5 1.5"/></svg>;
const IconChart   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const IconCog     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
const IconSwitch  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>;
const IconBell    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>;

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminDashboard: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const fontFamily = isRTL ? "'Cairo', sans-serif" : "sans-serif";

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
  const [logFilters, setLogFilters] = useState({ userId: "", keyword: "" });
  const [logView, setLogView] = useState<"active" | "archived">("active");
  const [archivedLogs, setArchivedLogs] = useState<any[]>([]);
  const [archiveDays, setArchiveDays] = useState("30");
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [aiMetrics, setAiMetrics] = useState<any>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [revFilters, setRevFilters] = useState({ dateFrom: "", dateTo: "", txType: "", txStatus: "" });
  const [resolveModal, setResolveModal] = useState<{ id: number; contractId: number } | null>(null);
  const [resolveForm, setResolveForm] = useState({ resolution: "release_to_freelancer", note: "", split: "" });
  const [resolveLoading, setResolveLoading] = useState(false);
  const [roleConfigs, setRoleConfigs] = useState<RoleConfig[]>([]);
  const [changeRoleModal, setChangeRoleModal] = useState<{ userId: number; userEmail: string; currentRole: string } | null>(null);
  const [changeRoleValue, setChangeRoleValue] = useState<string>("");
  const [editRoleModal, setEditRoleModal] = useState<RoleConfig | null>(null);
  const [editRoleForm, setEditRoleForm] = useState({ description: "", permissions: "" });
  const [roleActionLoading, setRoleActionLoading] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthData | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState<"market-trends" | "skill-demand" | "fairness">("market-trends");
  const [marketTrends, setMarketTrends] = useState<any>(null);
  const [skillDemand, setSkillDemand] = useState<any>(null);
  const [fairnessReport, setFairnessReport] = useState<any>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  // ADM-04: AI Config
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [aiConfigSaving, setAiConfigSaving] = useState(false);
  const [aiConfigMsg, setAiConfigMsg] = useState<string | null>(null);
  // ADM-05: Dispute AI summaries
  const [disputeAiSummary, setDisputeAiSummary] = useState<Record<number, any>>({});
  const [disputeAiLoading, setDisputeAiLoading] = useState<number | null>(null);
  // ADM-06: Manual Overrides
  const [overrideMatchForm, setOverrideMatchForm] = useState({ projectId: "", freelancerUserId: "" });
  const [overrideMatchLoading, setOverrideMatchLoading] = useState(false);
  const [overrideMatchMsg, setOverrideMatchMsg] = useState<string | null>(null);
  const [reversalForm, setReversalForm] = useState({ transactionId: "", reason: "" });
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalMsg, setReversalMsg] = useState<string | null>(null);
  // ADM-06: Force Payment Release
  const [releaseEscrowForm, setReleaseEscrowForm] = useState({ contractId: "", reason: "" });
  const [releaseEscrowLoading, setReleaseEscrowLoading] = useState(false);
  const [releaseEscrowMsg, setReleaseEscrowMsg] = useState<string | null>(null);
  // ADM-06: Adjust Trust Score
  const [trustScoreForm, setTrustScoreForm] = useState({ userId: "", score: "" });
  const [trustScoreLoading, setTrustScoreLoading] = useState(false);
  const [trustScoreMsg, setTrustScoreMsg] = useState<string | null>(null);
  // ADM-08: Alerts
  const [alertsData, setAlertsData] = useState<any>(null);
  const [alertFilters, setAlertFilters] = useState({ severity: "", component: "" });
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [expiringUsers, setExpiringUsers] = useState<any[]>([]);
  const [subActionMsg, setSubActionMsg] = useState<{ [uid: number]: string }>({});
  const [subActionLoading, setSubActionLoading] = useState<{ [uid: number]: string }>({});
  // ADM-01: Create User
  const [createUserModal, setCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ email: "", password: "", role: "freelancer", company_name: "" });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserMsg, setCreateUserMsg] = useState<string | null>(null);
  // ADM-01: Edit User Profile
  const [editUserModal, setEditUserModal] = useState<{ id: number; email: string; status: string } | null>(null);
  const [editUserForm, setEditUserForm] = useState({ email: "", status: "" });
  const [editUserLoading, setEditUserLoading] = useState(false);
  const [editUserMsg, setEditUserMsg] = useState<string | null>(null);
  // ADM-01: Create Role
  const [createRoleModal, setCreateRoleModal] = useState(false);
  const [createRoleForm, setCreateRoleForm] = useState({ role_name: "", display_name: "", description: "", permissions: "" });
  const [createRoleLoading, setCreateRoleLoading] = useState(false);
  const [createRoleMsg, setCreateRoleMsg] = useState<string | null>(null);

  const c = getColors(darkMode);

  const fetchOverviewData = () => {
    const token = localStorage.getItem("access_token");
    if (!token) { logout(); return; }
    const hdrs = { headers: { Authorization: `Bearer ${token}` } };
    const safeGet = (url: string) =>
      fetch(url, hdrs).then(res => { if (res.status === 401) { logout(); return null; } return res.ok ? res.json() : null; }).catch(() => null);

    safeGet(`${API_BASE_URL}/admin/stats`)
      .then(data => { if (data && typeof data.total_users === "number") setStats(data); });
    safeGet(`${API_BASE_URL}/admin/users?limit=5`)
      .then(data => { if (Array.isArray(data)) setRecentUsers(data); });
    safeGet(`${API_BASE_URL}/admin/logs?limit=3`)
      .then(data => { if (Array.isArray(data)) setSystemLogs(data); });
    safeGet(`${API_BASE_URL}/admin/contracts?limit=4`)
      .then(data => { if (Array.isArray(data)) setContracts(data); });
    safeGet(`${API_BASE_URL}/admin/projects?limit=10`)
      .then(data => { if (Array.isArray(data)) setProjects(data); });
    safeGet(`${API_BASE_URL}/admin/ai-metrics`)
      .then(data => { if (data && typeof data.match_engine_accuracy === "number") setAiMetrics(data); });
    safeGet(`${API_BASE_URL}/health/detailed`)
      .then(data => { if (data && typeof data.status === "string") setHealthData(data); })
      .catch(() => {});
    safeGet(`${API_BASE_URL}/admin/system-health`)
      .then(data => { if (data && typeof data.uptime_seconds === "number") setSystemHealth(data); });
    safeGet(`${API_BASE_URL}/admin/verifications`)
      .then(data => { if (Array.isArray(data)) setVerifications(data); });
    setLastRefreshed(new Date());
  };

  useEffect(() => {
    fetchOverviewData();
    const interval = setInterval(fetchOverviewData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLogsFiltered = (filters?: { userId: string; keyword: string }) => {
    const f = filters ?? logFilters;
    const params = new URLSearchParams({ limit: "100" });
    if (f.userId.trim()) params.set("user_id", f.userId.trim());
    if (f.keyword.trim()) params.set("keyword", f.keyword.trim());
    fetch(`${API_BASE_URL}/admin/logs?${params}`, getAuthHeaders())
      .then(res => res.json()).then(data => setSystemLogs(data || [])).catch(() => {});
  };

  const fetchArchivedLogs = () => {
    const params = new URLSearchParams({ limit: "100" });
    if (logFilters.userId.trim()) params.set("user_id", logFilters.userId.trim());
    if (logFilters.keyword.trim()) params.set("keyword", logFilters.keyword.trim());
    fetch(`${API_BASE_URL}/admin/logs/archive?${params}`, getAuthHeaders())
      .then(res => res.json()).then(data => setArchivedLogs(data || [])).catch(() => {});
  };

  const fetchAlerts = (filters = alertFilters) => {
    const p = new URLSearchParams();
    if (filters.severity)  p.set("severity",  filters.severity);
    if (filters.component) p.set("component", filters.component);
    fetch(`${API_BASE_URL}/admin/alerts?${p}`, getAuthHeaders())
      .then(r => r.json()).then(d => setAlertsData(d)).catch(() => {});
  };

  const fetchExpiringUsers = () => {
    fetch(`${API_BASE_URL}/admin/subscriptions/expiring`, getAuthHeaders())
      .then(r => r.json()).then(d => setExpiringUsers(d.expiring || [])).catch(() => {});
  };

  const cancelSubscription = async (userId: number) => {
    setSubActionLoading(p => ({ ...p, [userId]: "cancel" }));
    const res = await fetch(`${API_BASE_URL}/admin/subscriptions/${userId}/cancel`, { method: "POST", ...getAuthHeaders() });
    const d = await res.json().catch(() => ({}));
    setSubActionMsg(p => ({ ...p, [userId]: res.ok ? "Cancelled" : (d.detail || "Error") }));
    setSubActionLoading(p => ({ ...p, [userId]: "" }));
    if (res.ok) fetchExpiringUsers();
  };

  const notifyUser = async (userId: number) => {
    setSubActionLoading(p => ({ ...p, [userId]: "notify" }));
    const res = await fetch(`${API_BASE_URL}/admin/subscriptions/${userId}/notify`, { method: "POST", ...getAuthHeaders() });
    const d = await res.json().catch(() => ({}));
    setSubActionMsg(p => ({ ...p, [userId]: res.ok ? "Reminder sent!" : (d.detail || "Error") }));
    setSubActionLoading(p => ({ ...p, [userId]: "" }));
  };

  const fetchRevenue = (filters = revFilters) => {
    const p = new URLSearchParams();
    if (filters.dateFrom) p.set("date_from", filters.dateFrom);
    if (filters.dateTo)   p.set("date_to",   filters.dateTo);
    if (filters.txType)   p.set("tx_type",   filters.txType);
    if (filters.txStatus) p.set("tx_status", filters.txStatus);
    fetch(`${API_BASE_URL}/admin/revenue?${p}`, getAuthHeaders())
      .then(r => r.json()).then(d => setRevenue(d)).catch(() => {});
  };

  const submitArchive = async () => {
    setArchiveLoading(true); setArchiveMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/logs/archive`, {
        method: "POST", ...getAuthHeaders(),
        body: JSON.stringify({ older_than_days: Number(archiveDays) || 30 }),
      });
      const data = await res.json();
      setArchiveMsg(res.ok ? data.message : (data.detail || "Archive failed."));
      if (res.ok) fetchLogsFiltered();
    } catch { setArchiveMsg("Network error."); }
    setArchiveLoading(false);
  };

  useEffect(() => {
    if (activeTab === "Users") {
      fetchUsers();
    } else if (activeTab === "Vetting Gate") {
      fetchVerifications();
    } else if (activeTab === "Audit Logs") {
      fetchLogsFiltered();
    } else if (activeTab === "Revenue") {
      fetchRevenue();
    } else if (activeTab === "Disputes") {
      fetch(`${API_BASE_URL}/admin/disputes`, getAuthHeaders())
        .then(res => res.json())
        .then(data => setDisputes(data || []))
        .catch(err => console.error("Failed to fetch disputes", err));
    } else if (activeTab === "Roles") {
      fetchRoles();
    } else if (activeTab === "Analytics") {
      fetchAllAnalytics();
    } else if (activeTab === "AI Config" || activeTab === "Match Engine") {
      fetch(`${API_BASE_URL}/admin/ai-config`, getAuthHeaders())
        .then(r => r.json()).then(d => setAiConfig(d)).catch(() => {});
    } else if (activeTab === "Alerts") {
      fetchAlerts();
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

  const fetchRoles = () => {
    fetch(`${API_BASE_URL}/admin/roles`, getAuthHeaders())
      .then(res => res.json())
      .then(data => setRoleConfigs(data || []))
      .catch(err => console.error("Failed to fetch roles", err));
  };

  const changeUserRole = async () => {
    if (!changeRoleModal || !changeRoleValue) return;
    setRoleActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${changeRoleModal.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders().headers },
        body: JSON.stringify({ role: changeRoleValue }),
      });
      if (res.ok) {
        setChangeRoleModal(null);
        fetchUsers();
      }
    } catch (err) {
      console.error("Failed to change role", err);
    }
    setRoleActionLoading(false);
  };

  const updateRoleConfig = async () => {
    if (!editRoleModal) return;
    setRoleActionLoading(true);
    try {
      const perms = editRoleForm.permissions.split(",").map(s => s.trim()).filter(Boolean);
      const res = await fetch(`${API_BASE_URL}/admin/roles/${editRoleModal.role_name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders().headers },
        body: JSON.stringify({ description: editRoleForm.description, permissions: perms }),
      });
      if (res.ok) {
        setEditRoleModal(null);
        fetchRoles();
      }
    } catch (err) {
      console.error("Failed to update role config", err);
    }
    setRoleActionLoading(false);
  };

  const fetchAllAnalytics = () => {
    fetch(`${API_BASE_URL}/admin/analytics/market-trends`, getAuthHeaders())
      .then(r => r.json()).then(d => setMarketTrends(d)).catch(() => {});
    fetch(`${API_BASE_URL}/admin/analytics/skill-demand`, getAuthHeaders())
      .then(r => r.json()).then(d => setSkillDemand(d)).catch(() => {});
    fetch(`${API_BASE_URL}/admin/analytics/fairness`, getAuthHeaders())
      .then(r => r.json()).then(d => setFairnessReport(d)).catch(() => {});
  };

  const exportCSV = async (report: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/analytics/export?report=${report}`, getAuthHeaders());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export failed", err);
    }
  };

  const exportPDF = async (report: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/analytics/export-pdf?report=${report}`, getAuthHeaders());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed", err);
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

  const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
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

  // ADM-04: save AI config
  const saveAiConfig = async () => {
    setAiConfigSaving(true); setAiConfigMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/ai-config`, { method: "PUT", ...getAuthHeaders(), body: JSON.stringify(aiConfig) });
      const data = await res.json();
      setAiConfigMsg(res.ok ? "Saved successfully." : (data.detail || "Save failed."));
    } catch { setAiConfigMsg("Network error."); }
    setAiConfigSaving(false);
  };

  // ADM-05: fetch dispute AI summary
  const fetchDisputeAiSummary = async (id: number) => {
    setDisputeAiLoading(id);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/disputes/${id}/ai-summary`, getAuthHeaders());
      const data = await res.json();
      setDisputeAiSummary((prev: Record<number, any>) => ({ ...prev, [id]: data }));
    } catch { /* silent */ }
    setDisputeAiLoading(null);
  };

  // ADM-06: submit match override
  const submitOverrideMatch = async () => {
    setOverrideMatchLoading(true); setOverrideMatchMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/overrides/match`, {
        method: "POST", ...getAuthHeaders(),
        body: JSON.stringify({ project_id: Number(overrideMatchForm.projectId), freelancer_user_id: Number(overrideMatchForm.freelancerUserId) }),
      });
      const data = await res.json();
      setOverrideMatchMsg(res.ok ? data.message : (data.detail || "Error."));
      if (res.ok) setOverrideMatchForm({ projectId: "", freelancerUserId: "" });
    } catch { setOverrideMatchMsg("Network error."); }
    setOverrideMatchLoading(false);
  };

  // ADM-01: create user account
  const createUser = async () => {
    setCreateUserLoading(true); setCreateUserMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders().headers },
        body: JSON.stringify(createUserForm),
      });
      const data = await res.json();
      if (res.ok) {
        setCreateUserMsg(`User ${createUserForm.email} created successfully.`);
        setCreateUserForm({ email: "", password: "", role: "freelancer", company_name: "" });
        fetchUsers();
        setTimeout(() => { setCreateUserModal(false); setCreateUserMsg(null); }, 1500);
      } else {
        setCreateUserMsg(data.detail || "Error creating user.");
      }
    } catch { setCreateUserMsg("Network error."); }
    setCreateUserLoading(false);
  };

  // ADM-01: update user profile
  const updateUserProfile = async () => {
    if (!editUserModal) return;
    setEditUserLoading(true); setEditUserMsg(null);
    try {
      const body: any = {};
      if (editUserForm.email && editUserForm.email !== editUserModal.email) body.email = editUserForm.email;
      if (editUserForm.status && editUserForm.status !== editUserModal.status) body.status = editUserForm.status;
      const res = await fetch(`${API_BASE_URL}/admin/users/${editUserModal.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders().headers },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setEditUserMsg("Profile updated.");
        fetchUsers();
        setTimeout(() => { setEditUserModal(null); setEditUserMsg(null); }, 1200);
      } else {
        setEditUserMsg(data.detail || "Error updating profile.");
      }
    } catch { setEditUserMsg("Network error."); }
    setEditUserLoading(false);
  };

  // ADM-01: create role
  const createRole = async () => {
    setCreateRoleLoading(true); setCreateRoleMsg(null);
    try {
      const perms = createRoleForm.permissions.split(",").map((s: string) => s.trim()).filter(Boolean);
      const res = await fetch(`${API_BASE_URL}/admin/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders().headers },
        body: JSON.stringify({ ...createRoleForm, permissions: perms }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreateRoleMsg(`Role '${createRoleForm.role_name}' created.`);
        setCreateRoleForm({ role_name: "", display_name: "", description: "", permissions: "" });
        fetchRoles();
        setTimeout(() => { setCreateRoleModal(false); setCreateRoleMsg(null); }, 1500);
      } else {
        setCreateRoleMsg(data.detail || "Error creating role.");
      }
    } catch { setCreateRoleMsg("Network error."); }
    setCreateRoleLoading(false);
  };

  // ADM-06: force-release escrow
  const submitReleaseEscrow = async () => {
    setReleaseEscrowLoading(true); setReleaseEscrowMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/overrides/release-escrow`, {
        method: "POST", ...getAuthHeaders(),
        body: JSON.stringify({ contract_id: Number(releaseEscrowForm.contractId), reason: releaseEscrowForm.reason || "Admin force-release" }),
      });
      const data = await res.json();
      setReleaseEscrowMsg(res.ok ? data.message : (data.detail || "Release failed."));
      if (res.ok) setReleaseEscrowForm({ contractId: "", reason: "" });
    } catch { setReleaseEscrowMsg("Network error."); }
    setReleaseEscrowLoading(false);
  };

  // ADM-06: adjust trust score
  const submitTrustScore = async () => {
    setTrustScoreLoading(true); setTrustScoreMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/trust-score`, {
        method: "POST", ...getAuthHeaders(),
        body: JSON.stringify({ user_id: Number(trustScoreForm.userId), score: Number(trustScoreForm.score) }),
      });
      const data = await res.json();
      setTrustScoreMsg(res.ok ? data.message : (data.detail || "Update failed."));
      if (res.ok) setTrustScoreForm({ userId: "", score: "" });
    } catch { setTrustScoreMsg("Network error."); }
    setTrustScoreLoading(false);
  };

  // ADM-06: submit payment reversal
  const submitReversal = async () => {
    setReversalLoading(true); setReversalMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/overrides/payment-reversal`, {
        method: "POST", ...getAuthHeaders(),
        body: JSON.stringify({ transaction_id: Number(reversalForm.transactionId), reason: reversalForm.reason }),
      });
      const data = await res.json();
      setReversalMsg(res.ok ? data.message : (data.detail || "Error."));
      if (res.ok) setReversalForm({ transactionId: "", reason: "" });
    } catch { setReversalMsg("Network error."); }
    setReversalLoading(false);
  };

  const thStyle: React.CSSProperties = { fontSize: 10, color: c.subtext, textAlign: "left", padding: "0 8px 8px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500, borderBottom: `0.5px solid ${c.border}` };
  const tdStyle: React.CSSProperties = { padding: "9px 8px", fontSize: 12, color: c.text, borderBottom: `0.5px solid ${c.border}` };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: c.bg, color: c.text, fontFamily, fontSize: 13 }} dir={isRTL ? "rtl" : "ltr"}>

      {/* ── Top Bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>
          Skill<span style={{ color: c.primary }}>Link</span>
          <span style={{ fontSize: 10, color: c.subtext, marginLeft: 8, letterSpacing: ".08em" }}>ADMIN</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LangToggle style={{ color: c.text }} />
          <button onClick={toggleTheme} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
            {darkMode ? "☀️" : "🌙"}
          </button>
          {/* Avatar dropdown */}
          <div style={{ position: "relative" }}>
            <div
              role="button"
              tabIndex={0}
              aria-label="Open user menu"
              aria-expanded={dropdownOpen}
              onClick={() => setDropdownOpen((v) => !v)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDropdownOpen((v) => !v); } }}
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
                  🔐 {t("common.mfa")}
                </a>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); localStorage.clear(); window.location.href = "/login"; } }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: "#ef4444", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {isRTL ? "←" : "→"} {t("common.signOut")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 200, borderRight: `0.5px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", padding: "16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>{t("adm.section.platform")}</div>
          <NavItem label={t("adm.nav.overview")} active={activeTab === "Overview"} onClick={() => setActiveTab("Overview")} icon={<IconGrid />} colors={c} />
          <NavItem label={t("adm.nav.users")} active={activeTab === "Users"} onClick={() => setActiveTab("Users")} badge={stats ? stats.total_users : undefined} icon={<IconUsers />} colors={c} />
          <NavItem label={t("adm.nav.roles")} active={activeTab === "Roles"} onClick={() => setActiveTab("Roles")} icon={<IconKey />} colors={c} />
          <NavItem label={t("adm.nav.projects")} active={activeTab === "Projects"} onClick={() => setActiveTab("Projects")} badge={stats ? stats.total_projects : undefined} icon={<IconClip />} colors={c} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>{t("adm.section.ai")}</div>
          <NavItem label={t("adm.nav.matchEngine")} active={activeTab === "Match Engine"} onClick={() => setActiveTab("Match Engine")} icon={<IconBulb />} colors={c} />
          <NavItem label={t("adm.nav.vettingGate")} active={activeTab === "Vetting Gate"} onClick={() => setActiveTab("Vetting Gate")} badge={verifications.length} icon={<IconShield />} colors={c} />
          <NavItem label={t("adm.nav.auditLogs")} active={activeTab === "Audit Logs"} onClick={() => setActiveTab("Audit Logs")} icon={<IconList />} colors={c} />
          <NavItem label={t("adm.nav.analytics")} active={activeTab === "Analytics"} onClick={() => setActiveTab("Analytics")} icon={<IconChart />} colors={c} />
          <NavItem label={t("adm.nav.aiConfig")} active={activeTab === "AI Config"} onClick={() => setActiveTab("AI Config")} icon={<IconCog />} colors={c} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>{t("adm.section.finance")}</div>
          <NavItem label={t("adm.nav.revenue")} active={activeTab === "Revenue"} onClick={() => setActiveTab("Revenue")} icon={<IconDollar />} colors={c} />
          <NavItem label={t("adm.nav.disputes")} active={activeTab === "Disputes"} onClick={() => setActiveTab("Disputes")} badge={disputes.length} icon={<IconAlert />} colors={c} />
          <NavItem label={t("adm.nav.overrides")} active={activeTab === "Overrides"} onClick={() => setActiveTab("Overrides")} icon={<IconSwitch />} colors={c} />
          <NavItem label={t("adm.nav.alerts")} active={activeTab === "Alerts"} onClick={() => setActiveTab("Alerts")} badge={alertsData?.counts?.total || undefined} icon={<IconBell />} colors={c} />
          <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
            <div role="button" tabIndex={0} onClick={toggleTheme} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTheme(); } }} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>{t("adm.switchTheme")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>{t("adm.contactUs")}</div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>
          {activeTab === "Overview" && (
            <>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Admin Overview</div>
              <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>
                Platform health · Auto-refresh every 30s · Last updated: {lastRefreshed.toLocaleTimeString()}
              </div>
            </div>
            <button onClick={fetchOverviewData} style={{ background: "transparent", color: c.text, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              ↻ Refresh now
            </button>
          </div>

          {/* Metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
            {[
              { label: "Total Users",      val: stats ? stats.total_users.toLocaleString() : "...", sub: stats ? `${stats.total_freelancers} freelancers · ${stats.total_clients} clients` : "Loading...", badge: <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">Live</Badge>, tab: "Users" },
              { label: "Active Projects",  val: stats ? stats.total_projects.toLocaleString() : "...",   sub: "Across the platform", badge: <Badge bg="#2a2640" color="#7F77DD" border="rgba(127,119,221,.2)">Active</Badge>, tab: "Projects" },
              { label: "Contracts",        val: stats ? stats.total_contracts.toLocaleString() : "...",sub: "Total signed contracts", badge: <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">Active</Badge>, tab: "Revenue" },
              { label: "Pending Vetting",  val: <span style={{ color: "#f59e0b" }}>{verifications.length}</span>, sub: "awaiting AI Gate review", badge: <Badge bg="rgba(245,158,11,.1)" color="#f59e0b" border="rgba(245,158,11,.2)">Action needed</Badge>, tab: "Vetting Gate" },
            ].map((m, i) => (
              <div key={i} role="button" tabIndex={0} aria-label={`Go to ${m.label}`} onClick={() => setActiveTab(m.tab)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveTab(m.tab); } }} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, cursor: "pointer", transition: "border-color 0.15s" }}
                onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.borderColor = c.primary)}
                onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.borderColor = c.border)}
              >
                <div style={{ fontSize: 10, color: c.subtext, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 500, color: c.text, lineHeight: 1 }}>{m.val}</div>
                <div style={{ fontSize: 11, color: c.subtext, marginTop: 5 }}>{m.sub}</div>
                {m.badge}
              </div>
            ))}
          </div>

          {/* Platform Health */}
          <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Platform Health</span>
              {healthData ? (
                <Badge bg={healthData.status?.includes("✅") ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.1)"}
                  color={healthData.status?.includes("✅") ? "#22c55e" : "#ef4444"}
                  border={healthData.status?.includes("✅") ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}
                  style={{ margin: 0 }}>
                  {healthData.status?.includes("✅") ? "All services up" : "Degraded"}
                </Badge>
              ) : <Badge bg="rgba(245,158,11,.1)" color="#f59e0b" border="rgba(245,158,11,.2)" style={{ margin: 0 }}>Checking…</Badge>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              {[
                { label: "API Server",       val: healthData ? "Online" : "—",          color: "#22c55e" },
                { label: "Database",         val: healthData?.status?.includes("✅") ? "Connected" : healthData ? "Error" : "—", color: healthData?.status?.includes("✅") ? "#22c55e" : "#ef4444" },
                { label: "DB Latency",       val: systemHealth ? `${systemHealth.db_latency_ms} ms` : "—", color: systemHealth ? (systemHealth.db_latency_ms < 50 ? "#22c55e" : systemHealth.db_latency_ms < 200 ? "#f59e0b" : "#ef4444") : c.subtext },
                { label: "WS Online Users",  val: healthData?.ws_online_users ?? "—",   color: "#7F77DD" },
                { label: "Uptime",           val: systemHealth ? formatUptime(systemHealth.uptime_seconds) : "—", color: "#22c55e" },
                { label: "Error Rate (24h)", val: systemHealth ? `${systemHealth.error_rate_pct}%` : "—", color: systemHealth ? (systemHealth.error_rate_pct > 5 ? "#ef4444" : systemHealth.error_rate_pct > 1 ? "#f59e0b" : "#22c55e") : c.subtext },
                { label: "Errors (24h)",     val: systemHealth?.errors_24h ?? "—",      color: systemHealth?.errors_24h ? "#f59e0b" : "#22c55e" },
                { label: "Notifications",    val: healthData?.total_notifications ?? "—", color: "#3b82f6" },
              ].map(item => (
                <div key={item.label} style={{ background: c.bg, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: item.color }}>{item.val}</div>
                  <div style={{ fontSize: 10, color: c.subtext, marginTop: 4 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Transaction Feed */}
          {systemHealth && systemHealth.recent_transactions.length > 0 && (
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Live Transaction Feed</span>
                <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)" style={{ margin: 0 }}>
                  Live · {systemHealth.recent_transactions.length} recent
                </Badge>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["#", "Amount", "Type", "Description", "Time"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {systemHealth.recent_transactions.map((t) => {
                    const isDeposit = t.type === "deposit";
                    const typeColor = isDeposit ? "#22c55e" : "#ef4444";
                    return (
                      <tr key={t.id}>
                        <td style={tdStyle}>#{t.id}</td>
                        <td style={{ ...tdStyle, fontWeight: 500, color: typeColor }}>
                          {isDeposit ? "+" : "−"}${(t.amount ?? 0).toFixed(2)}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: `${typeColor}1a`, color: typeColor }}>{t.type}</span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, color: c.subtext }}>{t.description?.substring(0, 55) || "—"}</td>
                        <td style={{ ...tdStyle, fontSize: 11, color: c.subtext }}>{formatTimeAgo(t.timestamp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Middle row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>

            {/* User management */}
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Recent User Signups</span>
                <span onClick={() => setActiveTab("Users")} style={{ fontSize: 11, color: c.primary, cursor: "pointer" }}>Manage all →</span>
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
                          <button
                            onClick={() => {
                              if (u.status === "vetting") {
                                setActiveTab("Vetting Gate");
                              } else if (isSuspended) {
                                toggleUserStatus(u.id, u.status);
                              } else {
                                setEditUserModal({ id: u.id, email: u.email, status: u.status });
                                setEditUserForm({ email: u.email, status: u.status });
                                setEditUserMsg(null);
                              }
                            }}
                            style={{ fontSize: 10, padding: "2px 8px", background: "transparent", color: isSuspended ? "#ef4444" : c.primary, border: `0.5px solid ${isSuspended ? "#ef4444" : c.primary}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
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
              <span onClick={() => setActiveTab("Analytics")} style={{ fontSize: 11, color: c.primary, cursor: "pointer" }}>Full analytics →</span>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>User Management</div>
                <button
                  onClick={() => { setCreateUserModal(true); setCreateUserMsg(null); }}
                  style={{ fontSize: 12, padding: "7px 14px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                >+ Create User</button>
              </div>
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
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => { setEditUserModal({ id: u.id, email: u.email, status: u.status }); setEditUserForm({ email: u.email, status: u.status }); setEditUserMsg(null); }}
                              style={{ fontSize: 10, padding: "4px 8px", background: "transparent", color: c.subtext, border: `0.5px solid ${c.border}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
                            >Edit</button>
                            {u.role !== "admin" && (
                              <>
                                <button
                                  onClick={() => { setChangeRoleModal({ userId: u.id, userEmail: u.email, currentRole: u.role }); setChangeRoleValue(u.role); }}
                                  style={{ fontSize: 10, padding: "4px 8px", background: "transparent", color: c.primary, border: `0.5px solid ${c.primary}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
                                >Role</button>
                                <button onClick={() => toggleUserStatus(u.id, u.status)} style={{ fontSize: 10, padding: "4px 8px", background: "transparent", color: isSuspended ? c.text : "#ef4444", border: `0.5px solid ${isSuspended ? c.border : "rgba(239,68,68,.4)"}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                                  {isSuspended ? "Activate" : "Suspend"}
                                </button>
                                <button onClick={() => deleteUser(u.id)} style={{ fontSize: 10, padding: "4px 8px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && <tr><td colSpan={6} style={{...tdStyle, textAlign: "center", color: c.subtext}}>Loading users...</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          
          {activeTab === "Roles" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: c.text }}>Role Management</div>
                  <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Configure platform roles and their associated permissions</div>
                </div>
                <button
                  onClick={() => { setCreateRoleModal(true); setCreateRoleMsg(null); }}
                  style={{ fontSize: 12, padding: "7px 14px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                >+ Create Role</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {roleConfigs.map((rc) => {
                  let perms: string[] = [];
                  try { perms = JSON.parse(rc.permissions || "[]"); } catch {}
                  return (
                    <div key={rc.id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: c.text, marginBottom: 4 }}>{rc.display_name}</div>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: c.primarySoft, color: c.primary }}>{rc.role_name}</span>
                        </div>
                        <button
                          onClick={() => { setEditRoleModal(rc); setEditRoleForm({ description: rc.description || "", permissions: perms.join(", ") }); }}
                          style={{ fontSize: 10, padding: "4px 10px", background: "transparent", color: c.primary, border: `0.5px solid ${c.primary}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
                        >Edit</button>
                      </div>
                      <div style={{ fontSize: 12, color: c.subtext, marginBottom: 14, lineHeight: 1.5 }}>{rc.description || "No description."}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: c.text, marginBottom: 8 }}>Permissions</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {perms.map((p) => (
                          <span key={p} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: "rgba(127,119,221,.12)", color: c.primary, border: `0.5px solid rgba(127,119,221,.2)` }}>{p}</span>
                        ))}
                        {perms.length === 0 && <span style={{ fontSize: 11, color: c.subtext }}>No permissions configured.</span>}
                      </div>
                      <div style={{ fontSize: 10, color: c.subtext, marginTop: 12 }}>Updated: {new Date(rc.updated_at).toLocaleDateString()}</div>
                    </div>
                  );
                })}
                {roleConfigs.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center" as const, color: c.subtext, padding: 40 }}>Loading role configurations...</div>
                )}
              </div>
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
              {/* Matching Thresholds */}
              {aiConfig && (() => {
                const MatchSlider = ({ field, label, min, max, step }: { field: string; label: string; min: number; max: number; step: number }) => {
                  const val = aiConfig.matching?.[field] ?? 0;
                  return (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: c.subtext }}>{label}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: c.text }}>{Number(val).toFixed(step < 1 ? 2 : 0)}</span>
                      </div>
                      <input type="range" min={min} max={max} step={step} value={val}
                        onChange={e => setAiConfig((prev: any) => ({ ...prev, matching: { ...prev.matching, [field]: Number(e.target.value) } }))}
                        style={{ width: "100%", accentColor: c.primary }} />
                    </div>
                  );
                };
                const totalWeight = (aiConfig.matching?.skill_weight || 0) + (aiConfig.matching?.experience_weight || 0) + (aiConfig.matching?.budget_weight || 0) + (aiConfig.matching?.rating_weight || 0);
                return (
                  <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 10, borderBottom: `0.5px solid ${c.border}` }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>Matching Parameters</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {aiConfigMsg && <span style={{ fontSize: 11, color: aiConfigMsg.includes("aved") ? "#22c55e" : "#ef4444" }}>{aiConfigMsg}</span>}
                        <button onClick={saveAiConfig} disabled={aiConfigSaving} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: c.primary, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", opacity: aiConfigSaving ? 0.6 : 1 }}>
                          {aiConfigSaving ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                    <MatchSlider field="min_score_threshold" label="Min Score Threshold" min={0} max={1} step={0.05} />
                    <MatchSlider field="max_matches" label="Max Matches Returned" min={1} max={50} step={1} />
                    <MatchSlider field="skill_weight" label="Skill Weight" min={0} max={1} step={0.05} />
                    <MatchSlider field="experience_weight" label="Experience Weight" min={0} max={1} step={0.05} />
                    <MatchSlider field="budget_weight" label="Budget Weight" min={0} max={1} step={0.05} />
                    <MatchSlider field="rating_weight" label="Rating Weight" min={0} max={1} step={0.05} />
                    <div style={{ fontSize: 10, color: totalWeight > 1.01 ? "#ef4444" : "#22c55e" }}>
                      Weights total: <b>{totalWeight.toFixed(2)}</b> (should equal 1.00)
                    </div>
                  </div>
                );
              })()}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Header + view toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: c.text }}>System Audit Logs</div>
                  <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Full trail of every admin action on the platform</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["active", "archived"] as const).map(v => (
                    <button key={v} onClick={() => { setLogView(v); if (v === "archived") fetchArchivedLogs(); else fetchLogsFiltered(); }}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: logView === v ? c.primary : c.surface, color: logView === v ? "#fff" : c.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" as const }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search filters */}
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>User ID</label>
                  <input type="number" value={logFilters.userId} onChange={e => setLogFilters(f => ({ ...f, userId: e.target.value }))}
                    placeholder="e.g. 3" style={{ display: "block", width: "100%", marginTop: 5, padding: "7px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
                </div>
                <div style={{ flex: 3, minWidth: 200 }}>
                  <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Keyword</label>
                  <input type="text" value={logFilters.keyword} onChange={e => setLogFilters(f => ({ ...f, keyword: e.target.value }))}
                    placeholder="e.g. suspended, trust score…" style={{ display: "block", width: "100%", marginTop: 5, padding: "7px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
                </div>
                <button onClick={() => logView === "archived" ? fetchArchivedLogs() : fetchLogsFiltered()}
                  style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Search
                </button>
                <button onClick={() => { setLogFilters({ userId: "", keyword: "" }); fetchLogsFiltered({ userId: "", keyword: "" }); }}
                  style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.subtext, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  Clear
                </button>
              </div>

              {/* Archive controls (only shown in active view) */}
              {logView === "active" && (
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
                  <div>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Archive logs older than (days)</label>
                    <input type="number" min={1} value={archiveDays} onChange={e => setArchiveDays(e.target.value)}
                      style={{ display: "block", width: 100, marginTop: 5, padding: "7px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13 }} />
                  </div>
                  <button onClick={submitArchive} disabled={archiveLoading}
                    style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "#f59e0b", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: archiveLoading ? 0.6 : 1 }}>
                    {archiveLoading ? "Archiving…" : "Archive Old Logs"}
                  </button>
                  {archiveMsg && <div style={{ padding: "7px 12px", borderRadius: 8, background: archiveMsg.includes("Archived") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: archiveMsg.includes("Archived") ? "#22c55e" : "#ef4444", fontSize: 12 }}>{archiveMsg}</div>}
                </div>
              )}

              {/* Log table */}
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
                {logView === "active" ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Timestamp", "Action", "Performed By (ID)"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                    <tbody>
                      {systemLogs.map((log) => (
                        <tr key={log.log_id}>
                          <td style={{ ...tdStyle, whiteSpace: "nowrap" as const, width: 160 }}>{new Date(log.timestamp).toLocaleString()}</td>
                          <td style={{ ...tdStyle, fontSize: 11 }}>{log.action}</td>
                          <td style={{ ...tdStyle, textAlign: "center" as const, width: 120 }}>{log.performed_by ?? "—"}</td>
                        </tr>
                      ))}
                      {systemLogs.length === 0 && <tr><td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: c.subtext }}>No logs found.</td></tr>}
                    </tbody>
                  </table>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Archived At", "Original Timestamp", "Action", "Performed By (ID)"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                    <tbody>
                      {archivedLogs.map((log: any) => (
                        <tr key={log.archive_id}>
                          <td style={{ ...tdStyle, whiteSpace: "nowrap" as const, width: 160, color: c.subtext, fontSize: 11 }}>{new Date(log.archived_at).toLocaleString()}</td>
                          <td style={{ ...tdStyle, whiteSpace: "nowrap" as const, width: 160 }}>{new Date(log.timestamp).toLocaleString()}</td>
                          <td style={{ ...tdStyle, fontSize: 11 }}>{log.action}</td>
                          <td style={{ ...tdStyle, textAlign: "center" as const, width: 120 }}>{log.performed_by ?? "—"}</td>
                        </tr>
                      ))}
                      {archivedLogs.length === 0 && <tr><td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: c.subtext }}>No archived logs found.</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === "Revenue" && (
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, marginBottom: 16 }}>Revenue Analytics</div>
              {/* Summary cards */}
              {revenue && (
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
              )}
              {/* Filter bar */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14, padding: "12px 14px", background: c.bg, borderRadius: 10, border: `0.5px solid ${c.border}` }}>
                <div>
                  <div style={{ fontSize: 10, color: c.subtext, marginBottom: 3 }}>From</div>
                  <input type="date" value={revFilters.dateFrom}
                    onChange={e => setRevFilters(f => ({ ...f, dateFrom: e.target.value }))}
                    style={{ padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, fontSize: 11 }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: c.subtext, marginBottom: 3 }}>To</div>
                  <input type="date" value={revFilters.dateTo}
                    onChange={e => setRevFilters(f => ({ ...f, dateTo: e.target.value }))}
                    style={{ padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, fontSize: 11 }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: c.subtext, marginBottom: 3 }}>Type</div>
                  <select value={revFilters.txType} onChange={e => setRevFilters(f => ({ ...f, txType: e.target.value }))}
                    style={{ padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, fontSize: 11 }}>
                    <option value="">All types</option>
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: c.subtext, marginBottom: 3 }}>Status</div>
                  <select value={revFilters.txStatus} onChange={e => setRevFilters(f => ({ ...f, txStatus: e.target.value }))}
                    style={{ padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, fontSize: 11 }}>
                    <option value="">All statuses</option>
                    <option value="cleared">Cleared</option>
                    <option value="reversed">Reversed</option>
                  </select>
                </div>
                <button onClick={() => fetchRevenue(revFilters)}
                  style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: c.primary, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Apply
                </button>
                <button onClick={() => { const f = { dateFrom: "", dateTo: "", txType: "", txStatus: "" }; setRevFilters(f); fetchRevenue(f); }}
                  style={{ padding: "6px 10px", borderRadius: 7, border: `0.5px solid ${c.border}`, background: "transparent", color: c.subtext, fontSize: 11, cursor: "pointer" }}>
                  Clear
                </button>
              </div>
              {/* Transaction table */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Tx ID", "Type", "Amount", "Status", "Description", "Date"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {revenue?.transactions?.map((t: any) => {
                    const isReversed = (t.description || "").toLowerCase().includes("reversal");
                    return (
                      <tr key={t.id}>
                        <td style={tdStyle}>{t.id}</td>
                        <td style={tdStyle}><Badge bg={t.type === "deposit" ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)"} color={t.type === "deposit" ? "#22c55e" : "#ef4444"} border="transparent" style={{margin:0}}>{t.type}</Badge></td>
                        <td style={tdStyle}>${(t.amount || 0).toLocaleString()}</td>
                        <td style={tdStyle}><Badge bg={isReversed ? "rgba(239,68,68,.1)" : "rgba(34,197,94,.1)"} color={isReversed ? "#ef4444" : "#22c55e"} border="transparent" style={{margin:0}}>{isReversed ? "reversed" : "cleared"}</Badge></td>
                        <td style={{...tdStyle, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{t.description || "—"}</td>
                        <td style={tdStyle}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
                      </tr>
                    );
                  })}
                  {!revenue?.transactions?.length && <tr><td colSpan={6} style={{...tdStyle, textAlign: "center", color: c.subtext}}>No transactions match the selected filters.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "Analytics" && (() => {
            const maxCatCount = Math.max(1, ...(marketTrends?.category_breakdown?.map((c: any) => c.count) ?? [1]));
            const maxSkillDemand = Math.max(1, ...(skillDemand?.top_skills?.map((s: any) => s.demand) ?? [1]));
            const maxAccept = Math.max(1, ...(fairnessReport?.acceptance_by_category?.map((r: any) => r.total_proposals) ?? [1]));
            const maxTrust = Math.max(1, ...(fairnessReport?.trust_score_distribution?.map((b: any) => b.count) ?? [1]));

            const subTabStyle = (key: string): React.CSSProperties => ({
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer",
              background: analyticsTab === key ? c.primary : "transparent",
              color: analyticsTab === key ? "#fff" : c.subtext,
              border: `0.5px solid ${analyticsTab === key ? c.primary : c.border}`,
            });

            return (
              <div>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 500, color: c.text }}>Analytics &amp; Reporting</div>
                    <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Platform insights · market trends · skill demand · fairness</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => exportCSV(analyticsTab)}
                      style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      ↓ Export CSV
                    </button>
                    <button
                      onClick={() => exportPDF(analyticsTab)}
                      style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      ↓ Export PDF
                    </button>
                  </div>
                </div>

                {/* Sub-tab selector */}
                <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                  <button style={subTabStyle("market-trends")} onClick={() => setAnalyticsTab("market-trends")}>Market Trends</button>
                  <button style={subTabStyle("skill-demand")}  onClick={() => setAnalyticsTab("skill-demand")}>Skill Demand</button>
                  <button style={subTabStyle("fairness")}      onClick={() => setAnalyticsTab("fairness")}>Fairness Report</button>
                </div>

                {/* ── Market Trends ── */}
                {analyticsTab === "market-trends" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Monthly table */}
                    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 12 }}>Monthly Growth (last 6 months)</div>
                      {marketTrends ? (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr>{["Month", "Projects", "Contracts", "New Users", "Avg Budget"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                          <tbody>
                            {marketTrends.monthly_trends.map((row: any) => (
                              <tr key={row.month}>
                                <td style={{ ...tdStyle, fontWeight: 500 }}>{row.month}</td>
                                <td style={{ ...tdStyle, color: c.primary }}>{row.projects}</td>
                                <td style={{ ...tdStyle, color: "#22c55e" }}>{row.contracts}</td>
                                <td style={{ ...tdStyle, color: "#3b82f6" }}>{row.users}</td>
                                <td style={tdStyle}>${row.avg_budget.toLocaleString()}</td>
                              </tr>
                            ))}
                            {marketTrends.monthly_trends.length === 0 && (
                              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: c.subtext }}>No data yet.</td></tr>
                            )}
                          </tbody>
                        </table>
                      ) : <div style={{ color: c.subtext, fontSize: 12 }}>Loading…</div>}
                    </div>

                    {/* Category breakdown bar chart */}
                    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 14 }}>Project Demand by Category</div>
                      {marketTrends?.category_breakdown?.map((row: any) => (
                        <div key={row.category} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: c.text }}>{row.category}</span>
                            <span style={{ fontSize: 11, color: c.subtext }}>{row.count} projects · ${row.avg_budget.toLocaleString()} avg</span>
                          </div>
                          <div style={{ height: 6, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(row.count / maxCatCount) * 100}%`, background: c.primary, borderRadius: 20 }} />
                          </div>
                        </div>
                      ))}
                      {!marketTrends && <div style={{ color: c.subtext, fontSize: 12 }}>Loading…</div>}
                    </div>
                  </div>
                )}

                {/* ── Skill Demand ── */}
                {analyticsTab === "skill-demand" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Top skills bar chart */}
                    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 14 }}>Top Skills — Supply vs Demand</div>
                      {skillDemand?.top_skills?.map((row: any) => (
                        <div key={row.skill} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: c.text }}>{row.skill}</span>
                            <span style={{ fontSize: 11, color: c.subtext }}>
                              <span style={{ color: c.primary }}>{row.demand} projects</span>
                              {" · "}
                              <span style={{ color: "#22c55e" }}>{row.supply} freelancers</span>
                            </span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <div style={{ height: 5, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(row.demand / maxSkillDemand) * 100}%`, background: c.primary, borderRadius: 20 }} />
                            </div>
                            <div style={{ height: 5, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(row.supply / maxSkillDemand) * 100}%`, background: "#22c55e", borderRadius: 20 }} />
                            </div>
                          </div>
                        </div>
                      ))}
                      {!skillDemand && <div style={{ color: c.subtext, fontSize: 12 }}>Loading…</div>}
                      {skillDemand?.top_skills?.length === 0 && <div style={{ color: c.subtext, fontSize: 12 }}>No skill data yet.</div>}
                    </div>

                    {/* High demand / low supply table */}
                    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 12 }}>Highest Demand Gap (shortage)</div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr>{["Skill", "Demand", "Supply", "Gap"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                        <tbody>
                          {skillDemand?.high_demand_low_supply?.map((row: any) => (
                            <tr key={row.skill}>
                              <td style={{ ...tdStyle, fontWeight: 500 }}>{row.skill}</td>
                              <td style={{ ...tdStyle, color: c.primary }}>{row.demand}</td>
                              <td style={{ ...tdStyle, color: "#22c55e" }}>{row.supply}</td>
                              <td style={{ ...tdStyle, color: row.gap > 0 ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                                {row.gap > 0 ? `+${row.gap}` : row.gap}
                              </td>
                            </tr>
                          ))}
                          {!skillDemand && <tr><td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: c.subtext }}>Loading…</td></tr>}
                          {skillDemand?.high_demand_low_supply?.length === 0 && <tr><td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: c.subtext }}>No data yet.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Fairness Report ── */}
                {analyticsTab === "fairness" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Acceptance rate by category */}
                    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 14 }}>Proposal Acceptance Rate by Category</div>
                      {fairnessReport?.acceptance_by_category?.map((row: any) => (
                        <div key={row.category} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: c.text }}>{row.category}</span>
                            <span style={{ fontSize: 11, color: c.subtext }}>
                              {row.accepted}/{row.total_proposals} · <span style={{ color: row.acceptance_rate > 30 ? "#22c55e" : row.acceptance_rate > 10 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>{row.acceptance_rate}%</span>
                              {row.avg_ai_score != null && <span style={{ color: c.subtext }}> · AI score: {row.avg_ai_score}</span>}
                            </span>
                          </div>
                          <div style={{ height: 6, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(row.total_proposals / maxAccept) * 100}%`, background: c.primary, borderRadius: 20, opacity: 0.4 }} />
                          </div>
                        </div>
                      ))}
                      {!fairnessReport && <div style={{ color: c.subtext, fontSize: 12 }}>Loading…</div>}
                      {fairnessReport?.acceptance_by_category?.length === 0 && <div style={{ color: c.subtext, fontSize: 12 }}>No proposal data yet.</div>}
                    </div>

                    {/* Trust score + Review rating side by side */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      {/* Trust score distribution */}
                      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 14 }}>Trust Score Distribution</div>
                        {fairnessReport?.trust_score_distribution?.map((row: any) => (
                          <div key={row.bucket} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: c.text }}>{row.bucket}</span>
                              <span style={{ fontSize: 11, color: c.subtext }}>{row.count} users</span>
                            </div>
                            <div style={{ height: 6, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(row.count / maxTrust) * 100}%`, background: "#3b82f6", borderRadius: 20 }} />
                            </div>
                          </div>
                        ))}
                        {!fairnessReport && <div style={{ color: c.subtext, fontSize: 12 }}>Loading…</div>}
                      </div>

                      {/* Review rating distribution */}
                      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 14 }}>Review Rating Distribution</div>
                        {(() => {
                          const maxRating = Math.max(1, ...(fairnessReport?.review_rating_distribution?.map((r: any) => r.count) ?? [1]));
                          const ratingColors = ["", "#ef4444", "#f59e0b", "#f59e0b", "#22c55e", "#22c55e"];
                          return fairnessReport?.review_rating_distribution?.map((row: any) => (
                            <div key={row.rating} style={{ marginBottom: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: c.text }}>{"★".repeat(Number(row.rating))} {row.rating}</span>
                                <span style={{ fontSize: 11, color: c.subtext }}>{row.count} reviews</span>
                              </div>
                              <div style={{ height: 6, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${(row.count / maxRating) * 100}%`, background: ratingColors[Number(row.rating)] || "#f59e0b", borderRadius: 20 }} />
                              </div>
                            </div>
                          ));
                        })()}
                        {!fairnessReport && <div style={{ color: c.subtext, fontSize: 12 }}>Loading…</div>}
                        {fairnessReport?.review_rating_distribution?.length === 0 && <div style={{ color: c.subtext, fontSize: 12 }}>No reviews yet.</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

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
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {d.status === "open" && (
                            <button onClick={() => setResolveModal({ id: d.id, contractId: d.contract_id })} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: c.primarySoft, color: c.primary, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Resolve</button>
                          )}
                          {d.status === "open" && (
                            <button onClick={() => fetchDisputeAiSummary(d.id)} disabled={disputeAiLoading === d.id} style={{ padding: "4px 10px", borderRadius: 6, border: `0.5px solid ${c.border}`, background: "transparent", color: c.subtext, fontSize: 11, cursor: "pointer" }}>
                              {disputeAiLoading === d.id ? "…" : "AI Insight"}
                            </button>
                          )}
                          {d.status === "resolved" && <span style={{ fontSize: 11, color: c.subtext }}>{d.resolution_note?.substring(0, 30) || "Resolved"}</span>}
                        </div>
                        {disputeAiSummary[d.id] && (() => {
                          const s = disputeAiSummary[d.id];
                          const chat = s.chat_analysis;
                          const sentimentColor = chat?.sentiment === "negative" ? "#ef4444" : chat?.sentiment === "positive" ? "#22c55e" : c.subtext;
                          return (
                            <div style={{ marginTop: 8, padding: "10px 12px", background: c.primarySoft, borderRadius: 8, fontSize: 11, color: c.text, maxWidth: 300 }}>
                              {/* AI Recommendation */}
                              <div style={{ fontWeight: 600, color: c.primary, marginBottom: 6 }}>AI Recommendation</div>
                              <div style={{ marginBottom: 2 }}><b>Action:</b> {s.recommendation?.replace(/_/g, " ")}</div>
                              <div style={{ marginBottom: 2 }}><b>Score:</b> {(s.model_score * 100).toFixed(0)}/100 · confidence {s.confidence_pct}%</div>
                              <div style={{ marginBottom: 2 }}><b>Work done:</b> {s.work_completion_pct}% ({s.milestones_completed}/{s.total_milestones} milestones)</div>
                              <div style={{ marginBottom: 2 }}><b>Escrow:</b> ${s.escrow_amount?.toLocaleString()}{s.split_pct ? ` · split ${s.split_pct}/${100 - s.split_pct}` : ""}</div>
                              <div style={{ color: c.subtext, fontStyle: "italic", marginBottom: 4 }}>{s.rationale}</div>
                              <div style={{ color: s.urgency === "high" ? "#ef4444" : s.urgency === "medium" ? "#f59e0b" : "#22c55e", fontWeight: 600, marginBottom: 8 }}>
                                Urgency: {s.urgency} · {s.days_open}d open
                              </div>
                              {/* Chat Log Analysis */}
                              {chat && (
                                <>
                                  <div style={{ borderTop: `0.5px solid ${c.border}`, marginBottom: 6 }} />
                                  <div style={{ fontWeight: 600, color: c.primary, marginBottom: 5 }}>Chat Log Analysis</div>
                                  <div style={{ marginBottom: 2 }}>
                                    <b>Messages:</b> {chat.message_count} ({chat.client_messages} client · {chat.freelancer_messages} freelancer)
                                  </div>
                                  <div style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                                    <b>Sentiment:</b>
                                    <span style={{ padding: "1px 7px", borderRadius: 20, background: sentimentColor + "20", color: sentimentColor, fontWeight: 600, fontSize: 10 }}>
                                      {chat.sentiment}
                                    </span>
                                  </div>
                                  <div style={{ color: c.subtext, fontStyle: "italic", marginBottom: chat.flagged_phrases?.length ? 4 : 0 }}>{chat.summary}</div>
                                  {chat.flagged_phrases?.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                                      {chat.flagged_phrases.map((p: string) => (
                                        <span key={p} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, background: "rgba(239,68,68,.12)", color: "#ef4444", border: "0.5px solid rgba(239,68,68,.2)" }}>{p}</span>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                  {disputes.length === 0 && <tr><td colSpan={7} style={{...tdStyle, textAlign: "center", color: c.subtext}}>No disputes.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ── ADM-04: AI Parameter Configuration ── */}
          {activeTab === "AI Config" && aiConfig && (() => {
            const SliderRow = ({ section, field, label, min, max, step }: { section: string; field: string; label: string; min: number; max: number; step: number }) => {
              const val = aiConfig[section]?.[field] ?? 0;
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: c.text }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.primary }}>{val}</span>
                  </div>
                  <input type="range" min={min} max={max} step={step} value={val}
                    onChange={e => setAiConfig((prev: any) => ({ ...prev, [section]: { ...prev[section], [field]: parseFloat(e.target.value) } }))}
                    style={{ width: "100%", accentColor: c.primary }} />
                </div>
              );
            };
            const Toggle = ({ section, field, label }: { section: string; field: string; label: string }) => {
              const val = aiConfig[section]?.[field] ?? false;
              return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: c.text }}>{label}</span>
                  <div onClick={() => setAiConfig((prev: any) => ({ ...prev, [section]: { ...prev[section], [field]: !val } }))}
                    style={{ width: 36, height: 20, borderRadius: 20, background: val ? c.primary : c.border, cursor: "pointer", position: "relative", transition: "background .2s" }}>
                    <div style={{ position: "absolute", top: 2, left: val ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                  </div>
                </div>
              );
            };
            return (
              <div style={{ animation: "fadeIn 0.4s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 500, color: c.text }}>AI Parameter Configuration</div>
                    <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Tune matching thresholds, pricing weights, and verification rules</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {aiConfigMsg && <span style={{ fontSize: 11, color: aiConfigMsg.includes("success") ? "#22c55e" : "#ef4444" }}>{aiConfigMsg}</span>}
                    <button onClick={saveAiConfig} disabled={aiConfigSaving} style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: aiConfigSaving ? 0.6 : 1 }}>
                      {aiConfigSaving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                  {/* Matching */}
                  <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 16, paddingBottom: 8, borderBottom: `0.5px solid ${c.border}` }}>Match Engine</div>
                    <SliderRow section="matching" field="min_score_threshold" label="Min Score Threshold" min={0} max={1} step={0.05} />
                    <SliderRow section="matching" field="max_matches" label="Max Matches Returned" min={1} max={50} step={1} />
                    <SliderRow section="matching" field="skill_weight" label="Skill Weight" min={0} max={1} step={0.05} />
                    <SliderRow section="matching" field="experience_weight" label="Experience Weight" min={0} max={1} step={0.05} />
                    <SliderRow section="matching" field="budget_weight" label="Budget Weight" min={0} max={1} step={0.05} />
                    <SliderRow section="matching" field="rating_weight" label="Rating Weight" min={0} max={1} step={0.05} />
                    <div style={{ marginTop: 8, fontSize: 10, color: c.subtext }}>
                      Weights total: <b style={{ color: ((aiConfig.matching?.skill_weight || 0) + (aiConfig.matching?.experience_weight || 0) + (aiConfig.matching?.budget_weight || 0) + (aiConfig.matching?.rating_weight || 0)) > 1.01 ? "#ef4444" : "#22c55e" }}>
                        {((aiConfig.matching?.skill_weight || 0) + (aiConfig.matching?.experience_weight || 0) + (aiConfig.matching?.budget_weight || 0) + (aiConfig.matching?.rating_weight || 0)).toFixed(2)}
                      </b> (should equal 1.00)
                    </div>
                  </div>
                  {/* Pricing */}
                  <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 16, paddingBottom: 8, borderBottom: `0.5px solid ${c.border}` }}>Pricing Formula</div>
                    <SliderRow section="pricing" field="base_rate_multiplier" label="Base Rate Multiplier" min={0.5} max={3} step={0.1} />
                    <SliderRow section="pricing" field="complexity_factor" label="Complexity Factor" min={1} max={3} step={0.1} />
                    <SliderRow section="pricing" field="urgency_premium_pct" label="Urgency Premium %" min={0} max={50} step={1} />
                    <SliderRow section="pricing" field="platform_fee_pct" label="Platform Fee %" min={0} max={30} step={1} />
                  </div>
                  {/* Verification */}
                  <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 16, paddingBottom: 8, borderBottom: `0.5px solid ${c.border}` }}>Verification Rules</div>
                    <Toggle section="verification" field="require_document" label="Require Document Upload" />
                    <Toggle section="verification" field="auto_approve_trusted" label="Auto-approve Trusted Users" />
                    <SliderRow section="verification" field="min_trust_score_for_auto" label="Min Trust Score for Auto-approve" min={0} max={100} step={1} />
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: c.subtext, marginBottom: 6 }}>Allowed Document Types</div>
                      {["passport", "national_id", "drivers_license"].map(dt => {
                        const allowed: string[] = aiConfig.verification?.allowed_document_types || [];
                        const checked = allowed.includes(dt);
                        return (
                          <div key={dt} onClick={() => setAiConfig((prev: any) => {
                            const types: string[] = prev.verification?.allowed_document_types || [];
                            const next = checked ? types.filter((t: string) => t !== dt) : [...types, dt];
                            return { ...prev, verification: { ...prev.verification, allowed_document_types: next } };
                          })} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                            <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked ? c.primary : c.border}`, background: checked ? c.primary : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {checked && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>✓</span>}
                            </div>
                            <span style={{ fontSize: 12, color: c.text }}>{dt.replace(/_/g, " ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          {activeTab === "AI Config" && !aiConfig && (
            <div style={{ textAlign: "center", color: c.subtext, marginTop: 60 }}>Loading AI configuration…</div>
          )}

          {/* ── ADM-06: Manual Overrides ── */}
          {activeTab === "Overrides" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 500, color: c.text }}>Manual Overrides</div>
                <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Force-match freelancers to projects or reverse wallet transactions</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Match Override */}
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 4 }}>Force Freelancer–Project Match</div>
                  <div style={{ fontSize: 11, color: c.subtext, marginBottom: 16 }}>Creates a pending proposal on behalf of the admin</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Project ID</label>
                    <input type="number" value={overrideMatchForm.projectId} onChange={e => setOverrideMatchForm(f => ({ ...f, projectId: e.target.value }))}
                      placeholder="e.g. 42" style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Freelancer User ID</label>
                    <input type="number" value={overrideMatchForm.freelancerUserId} onChange={e => setOverrideMatchForm(f => ({ ...f, freelancerUserId: e.target.value }))}
                      placeholder="e.g. 7" style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
                  </div>
                  {overrideMatchMsg && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: overrideMatchMsg.includes("matched") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: overrideMatchMsg.includes("matched") ? "#22c55e" : "#ef4444", fontSize: 12 }}>{overrideMatchMsg}</div>}
                  <button onClick={submitOverrideMatch} disabled={overrideMatchLoading || !overrideMatchForm.projectId || !overrideMatchForm.freelancerUserId}
                    style={{ width: "100%", padding: "9px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: overrideMatchLoading || !overrideMatchForm.projectId || !overrideMatchForm.freelancerUserId ? 0.5 : 1 }}>
                    {overrideMatchLoading ? "Processing…" : "Create Match Override"}
                  </button>
                </div>
                {/* Payment Reversal */}
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 4 }}>Payment Reversal</div>
                  <div style={{ fontSize: 11, color: c.subtext, marginBottom: 16 }}>Reverse a deposit or withdrawal and adjust the freelancer's wallet balance</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Transaction ID</label>
                    <input type="number" value={reversalForm.transactionId} onChange={e => setReversalForm(f => ({ ...f, transactionId: e.target.value }))}
                      placeholder="e.g. 15" style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Reason</label>
                    <textarea value={reversalForm.reason} onChange={e => setReversalForm(f => ({ ...f, reason: e.target.value }))}
                      rows={3} placeholder="Explain the reason for reversal…" style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, resize: "vertical" as const, boxSizing: "border-box" as const }} />
                  </div>
                  {reversalMsg && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: reversalMsg.includes("reversed") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: reversalMsg.includes("reversed") ? "#22c55e" : "#ef4444", fontSize: 12 }}>{reversalMsg}</div>}
                  <button onClick={submitReversal} disabled={reversalLoading || !reversalForm.transactionId || !reversalForm.reason.trim()}
                    style={{ width: "100%", padding: "9px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: reversalLoading || !reversalForm.transactionId || !reversalForm.reason.trim() ? 0.5 : 1 }}>
                    {reversalLoading ? "Processing…" : "Reverse Transaction"}
                  </button>
                </div>

                {/* Force Payment Release */}
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 4 }}>Force Payment Release</div>
                  <div style={{ fontSize: 11, color: c.subtext, marginBottom: 16 }}>Release all remaining escrow funds to the freelancer immediately</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Contract ID</label>
                    <input type="number" value={releaseEscrowForm.contractId} onChange={e => setReleaseEscrowForm(f => ({ ...f, contractId: e.target.value }))}
                      placeholder="e.g. 12" style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Reason</label>
                    <textarea value={releaseEscrowForm.reason} onChange={e => setReleaseEscrowForm(f => ({ ...f, reason: e.target.value }))}
                      rows={3} placeholder="Reason for force-release…" style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, resize: "vertical" as const, boxSizing: "border-box" as const }} />
                  </div>
                  {releaseEscrowMsg && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: releaseEscrowMsg.includes("Released") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: releaseEscrowMsg.includes("Released") ? "#22c55e" : "#ef4444", fontSize: 12 }}>{releaseEscrowMsg}</div>}
                  <button onClick={submitReleaseEscrow} disabled={releaseEscrowLoading || !releaseEscrowForm.contractId}
                    style={{ width: "100%", padding: "9px", borderRadius: 8, border: "none", background: "#f59e0b", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: releaseEscrowLoading || !releaseEscrowForm.contractId ? 0.5 : 1 }}>
                    {releaseEscrowLoading ? "Releasing…" : "Force Release Escrow"}
                  </button>
                </div>

                {/* Adjust Trust Score */}
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 4 }}>Adjust Trust Score</div>
                  <div style={{ fontSize: 11, color: c.subtext, marginBottom: 16 }}>Manually set a user's trust score (0 – 100)</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>User ID</label>
                    <input type="number" value={trustScoreForm.userId} onChange={e => setTrustScoreForm(f => ({ ...f, userId: e.target.value }))}
                      placeholder="e.g. 5" style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Score (0 – 100)</label>
                    <input type="number" min={0} max={100} step={0.1} value={trustScoreForm.score} onChange={e => setTrustScoreForm(f => ({ ...f, score: e.target.value }))}
                      placeholder="e.g. 78.5" style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
                  </div>
                  {trustScoreMsg && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: trustScoreMsg.includes("set to") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: trustScoreMsg.includes("set to") ? "#22c55e" : "#ef4444", fontSize: 12 }}>{trustScoreMsg}</div>}
                  <button onClick={submitTrustScore} disabled={trustScoreLoading || !trustScoreForm.userId || !trustScoreForm.score}
                    style={{ width: "100%", padding: "9px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: trustScoreLoading || !trustScoreForm.userId || !trustScoreForm.score ? 0.5 : 1 }}>
                    {trustScoreLoading ? "Saving…" : "Set Trust Score"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── ADM-08: System Alerts ── */}
          {activeTab === "Alerts" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: c.text }}>System Alerts</div>
                  <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Threshold-based platform health signals</div>
                </div>
                <button onClick={() => fetchAlerts(alertFilters)}
                  style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.subtext, fontSize: 12, cursor: "pointer" }}>
                  Refresh
                </button>
              </div>
              {/* Filter bar */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16, padding: "10px 12px", background: c.bg, borderRadius: 10, border: `0.5px solid ${c.border}` }}>
                <span style={{ fontSize: 11, color: c.subtext, marginRight: 4 }}>Severity:</span>
                {["", "critical", "warning", "info"].map(sev => (
                  <button key={sev} onClick={() => { const f = { ...alertFilters, severity: sev }; setAlertFilters(f); fetchAlerts(f); }}
                    style={{ padding: "4px 12px", borderRadius: 20, border: `0.5px solid ${alertFilters.severity === sev ? c.primary : c.border}`, background: alertFilters.severity === sev ? c.primarySoft : "transparent", color: alertFilters.severity === sev ? c.primary : c.subtext, fontSize: 11, cursor: "pointer", fontWeight: alertFilters.severity === sev ? 600 : 400 }}>
                    {sev === "" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                  </button>
                ))}
                <span style={{ fontSize: 11, color: c.subtext, marginLeft: 10, marginRight: 4 }}>Component:</span>
                <select value={alertFilters.component} onChange={e => { const f = { ...alertFilters, component: e.target.value }; setAlertFilters(f); fetchAlerts(f); }}
                  style={{ padding: "4px 8px", borderRadius: 6, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, fontSize: 11 }}>
                  <option value="">All components</option>
                  <option value="error_rate">Error Rate</option>
                  <option value="stale_disputes">Stale Disputes</option>
                  <option value="pending_verifications">Pending Verifications</option>
                  <option value="unfunded_escrow">Unfunded Escrow</option>
                  <option value="user_spike">User Spike</option>
                </select>
                {(alertFilters.severity || alertFilters.component) && (
                  <button onClick={() => { const f = { severity: "", component: "" }; setAlertFilters(f); fetchAlerts(f); }}
                    style={{ padding: "4px 10px", borderRadius: 6, border: `0.5px solid ${c.border}`, background: "transparent", color: c.subtext, fontSize: 11, cursor: "pointer" }}>
                    Clear
                  </button>
                )}
              </div>
              {alertsData && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                    {[
                      { label: "Critical", count: alertsData.counts?.critical || 0, color: "#ef4444", bg: "rgba(239,68,68,.1)" },
                      { label: "Warning",  count: alertsData.counts?.warning  || 0, color: "#f59e0b", bg: "rgba(245,158,11,.1)" },
                      { label: "Info",     count: alertsData.counts?.info     || 0, color: "#3b82f6", bg: "rgba(59,130,246,.12)" },
                      { label: "Total",    count: alertsData.counts?.total    || 0, color: c.primary,  bg: c.primarySoft },
                    ].map(s => (
                      <div key={s.label} onClick={() => { if (s.label !== "Total") { const sev = s.label.toLowerCase(); const f = { ...alertFilters, severity: alertFilters.severity === sev ? "" : sev }; setAlertFilters(f); fetchAlerts(f); } }}
                        style={{ background: s.bg, border: `0.5px solid ${s.color}22`, borderRadius: 10, padding: "14px 16px", textAlign: "center", cursor: s.label !== "Total" ? "pointer" : "default" }}>
                        <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.count}</div>
                        <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {alertsData.alerts?.length === 0 ? (
                    <div style={{ background: "rgba(34,197,94,.08)", border: "0.5px solid rgba(34,197,94,.2)", borderRadius: 12, padding: "28px 20px", textAlign: "center" }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#22c55e" }}>All systems healthy</div>
                      <div style={{ fontSize: 12, color: c.subtext, marginTop: 4 }}>No active alerts match the current filters.</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {alertsData.alerts.map((alert: any, i: number) => {
                        const sev   = alert.severity;
                        const color = sev === "critical" ? "#ef4444" : sev === "warning" ? "#f59e0b" : "#3b82f6";
                        const bg    = sev === "critical" ? "rgba(239,68,68,.08)" : sev === "warning" ? "rgba(245,158,11,.08)" : "rgba(59,130,246,.08)";
                        const isExpSubs  = alert.component === "expiring_subscriptions";
                        const isExpanded = expandedAlert === `${i}`;
                        return (
                          <div key={i} style={{ background: bg, border: `0.5px solid ${color}33`, borderRadius: 12, overflow: "hidden" }}>
                            {/* Alert header row */}
                            <div
                              style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 14, cursor: isExpSubs ? "pointer" : "default" }}
                              onClick={() => {
                                if (!isExpSubs) return;
                                if (isExpanded) { setExpandedAlert(null); } else { setExpandedAlert(`${i}`); fetchExpiringUsers(); }
                              }}
                            >
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 5, flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{alert.title}</span>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: `${color}22`, color, fontWeight: 600, textTransform: "uppercase" as const }}>{sev}</span>
                                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: c.bg, color: c.subtext, border: `0.5px solid ${c.border}` }}>{alert.type}</span>
                                    {isExpSubs && <span style={{ fontSize: 11, color: c.subtext }}>{isExpanded ? "▲ Hide" : "▼ Show users"}</span>}
                                  </div>
                                </div>
                                <div style={{ fontSize: 12, color: c.subtext, marginTop: 4 }}>{alert.message}</div>
                              </div>
                            </div>

                            {/* Expanded: expiring subscription user table */}
                            {isExpSubs && isExpanded && (
                              <div style={{ borderTop: `1px solid ${color}33`, padding: "16px 18px", background: c.surface }}>
                                {expiringUsers.length === 0 ? (
                                  <div style={{ fontSize: 12, color: c.subtext }}>No users found.</div>
                                ) : (
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ color: c.subtext, textAlign: "left" }}>
                                        <th style={{ paddingBottom: 8, fontWeight: 600 }}>User</th>
                                        <th style={{ paddingBottom: 8, fontWeight: 600 }}>Email</th>
                                        <th style={{ paddingBottom: 8, fontWeight: 600 }}>Plan</th>
                                        <th style={{ paddingBottom: 8, fontWeight: 600 }}>Expires</th>
                                        <th style={{ paddingBottom: 8, fontWeight: 600 }}>Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {expiringUsers.map((u: any) => (
                                        <tr key={u.user_id} style={{ borderTop: `1px solid ${c.border}` }}>
                                          <td style={{ padding: "8px 0", color: c.text, fontWeight: 500 }}>{u.first_name} {u.last_name}</td>
                                          <td style={{ padding: "8px 8px", color: c.subtext }}>{u.email}</td>
                                          <td style={{ padding: "8px 8px" }}>
                                            <span style={{ background: "#eef2ff", color: "#4f46e5", padding: "2px 8px", borderRadius: 12, fontWeight: 600, textTransform: "capitalize" as const }}>{u.plan_tier}</span>
                                          </td>
                                          <td style={{ padding: "8px 8px", color: u.days_left <= 1 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
                                            {u.days_left}d left
                                          </td>
                                          <td style={{ padding: "8px 0" }}>
                                            {subActionMsg[u.user_id] ? (
                                              <span style={{ fontSize: 11, color: subActionMsg[u.user_id].includes("Cancelled") || subActionMsg[u.user_id].includes("sent") ? "#22c55e" : "#ef4444" }}>
                                                {subActionMsg[u.user_id]}
                                              </span>
                                            ) : (
                                              <div style={{ display: "flex", gap: 6 }}>
                                                <button
                                                  disabled={!!subActionLoading[u.user_id]}
                                                  onClick={() => notifyUser(u.user_id)}
                                                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #6366f1", background: "transparent", color: "#6366f1", cursor: "pointer", fontWeight: 600 }}
                                                >
                                                  {subActionLoading[u.user_id] === "notify" ? "Sending…" : "Send Reminder"}
                                                </button>
                                                <button
                                                  disabled={!!subActionLoading[u.user_id]}
                                                  onClick={() => cancelSubscription(u.user_id)}
                                                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}
                                                >
                                                  {subActionLoading[u.user_id] === "cancel" ? "Cancelling…" : "Cancel Sub"}
                                                </button>
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {!alertsData && <div style={{ textAlign: "center", color: c.subtext, marginTop: 60 }}>Loading alerts…</div>}
            </div>
          )}
        </main>

        {/* Create User Modal */}
        {createUserModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 28, width: 420, maxWidth: "90vw" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 4 }}>Create User Account</div>
              <div style={{ fontSize: 12, color: c.subtext, marginBottom: 20 }}>Admin-created accounts are activated immediately.</div>
              {(["Email", "Password"] as const).map((label) => {
                const key = label.toLowerCase() as "email" | "password";
                return (
                  <div key={label} style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>{label}</label>
                    <input
                      type={key === "password" ? "password" : "text"}
                      value={createUserForm[key]}
                      onChange={e => setCreateUserForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }}
                    />
                  </div>
                );
              })}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Role</label>
                <select value={createUserForm.role} onChange={e => setCreateUserForm(f => ({ ...f, role: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13 }}>
                  <option value="freelancer">Freelancer</option>
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {createUserForm.role === "client" && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Company Name</label>
                  <input value={createUserForm.company_name} onChange={e => setCreateUserForm(f => ({ ...f, company_name: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
                </div>
              )}
              {createUserMsg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, marginBottom: 14, background: createUserMsg.includes("success") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: createUserMsg.includes("success") ? "#22c55e" : "#ef4444" }}>{createUserMsg}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setCreateUserModal(false); setCreateUserMsg(null); }} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.subtext, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button onClick={createUser} disabled={!createUserForm.email || !createUserForm.password || createUserLoading} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: !createUserForm.email || !createUserForm.password || createUserLoading ? 0.5 : 1 }}>
                  {createUserLoading ? "Creating…" : "Create User"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Profile Modal */}
        {editUserModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 28, width: 380, maxWidth: "90vw" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 4 }}>Edit User Profile</div>
              <div style={{ fontSize: 12, color: c.subtext, marginBottom: 20 }}>User #{editUserModal.id}</div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Email</label>
                <input value={editUserForm.email} onChange={e => setEditUserForm(f => ({ ...f, email: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Status</label>
                <select value={editUserForm.status} onChange={e => setEditUserForm(f => ({ ...f, status: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13 }}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="unverified">Unverified</option>
                </select>
              </div>
              {editUserMsg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, marginBottom: 14, background: editUserMsg.includes("updated") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: editUserMsg.includes("updated") ? "#22c55e" : "#ef4444" }}>{editUserMsg}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setEditUserModal(null); setEditUserMsg(null); }} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.subtext, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button onClick={updateUserProfile} disabled={editUserLoading} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: editUserLoading ? 0.5 : 1 }}>
                  {editUserLoading ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Role Modal */}
        {createRoleModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 28, width: 440, maxWidth: "90vw" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 4 }}>Create New Role</div>
              <div style={{ fontSize: 12, color: c.subtext, marginBottom: 20 }}>Define a custom platform role with a unique name and permissions.</div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Role Name (unique key)</label>
                <input value={createRoleForm.role_name} onChange={e => setCreateRoleForm(f => ({ ...f, role_name: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="e.g. moderator" style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Display Name</label>
                <input value={createRoleForm.display_name} onChange={e => setCreateRoleForm(f => ({ ...f, display_name: e.target.value }))} placeholder="e.g. Moderator" style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, boxSizing: "border-box" as const }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Description</label>
                <textarea value={createRoleForm.description} onChange={e => setCreateRoleForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, resize: "vertical" as const, boxSizing: "border-box" as const }} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em", display: "block", marginBottom: 8 }}>Permissions</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
                  {KNOWN_PERMISSIONS.map(({ key, label }) => {
                    const active = createRoleForm.permissions.split(",").map(s => s.trim()).filter(Boolean).includes(key);
                    return (
                      <button key={key} type="button" onClick={() => {
                        const arr = createRoleForm.permissions.split(",").map(s => s.trim()).filter(Boolean);
                        const next = active ? arr.filter(p => p !== key) : [...arr, key];
                        setCreateRoleForm(f => ({ ...f, permissions: next.join(", ") }));
                      }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 8, border: `1px solid ${active ? c.primary : c.border}`, background: active ? c.primarySoft : "transparent", color: active ? c.primary : c.subtext, cursor: "pointer", fontSize: 11, textAlign: "left" as const, fontFamily: "inherit", transition: "all .15s" }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${active ? c.primary : c.border}`, background: active ? c.primary : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff" }}>{active ? "✓" : ""}</span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {createRoleMsg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, marginBottom: 14, background: createRoleMsg.includes("created") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: createRoleMsg.includes("created") ? "#22c55e" : "#ef4444" }}>{createRoleMsg}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setCreateRoleModal(false); setCreateRoleMsg(null); }} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.subtext, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button onClick={createRole} disabled={!createRoleForm.role_name || !createRoleForm.display_name || createRoleLoading} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: !createRoleForm.role_name || !createRoleForm.display_name || createRoleLoading ? 0.5 : 1 }}>
                  {createRoleLoading ? "Creating…" : "Create Role"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change Role Modal */}
        {changeRoleModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 28, width: 360, maxWidth: "90vw" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 4 }}>Change User Role</div>
              <div style={{ fontSize: 12, color: c.subtext, marginBottom: 20 }}>{changeRoleModal.userEmail} · current: <strong style={{ color: c.primary }}>{changeRoleModal.currentRole}</strong></div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>New Role</label>
                <select value={changeRoleValue} onChange={e => setChangeRoleValue(e.target.value)} style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13 }}>
                  <option value="">— Select role —</option>
                  <option value="freelancer">Freelancer</option>
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setChangeRoleModal(null)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.subtext, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button onClick={changeUserRole} disabled={!changeRoleValue || roleActionLoading || changeRoleValue === changeRoleModal.currentRole} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: !changeRoleValue || roleActionLoading || changeRoleValue === changeRoleModal.currentRole ? 0.5 : 1 }}>
                  {roleActionLoading ? "Saving…" : "Assign Role"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Role Config Modal */}
        {editRoleModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 28, width: 440, maxWidth: "90vw" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 4 }}>Configure Role: {editRoleModal.display_name}</div>
              <div style={{ fontSize: 12, color: c.subtext, marginBottom: 20 }}>{editRoleModal.role_name}</div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Description</label>
                <textarea value={editRoleForm.description} onChange={e => setEditRoleForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13, resize: "vertical" as const, boxSizing: "border-box" as const }} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase" as const, letterSpacing: ".08em", display: "block", marginBottom: 8 }}>Permissions</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
                  {KNOWN_PERMISSIONS.map(({ key, label }) => {
                    const active = editRoleForm.permissions.split(",").map(s => s.trim()).filter(Boolean).includes(key);
                    return (
                      <button key={key} type="button" onClick={() => {
                        const arr = editRoleForm.permissions.split(",").map(s => s.trim()).filter(Boolean);
                        const next = active ? arr.filter(p => p !== key) : [...arr, key];
                        setEditRoleForm(f => ({ ...f, permissions: next.join(", ") }));
                      }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 8, border: `1px solid ${active ? c.primary : c.border}`, background: active ? c.primarySoft : "transparent", color: active ? c.primary : c.subtext, cursor: "pointer", fontSize: 11, textAlign: "left" as const, fontFamily: "inherit", transition: "all .15s" }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${active ? c.primary : c.border}`, background: active ? c.primary : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff" }}>{active ? "✓" : ""}</span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setEditRoleModal(null)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.subtext, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button onClick={updateRoleConfig} disabled={roleActionLoading} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: roleActionLoading ? 0.6 : 1 }}>
                  {roleActionLoading ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

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
              {[{ val: stats ? stats.total_users.toLocaleString() : "...", label: "USERS", color: c.text, tab: "Users" }, { val: stats ? stats.total_projects.toLocaleString() : "...", label: "PROJECTS", color: "#22c55e", tab: "Projects" }].map((s) => (
                <div key={s.label} onClick={() => setActiveTab(s.tab)} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 4px", textAlign: "center", cursor: "pointer" }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 9, color: c.subtext }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform stats */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 8 }}>Platform stats</div>
          {stats && [
            { label: "Total freelancers", value: stats.total_freelancers.toLocaleString(), tab: "Users" },
            { label: "Total clients",     value: stats.total_clients.toLocaleString(),     tab: "Users" },
            { label: "Verified users",    value: stats.total_users.toLocaleString(),        tab: "Users" },
            { label: "Pending vetting",   value: verifications.length.toString(), color: "#f59e0b", tab: "Vetting Gate" },
            { label: "Open disputes",     value: disputes.length.toString(),       color: "#ef4444", tab: "Disputes" },
            { label: "Avg match score",   value: aiMetrics?.match_engine_accuracy ? `${aiMetrics.match_engine_accuracy}%` : "N/A", color: "#7F77DD", tab: "Match Engine" },
          ].map((s) => (
            <div key={s.label} onClick={() => setActiveTab(s.tab)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `0.5px solid ${c.border}`, fontSize: 12, cursor: "pointer" }}
              onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.opacity = "0.75")}
              onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.opacity = "1")}
            >
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