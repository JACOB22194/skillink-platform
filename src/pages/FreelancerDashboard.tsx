import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../shared/useAuth";
import { useProfile, useGitHubProfile } from "../api/hooks";
import type { FreelancerProfile } from "../api/types";
import { Skeleton, SkeletonMetric } from "../components/ui/Skeleton";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { API_BASE_URL, getAuthHeaders, logout } from "../shared/api";
import UpgradeNowSection from "../components/UpgradeNowSection";
import { useLanguage, LangToggle } from "../shared/LanguageContext";
import ProjectMatchView from "./freelancer/ProjectMatchView";
import VerificationView from "./freelancer/VerificationView";
import WorkroomsView from "./freelancer/WorkroomsView";
import InvitationsView from "./freelancer/InvitationsView";

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
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 16px", color: active ? colors.primary : colors.subtext, borderLeft: `2px solid ${active ? colors.primary : "transparent"}`, background: active ? colors.bg : "transparent", cursor: "pointer", fontSize: 12 }}
    >
      {icon}
      {label}
      {badge !== undefined && <span style={{ marginLeft: "auto", background: colors.primary, color: "#fff", fontSize: 9, padding: "1px 5px", borderRadius: 20 }}>{badge}</span>}
    </div>
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
const IconRocket = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>;
const IconChart = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;

// ─── Notification Bell ────────────────────────────────────────────────────────

interface AppNotif {
  notification_id: number;
  type: string;
  title: string;
  body?: string;
  is_read: boolean;
  created_at: string;
}

