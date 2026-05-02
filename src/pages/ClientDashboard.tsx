import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import UpgradeNowSection from "../components/UpgradeNowSection";

// ─── API Types (matching backend schema exactly) ──────────────────────────────

interface ClientProfile {
  client_id: number;
  company_name: string | null;
}

interface Project {
  project_id: number;
  client_id: number;
  title: string;
  description: string | null;
  budget: number;
  sub_category: string | null;
  category: string | null;
  status: "open" | "in_progress" | "completed";
  required_skills: string[];
}

interface Contract {
  contract_id: number;
  project_id: number;
  freelancer_id: number;
  status: "active" | "completed" | "disputed";
  created_at: string;
}

interface Proposal {
  proposal_id: number;
  project_id: number;
  freelancer_id: number;
  bid_amount: number;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

// ─── Derived / UI Types ───────────────────────────────────────────────────────

interface DashboardStats {
  activeProjects: number;
  inProgressProjects: number;
  completedProjects: number;
  totalProjects: number;
  totalHired: number;        // unique freelancers under contract
  totalSpent: number;        // sum of budgets for completed/in_progress projects
  pendingProposals: number;  // open proposals across all projects
}

interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primarySoft: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE" };

// ─── Notification Bell ────────────────────────────────────────────────────────

interface AppNotif {
  notification_id: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

const _timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const API_BASE_CLIENT = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const authHdr = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });

