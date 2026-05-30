import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { logout } from "../shared/api";
import UpgradeNowSection from "../components/UpgradeNowSection";
import { useLanguage, LangToggle } from "../shared/LanguageContext";

import { type ThemeColors, getColors, getInitials, fmt, _timeAgo, projectStatusColor, STATUS_COLORS, Badge, Skeleton, NOTIF_ICON, API_BASE_CLIENT, authHdr } from "./client/clientShared";

import CompanyProfileView    from "./client/CompanyProfileView";
import MyProjectsView        from "./client/MyProjectsView";
import FindTalentView        from "./client/FindTalentView";
import InvoicesView          from "./client/InvoicesView";
import ProposalsView         from "./client/ProposalsView";
import SentInvitationsView   from "./client/SentInvitationsView";
import ClientWorkspaceView   from "./client/ClientWorkspaceView";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientProfile  { client_id: number; company_name: string | null; }
interface Project        { project_id: number; client_id: number; title: string; description: string | null; budget: number; sub_category: string | null; category: string | null; status: "open" | "in_progress" | "completed"; required_skills: string[]; }
interface Contract       { contract_id: number; project_id: number; freelancer_id: number; status: "active" | "completed" | "disputed"; created_at: string; }
interface Proposal       { proposal_id: number; project_id: number; freelancer_id: number; bid_amount: number; status: "pending" | "accepted" | "rejected"; created_at: string; }
interface AppNotif       { notification_id: number; type: string; title: string; body?: string; is_read: boolean; created_at: string; }

// ─── Notification Bell ────────────────────────────────────────────────────────