const NOTIF_ICON: Record<string, string> = {
  message:      "💬",
  proposal:     "📄",
  contract:     "📝",
  milestone:    "✅",
  dispute:      "⚠️",
  verification: "🛡️",
  review:       "⭐",
  payment:      "💰",
  system:       "📢",
};

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
    if (!localStorage.getItem("access_token")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/unread-count`, getAuthHeaders());
      if (res.status === 401) { logout(); return; }
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
    if (!localStorage.getItem("access_token")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      });
      if (res.ok) {
        setUnread(0);
        setNotifs((prev: AppNotif[]) => prev.map((n: AppNotif) => ({ ...n, is_read: true })));
      }
    } catch {}
  };

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { if (open) fetchNotifs(); }, [open]);

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
        role="button"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && setOpen(v => !v)}
        style={{ width: 32, height: 32, borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: unread > 0 ? c.primary : c.subtext }} aria-hidden="true">
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
                <div style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{NOTIF_ICON[n.type] ?? "🔔"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text, lineHeight: 1.4 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11, color: c.subtext, marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>}
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

// ─── Metric Skeletons ─────────────────────────────────────────────────────────

const MetricSkeletons: React.FC<{ dark: boolean }> = ({ dark }) => (
  <>
    {[0, 1, 2, 3].map((i) => <SkeletonMetric key={i} dark={dark} />)}
  </>
);



// ─── Main Component ───────────────────────────────────────────────────────────

interface WorkContract {
  contract_id: number;
  status: string;
  created_at: string;
  project?: { project_id: number; title: string; description: string; budget: number; status: string };
  milestones?: { milestone_id: number; title: string | null; amount: number; status: string; due_date: string | null }[];
}

const FreelancerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth<FreelancerProfile>();
  const { data: profile, isLoading: profileLoading, isError: profileError } = useProfile();
  const { data: ghProfile } = useGitHubProfile();
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
  const [inviteCount, setInviteCount] = useState(0);
  const c = getColors(darkMode);
  const { t, isRTL } = useLanguage();
  const fontFamily = isRTL ? "'Cairo', sans-serif" : "sans-serif";

  const displayName = (user?.first_name || user?.last_name)
    ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
    : (user?.email ?? "…");

  const initials = (user?.first_name || user?.last_name)
    ? `${user.first_name?.charAt(0) ?? ""}${user.last_name?.charAt(0) ?? ""}`.toUpperCase()
    : (user?.email ? user.email.split("@")[0].slice(0, 2).toUpperCase() : "…");

  const firstName = user?.first_name || (user?.email ? user.email.split("@")[0] : "…");

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
      if (res.ok) { setWalletMsg(`Withdrawn $${amt.toFixed(2)}`); setWalletAmount(""); }
      else setWalletMsg(d.detail || "Request failed");
      const tx = await fetch(`${API_BASE_URL}/wallet/transactions`, getAuthHeaders()).then(r => r.json()).catch(() => []);
      setWalletTx(Array.isArray(tx) ? tx : []);
    } catch { setWalletMsg("Request failed"); }
    setWalletLoading(false);
  };

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/proposals/my/stats`, getAuthHeaders());
        if (res.ok) setProposalStats(await res.json());
      } catch { /* silent */ }
    })();
  }, []);

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
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: c.bg, color: c.text, fontFamily, fontSize: 13 }} dir={isRTL ? "rtl" : "ltr"}>

        {/* ── Top Bar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Skill<span style={{ color: c.primary }}>Link</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LangToggle style={{ color: c.text }} />
            <button onClick={toggleTheme} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily }} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
              {darkMode ? "☀️" : "🌙"}
            </button>
            <NotificationBell c={c} />
            <div style={{ position: "relative" }}>
              <div role="button" tabIndex={0} aria-label="Open user menu" aria-expanded={dropdownOpen} onClick={() => setDropdownOpen((v) => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDropdownOpen((v) => !v); } }} style={{ width: 28, height: 28, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, border: `0.5px solid ${c.border}`, cursor: "pointer" }}>
                {initials}
              </div>
              {dropdownOpen && (
                <div style={{ position: "absolute", right: 0, top: 36, background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "6px 0", minWidth: 180, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,.15)" }}>
                  <div style={{ padding: "6px 14px 8px", borderBottom: `0.5px solid ${c.border}`, marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{displayName}</div>
                    <div style={{ fontSize: 11, color: c.subtext }}>{t("reg.role.freelancer")}</div>
                  </div>
                  {[
                    { href: "/settings",     label: `⚙️ ${t("common.settings")}` },
                    { href: "/settings/mfa", label: `🔐 ${t("common.mfa")}` },
                    { href: "/github/review",label: `🐙 ${t("fl.nav.updateGithub")}` },
                  ].map(({ href, label }) => (
                    <a key={href} href={href} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: c.text, textDecoration: "none" }}
                      onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >{label}</a>
                  ))}
                  <div role="button" tabIndex={0} onClick={() => { localStorage.clear(); window.location.href = "/login"; }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); localStorage.clear(); window.location.href = "/login"; } }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: "#ef4444", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >{isRTL ? "←" : "→"} {t("common.signOut")}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── Sidebar ── */}
          <aside style={{ width: 200, borderRight: `0.5px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", padding: "16px 0", flexShrink: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>{t("fl.section.main")}</div>
            <NavItem label={t("common.dashboard")} active={activeView === "Dashboard"} icon={<IconGrid />} colors={c} onClick={() => setActiveView("Dashboard")} />
            <NavItem label={t("common.profile")}   icon={<IconUser />} colors={c} onClick={() => navigate("/settings")} />
            <NavItem label={t("common.messages")}  badge={unreadCount} icon={<IconMsg />} colors={c} onClick={() => navigate("/messages")} />
            <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>{t("fl.section.skilllink")}</div>
            <NavItem label={t("common.proposals")}   icon={<IconDoc />}    colors={c} onClick={() => navigate("/proposals")} />
            <NavItem label={t("fl.inv.title")} active={activeView === "Invitations"} badge={inviteCount > 0 ? inviteCount : undefined} icon={<IconTeam />} colors={c} onClick={() => setActiveView("Invitations")} />
            <NavItem label={t("fl.nav.aiMatches")}   badge="New" active={activeView === "AI Matches"} icon={<IconBulb />} colors={c} onClick={() => setActiveView("AI Matches")} />
            <NavItem label="Launchpad"    badge="🚀" icon={<IconRocket />} colors={c} onClick={() => navigate("/launchpad")} />
            <NavItem label="Skill Growth" badge="📈" icon={<IconChart />}  colors={c} onClick={() => navigate("/skill-growth")} />
            <NavItem label={t("common.verification")} active={activeView === "Verification"} icon={<IconShield />} colors={c} onClick={() => setActiveView("Verification")} />
            <NavItem label={t("fl.nav.workrooms")} active={activeView === "Workrooms"} icon={<IconTeam />} colors={c} onClick={() => setActiveView("Workrooms")} />
            {/* ── Upgrade Banner ── */}
            <div style={{ margin: "10px 12px 0" }}>
              <div
                onClick={() => setActiveView("Upgrade")}
                style={{ background: "linear-gradient(135deg, #2a1f4a 0%, #3d2566 100%)", border: `0.5px solid rgba(127,119,221,0.4)`, borderRadius: 10, padding: "12px 12px", cursor: "pointer", transition: "all .2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 20px rgba(127,119,221,0.25)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
              >
                <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#c4b5fd", marginBottom: 4 }}>⭐ Premium</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{t("fl.nav.upgradeNow")}</div>
                <div style={{ fontSize: 10, color: "#c4b5fd", lineHeight: 1.4 }}>{t("land.plan.pro.f1")}, {t("land.plan.pro.f3")} & more.</div>
                <div style={{ marginTop: 8, fontSize: 10, fontWeight: 600, color: "#7F77DD", background: "rgba(127,119,221,0.2)", borderRadius: 6, padding: "4px 8px", display: "inline-block" }}>
                  {t("fl.nav.viewPlans")}
                </div>
              </div>
            </div>
            <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
              <NavItem label={t("common.settings")} icon={<IconSettings />} colors={c} onClick={() => navigate("/settings")} />
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>

            {activeView === "AI Matches"   && <ProjectMatchView c={c} />}
            {activeView === "Invitations"  && <InvitationsView c={c} onCountChange={setInviteCount} />}
            {activeView === "Verification" && <VerificationView c={c} />}
            {activeView === "Workrooms"    && <WorkroomsView c={c} />}
            {activeView === "Upgrade"      && <UpgradeNowSection roleType="freelancer" colors={c} />}

            {activeView === "Dashboard" && <>

            {/* ── Profile hero banner ── */}
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 14, padding: "20px 24px", marginBottom: 16, animation: "fadeIn .5s ease" }}>
              {profileLoading ? (
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <MetricSkeletons dark={darkMode} />
                </div>
              ) : profileError ? (
                <div style={{ fontSize: 13, color: "#ef4444" }}>Failed to load profile. <button onClick={() => window.location.reload()} style={{ color: c.primary, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>Retry</button></div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ width: 54, height: 54, borderRadius: 15, background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, flexShrink: 0, border: `0.5px solid ${c.primary}25` }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: c.text, letterSpacing: "-0.3px" }}>{firstName}</div>
                        {ghProfile?.github_score && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(34,197,94,.12)", color: "#22c55e", border: "0.5px solid rgba(34,197,94,.2)", borderRadius: 100, padding: "2px 8px" }}>✓ AI Gate Verified</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: c.subtext, marginBottom: 16 }}>
                        {ghProfile?.professional_title || profile?.bio?.split(".")[0] || "Freelancer on SkillLink"}
                      </div>
                      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                        {([
                          { label: t("fl.metric.ghScore"), val: ghProfile?.github_score ? `${ghProfile.github_score}/100` : "—", color: c.primary },
                          { label: t("fl.metric.rate"),    val: profile?.hourly_rate ? `$${profile.hourly_rate}/hr` : "—",       color: "#22c55e" },
                          { label: t("fl.metric.wallet"),  val: `$${profile?.wallet_balance?.toFixed(2) ?? "0.00"}`,              color: "#f59e0b" },
                          { label: t("fl.match.skills"),   val: String(profile?.skills?.length ?? 0),                             color: c.text },
                          ...(proposalStats ? [
                            { label: t("fl.recentProposals").split(" ")[0], val: String(proposalStats.sent),     color: c.text },
                            { label: t("contracts.active"),                  val: String(proposalStats.accepted), color: "#22c55e" },
                            { label: "Response",                             val: `${proposalStats.response_rate}%`, color: "#f59e0b" },
                          ] : []),
                        ] as { label: string; val: string; color: string }[]).map(s => (
                          <div key={s.label}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
                            <div style={{ fontSize: 10, color: c.subtext, textTransform: "uppercase", letterSpacing: ".05em", marginTop: 3 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={openWallet} style={{ fontSize: 11, padding: "7px 14px", borderRadius: 8, background: "transparent", border: `0.5px solid ${c.border}`, color: c.subtext, cursor: "pointer", fontFamily }}>{t("fl.metric.wallet")} {isRTL ? "←" : "→"}</button>
                      <button onClick={() => navigate("/settings")} style={{ fontSize: 11, padding: "7px 14px", borderRadius: 8, background: c.primary, border: "none", color: "#fff", cursor: "pointer", fontFamily, fontWeight: 500 }}>{t("common.edit")} {t("common.profile")}</button>
                    </div>
                  </div>
                  {profile?.skills && profile.skills.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `0.5px solid ${c.border}`, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(profile.skills as string[]).slice(0, 14).map((s: string) => (
                        <span key={s} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primary}20` }}>{s}</span>
                      ))}
                      {profile.skills.length > 14 && (
                        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: c.bg, color: c.subtext, border: `0.5px solid ${c.border}` }}>+{profile.skills.length - 14} more</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Active Contracts ── */}
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>Active Contracts</div>
                  {activeContracts.length > 0 && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: "rgba(34,197,94,.1)", color: "#22c55e", border: "0.5px solid rgba(34,197,94,.2)" }}>{activeContracts.length} active</span>
                  )}
                </div>
                <span onClick={() => setActiveView("Workrooms")} style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>All workrooms →</span>
              </div>
              {activeContracts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "22px 0" }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📝</div>
                  <div style={{ fontSize: 12, color: c.subtext }}>No active contracts yet.</div>
                  <div style={{ fontSize: 11, color: c.subtext, marginTop: 4, opacity: .7 }}>Submit proposals to open projects to start working.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeContracts.map((ct: WorkContract) => {
                    const msList = ct.milestones ?? [];
                    const paid  = msList.filter((m: { status: string }) => m.status === "paid").length;
                    const total = msList.length;
                    const pct   = total > 0 ? Math.round((paid / total) * 100) : 0;
                    return (
                      <div key={ct.contract_id}
                        onClick={() => navigate(`/contract/${ct.contract_id}`)}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: c.bg, border: `0.5px solid ${c.border}`, cursor: "pointer", transition: "border-color .15s" }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = c.primary + "66"}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = c.border}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ct.project?.title ?? `Contract #${ct.contract_id}`}</div>
                          <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{total > 0 ? `${paid}/${total} milestones · ${pct}% complete` : "No milestones yet"}</div>
                          {total > 0 && (
                            <div style={{ height: 3, background: c.border, borderRadius: 20, overflow: "hidden", marginTop: 5 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: "#22c55e", borderRadius: 20, transition: "width .4s" }} />
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: c.primary, fontWeight: 500 }}>Open →</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Bio + AI Matches (2-col) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>About Me</div>
                  <a href="/settings" style={{ fontSize: 11, color: c.subtext, textDecoration: "none" }}>Edit →</a>
                </div>
                {profileLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Skeleton width="100%" height={12} dark={darkMode} />
                    <Skeleton width="88%" height={12} dark={darkMode} />
                    <Skeleton width="72%" height={12} dark={darkMode} />
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: c.subtext, lineHeight: 1.6, margin: "0 0 14px" }}>
                    {profile?.bio ?? <span style={{ opacity: .5 }}>No bio yet. <a href="/settings" style={{ color: c.primary, textDecoration: "none" }}>Add one →</a></span>}
                  </p>
                )}
                {ghProfile && (
                  <div style={{ display: "flex", gap: 20, paddingTop: 12, borderTop: `0.5px solid ${c.border}` }}>
                    {([
                      { label: "Stars",     val: ghProfile.github_stats?.total_stars ?? 0 },
                      { label: "Repos",     val: ghProfile.github_stats?.public_repos ?? 0 },
                      { label: "Followers", val: ghProfile.github_stats?.followers ?? 0 },
                    ] as { label: string; val: number }[]).map(s => (
                      <div key={s.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{s.val}</div>
                        <div style={{ fontSize: 10, color: c.subtext }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>AI Job Matches</div>
                    <span style={{ fontSize: 9, fontWeight: 700, background: `${c.primary}18`, color: c.primary, border: `0.5px solid ${c.primary}30`, borderRadius: 100, padding: "2px 7px" }}>AI</span>
                  </div>
                  <span onClick={() => setActiveView("AI Matches")} style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>View all →</span>
                </div>
                <EmptyState label="Click 'AI Matches' in the sidebar" hint="The engine surfaces best-fit projects once clients run AI matching for their jobs." c={c} />
              </div>
            </div>

            </>}
          </main>

        </div>
      </div>

      {/* Wallet Modal */}
      {showWallet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 18, padding: 28, width: 420, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: c.text }}>{t("fl.metric.wallet")}</div>
              <button onClick={() => setShowWallet(false)} style={{ background: "none", border: "none", color: c.subtext, fontSize: 18, cursor: "pointer" }} aria-label="Close wallet">✕</button>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>${profile?.wallet_balance?.toFixed(2) ?? "0.00"}</div>
            <div style={{ fontSize: 12, color: c.subtext, marginBottom: 20 }}>Available balance</div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em" }}>Withdraw Amount (min $5)</label>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input type="number" min="5" value={walletAmount} onChange={e => setWalletAmount(e.target.value)} placeholder="0.00" style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 14 }} aria-label="Withdrawal amount" />
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