const NotificationBell: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const [open, setOpen]     = React.useState(false);
  const [notifs, setNotifs] = React.useState<AppNotif[]>([]);
  const [unread, setUnread] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  const fetchCount = async () => {
    try {
      const res = await fetch(`${API_BASE_CLIENT}/notifications/unread-count`, authHdr());
      if (res.ok) { const d = await res.json(); setUnread(d.count ?? 0); }
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await fetch(`${API_BASE_CLIENT}/notifications/read-all`, { method: "PATCH", ...authHdr() });
      setUnread(0);
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
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
    markAllRead();
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

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const fmt = (n: number): string => {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

const projectStatusColor = (status: Project["status"]): { bg: string; color: string; border: string; label: string } => {
  if (status === "in_progress") return { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)", label: "In Progress" };
  if (status === "completed")   return { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)", label: "Completed" };
  return { bg: "rgba(245,158,11,.1)", color: "#f59e0b", border: "rgba(245,158,11,.2)", label: "Open" };
};

const contractStatusColor = (status: Contract["status"]): { bg: string; color: string; border: string } => {
  if (status === "active")    return { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" };
  if (status === "completed") return { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)" };
  return { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "rgba(239,68,68,.2)" };
};

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  "In Progress": { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" },
  "Open":        { bg: "rgba(245,158,11,.1)", color: "#f59e0b", border: "rgba(245,158,11,.2)" },
  "Completed":   { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)" },
  "active":      { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" },
  "completed":   { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)" },
  "disputed":    { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "rgba(239,68,68,.2)" },
  "pending":     { bg: "rgba(245,158,11,.1)", color: "#f59e0b", border: "rgba(245,158,11,.2)" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Badge: React.FC<{
  bg: string; color: string; border: string;
  children: React.ReactNode; style?: React.CSSProperties;
}> = ({ bg, color, border, children, style }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10,
    padding: "3px 8px", borderRadius: 100,
    background: bg, color, border: `0.5px solid ${border}`, ...style,
  }}>
    {children}
  </span>
);

const Skeleton: React.FC<{ w?: number | string; h?: number; r?: number; style?: React.CSSProperties }> =
  ({ w = "100%", h = 16, r = 6, style }) => (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg, rgba(255,255,255,.05) 25%, rgba(255,255,255,.1) 50%, rgba(255,255,255,.05) 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.4s infinite",
      ...style,
    }} />
  );

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

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconGrid   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const IconUser   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconMsg    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
const IconSearch = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
const IconClip   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>;
const IconInv    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4M15 10h5M15 6h3a2 2 0 012 2v8a2 2 0 01-2 2h-3"/></svg>;
const IconRefresh = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>;
const IconProp    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;

// ─── Company Profile View ─────────────────────────────────────────────────────

const INDUSTRIES = ["Technology", "Finance", "Healthcare", "Education", "E-Commerce", "Marketing", "Design", "Consulting", "Real Estate", "Other"];
const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–500", "500+"];

const CompanyProfileView: React.FC<{ colors: ThemeColors; onSave: (name: string) => void }> = ({ colors: c, onSave }) => {
  const [companyName,  setCompanyName]  = useState("");
  const [website,      setWebsite]      = useState("");
  const [industry,     setIndustry]     = useState("");
  const [size,         setSize]         = useState("");
  const [description,  setDescription]  = useState("");
  const [location,     setLocation]     = useState("");
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [feedback,     setFeedback]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeTab,    setActiveTab]    = useState<"general" | "details">("general");

  // Load persisted extra fields from localStorage
  useEffect(() => {
    apiClient.get<ClientProfile>("/users/me/profile")
      .then(r => {
        setCompanyName(r.data.company_name || "");
        const saved = JSON.parse(localStorage.getItem("skilllink-company-meta") || "{}");
        setWebsite(saved.website || "");
        setIndustry(saved.industry || "");
        setSize(saved.size || "");
        setDescription(saved.description || "");
        setLocation(saved.location || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await apiClient.put("/users/me/profile", { company_name: companyName });
      // Persist extra fields locally until backend supports them
      localStorage.setItem("skilllink-company-meta", JSON.stringify({ website, industry, size, description, location }));
      onSave(companyName);
      setFeedback({ msg: "✓ Profile saved successfully!", ok: true });
    } catch {
      setFeedback({ msg: "✗ Failed to save changes.", ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const initials = companyName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "CO";
  const completeness = [companyName, website, industry, size, description, location].filter(Boolean).length;
  const completePct = Math.round((completeness / 6) * 100);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", fontSize: 13,
    background: c.bg, color: c.text,
    border: `1px solid ${c.border}`, borderRadius: 8,
    outline: "none", boxSizing: "border-box",
    transition: "border-color .2s",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600,
    color: c.subtext, marginBottom: 6,
    textTransform: "uppercase", letterSpacing: ".06em",
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${c.border}`, borderTopColor: c.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", maxWidth: 800, animation: "fadeIn 0.4s ease" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: c.text, margin: 0 }}>Company Profile</h2>
        <p style={{ fontSize: 13, color: c.subtext, margin: "4px 0 0" }}>Manage your corporate identity and visibility on SkillLink.</p>
      </div>

      {/* ── Hero card ── */}
      <div style={{ background: `linear-gradient(135deg, ${c.primarySoft} 0%, ${c.surface} 60%)`, border: `1px solid ${c.border}`, borderRadius: 16, padding: 24, marginBottom: 24, display: "flex", alignItems: "center", gap: 20, position: "relative", overflow: "hidden" }}>
        {/* Decorative blob */}
        <div style={{ position: "absolute", right: -40, top: -40, width: 160, height: 160, borderRadius: "50%", background: `rgba(127,119,221,.08)`, pointerEvents: "none" }} />

        {/* Avatar */}
        <div style={{ width: 72, height: 72, borderRadius: 18, background: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "#fff", flexShrink: 0, boxShadow: `0 4px 20px rgba(127,119,221,.35)` }}>
          {initials}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: c.text }}>{companyName || "Your Company"}</div>
          <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>
            {industry && <span style={{ marginRight: 12 }}>🏢 {industry}</span>}
            {location && <span style={{ marginRight: 12 }}>📍 {location}</span>}
            {size     && <span>👥 {size} employees</span>}
          </div>
          {website && (
            <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: c.primary, textDecoration: "none", marginTop: 4, display: "inline-block" }}>
              🔗 {website}
            </a>
          )}
        </div>

        {/* Profile completeness */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ position: "relative", width: 56, height: 56, margin: "0 auto 6px" }}>
            <svg viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)", width: 56, height: 56 }}>
              <circle cx="28" cy="28" r="22" fill="none" stroke={c.border} strokeWidth="5" />
              <circle cx="28" cy="28" r="22" fill="none" stroke={c.primary} strokeWidth="5"
                strokeDasharray={`${2 * Math.PI * 22}`}
                strokeDashoffset={`${2 * Math.PI * 22 * (1 - completePct / 100)}`}
                strokeLinecap="round" style={{ transition: "stroke-dashoffset .6s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: c.text }}>{completePct}%</div>
          </div>
          <div style={{ fontSize: 10, color: c.subtext, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Complete</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {(["general", "details"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: "7px 20px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all .2s",
              background: activeTab === tab ? c.primary : "transparent",
              color:      activeTab === tab ? "#fff" : c.subtext,
            }}>
            {tab === "general" ? "General" : "Details"}
          </button>
        ))}
      </div>

      {/* ── Form card ── */}
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 24 }}>

        {activeTab === "general" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Company Name — full width */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Company Name *</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corporation"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = c.primary)}
                onBlur={e  => (e.target.style.borderColor = c.border)} />
            </div>

            <div>
              <label style={labelStyle}>Website</label>
              <input value={website} onChange={e => setWebsite(e.target.value)}
                placeholder="https://yourcompany.com"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = c.primary)}
                onBlur={e  => (e.target.style.borderColor = c.border)} />
            </div>

            <div>
              <label style={labelStyle}>Location</label>
              <input value={location} onChange={e => setLocation(e.target.value)}
                placeholder="e.g. New York, USA"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = c.primary)}
                onBlur={e  => (e.target.style.borderColor = c.border)} />
            </div>
          </div>
        )}

        {activeTab === "details" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <label style={labelStyle}>Industry</label>
              <select value={industry} onChange={e => setIndustry(e.target.value)}
                style={{ ...inputStyle, appearance: "none" }}>
                <option value="">Select industry…</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Company Size</label>
              <select value={size} onChange={e => setSize(e.target.value)}
                style={{ ...inputStyle, appearance: "none" }}>
                <option value="">Select size…</option>
                {COMPANY_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>About the Company</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                rows={4} placeholder="Briefly describe what your company does…"
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
                onFocus={e => (e.target.style.borderColor = c.primary)}
                onBlur={e  => (e.target.style.borderColor = c.border)} />
              <div style={{ fontSize: 11, color: c.subtext, marginTop: 4, textAlign: "right" }}>{description.length} / 500</div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, paddingTop: 20, borderTop: `1px solid ${c.border}` }}>
          {feedback ? (
            <span style={{ fontSize: 13, fontWeight: 500, color: feedback.ok ? "#22c55e" : "#f87171" }}>{feedback.msg}</span>
          ) : (
            <span style={{ fontSize: 12, color: c.subtext }}>
              {completePct < 100 ? `${6 - completeness} field${6 - completeness !== 1 ? "s" : ""} remaining to complete your profile` : "✓ Profile is complete"}
            </span>
          )}
          <button onClick={save} disabled={saving || !companyName.trim()}
            style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 9, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: saving || !companyName.trim() ? "not-allowed" : "pointer", opacity: saving || !companyName.trim() ? 0.7 : 1, transition: "opacity .2s" }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── My Projects View ─────────────────────────────────────────────────────────

const MyProjectsView: React.FC<{ colors: ThemeColors; projects: Project[]; contracts: Contract[]; proposals: Proposal[]; loading: boolean; onRefresh: () => void }> =
  ({ colors, projects, contracts, proposals, loading, onRefresh }) => {
  const navigate = useNavigate();
  const contractByProject = Object.fromEntries(contracts.map(c => [c.project_id, c]));
  const proposalsByProject = proposals.reduce<Record<number, number>>((acc, p) => {
    if (p.status === "pending") acc[p.project_id] = (acc[p.project_id] || 0) + 1;
    return acc;
  }, {});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId]   = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "completed">("all");
  const filtered = filter === "all" ? projects : projects.filter(p => p.status === filter);

  const handleDelete = async (projectId: number) => {
    setDeletingId(projectId);
    try {
      await apiClient.delete(`/projects/${projectId}`);
      onRefresh();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to delete project.");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const thStyle: React.CSSProperties = { fontSize: 10, color: colors.subtext, textAlign: "left", padding: "0 8px 8px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500, borderBottom: `0.5px solid ${colors.border}` };
  const tdStyle: React.CSSProperties = { padding: "10px 8px", fontSize: 12, color: colors.text, borderBottom: `0.5px solid ${colors.border}` };

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: colors.text }}>Active Projects</div>
          <div style={{ fontSize: 12, color: colors.subtext, marginTop: 3 }}>All projects you have posted</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onRefresh} style={{ background: "transparent", border: `0.5px solid ${colors.border}`, color: colors.subtext, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <IconRefresh /> Refresh
          </button>
          <button onClick={() => navigate("/post-project")} style={{ background: colors.primary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            + Post Project
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["all", "open", "in_progress", "completed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 11, padding: "5px 14px", borderRadius: 20, border: `0.5px solid ${filter === f ? colors.primary : colors.border}`, background: filter === f ? colors.primarySoft : "transparent", color: filter === f ? colors.primary : colors.subtext, cursor: "pointer", fontFamily: "inherit", fontWeight: filter === f ? 600 : 400 }}>
            {f === "all" ? `All (${projects.length})` : f === "open" ? `Open (${projects.filter(p => p.status === "open").length})` : f === "in_progress" ? `In Progress (${projects.filter(p => p.status === "in_progress").length})` : `Completed (${projects.filter(p => p.status === "completed").length})`}
          </button>
        ))}
      </div>
      <div style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8 }}>
            {[1,2,3].map(i => <Skeleton key={i} h={40} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: colors.subtext }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: colors.text, marginBottom: 6 }}>{filter === "all" ? "No projects yet" : `No ${filter.replace("_", " ")} projects`}</div>
            <div style={{ fontSize: 12 }}>Post your first project to start hiring</div>
            <button onClick={() => navigate("/post-project")} style={{ marginTop: 16, background: colors.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              + Post Project
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Title", "Budget", "Category", "Status", "Proposals", "Contract", ""].map(h =>
                  <th key={h} style={thStyle}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const s = projectStatusColor(p.status);
                const contract = contractByProject[p.project_id];
                const cs = contract ? contractStatusColor(contract.status) : null;
                return (
                  <tr key={p.project_id}>
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 200 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                      {p.required_skills.length > 0 && (
                        <div style={{ fontSize: 10, color: colors.subtext, marginTop: 3 }}>{p.required_skills.slice(0, 3).join(", ")}</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{fmt(p.budget)}</td>
                    <td style={{ ...tdStyle, color: colors.subtext }}>{p.category || p.sub_category || "—"}</td>
                    <td style={tdStyle}>
                      <Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{s.label}</Badge>
                    </td>
                    <td style={tdStyle}>
                      {(() => {
                        const cnt = proposalsByProject[p.project_id] || 0;
                        return cnt > 0
                          ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 100, background: "rgba(245,158,11,.1)", color: "#f59e0b", fontWeight: 500 }}>{cnt} pending</span>
                          : <span style={{ color: colors.subtext, fontSize: 11 }}>—</span>;
                      })()}
                    </td>
                    <td style={tdStyle}>
                      {cs ? (
                        <Badge bg={cs.bg} color={cs.color} border={cs.border} style={{ margin: 0 }}>#{contract!.contract_id} · {contract!.status}</Badge>
                      ) : (
                        <span style={{ color: colors.subtext, fontSize: 11 }}>No contract</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                      {confirmId === p.project_id ? (
                        <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            onClick={() => handleDelete(p.project_id)}
                            disabled={deletingId === p.project_id}
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                            {deletingId === p.project_id ? "…" : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border}`, background: "transparent", color: colors.subtext, cursor: "pointer" }}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmId(p.project_id)}
                          disabled={!!contractByProject[p.project_id]}
                          title={contractByProject[p.project_id] ? "Cannot delete a project with an active contract" : "Delete project"}
                          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid rgba(239,68,68,.3)`, background: "rgba(239,68,68,.08)", color: "#ef4444", cursor: contractByProject[p.project_id] ? "not-allowed" : "pointer", opacity: contractByProject[p.project_id] ? 0.4 : 1 }}>
                          🗑 Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── Find Talent View (unchanged from original — already uses real API) ────────

interface MatchedFreelancer {
  freelancer_id: number;
  user_id: number;
  email: string;
  bio: string | null;
  hourly_rate: number | null;
  success_score: number;
  skills: string[];
  ai_match_score: number | null;
}

const MATCH_PALETTE = [
  { bg: "#2a2640", color: "#7F77DD" },
  { bg: "rgba(34,197,94,.12)", color: "#22c55e" },
  { bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
  { bg: "rgba(245,158,11,.1)", color: "#f59e0b" },
  { bg: "rgba(239,68,68,.1)", color: "#ef4444" },
];

const FindTalentView: React.FC<{ colors: ThemeColors; projects: Project[]; projLoading: boolean }> = ({ colors, projects, projLoading }) => {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [matches, setMatches]       = useState<MatchedFreelancer[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [latency, setLatency]       = useState(0);
  const [viewProfile, setViewProfile] = useState<MatchedFreelancer | null>(null);

  useEffect(() => {
    if (projects.length > 0 && !selectedId) setSelectedId(projects[0].project_id);
  }, [projects, selectedId]);

  const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";

  const runMatch = async () => {
    if (!selectedId) return;
    setLoading(true); setError(""); setMatches([]);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE}/projects/${selectedId}/ai-match`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Match failed");
      const data = await res.json();
      setMatches(data.matches || []);
      setLatency(Math.round(performance.now() - t0));
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: colors.text }}>Find Talent</div>
        <div style={{ fontSize: 12, color: colors.subtext, marginTop: 3 }}>AI-powered freelancer matching for your projects</div>
      </div>

      <div style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {projLoading ? (
            <Skeleton w={240} h={36} />
          ) : (
            <select
              value={selectedId ?? ""}
              onChange={e => setSelectedId(Number(e.target.value))}
              style={{ flex: 1, minWidth: 200, padding: "8px 12px", fontSize: 13, background: colors.bg, color: colors.text, border: `0.5px solid ${colors.border}`, borderRadius: 8, outline: "none" }}
            >
              {projects.length === 0
                ? <option value="">No projects available</option>
                : projects.filter(p => p.status === "open").map(p => (
                    <option key={p.project_id} value={p.project_id}>{p.title}</option>
                  ))
              }
            </select>
          )}
          <button
            onClick={runMatch}
            disabled={loading || !selectedId || projects.filter(p => p.status === "open").length === 0}
            style={{ background: colors.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Matching…" : "Run AI Match"}
          </button>
          {latency > 0 && !loading && (
            <span style={{ fontSize: 11, color: colors.subtext }}>{latency}ms</span>
          )}
        </div>

        {projects.filter(p => p.status === "open").length === 0 && !projLoading && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#f59e0b" }}>
            ⚠ No open projects found. Only open projects can be matched.
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,.1)", border: "0.5px solid rgba(239,68,68,.2)", borderRadius: 10, padding: "12px 16px", color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Skeleton w={40} h={40} r={20} />
                <div style={{ flex: 1 }}>
                  <Skeleton w="60%" h={14} style={{ marginBottom: 8 }} />
                  <Skeleton w="40%" h={11} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && matches.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: colors.subtext, marginBottom: 4 }}>
            {matches.length} freelancer{matches.length !== 1 ? "s" : ""} matched
          </div>
          {matches.map((m, i) => {
            const pal = MATCH_PALETTE[i % MATCH_PALETTE.length];
            const displayName = m.email ? m.email.split("@")[0] : `Freelancer #${m.freelancer_id}`;
            const initials = getInitials(displayName);
            const scoreDisplay = m.ai_match_score != null
              ? Math.round(m.ai_match_score)
              : Math.round(m.success_score * 10);
            return (
              <div key={m.freelancer_id} style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: pal.bg, color: pal.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{displayName}</div>
                        {m.bio && <div style={{ fontSize: 11, color: colors.subtext, marginTop: 2 }}>{m.bio}</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: pal.color }}>{scoreDisplay}%</div>
                        <div style={{ fontSize: 10, color: colors.subtext }}>{m.ai_match_score != null ? "AI match" : "score"}</div>
                      </div>
                    </div>
                    {m.skills?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                        {m.skills.map(s => (
                          <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: colors.primarySoft, color: colors.primary, border: `0.5px solid ${colors.primary}30` }}>{s}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: colors.subtext }}>
                        {m.hourly_rate != null && m.hourly_rate > 0 && <span>${m.hourly_rate}/hr</span>}
                      </div>
                      <button
                        onClick={() => setViewProfile(m)}
                        style={{ fontSize: 11, fontWeight: 500, padding: "5px 14px", borderRadius: 8, background: colors.primary, color: "#fff", border: "none", cursor: "pointer" }}
                      >
                        View Profile
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewProfile && (() => {
        const m = viewProfile;
        const pal = MATCH_PALETTE[matches.indexOf(m) % MATCH_PALETTE.length] ?? MATCH_PALETTE[0];
        const displayName = m.email ? m.email.split("@")[0] : `Freelancer #${m.freelancer_id}`;
        const initials = getInitials(displayName);
        const scoreDisplay = m.ai_match_score != null ? Math.round(m.ai_match_score) : Math.round(m.success_score * 10);
        return (
          <div
            onClick={() => setViewProfile(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,.4)", overflow: "hidden" }}
            >
              {/* Header band */}
              <div style={{ background: `linear-gradient(135deg, ${pal.bg} 0%, ${colors.primarySoft} 100%)`, padding: "24px 24px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: pal.color + "20", border: `2px solid ${pal.color}40`, color: pal.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>{displayName}</div>
                    <div style={{ fontSize: 11, color: colors.subtext, marginTop: 2 }}>{m.email}</div>
                  </div>
                  <div style={{ textAlign: "center", flexShrink: 0, background: pal.color + "18", border: `1px solid ${pal.color}30`, borderRadius: 12, padding: "8px 14px" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: pal.color }}>{scoreDisplay}%</div>
                    <div style={{ fontSize: 9, color: colors.subtext, textTransform: "uppercase", letterSpacing: ".08em" }}>{m.ai_match_score != null ? "AI Match" : "Score"}</div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                {m.bio && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: colors.subtext, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 5 }}>About</div>
                    <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.6 }}>{m.bio}</div>
                  </div>
                )}

                {m.skills?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: colors.subtext, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Skills</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {m.skills.map(s => (
                        <span key={s} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: colors.primarySoft, color: colors.primary, border: `0.5px solid ${colors.primary}30` }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 12 }}>
                  {m.hourly_rate != null && m.hourly_rate > 0 && (
                    <div style={{ flex: 1, background: colors.bg, borderRadius: 10, padding: "10px 14px", border: `0.5px solid ${colors.border}` }}>
                      <div style={{ fontSize: 10, color: colors.subtext, marginBottom: 3 }}>Hourly Rate</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>${m.hourly_rate}<span style={{ fontSize: 11, fontWeight: 400 }}>/hr</span></div>
                    </div>
                  )}
                  <div style={{ flex: 1, background: colors.bg, borderRadius: 10, padding: "10px 14px", border: `0.5px solid ${colors.border}` }}>
                    <div style={{ fontSize: 10, color: colors.subtext, marginBottom: 3 }}>Success Score</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>{m.success_score.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 400 }}>/5</span></div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => navigate(`/messages?user=${m.user_id}&email=${encodeURIComponent(m.email)}`)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: colors.primary, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    Message
                  </button>
                  <button
                    onClick={() => setViewProfile(null)}
                    style={{ padding: "10px 18px", borderRadius: 10, background: "transparent", color: colors.subtext, border: `0.5px solid ${colors.border}`, fontSize: 13, cursor: "pointer" }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {!loading && matches.length === 0 && latency > 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: colors.subtext }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.text, marginBottom: 6 }}>No matches found</div>
          <div style={{ fontSize: 12 }}>No freelancers matched this project's requirements, or no profiles have been set up yet.</div>
        </div>
      )}
    </div>
  );
};

// ─── Stub View ────────────────────────────────────────────────────────────────

// ─── Invoice Types ────────────────────────────────────────────────────────────

interface Invoice {
  payment_id:      number;
  contract_id:     number;
  project_id:      number;
  milestone_id:    number | null;
  milestone_title: string;
  amount:          number;
  status:          string;
  payment_date:    string | null;
  escrow_status:   string;
}

// ─── Invoices View ────────────────────────────────────────────────────────────

const statusBadge = (status: string, colors: ThemeColors) => {
  const map: Record<string, { bg: string; color: string }> = {
    paid:     { bg: "rgba(34,197,94,.15)",  color: "#22c55e" },
    approved: { bg: "rgba(99,102,241,.15)", color: "#818cf8" },
    pending:  { bg: "rgba(234,179, 8,.15)", color: "#eab308" },
  };
  const s = map[status] ?? { bg: "rgba(148,163,184,.15)", color: colors.subtext };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: s.bg, color: s.color, textTransform: "capitalize" }}>
      {status}
    </span>
  );
};

const InvoicesView: React.FC<{ colors: ThemeColors }> = ({ colors: c }) => {
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiClient.get<Invoice[]>("/invoices/my");
        setInvoices(r.data);
      } catch {
        setError("Failed to load invoices.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${c.border}`, borderTopColor: c.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#f87171", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 32 }}>⚠️</span>
      <span>{error}</span>
    </div>
  );

  return (
    <div style={{ padding: "24px 28px", animation: "fadeIn 0.4s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: c.text, margin: 0 }}>Invoices</h2>
          <p style={{ fontSize: 13, color: c.subtext, margin: "4px 0 0" }}>All milestone payments made on your contracts</p>
        </div>
        <div style={{ background: "rgba(99,102,241,.12)", border: `1px solid rgba(99,102,241,.25)`, borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: c.subtext, marginBottom: 2 }}>Total Paid</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: c.primary }}>${totalPaid.toFixed(2)}</div>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", color: c.subtext, gap: 12 }}>
          <span style={{ fontSize: 40 }}>🧾</span>
          <span style={{ fontSize: 15, color: c.text, fontWeight: 500 }}>No invoices yet</span>
          <span style={{ fontSize: 13 }}>Payments will appear here once milestones are released.</span>
        </div>
      ) : (
        <div style={{ background: c.surface, borderRadius: 12, border: `1px solid ${c.border}`, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 120px 100px 130px", padding: "10px 20px", borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 600, color: c.subtext, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {["#", "Milestone", "Contract", "Amount", "Date"].map(h => <span key={h}>{h}</span>)}
          </div>

          {invoices.map((inv, idx) => (
            <div
              key={inv.payment_id}
              style={{ display: "grid", gridTemplateColumns: "60px 1fr 120px 100px 130px", padding: "14px 20px", borderBottom: idx < invoices.length - 1 ? `1px solid ${c.border}` : "none", fontSize: 13, color: c.text, alignItems: "center", transition: "background .15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: c.subtext, fontSize: 12 }}>#{inv.payment_id}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{inv.milestone_title}</div>
                <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{statusBadge(inv.status, c)}</div>
              </div>
              <span style={{ fontSize: 12, color: c.subtext }}>Contract #{inv.contract_id}</span>
              <span style={{ fontWeight: 600, color: "#22c55e" }}>${inv.amount.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: c.subtext }}>
                {inv.payment_date ? new Date(inv.payment_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Proposals View ───────────────────────────────────────────────────────────

const ProposalsView: React.FC<{ colors: ThemeColors; projects: Project[]; proposals: Proposal[]; loading: boolean; onRefresh: () => void }> =
  ({ colors: c, projects, proposals, loading, onRefresh }) => {
  const [actionId, setActionId] = useState<number | null>(null);
  const [acting,   setActing]   = useState(false);

  const act = async (proposalId: number, action: "accept" | "reject") => {
    setActing(true); setActionId(proposalId);
    try {
      await apiClient.put(`/proposals/${proposalId}/status`, { action });
      onRefresh();
    } catch (e: any) {
      alert(e.response?.data?.detail || `Failed to ${action} proposal.`);
    } finally { setActing(false); setActionId(null); }
  };

  const pending = proposals.filter(p => p.status === "pending").length;

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Proposals</div>
          <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Review and respond to freelancer proposals</div>
        </div>
        <button onClick={onRefresh} style={{ background: "transparent", border: `0.5px solid ${c.border}`, color: c.subtext, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <IconRefresh /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1,2,3].map(i => <Skeleton key={i} h={80} />)}</div>
      ) : proposals.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: c.subtext }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📨</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>No proposals yet</div>
          <div style={{ fontSize: 12 }}>Freelancers will submit proposals on your open projects.</div>
        </div>
      ) : (
        <>
          {pending > 0 && (
            <div style={{ fontSize: 12, color: "#f59e0b", background: "rgba(245,158,11,.08)", border: "0.5px solid rgba(245,158,11,.2)", borderRadius: 8, padding: "8px 14px", marginBottom: 14 }}>
              {pending} pending proposal{pending !== 1 ? "s" : ""} awaiting review
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {proposals.map(pr => {
              const proj = projects.find(p => p.project_id === pr.project_id);
              const sc = STATUS_COLORS[pr.status] ?? STATUS_COLORS["pending"];
              return (
                <div key={pr.proposal_id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{proj?.title ?? `Project #${pr.project_id}`}</div>
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>Freelancer #{pr.freelancer_id} · {new Date(pr.created_at).toLocaleDateString()}</div>
                    </div>
                    <Badge bg={sc.bg} color={sc.color} border={sc.border} style={{ margin: 0, flexShrink: 0 }}>{pr.status}</Badge>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#22c55e" }}>${pr.bid_amount.toFixed(2)}</div>
                    {pr.status === "pending" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => act(pr.proposal_id, "accept")} disabled={acting && actionId === pr.proposal_id}
                          style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "none", background: "#22c55e", color: "#fff", cursor: "pointer", fontWeight: 500, opacity: acting && actionId === pr.proposal_id ? 0.7 : 1 }}>
                          {acting && actionId === pr.proposal_id ? "…" : "Accept"}
                        </button>
                        <button onClick={() => act(pr.proposal_id, "reject")} disabled={acting}
                          style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: "transparent", color: c.subtext, cursor: "pointer" }}>
                          Reject
                        </button>
                      </div>
                    )}
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

// ─── Stub View ────────────────────────────────────────────────────────────────

const StubView: React.FC<{ colors: ThemeColors; title: string }> = ({ colors, title }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: colors.subtext, animation: "fadeIn 0.5s ease" }}>
    <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
    <div style={{ fontSize: 20, fontWeight: 500, color: colors.text, marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 13, textAlign: "center", maxWidth: 300, lineHeight: 1.5 }}>
      This feature is under development. Endpoints and schemas are being finalised.
    </div>
  </div>
);

// ─── Main Dashboard Component ─────────────────────────────────────────────────

const ClientDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const s = localStorage.getItem("skilllink-darkMode");
    return s !== null ? JSON.parse(s) : true;
  });

  const [activeView, setActiveView]     = useState("Dashboard");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [unreadCount, setUnreadCount]   = useState(0);
  const c = getColors(darkMode);

  // ── Real data state ──
  const [profile, setProfile]           = useState<ClientProfile | null>(null);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [contracts, setContracts]       = useState<Contract[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [proposals, setProposals]             = useState<Proposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [recentActivity, setRecentActivity]   = useState<AppNotif[]>([]);

  const companyName = profile?.company_name || "Your Company";
  const initials    = getInitials(companyName);

  // ── Fetch helpers ──
  const fetchProfile = useCallback(async () => {
    try {
      const r = await apiClient.get<ClientProfile>("/users/me/profile");
      setProfile(r.data);
    } catch { /* ignore */ }
    finally { setLoadingProfile(false); }
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const r = await apiClient.get<Project[]>("/projects/my");
      setProjects(r.data);
    } catch { setProjects([]); }
    finally { setLoadingProjects(false); }
  }, []);

  const fetchContracts = useCallback(async () => {
    setLoadingContracts(true);
    try {
      const r = await apiClient.get<Contract[]>("/contracts/my");
      setContracts(r.data);
    } catch { setContracts([]); }
    finally { setLoadingContracts(false); }
  }, []);

  const fetchProposals = useCallback(async () => {
    setLoadingProposals(true);
    try {
      const r = await apiClient.get<Proposal[]>("/proposals/received");
      setProposals(r.data);
    } catch { setProposals([]); }
    finally { setLoadingProposals(false); }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchProjects();
    fetchContracts();
    fetchProposals();
  }, [fetchProfile, fetchProjects, fetchContracts, fetchProposals]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_CLIENT}/notifications?limit=5`, authHdr());
        if (res.ok) setRecentActivity(await res.json());
      } catch {}
    })();
  }, []);

  // ── Fetch unread message count ──
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
        const response = await fetch(`${API_BASE_URL}/messages/inbox`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
        });
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

  // ── Derived stats ──
  const stats: DashboardStats = {
    activeProjects:     projects.filter(p => p.status === "in_progress").length,
    inProgressProjects: projects.filter(p => p.status === "in_progress").length,
    completedProjects:  projects.filter(p => p.status === "completed").length,
    totalProjects:      projects.length,
    totalHired:         new Set(contracts.map(c => c.freelancer_id)).size,
    totalSpent:         projects
      .filter(p => p.status === "in_progress" || p.status === "completed")
      .reduce((sum, p) => sum + p.budget, 0),
    pendingProposals: proposals.filter(p => p.status === "pending").length,
  };

  const activeContracts  = contracts.filter(c => c.status === "active").length;
  const recentContracts  = [...contracts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  // ── Spend by category (derived from projects with contracts) ──
  const contractedProjectIds = new Set(contracts.map(c => c.project_id));
  const categorySpend: Record<string, number> = {};
  for (const p of projects) {
    if (contractedProjectIds.has(p.project_id)) {
      const cat = p.category || p.sub_category || "Uncategorized";
      categorySpend[cat] = (categorySpend[cat] || 0) + p.budget;
    }
  }
  const spendEntries = Object.entries(categorySpend).sort((a, b) => b[1] - a[1]).slice(0, 4);

  // ── Recent projects for dashboard ──
  const recentProjects = [...projects].sort((a, b) => b.project_id - a.project_id).slice(0, 4);

  const toggleTheme = () => {
    setDarkMode(d => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
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

  const thBorder: React.CSSProperties = { fontSize: 10, color: c.subtext, textAlign: "left", padding: "0 8px 8px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500, borderBottom: `0.5px solid ${c.border}` };
  const tdBorder: React.CSSProperties = { padding: "9px 8px", fontSize: 12, color: c.text, borderBottom: `0.5px solid ${c.border}` };

  const isLoading = loadingProjects || loadingContracts;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif", fontSize: 13 }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>

      {/* ── Top Bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => navigate("/post-project")}
            style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginRight: 8 }}
          >
            + Post Project
          </button>
          <button onClick={toggleTheme} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
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
                  <div style={{ fontSize: 11, color: c.subtext }}>Client</div>
                </div>
                <a href="/settings/mfa" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: c.text, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  🔐 Two-factor auth
                </a>
                <div
                  onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: "#ef4444", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
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
          <NavItem label="Dashboard"       active={activeView === "Dashboard"}       onClick={() => setActiveView("Dashboard")}       icon={<IconGrid />}   colors={c} />
          <NavItem label="Company Profile" active={activeView === "Company Profile"} onClick={() => setActiveView("Company Profile")} icon={<IconUser />}   colors={c} />
          <NavItem label="Messages"        badge={unreadCount} icon={<IconMsg />}    colors={c} onClick={() => navigate("/messages")} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Hiring</div>
          <NavItem label="Find Talent"    badge="New" active={activeView === "Find Talent"}    onClick={() => setActiveView("Find Talent")}    icon={<IconSearch />} colors={c} />
          <NavItem label="Proposals"  badge={proposals.filter(p => p.status === "pending").length || undefined} active={activeView === "Proposals"} onClick={() => setActiveView("Proposals")} icon={<IconProp />} colors={c} />
          <NavItem label="Active Projects"            active={activeView === "Active Projects"} onClick={() => setActiveView("Active Projects")} icon={<IconClip />}   colors={c} />
          <NavItem label="Invoices"                   active={activeView === "Invoices"}        onClick={() => setActiveView("Invoices")}        icon={<IconInv />}    colors={c} />

          {/* Upgrade banner */}
          <div style={{ margin: "10px 12px 0" }}>
            <div
              onClick={() => setActiveView("Upgrade")}
              style={{ background: "linear-gradient(135deg,#1a2640,#1e3560)", border: "0.5px solid rgba(59,130,246,0.35)", borderRadius: 10, padding: 12, cursor: "pointer" }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
            >
              <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#7eb3f8", marginBottom: 4 }}>⭐ Premium</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Upgrade Now</div>
              <div style={{ fontSize: 10, color: "#7eb3f8", lineHeight: 1.4 }}>Post unlimited jobs, AI talent matching & more.</div>
              <div style={{ marginTop: 8, fontSize: 10, fontWeight: 600, color: "#3b82f6", background: "rgba(59,130,246,.15)", borderRadius: 6, padding: "4px 8px", display: "inline-block" }}>
                View Plans →
              </div>
            </div>
          </div>

          <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
            <div onClick={toggleTheme} style={{ fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>Switch theme</div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>
          {activeView === "Upgrade" && <UpgradeNowSection roleType="client" colors={c} />}

          {activeView === "Dashboard" && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>

              {/* Page header */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Dashboard</div>
                <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>
                  {loadingProfile
                    ? <Skeleton w={180} h={12} />
                    : `${companyName} · AI-assisted hiring overview`}
                </div>
              </div>

              {/* Profile incomplete nudge */}
              {!loadingProfile && (!profile?.company_name || profile.company_name === "Your Company") && (
                <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 12, background: "linear-gradient(135deg,rgba(59,130,246,.12),rgba(59,130,246,.04))", border: "0.5px solid rgba(59,130,246,.3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 22 }}>🏢</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>Complete your company profile</div>
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>Add your company name, industry and size to attract better freelancers.</div>
                    </div>
                  </div>
                  <button onClick={() => setActiveView("Company Profile")} style={{ fontSize: 11, padding: "6px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 500, flexShrink: 0 }}>Complete Profile →</button>
                </div>
              )}

              {/* ── Quick Actions ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
                {[
                  { icon: "📋", label: "Post Project",  action: () => navigate("/post-project"),    color: c.primary },
                  { icon: "🔍", label: "Find Talent",   action: () => setActiveView("Find Talent"), color: "#22c55e" },
                  { icon: "📨", label: "Proposals",     action: () => setActiveView("Proposals"),   color: "#f59e0b" },
                  { icon: "🧾", label: "Invoices",      action: () => setActiveView("Invoices"),    color: "#3b82f6" },
                ].map(({ icon, label, action, color }) => (
                  <div key={label} onClick={action}
                    style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", textAlign: "center", transition: "border-color .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = color)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = c.border)}
                  >
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* ── Hiring pipeline funnel ── */}
              {!isLoading && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 12 }}>
                  {[
                    { icon: "📋", label: "Open Projects",     val: projects.filter(p => p.status === "open").length,       color: "#f59e0b", bg: "rgba(245,158,11,.08)",  border: "rgba(245,158,11,.2)" },
                    { icon: "⚡", label: "Active Contracts",  val: activeContracts,                                         color: "#22c55e", bg: "rgba(34,197,94,.08)",   border: "rgba(34,197,94,.2)" },
                    { icon: "✅", label: "Completed",          val: stats.completedProjects,                                 color: "#7F77DD", bg: "rgba(127,119,221,.1)",  border: "rgba(127,119,221,.25)" },
                  ].map(({ icon, label, val, color, bg, border }) => (
                    <div key={label} style={{ background: c.surface, border: `0.5px solid ${border}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{icon}</div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
                        <div style={{ fontSize: 11, color: c.subtext, marginTop: 3 }}>{label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Metric cards ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
                {isLoading ? (
                  [1,2,3,4].map(i => (
                    <div key={i} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                      <Skeleton w="50%" h={10} style={{ marginBottom: 10 }} />
                      <Skeleton w="60%" h={24} style={{ marginBottom: 8 }} />
                      <Skeleton w="70%" h={10} style={{ marginBottom: 8 }} />
                      <Skeleton w="40%" h={18} r={100} />
                    </div>
                  ))
                ) : [
                  {
                    label: "Total Projects",
                    val: String(stats.totalProjects),
                    sub: `${stats.inProgressProjects} in progress`,
                    badge: <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">{stats.completedProjects} completed</Badge>,
                  },
                  {
                    label: "Talent Hired",
                    val: String(stats.totalHired),
                    sub: `${activeContracts} active contract${activeContracts !== 1 ? "s" : ""}`,
                    badge: <Badge bg="#2a2640" color="#7F77DD" border="rgba(127,119,221,.2)">AI-matched</Badge>,
                  },
                  {
                    label: "Open Projects",
                    val: String(projects.filter(p => p.status === "open").length),
                    sub: "accepting proposals",
                    badge: <Badge bg="rgba(245,158,11,.1)" color="#f59e0b" border="rgba(245,158,11,.2)">awaiting bids</Badge>,
                  },
                  {
                    label: "Total Budget",
                    val: fmt(stats.totalSpent),
                    sub: "across hired projects",
                    badge: <Badge bg="rgba(127,119,221,.12)" color="#7F77DD" border="rgba(127,119,221,.2)">{contracts.length} contract{contracts.length !== 1 ? "s" : ""}</Badge>,
                  },
                ].map(m => (
                  <div key={m.label} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 10, color: c.subtext, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{m.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 500, color: c.text, lineHeight: 1 }}>{m.val}</div>
                    <div style={{ fontSize: 11, color: c.subtext, margin: "5px 0 8px" }}>{m.sub}</div>
                    {m.badge}
                  </div>
                ))}
              </div>

              {/* ── Middle row ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>

                {/* Recent Projects */}
                {card(
                  <>
                    {sectionHeader("Recent Projects",
                      <button onClick={() => navigate("/post-project")} style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                        + Post Project
                      </button>
                    )}
                    {isLoading ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {[1,2,3].map(i => <Skeleton key={i} h={40} />)}
                      </div>
                    ) : recentProjects.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 16px" }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: c.primarySoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 12px" }}>📋</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 6 }}>No projects yet</div>
                        <div style={{ fontSize: 12, color: c.subtext, marginBottom: 14, lineHeight: 1.6 }}>Post your first project and let AI find the best freelancers for you.</div>
                        <button onClick={() => navigate("/post-project")} style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Post First Project</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {recentProjects.map(p => {
                          const s = projectStatusColor(p.status);
                          const hasContract = contractedProjectIds.has(p.project_id);
                          const pct = p.status === "completed" ? 100 : p.status === "in_progress" ? 60 : 10;
                          return (
                            <div key={p.project_id}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{p.title}</span>
                                <Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{s.label}</Badge>
                              </div>
                              <div style={{ height: 4, background: c.bg, borderRadius: 20, overflow: "hidden", margin: "5px 0" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: s.color, borderRadius: 20 }} />
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.subtext, marginTop: 2 }}>
                                <span>{p.category || p.sub_category || "Uncategorized"} · {fmt(p.budget)}</span>
                                <span>{hasContract ? "✓ Hired" : "No hire"}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* AI Recommended Talent — quick launch */}
                {card(
                  <>
                    {sectionHeader("AI Match — Quick Launch",
                      <span onClick={() => setActiveView("Find Talent")} style={{ fontSize: 11, color: c.primary, cursor: "pointer", fontWeight: 500 }}>Full view →</span>
                    )}
                    {isLoading ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[1,2,3].map(i => <Skeleton key={i} h={44} />)}</div>
                    ) : projects.filter(p => p.status === "open").length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 16px" }}>
                        <div style={{ fontSize: 28, marginBottom: 10 }}>🤖</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 }}>No open projects</div>
                        <div style={{ fontSize: 11, color: c.subtext, marginBottom: 14 }}>Post a project to run AI talent matching.</div>
                        <button onClick={() => navigate("/post-project")} style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>+ Post Project</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 11, color: c.subtext, marginBottom: 4 }}>Click a project to find matched freelancers instantly</div>
                        {projects.filter(p => p.status === "open").slice(0, 4).map(p => (
                          <div key={p.project_id}
                            onClick={() => setActiveView("Find Talent")}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: c.bg, border: `0.5px solid ${c.border}`, cursor: "pointer", transition: "border-color .15s" }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = c.primary + "60")}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = c.border)}
                          >
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🔍</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                              <div style={{ fontSize: 10, color: c.subtext, marginTop: 2 }}>{fmt(p.budget)} · {p.category || "Uncategorized"}</div>
                            </div>
                            <span style={{ fontSize: 11, color: c.primary, flexShrink: 0 }}>Match →</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Recent Contracts table ── */}
              {card(
                <>
                  {sectionHeader("Recent Contracts",
                    <span onClick={() => setActiveView("Active Projects")} style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>View all →</span>
                  )}
                  {isLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[1,2,3].map(i => <Skeleton key={i} h={36} />)}
                    </div>
                  ) : recentContracts.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: c.subtext, fontSize: 12 }}>
                      No contracts yet. Accept a proposal to create one.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["Contract ID", "Project", "Budget", "Status", "Created", ""].map(h =>
                            <th key={h} style={thBorder}>{h}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {recentContracts.map(ct => {
                          const proj = projects.find(p => p.project_id === ct.project_id);
                          const cs = STATUS_COLORS[ct.status];
                          return (
                            <tr key={ct.contract_id}>
                              <td style={{ ...tdBorder, color: c.subtext }}>#{ct.contract_id}</td>
                              <td style={{ ...tdBorder, fontWeight: 500 }}>{proj?.title ?? `Project #${ct.project_id}`}</td>
                              <td style={{ ...tdBorder }}>{proj ? fmt(proj.budget) : "—"}</td>
                              <td style={tdBorder}><Badge bg={cs.bg} color={cs.color} border={cs.border} style={{ margin: 0 }}>{ct.status}</Badge></td>
                              <td style={{ ...tdBorder, color: c.subtext }}>{new Date(ct.created_at).toLocaleDateString()}</td>
                              <td style={tdBorder}><span onClick={() => navigate(`/workroom/${ct.contract_id}`)} style={{ fontSize: 11, color: c.primary, cursor: "pointer", fontWeight: 500 }}>Workroom →</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* ── Spend + Activity row ── */}
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
                          <div style={{ fontSize: 12, color: c.text, lineHeight: 1.4 }}>{n.message}</div>
                          <div style={{ fontSize: 10, color: c.subtext, marginTop: 2 }}>{_timeAgo(n.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {activeView === "Company Profile" && (
            <CompanyProfileView colors={c} onSave={name => setProfile(p => p ? { ...p, company_name: name } : null)} />
          )}

          {activeView === "Find Talent" && (
            <FindTalentView colors={c} projects={projects} projLoading={loadingProjects} />
          )}

          {activeView === "Active Projects" && (
            <MyProjectsView colors={c} projects={projects} contracts={contracts} proposals={proposals} loading={loadingProjects} onRefresh={() => { fetchProjects(); fetchContracts(); fetchProposals(); }} />
          )}

          {activeView === "Invoices" && (
            <InvoicesView colors={c} />
          )}

          {activeView === "Proposals" && (
            <ProposalsView colors={c} projects={projects} proposals={proposals} loading={loadingProposals} onRefresh={() => { fetchProposals(); fetchProjects(); fetchContracts(); }} />
          )}
        </main>

        {/* ── Right Panel ── */}
        <aside style={{ width: 220, borderLeft: `0.5px solid ${c.border}`, background: c.surface, padding: 16, overflowY: "auto", flexShrink: 0 }}>
          {/* Company card */}
          <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: `0.5px solid ${c.border}`, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(127,119,221,.2)", color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, margin: "0 auto 8px" }}>
              {loadingProfile ? "…" : initials}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>
              {loadingProfile ? <Skeleton w={100} h={14} style={{ margin: "0 auto" }} /> : companyName}
            </div>
            <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>Client</div>
            <Badge bg="rgba(127,119,221,.1)" color={c.primary} border={`${c.primary}30`} style={{ marginTop: 8 }}>✓ Active Account</Badge>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 12 }}>
              {[
                { val: isLoading ? "…" : String(stats.totalProjects),   label: "PROJECTS",  color: c.text },
                { val: isLoading ? "…" : String(stats.totalHired),      label: "HIRED",     color: "#22c55e" },
                { val: isLoading ? "…" : String(activeContracts),       label: "ACTIVE",    color: c.primary },
                { val: isLoading ? "…" : fmt(stats.totalSpent),         label: "SPENT",     color: "#f59e0b" },
              ].map(s => (
                <div key={s.label} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 9, color: c.subtext }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 8 }}>Quick Actions</div>
          {[
            { label: "Post New Project", action: () => navigate("/post-project"), color: c.primary },
            { label: "Find Talent", action: () => setActiveView("Find Talent"), color: "#22c55e" },
            { label: "View Contracts", action: () => setActiveView("Active Projects"), color: "#3b82f6" },
          ].map(a => (
            <div
              key={a.label}
              onClick={a.action}
              style={{ padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, fontSize: 12, color: a.color, cursor: "pointer", marginBottom: 6, background: c.bg }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = a.color)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = c.border)}
            >
              {a.label}
            </div>
          ))}

          {/* Spend breakdown with visual bars */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginTop: 16, marginBottom: 8 }}>Spend by Category</div>
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map(i => <Skeleton key={i} h={36} />)}
            </div>
          ) : spendEntries.length === 0 ? (
            <div style={{ fontSize: 11, color: c.subtext }}>No spend data yet</div>
          ) : (() => {
            const maxSpend = Math.max(...spendEntries.map(([,v]) => v));
            return spendEntries.map(([label, amount]) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: c.subtext, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{label}</span>
                  <span style={{ fontWeight: 600, color: c.text, flexShrink: 0 }}>{fmt(amount)}</span>
                </div>
                <div style={{ height: 4, background: c.bg, borderRadius: 20, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round((amount / maxSpend) * 100)}%`, background: `linear-gradient(90deg,${c.primary},${c.primary}99)`, borderRadius: 20, transition: "width .5s" }} />
                </div>
              </div>
            ));
          })()}

          {/* Project status summary */}
          {!isLoading && projects.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginTop: 16, marginBottom: 8 }}>Project Status</div>
              {([
                ["Open", projects.filter(p => p.status === "open").length, "#f59e0b"],
                ["In Progress", projects.filter(p => p.status === "in_progress").length, "#22c55e"],
                ["Completed", projects.filter(p => p.status === "completed").length, c.primary],
              ] as [string, number, string][]).map(([label, count, color]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `0.5px solid ${c.border}`, fontSize: 12 }}>
                  <span style={{ color: c.subtext }}>{label}</span>
                  <span style={{ fontWeight: 600, color }}>{count}</span>
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

export default ClientDashboard;