const NotificationBell: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const { t } = useLanguage();
  const [open, setOpen]     = React.useState(false);
  const [notifs, setNotifs] = React.useState<AppNotif[]>([]);
  const [unread, setUnread] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  const fetchCount = async () => {
    if (!localStorage.getItem("access_token")) return;
    try {
      const res = await fetch(`${API_BASE_CLIENT}/notifications/unread-count`, authHdr());
      if (res.status === 401) { logout(); return; }
      if (res.ok) { const d = await res.json(); setUnread(d.count ?? 0); }
    } catch {}
  };

  const markAllRead = async () => {
    if (!localStorage.getItem("access_token")) return;
    try {
      const res = await fetch(`${API_BASE_CLIENT}/notifications/read-all`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      });
      if (res.ok) {
        setUnread(0);
        setNotifs((prev: AppNotif[]) => prev.map((n: AppNotif) => ({ ...n, is_read: true })));
      }
    } catch {}
  };

  React.useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_CLIENT}/notifications?limit=15`, authHdr());
        if (res.ok) setNotifs(await res.json());
      } catch {}
    })();
  }, [open]);

  React.useEffect(() => {
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
            <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{t("common.notifications")}</span>
            <span onClick={markAllRead} style={{ fontSize: 11, color: c.primary, cursor: "pointer" }}>{t("common.markAllRead")}</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {notifs.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: c.subtext, fontSize: 12 }}>{t("common.noNotifs")}</div>
            ) : notifs.map(n => (
              <div key={n.notification_id} style={{ display: "flex", gap: 10, padding: "10px 14px", borderBottom: `0.5px solid ${c.border}`, background: n.is_read ? "transparent" : c.primarySoft + "60" }}>
                <div style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{NOTIF_ICON[n.type] ?? "🔔"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text, lineHeight: 1.4 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11, color: c.subtext, marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>}
                  <div style={{ fontSize: 10, color: c.subtext, marginTop: 3 }}>{_timeAgo(n.created_at)}</div>
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

// ─── Nav + Icons ──────────────────────────────────────────────────────────────

const NavItem: React.FC<{
  label: string; active?: boolean; badge?: number | string;
  icon: React.ReactNode; colors: ThemeColors; onClick?: () => void;
}> = ({ label, active, badge, icon, colors, onClick }) => (
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
      <span style={{ marginLeft: "auto", background: colors.primary, color: "#fff", fontSize: 9, padding: "1px 5px", borderRadius: 20 }}>
        {badge}
      </span>
    )}
  </div>
);

const IconGrid      = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const IconUser      = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconMsg       = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
const IconSearch    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
const IconClip      = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>;
const IconInv       = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4M15 10h5M15 6h3a2 2 0 012 2v8a2 2 0 01-2 2h-3"/></svg>;
const IconProp      = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const IconBriefcase = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>;

// ─── Dashboard ────────────────────────────────────────────────────────────────

const ClientDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const fontFamily = isRTL ? "'Cairo', sans-serif" : "sans-serif";

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const s = localStorage.getItem("skilllink-darkMode");
    return s !== null ? JSON.parse(s) : true;
  });

  const [activeView, setActiveView]     = useState("Dashboard");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [unreadCount, setUnreadCount]   = useState(0);
  const c = getColors(darkMode);

  const [profile, setProfile]                   = useState<ClientProfile | null>(null);
  const [projects, setProjects]                 = useState<Project[]>([]);
  const [contracts, setContracts]               = useState<Contract[]>([]);
  const [proposals, setProposals]               = useState<Proposal[]>([]);
  const [recentActivity, setRecentActivity]     = useState<AppNotif[]>([]);
  const [loadingProfile, setLoadingProfile]     = useState(true);
  const [loadingProjects, setLoadingProjects]   = useState(true);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [loadingProposals, setLoadingProposals] = useState(true);

  const companyName = profile?.company_name || "Your Company";
  const initials    = getInitials(companyName);

  const fetchProfile = useCallback(async () => {
    try { const r = await apiClient.get<ClientProfile>("/users/me/profile"); setProfile(r.data); }
    catch { /* ignore */ }
    finally { setLoadingProfile(false); }
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try { const r = await apiClient.get<Project[]>("/projects/my"); setProjects(r.data); }
    catch { setProjects([]); }
    finally { setLoadingProjects(false); }
  }, []);

  const fetchContracts = useCallback(async () => {
    setLoadingContracts(true);
    try { const r = await apiClient.get<Contract[]>("/contracts/my"); setContracts(r.data); }
    catch { setContracts([]); }
    finally { setLoadingContracts(false); }
  }, []);

  const fetchProposals = useCallback(async () => {
    setLoadingProposals(true);
    try { const r = await apiClient.get<Proposal[]>("/proposals/received"); setProposals(r.data); }
    catch { setProposals([]); }
    finally { setLoadingProposals(false); }
  }, []);

  useEffect(() => {
    fetchProfile(); fetchProjects(); fetchContracts(); fetchProposals();
  }, [fetchProfile, fetchProjects, fetchContracts, fetchProposals]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_CLIENT}/notifications?limit=5`, authHdr());
        if (res.ok) setRecentActivity(await res.json());
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_CLIENT}/messages/inbox`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
        });
        if (res.ok) {
          const conversations = await res.json();
          setUnreadCount(conversations.reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0));
        }
      } catch {}
    })();
  }, []);

  // Derived values
  const contractedProjectIds = new Set(contracts.map(c => c.project_id));
  const activeContracts      = contracts.filter(c => c.status === "active").length;
  const recentContracts      = [...contracts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
  const totalHired           = new Set(contracts.map(c => c.freelancer_id)).size;
  const totalSpent           = projects.filter(p => p.status === "in_progress" || p.status === "completed").reduce((s, p) => s + p.budget, 0);

  const categorySpend: Record<string, number> = {};
  for (const p of projects) {
    if (contractedProjectIds.has(p.project_id)) {
      const cat = p.category || p.sub_category || "Uncategorized";
      categorySpend[cat] = (categorySpend[cat] || 0) + p.budget;
    }
  }
  const spendEntries = Object.entries(categorySpend).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const isLoading = loadingProjects || loadingContracts;

  const toggleTheme = () => {
    setDarkMode(d => { localStorage.setItem("skilllink-darkMode", JSON.stringify(!d)); return !d; });
  };

  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, ...style }}>
      {children}
    </div>
  );

  const sectionHeader = (title: string, action?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{title}</span>
      {action}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: c.bg, color: c.text, fontFamily, fontSize: 13 }} dir={isRTL ? "rtl" : "ltr"}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>

      {/* Top Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LangToggle style={{ color: c.text }} />
          <button onClick={() => navigate("/post-project")} style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginRight: 8 }}>
            {t("cl.postProject")}
          </button>
          <button onClick={toggleTheme} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
            {darkMode ? "☀️" : "🌙"}
          </button>
          <NotificationBell c={c} />
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setDropdownOpen(v => !v)}
              style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(127,119,221,.2)", color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, border: `0.5px solid ${c.border}`, cursor: "pointer" }}
            >
              {loadingProfile ? "…" : initials}
            </div>
            {dropdownOpen && (
              <div style={{ position: "absolute", right: 0, top: 36, background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "6px 0", minWidth: 180, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,.15)" }}>
                <div style={{ padding: "6px 14px 8px", borderBottom: `0.5px solid ${c.border}`, marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{companyName}</div>
                  <div style={{ fontSize: 11, color: c.subtext }}>{t("reg.role.client")}</div>
                </div>
                <a href="/settings/client" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: c.text, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  ⚙️ {t("common.settings")}
                </a>
                <a href="/settings/mfa" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: c.text, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  🔐 {t("common.mfa")}
                </a>
                <div
                  onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: "#ef4444", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  {isRTL ? "←" : "→"} {t("common.signOut")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar */}
        <aside style={{ width: 200, borderRight: `0.5px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", padding: "16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>{t("fl.section.main")}</div>
          <NavItem label={t("common.dashboard")}      active={activeView === "Dashboard"}       onClick={() => setActiveView("Dashboard")}       icon={<IconGrid />}   colors={c} />
          <NavItem label={t("cl.nav.companyProfile")} active={activeView === "Company Profile"} onClick={() => setActiveView("Company Profile")} icon={<IconUser />}   colors={c} />
          <NavItem label={t("common.messages")}       badge={unreadCount}                       onClick={() => navigate("/messages")}            icon={<IconMsg />}    colors={c} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>{t("cl.section.hiring")}</div>
          <NavItem label={t("cl.nav.findTalent")}    badge="New" active={activeView === "Find Talent"}    onClick={() => setActiveView("Find Talent")}    icon={<IconSearch />}    colors={c} />
          <NavItem label={t("common.proposals")}     badge={proposals.filter(p => p.status === "pending").length || undefined} active={activeView === "Proposals"} onClick={() => setActiveView("Proposals")} icon={<IconProp />} colors={c} />
          <NavItem label={t("cl.nav.invitations")}               active={activeView === "Invitations"}     onClick={() => setActiveView("Invitations")}     icon={<IconMsg />}       colors={c} />
          <NavItem label={t("cl.nav.activeProjects")}            active={activeView === "Active Projects"} onClick={() => setActiveView("Active Projects")} icon={<IconClip />}      colors={c} />
          <NavItem label={t("cl.nav.workspace")}     badge={contracts.filter((ct: Contract) => ct.status === "active").length || undefined} active={activeView === "Workspace"} onClick={() => setActiveView("Workspace")} icon={<IconBriefcase />} colors={c} />
          <NavItem label={t("cl.nav.invoices")}                  active={activeView === "Invoices"}        onClick={() => setActiveView("Invoices")}        icon={<IconInv />}       colors={c} />

          <div style={{ margin: "10px 12px 0" }}>
            <div
              onClick={() => setActiveView("Upgrade")}
              style={{ background: "linear-gradient(135deg,#1a2640,#1e3560)", border: "0.5px solid rgba(59,130,246,0.35)", borderRadius: 10, padding: 12, cursor: "pointer" }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
            >
              <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#7eb3f8", marginBottom: 4 }}>⭐ Premium</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{t("cl.upgradeNow")}</div>
              <div style={{ fontSize: 10, color: "#7eb3f8", lineHeight: 1.4 }}>Post unlimited jobs, AI talent matching & more.</div>
              <div style={{ marginTop: 8, fontSize: 10, fontWeight: 600, color: "#3b82f6", background: "rgba(59,130,246,.15)", borderRadius: 6, padding: "4px 8px", display: "inline-block" }}>
                {t("cl.viewPlans")}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
            <div onClick={toggleTheme} style={{ fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>{t("cl.switchTheme")}</div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>
          {activeView === "Upgrade" && <UpgradeNowSection roleType="client" colors={c} />}

          {activeView === "Company Profile" && (
            <CompanyProfileView colors={c} onSave={name => setProfile(p => p ? { ...p, company_name: name } : null)} />
          )}
          {activeView === "Find Talent" && (
            <FindTalentView colors={c} projects={projects} projLoading={loadingProjects} />
          )}
          {activeView === "Active Projects" && (
            <MyProjectsView colors={c} projects={projects} contracts={contracts} proposals={proposals} loading={loadingProjects} onRefresh={() => { fetchProjects(); fetchContracts(); fetchProposals(); }} />
          )}
          {activeView === "Invoices" && <InvoicesView colors={c} />}
          {activeView === "Invitations" && <SentInvitationsView colors={c} />}
          {activeView === "Workspace" && (
            <ClientWorkspaceView colors={c} contracts={contracts} projects={projects} loading={loadingContracts || loadingProjects} onRefresh={() => { fetchContracts(); fetchProjects(); }} />
          )}
          {activeView === "Proposals" && (
            <ProposalsView colors={c} projects={projects} proposals={proposals} loading={loadingProposals} onRefresh={() => { fetchProposals(); fetchProjects(); fetchContracts(); }} />
          )}

          {activeView === "Dashboard" && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>

              {/* Welcome banner */}
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 14, padding: "18px 22px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(127,119,221,.15)", color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0, border: `0.5px solid ${c.primary}30` }}>
                    {loadingProfile ? "…" : initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: c.text, letterSpacing: "-0.3px" }}>
                      {loadingProfile ? <Skeleton w={160} h={16} /> : t("cl.welcome", { name: companyName })}
                    </div>
                    <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>{t("reg.role.client")} · AI-assisted hiring dashboard</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                  {([
                    { label: t("cl.stat.projects"), val: String(projects.length), color: c.text },
                    { label: t("cl.stat.active"),   val: String(activeContracts), color: "#22c55e" },
                    { label: t("cl.stat.hired"),     val: String(totalHired),      color: c.primary },
                    { label: t("cl.stat.spent"),     val: fmt(totalSpent),          color: "#f59e0b" },
                  ]).map(s => (
                    <div key={s.label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: isLoading ? c.subtext : s.color, lineHeight: 1 }}>{isLoading ? "…" : s.val}</div>
                      <div style={{ fontSize: 10, color: c.subtext, letterSpacing: ".05em", textTransform: "uppercase", marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Profile incomplete nudge */}
              {!loadingProfile && (!profile?.company_name || profile.company_name === "Your Company") && (
                <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(59,130,246,.08)", border: "0.5px solid rgba(59,130,246,.25)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🏢</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Complete your company profile</div>
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 1 }}>Add your company name and industry to attract top freelancers.</div>
                    </div>
                  </div>
                  <button onClick={() => setActiveView("Company Profile")} style={{ fontSize: 11, padding: "6px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 500, flexShrink: 0 }}>Complete Profile →</button>
                </div>
              )}

              {/* My Projects horizontal scroll */}
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>My Projects</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span onClick={() => setActiveView("Active Projects")} style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>View all →</span>
                    <button onClick={() => navigate("/post-project")} style={{ fontSize: 11, fontWeight: 500, padding: "5px 12px", borderRadius: 8, background: c.primary, color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}>+ Post New</button>
                  </div>
                </div>
                {isLoading ? (
                  <div style={{ display: "flex", gap: 12 }}>{[1,2,3].map(i => <Skeleton key={i} w={200} h={110} />)}</div>
                ) : projects.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 0" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 4 }}>No projects yet</div>
                    <div style={{ fontSize: 12, color: c.subtext, marginBottom: 14 }}>Post your first project and let AI find the best talent.</div>
                    <button onClick={() => navigate("/post-project")} style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Post First Project</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
                    {projects.map(p => {
                      const s = projectStatusColor(p.status);
                      const hasContract = contractedProjectIds.has(p.project_id);
                      const proposalCount = proposals.filter(pr => pr.project_id === p.project_id).length;
                      return (
                        <div key={p.project_id}
                          onClick={() => setActiveView("Active Projects")}
                          style={{ flexShrink: 0, width: 210, background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 14, cursor: "pointer", transition: "border-color .15s" }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = c.primary + "70")}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = c.border)}
                        >
                          <div style={{ fontSize: 12, fontWeight: 600, color: c.text, lineHeight: 1.4, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{p.title}</div>
                          <Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: "0 0 10px" }}>{s.label}</Badge>
                          <div style={{ fontSize: 11, color: c.subtext, marginBottom: 3 }}>{fmt(p.budget)} · {p.category || "General"}</div>
                          <div style={{ fontSize: 11, color: c.subtext }}>{proposalCount} proposal{proposalCount !== 1 ? "s" : ""} · {hasContract ? "✓ Hired" : "No hire"}</div>
                        </div>
                      );
                    })}
                    <div
                      onClick={() => navigate("/post-project")}
                      style={{ flexShrink: 0, width: 150, background: c.bg, border: `1px dashed ${c.border}`, borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, transition: "border-color .15s" }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = c.primary)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = c.border)}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>+</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: c.primary, textAlign: "center" }}>Post a Project</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Active Contracts + AI Match */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>Active Contracts</div>
                    <span onClick={() => setActiveView("Workspace")} style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>Workspace →</span>
                  </div>
                  {isLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[1,2].map(i => <Skeleton key={i} h={52} />)}</div>
                  ) : recentContracts.filter(ct => ct.status === "active").length === 0 ? (
                    <div style={{ textAlign: "center", padding: "22px 0" }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>📝</div>
                      <div style={{ fontSize: 12, color: c.subtext }}>No active contracts.</div>
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 4, opacity: .7 }}>Accept a proposal to start working with a freelancer.</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {recentContracts.filter(ct => ct.status === "active").map(ct => {
                        const proj = projects.find(p => p.project_id === ct.project_id);
                        const cs = STATUS_COLORS[ct.status];
                        return (
                          <div key={ct.contract_id} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proj?.title ?? `Project #${ct.project_id}`}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                <Badge bg={cs.bg} color={cs.color} border={cs.border} style={{ margin: 0 }}>{ct.status}</Badge>
                                <span style={{ fontSize: 10, color: c.subtext }}>{proj ? fmt(proj.budget) : "—"}</span>
                              </div>
                            </div>
                            <span onClick={() => navigate(`/contract/${ct.contract_id}`)} style={{ fontSize: 11, color: c.primary, cursor: "pointer", fontWeight: 500, flexShrink: 0 }}>Workroom →</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>AI Talent Match</div>
                      <span style={{ fontSize: 9, fontWeight: 700, background: `${c.primary}18`, color: c.primary, border: `0.5px solid ${c.primary}30`, borderRadius: 100, padding: "2px 7px" }}>AI</span>
                    </div>
                    <span onClick={() => setActiveView("Find Talent")} style={{ fontSize: 11, color: c.primary, cursor: "pointer", fontWeight: 500 }}>Find Talent →</span>
                  </div>
                  {isLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[1,2,3].map(i => <Skeleton key={i} h={44} />)}</div>
                  ) : projects.filter(p => p.status === "open").length === 0 ? (
                    <div style={{ textAlign: "center", padding: "22px 0" }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 4 }}>No open projects</div>
                      <div style={{ fontSize: 11, color: c.subtext }}>Post a project to start AI matching.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: c.subtext, marginBottom: 10 }}>Select a project to match top freelancers</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {projects.filter(p => p.status === "open").slice(0, 3).map(p => (
                          <div key={p.project_id}
                            onClick={() => setActiveView("Find Talent")}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: c.bg, border: `0.5px solid ${c.border}`, cursor: "pointer", transition: "border-color .15s" }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = c.primary + "60")}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = c.border)}
                          >
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🔍</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                              <div style={{ fontSize: 10, color: c.subtext, marginTop: 2 }}>{fmt(p.budget)} · {p.category || "Uncategorized"}</div>
                            </div>
                            <span style={{ fontSize: 11, color: c.primary, flexShrink: 0 }}>Match →</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Pending Proposals */}
              {!loadingProposals && proposals.filter(p => p.status === "pending").length > 0 && (
                <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>Pending Proposals</div>
                      <span style={{ background: "#f59e0b18", color: "#f59e0b", border: "0.5px solid #f59e0b30", borderRadius: 100, fontSize: 10, fontWeight: 700, padding: "2px 8px" }}>{proposals.filter(p => p.status === "pending").length}</span>
                    </div>
                    <span onClick={() => setActiveView("Proposals")} style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>Review all →</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {proposals.filter(p => p.status === "pending").slice(0, 3).map(pr => {
                      const proj = projects.find(p => p.project_id === pr.project_id);
                      return (
                        <div key={pr.proposal_id} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proj?.title ?? `Project #${pr.project_id}`}</div>
                            <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>Freelancer #{pr.freelancer_id} · {fmt(pr.bid_amount)} · {new Date(pr.created_at).toLocaleDateString()}</div>
                          </div>
                          <span onClick={() => setActiveView("Proposals")} style={{ fontSize: 11, color: "#f59e0b", cursor: "pointer", fontWeight: 500, flexShrink: 0 }}>Review →</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Spend + Activity */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                {card(
                  <>
                    {sectionHeader("Spend by Category")}
                    {spendEntries.length === 0 ? (
                      <div style={{ fontSize: 12, color: c.subtext, textAlign: "center", padding: "20px 0" }}>No spend data yet. Budget tracked once a contract is active.</div>
                    ) : (() => {
                      const maxS = Math.max(...spendEntries.map(([, v]) => v));
                      return spendEntries.map(([label, amount]) => (
                        <div key={label} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                            <span style={{ color: c.subtext, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{label}</span>
                            <span style={{ fontWeight: 600, color: c.text }}>{fmt(amount)}</span>
                          </div>
                          <div style={{ height: 6, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.round((amount / maxS) * 100)}%`, background: `linear-gradient(90deg,${c.primary},${c.primary}aa)`, borderRadius: 20, transition: "width .6s" }} />
                          </div>
                        </div>
                      ));
                    })()}
                  </>
                )}
                {card(
                  <>
                    {sectionHeader("Recent Activity")}
                    {recentActivity.length === 0 ? (
                      <div style={{ fontSize: 12, color: c.subtext, textAlign: "center", padding: "20px 0" }}>No recent activity</div>
                    ) : recentActivity.map(n => (
                      <div key={n.notification_id} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: `0.5px solid ${c.border}` }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: n.is_read ? c.border : c.primary, flexShrink: 0, marginTop: 5 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: c.text, lineHeight: 1.4 }}>{n.title}{n.body ? ` — ${n.body}` : ""}</div>
                          <div style={{ fontSize: 10, color: c.subtext, marginTop: 2 }}>{_timeAgo(n.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ClientDashboard;
