import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { logout } from "../shared/api";
import UpgradeNowSection from "../components/UpgradeNowSection";
import { useLanguage, LangToggle } from "../shared/LanguageContext";

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

interface Milestone {
  milestone_id: number;
  contract_id: number;
  title: string | null;
  description: string | null;
  amount: number;
  status: "pending" | "revision_requested" | "approved" | "paid";
  due_date: string | null;
  created_at: string;
  ai_verification_status: "passed" | "flagged" | "insufficient_evidence" | null;
  ai_verification_report: string | null;
  revision_feedback: string | null;
}

interface Escrow {
  escrow_id: number;
  contract_id: number;
  amount: number;
  released_amount: number;
  status: "held" | "released";
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

// ─── Score Tooltip ────────────────────────────────────────────────────────────

interface ScoreBreakdown { score: number; avg_rating: number; total_reviews: number; jobs_completed: number; }

const ScoreTooltip: React.FC<{
  freelancerId: number;
  rawScore: number;
  colors: ThemeColors;
  displayScore: number;
  label: string;
  color: string;
  compact?: boolean;
}> = ({ freelancerId, rawScore, colors, displayScore, label, color, compact }) => {
  const [visible, setVisible] = useState(false);
  const [data, setData]       = useState<ScoreBreakdown | null>(null);
  const [fetched, setFetched] = useState(false);
  const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";

  const load = async () => {
    if (fetched) return;
    setFetched(true);
    try {
      const res = await fetch(`${API}/freelancers/${freelancerId}/score-breakdown`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      });
      if (res.ok) setData(await res.json());
    } catch {}
  };

  const trustScore = data ? data.score : Math.round(rawScore * 20);
  const stars      = data ? data.avg_rating : rawScore;

  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => { setVisible(true); load(); }}
      onMouseLeave={() => setVisible(false)}
    >
      {compact ? (
        <span style={{ fontSize: 10, color: "#22c55e", cursor: "default", userSelect: "none" }}>
          {data ? `★ ${data.avg_rating.toFixed(1)} (${data.score}/100)` : "★ Score"}
        </span>
      ) : (
        <div style={{ textAlign: "center", flexShrink: 0, background: color + "18", border: `1px solid ${color}30`, borderRadius: 12, padding: "8px 14px", cursor: "default" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>{displayScore}%</div>
          <div style={{ fontSize: 9, color: colors.subtext, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
        </div>
      )}

      {visible && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 10,
          padding: "12px 14px", width: 200, zIndex: 500,
          boxShadow: "0 8px 24px rgba(0,0,0,.5)",
          pointerEvents: "none",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Trust Score</div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: colors.subtext, marginBottom: 3 }}>
              <span>Overall</span><span style={{ color: "#22c55e", fontWeight: 700 }}>{trustScore}/100</span>
            </div>
            <div style={{ height: 5, background: colors.border, borderRadius: 100 }}>
              <div style={{ width: `${trustScore}%`, height: "100%", background: "#22c55e", borderRadius: 100, transition: "width .4s ease" }} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: colors.subtext }}>
              <span>Avg Rating</span>
              <span style={{ color: colors.text }}>{"★".repeat(Math.round(stars))}{"☆".repeat(5 - Math.round(stars))} {stars.toFixed(1)}/5</span>
            </div>
            {data && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: colors.subtext }}>
                  <span>Jobs Completed</span><span style={{ color: colors.text }}>{data.jobs_completed}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: colors.subtext }}>
                  <span>Reviews</span><span style={{ color: colors.text }}>{data.total_reviews}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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
const IconProp       = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const IconBriefcase  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>;

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
  const [activeTab,    setActiveTab]    = useState<"general" | "details" | "verification">("general");

  // Verification state
  const [verifStatus,  setVerifStatus]  = useState<{ status: string; document_type: string | null; rejection_note: string | null; reviewed_at: string | null; created_at: string | null } | null>(null);
  const [verifLoading, setVerifLoading] = useState(false);
  const [verifDocType, setVerifDocType] = useState("passport");
  const [verifFile,    setVerifFile]    = useState<File | null>(null);
  const [verifMsg,     setVerifMsg]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [cancelling,   setCancelling]   = useState(false);

  const fetchVerifStatus = async () => {
    try {
      const r = await apiClient.get<{ status: string; document_type: string | null; rejection_note: string | null; reviewed_at: string | null; created_at: string | null }>("/verification/status");
      setVerifStatus(r.data);
    } catch {}
  };

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
    fetchVerifStatus();
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

  const submitVerification = async () => {
    if (!verifFile) return;
    setVerifLoading(true);
    setVerifMsg(null);
    try {
      const fd = new FormData();
      fd.append("document_type", verifDocType);
      fd.append("file", verifFile);
      const res = await fetch(`${API_BASE_CLIENT}/verification/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed.");
      setVerifMsg({ msg: "✓ Document submitted. Under review.", ok: true });
      setVerifFile(null);
      await fetchVerifStatus();
    } catch (e: any) {
      setVerifMsg({ msg: (e as Error).message || "Upload failed.", ok: false });
    } finally {
      setVerifLoading(false);
      setTimeout(() => setVerifMsg(null), 5000);
    }
  };

  const cancelVerification = async () => {
    setCancelling(true);
    try {
      await apiClient.delete("/verification/cancel");
      await fetchVerifStatus();
    } catch {} finally {
      setCancelling(false);
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
        {(["general", "details", "verification"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: "7px 20px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all .2s",
              background: activeTab === tab ? c.primary : "transparent",
              color:      activeTab === tab ? "#fff" : c.subtext,
            }}>
            {tab === "general" ? "General" : tab === "details" ? "Details" : "Verification"}
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

        {activeTab === "verification" && (() => {
          const statusMap: Record<string, { label: string; color: string; bg: string; icon: string }> = {
            approved:      { label: "Verified",      color: "#22c55e", bg: "rgba(34,197,94,.12)",   icon: "✓" },
            pending:       { label: "Under Review",  color: "#f59e0b", bg: "rgba(245,158,11,.10)", icon: "⏳" },
            rejected:      { label: "Rejected",      color: "#ef4444", bg: "rgba(239,68,68,.10)",  icon: "✗" },
            not_submitted: { label: "Not Submitted", color: "#888",    bg: "rgba(128,128,128,.1)", icon: "○" },
          };
          const vs = statusMap[verifStatus?.status ?? "not_submitted"] ?? statusMap["not_submitted"];
          const canSubmit = !verifStatus || verifStatus.status === "not_submitted" || verifStatus.status === "rejected";

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Status card */}
              <div style={{ background: vs.bg, border: `1px solid ${vs.color}30`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28 }}>{vs.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: vs.color }}>{vs.label}</div>
                  {verifStatus?.document_type && (
                    <div style={{ fontSize: 12, color: c.subtext, marginTop: 2 }}>Document: {verifStatus.document_type.replace(/_/g, " ")}</div>
                  )}
                  {verifStatus?.created_at && (
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 1 }}>Submitted: {new Date(verifStatus.created_at).toLocaleDateString()}</div>
                  )}
                  {verifStatus?.reviewed_at && verifStatus.status === "approved" && (
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 1 }}>Reviewed: {new Date(verifStatus.reviewed_at).toLocaleDateString()}</div>
                  )}
                </div>
                {verifStatus?.status === "pending" && (
                  <button onClick={cancelVerification} disabled={cancelling}
                    style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, border: `1px solid rgba(239,68,68,.4)`, background: "rgba(239,68,68,.08)", color: "#ef4444", cursor: cancelling ? "not-allowed" : "pointer", opacity: cancelling ? 0.6 : 1 }}>
                    {cancelling ? "Cancelling…" : "Cancel Submission"}
                  </button>
                )}
              </div>

              {verifStatus?.rejection_note && (
                <div style={{ background: "rgba(239,68,68,.08)", border: `1px solid rgba(239,68,68,.25)`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>Rejection Reason</div>
                  <div style={{ fontSize: 13, color: c.text }}>{verifStatus.rejection_note}</div>
                </div>
              )}

              {canSubmit && (
                <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: "20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 16 }}>
                    {verifStatus?.status === "rejected" ? "Resubmit Document" : "Submit Business Verification"}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Document Type</label>
                      <select value={verifDocType} onChange={e => setVerifDocType(e.target.value)}
                        style={{ ...inputStyle, appearance: "none" }}>
                        <option value="passport">Passport</option>
                        <option value="national_id">National ID</option>
                        <option value="drivers_license">Driver's License</option>
                        <option value="residence_permit">Residence Permit</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Document File</label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: c.surface, border: `1px dashed ${verifFile ? c.primary : c.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, color: verifFile ? c.primary : c.subtext, boxSizing: "border-box" as const }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {verifFile ? verifFile.name : "Choose file (PDF, JPEG, PNG)"}
                        </span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setVerifFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                      </label>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: c.subtext, marginTop: 10 }}>
                    Accepted formats: PDF, JPEG, PNG, Word — max 10 MB.
                  </div>

                  {verifMsg && (
                    <div style={{ marginTop: 12, fontSize: 13, fontWeight: 500, color: verifMsg.ok ? "#22c55e" : "#f87171" }}>{verifMsg.msg}</div>
                  )}

                  <button onClick={submitVerification} disabled={verifLoading || !verifFile}
                    style={{ marginTop: 16, background: c.primary, color: "#fff", border: "none", borderRadius: 9, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: verifLoading || !verifFile ? "not-allowed" : "pointer", opacity: verifLoading || !verifFile ? 0.7 : 1 }}>
                    {verifLoading ? "Uploading…" : "Submit for Verification"}
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Footer (profile save — hidden on verification tab) ── */}
        {activeTab !== "verification" && (
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
        )}
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
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
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
  const [viewProfile, setViewProfile]   = useState<MatchedFreelancer | null>(null);
  const [invitedIds, setInvitedIds]     = useState<Set<number>>(new Set());
  const [invitingId, setInvitingId]     = useState<number | null>(null);

  const inviteFreelancer = async (freelancerId: number) => {
    if (!selectedId || invitingId !== null) return;
    setInvitingId(freelancerId);
    try {
      const res = await fetch(`${API_BASE}/proposals/invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: selectedId, freelancer_id: freelancerId }),
      });
      if (res.ok || res.status === 409) setInvitedIds((prev: Set<number>) => new Set(prev).add(freelancerId));
    } catch {} finally { setInvitingId(null); }
  };

  useEffect(() => {
    const openProjects = projects.filter(p => p.status === "open");
    if (openProjects.length > 0) {
      const selectedProject = openProjects.find(p => p.project_id === selectedId);
      if (!selectedProject) {
        setSelectedId(openProjects[0].project_id);
      }
    } else {
      setSelectedId(null);
    }
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
              {projects.filter(p => p.status === "open").length === 0
                ? <option value="">No open projects available</option>
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
            const displayName = (m.first_name || m.last_name) ? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() : (m.email ? m.email.split("@")[0] : `Freelancer #${m.freelancer_id}`);
            const initials = getInitials(displayName);
            const scoreDisplay = m.ai_match_score != null
              ? Math.round(m.ai_match_score)
              : Math.round(m.success_score * 20);
            return (
              <div key={m.freelancer_id} style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: pal.bg, color: pal.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0, overflow: "hidden" }}>
                    {m.avatar_url ? <img src={`http://localhost:8000${m.avatar_url}`} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{displayName}</div>
                        {m.bio && <div style={{ fontSize: 11, color: colors.subtext, marginTop: 2 }}>{m.bio}</div>}
                      </div>
                      <ScoreTooltip
                        freelancerId={m.freelancer_id}
                        rawScore={m.success_score}
                        colors={colors}
                        displayScore={scoreDisplay}
                        label={m.ai_match_score != null ? "AI match" : "score"}
                        color={pal.color}
                      />
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
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {invitedIds.has(m.freelancer_id) ? (
                          <span style={{ fontSize: 11, color: "#22c55e", padding: "5px 8px" }}>✓ Invited</span>
                        ) : (
                          <button
                            onClick={() => inviteFreelancer(m.freelancer_id)}
                            disabled={invitingId === m.freelancer_id || !selectedId}
                            style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, background: "transparent", border: `0.5px solid ${colors.border}`, color: colors.subtext, cursor: "pointer", opacity: invitingId === m.freelancer_id ? 0.6 : 1 }}
                          >
                            {invitingId === m.freelancer_id ? "…" : "+ Invite"}
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/freelancer/${m.user_id}`)}
                          style={{ fontSize: 11, fontWeight: 500, padding: "5px 14px", borderRadius: 8, background: colors.primary, color: "#fff", border: "none", cursor: "pointer" }}
                        >
                          View Profile
                        </button>
                      </div>
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
        const scoreDisplay = m.ai_match_score != null ? Math.round(m.ai_match_score) : Math.round(m.success_score * 20);
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
                  <ScoreTooltip
                    freelancerId={m.freelancer_id}
                    rawScore={m.success_score}
                    colors={colors}
                    displayScore={scoreDisplay}
                    label={m.ai_match_score != null ? "AI Match" : "Score"}
                    color={pal.color}
                  />
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
                    <div style={{ fontSize: 10, color: colors.subtext, marginBottom: 3 }}>Trust Score</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>{Math.round(m.success_score * 20)}<span style={{ fontSize: 11, fontWeight: 400 }}>/100</span></div>
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
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>Freelancer #{pr.freelancer_id} · {new Date(pr.created_at).toLocaleDateString()}</span>
                      <ScoreTooltip freelancerId={pr.freelancer_id} rawScore={0} colors={c} displayScore={0} label="Score" color="#22c55e" compact={true} />
                    </div>
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

// ─── Sent Invitations View ────────────────────────────────────────────────────

interface SentInvitation {
  invitation_id:    number;
  project_id:       number;
  project_title:    string;
  freelancer_id:    number;
  freelancer_email: string;
  message:          string | null;
  status:           string;
  created_at:       string;
}

const SentInvitationsView: React.FC<{ colors: ThemeColors }> = ({ colors: c }) => {
  const [invites, setInvites] = useState<SentInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<"all" | "pending" | "accepted" | "declined">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_CLIENT}/proposals/invitations/sent`, authHdr());
        if (res.ok) setInvites(await res.json());
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const statusColor = (s: string) =>
    s === "accepted" ? "#22c55e" : s === "declined" ? "#ef4444" : c.primary;
  const statusLabel = (s: string) =>
    s === "accepted" ? "Accepted" : s === "declined" ? "Declined" : "Pending";
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

  const filtered = filter === "all" ? invites : invites.filter((i: SentInvitation) => i.status === filter);
  const counts = {
    all:      invites.length,
    pending:  invites.filter((i: SentInvitation) => i.status === "pending").length,
    accepted: invites.filter((i: SentInvitation) => i.status === "accepted").length,
    declined: invites.filter((i: SentInvitation) => i.status === "declined").length,
  };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Sent Invitations</div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Track freelancers you've invited to your projects</div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["all", "pending", "accepted", "declined"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ fontSize: 11, padding: "5px 12px", borderRadius: 100, border: `0.5px solid ${filter === f ? c.primary : c.border}`, background: filter === f ? c.primary + "18" : "transparent", color: filter === f ? c.primary : c.subtext, cursor: "pointer", fontFamily: "inherit" }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} {counts[f] > 0 && `(${counts[f]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: c.subtext, padding: 24, textAlign: "center" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: c.subtext, marginBottom: 4 }}>No invitations yet</div>
          <div style={{ fontSize: 12, color: c.subtext, opacity: .6 }}>Go to Find Talent and click "+ Invite" on a freelancer.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((inv: SentInvitation) => (
            <div key={inv.invitation_id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{inv.freelancer_email}</span>
                  <span style={{ fontSize: 10, color: c.subtext }}>→</span>
                  <span style={{ fontSize: 12, color: c.subtext, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{inv.project_title}</span>
                </div>
                <div style={{ fontSize: 11, color: c.subtext }}>Sent {fmtDate(inv.created_at)}</div>
                {inv.message && (
                  <div style={{ fontSize: 11, color: c.subtext, background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 6, padding: "6px 10px", marginTop: 6, fontStyle: "italic" }}>
                    "{inv.message}"
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: statusColor(inv.status), background: statusColor(inv.status) + "18", border: `0.5px solid ${statusColor(inv.status)}30`, borderRadius: 100, padding: "3px 10px", flexShrink: 0, whiteSpace: "nowrap" }}>
                {statusLabel(inv.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Workspace Modals ─────────────────────────────────────────────────────────

const WsModal: React.FC<{ colors: ThemeColors; children: React.ReactNode }> = ({ colors: c, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 28, width: "100%", maxWidth: 460 }}>
      {children}
    </div>
  </div>
);

const WsAddMilestoneModal: React.FC<{
  colors: ThemeColors; contractId: number; escrowRemaining: number;
  onClose: () => void; onDone: () => void;
}> = ({ colors: c, contractId, escrowRemaining, onClose, onDone }) => {
  const [title, setTitle] = useState("");
  const [desc, setDesc]   = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const API_WS = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr("Amount must be > $0"); return; }
    if (amt > escrowRemaining + 0.01) { setErr(`Cannot exceed escrow remaining (${fmt(escrowRemaining)})`); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API_WS}/contracts/${contractId}/milestones`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || null, description: desc || null, amount: amt, due_date: dueDate || null }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 13, background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <WsModal colors={c}>
      <div style={{ fontSize: 11, color: c.primary, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>New Milestone</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: c.text, marginBottom: 4 }}>Add Payment Milestone</div>
      <div style={{ fontSize: 12, color: c.subtext, marginBottom: 18 }}>Escrow remaining: <strong style={{ color: "#22c55e" }}>{fmt(escrowRemaining)}</strong></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>Title</div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Initial Mockup" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>Description</div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={{ ...inp, resize: "vertical" } as any} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>Amount (USD) *</div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: c.subtext }}>$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inp, paddingLeft: 24 }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>Due Date</div>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp} />
          </div>
        </div>
      </div>
      {err && <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,.1)", color: "#ef4444", borderRadius: 7, fontSize: 12 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8, color: c.subtext, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
        <button onClick={submit} disabled={loading} style={{ flex: 2, padding: "10px 0", background: c.primary, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, opacity: loading ? 0.7 : 1, fontFamily: "inherit" }}>
          {loading ? "Adding…" : "Add Milestone"}
        </button>
      </div>
    </WsModal>
  );
};

const WsRevisionModal: React.FC<{
  colors: ThemeColors; milestoneId: number; milestoneTitle: string | null;
  onClose: () => void; onDone: () => void;
}> = ({ colors: c, milestoneId, milestoneTitle, onClose, onDone }) => {
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");
  const API_WS = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";

  const submit = async () => {
    if (!feedback.trim()) { setErr("Please describe what needs to be revised."); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API_WS}/milestones/${milestoneId}/request-revision`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Request failed"); }
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 13, background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <WsModal colors={c}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔄</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: c.text, marginBottom: 6 }}>Request Revision</div>
        <div style={{ fontSize: 12, color: c.subtext, lineHeight: 1.6 }}>
          Tell the freelancer what needs to be changed on <strong style={{ color: c.text }}>{milestoneTitle || `Milestone #${milestoneId}`}</strong>.
        </div>
      </div>
      <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={5}
        placeholder="e.g. The login screen design doesn't match the mockup. Please update the colour scheme…"
        style={{ ...inp, resize: "vertical" } as any} />
      {err && <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,.1)", color: "#ef4444", borderRadius: 7, fontSize: 12 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8, color: c.subtext, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
        <button onClick={submit} disabled={loading} style={{ flex: 2, padding: "10px 0", background: "#f97316", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, opacity: loading ? 0.7 : 1, fontFamily: "inherit" }}>
          {loading ? "Sending…" : "Send Revision Request"}
        </button>
      </div>
    </WsModal>
  );
};

// ─── Client Workspace View ────────────────────────────────────────────────────

interface ContractDetail {
  project: Project | null;
  milestones: Milestone[];
  escrow: Escrow | null;
  loading: boolean;
}

const WS_MS_COLORS = {
  pending:            { bg: "rgba(245,158,11,.1)",  color: "#f59e0b",  label: "Pending" },
  revision_requested: { bg: "rgba(249,115,22,.1)",  color: "#f97316",  label: "Revision" },
  approved:           { bg: "rgba(59,130,246,.1)",  color: "#3b82f6",  label: "Approved" },
  paid:               { bg: "rgba(34,197,94,.1)",   color: "#22c55e",  label: "Paid ✓" },
};

const ClientWorkspaceView: React.FC<{
  colors: ThemeColors;
  contracts: Contract[];
  projects: Project[];
  loading: boolean;
  onRefresh: () => void;
}> = ({ colors: c, contracts, projects, loading, onRefresh }) => {
  const navigate = useNavigate();
  const [filter, setFilter]             = useState<"all" | "active" | "completed" | "disputed">("active");
  const [selected, setSelected]         = useState<number | null>(null);
  const [details, setDetails]           = useState<Record<number, ContractDetail>>({});
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAddMs, setShowAddMs]       = useState<number | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<{ milestoneId: number; milestoneTitle: string | null } | null>(null);

  const API_WS = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
  const wsAuth = () => ({ Authorization: `Bearer ${localStorage.getItem("access_token")}` });

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadDetail = useCallback(async (contractId: number, force = false) => {
    if (details[contractId] && !force) return;
    const ct = contracts.find(x => x.contract_id === contractId);
    if (!ct) return;
    setDetails(prev => ({ ...prev, [contractId]: { project: null, milestones: [], escrow: null, loading: true } }));
    try {
      const [mr, pr, er] = await Promise.all([
        fetch(`${API_WS}/contracts/${contractId}/milestones`, { headers: wsAuth() }),
        fetch(`${API_WS}/projects/${ct.project_id}`, { headers: wsAuth() }),
        fetch(`${API_WS}/escrow/contract/${contractId}`, { headers: wsAuth() }),
      ]);
      const [milestones, project, escrow] = await Promise.all([
        mr.ok ? mr.json() : Promise.resolve([]),
        pr.ok ? pr.json() : Promise.resolve(null),
        er.ok ? er.json() : Promise.resolve(null),
      ]);
      setDetails((prev: Record<number, ContractDetail>) => ({
        ...prev,
        [contractId]: { milestones, project, escrow, loading: false },
      }));
    } catch {
      setDetails(prev => ({ ...prev, [contractId]: { ...prev[contractId], loading: false } }));
    }
  }, [contracts, API_WS]);

  const handleSelect = (contractId: number) => {
    if (selected === contractId) { setSelected(null); return; }
    setSelected(contractId);
    loadDetail(contractId);
  };

  const updateMilestone = async (contractId: number, milestoneId: number, status: "approved" | "paid") => {
    setActionLoading(milestoneId);
    try {
      const r = await fetch(`${API_WS}/milestones/${milestoneId}/status`, {
        method: "PUT",
        headers: { ...wsAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      showToast(status === "approved" ? "Payment released! 💸" : "Milestone marked as paid ✓", true);
      await loadDetail(contractId, true);
      onRefresh();
    } catch (e: any) { showToast(e.message, false); } finally { setActionLoading(null); }
  };

  const completeContract = async (contractId: number) => {
    try {
      const r = await fetch(`${API_WS}/contracts/${contractId}/complete`, { method: "POST", headers: wsAuth() });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      showToast("Contract completed! 🎉", true);
      await loadDetail(contractId, true);
      onRefresh();
    } catch (e: any) { showToast(e.message, false); }
  };

  const filtered = filter === "all" ? contracts : contracts.filter(ct => ct.status === filter);
  const counts = {
    all:       contracts.length,
    active:    contracts.filter(ct => ct.status === "active").length,
    completed: contracts.filter(ct => ct.status === "completed").length,
    disputed:  contracts.filter(ct => ct.status === "disputed").length,
  };

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 3000, padding: "12px 20px", borderRadius: 12, background: toast.ok ? "#22c55e" : "#ef4444", color: toast.ok ? "#000" : "#fff", fontWeight: 600, fontSize: 13, boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Workspace</div>
          <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Manage your contracts and milestones</div>
        </div>
        <button onClick={onRefresh} style={{ background: "transparent", border: `0.5px solid ${c.border}`, color: c.subtext, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          <IconRefresh /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["all", "active", "completed", "disputed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 11, padding: "5px 14px", borderRadius: 100, border: `0.5px solid ${filter === f ? c.primary : c.border}`, background: filter === f ? c.primarySoft : "transparent", color: filter === f ? c.primary : c.subtext, cursor: "pointer", fontFamily: "inherit", fontWeight: filter === f ? 600 : 400 }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}{counts[f] > 0 ? ` (${counts[f]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2, 3].map(i => <Skeleton key={i} h={72} />)}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>
            {filter === "all" ? "No contracts yet" : `No ${filter} contracts`}
          </div>
          <div style={{ fontSize: 12, color: c.subtext }}>Accept a proposal to create a contract with a freelancer.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(ct => {
            const proj = projects.find(p => p.project_id === ct.project_id);
            const cs   = contractStatusColor(ct.status);
            const det  = details[ct.contract_id];
            const isOpen      = selected === ct.contract_id;
            const paidCount   = det?.milestones.filter(m => m.status === "paid").length ?? 0;
            const totalCount  = det?.milestones.length ?? 0;
            const pendingCount = det?.milestones.filter(m => m.status === "pending").length ?? 0;
            const allPaid     = totalCount > 0 && paidCount === totalCount;

            return (
              <div key={ct.contract_id} style={{ background: c.surface, border: `0.5px solid ${isOpen ? c.primary + "60" : c.border}`, borderRadius: 14, overflow: "hidden", transition: "border-color .2s" }}>

                {/* ── Contract header row ── */}
                <div
                  onClick={() => handleSelect(ct.contract_id)}
                  style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = c.bg + "80"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: cs.color, flexShrink: 0, boxShadow: `0 0 8px ${cs.color}88` }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {proj?.title ?? `Project #${ct.project_id}`}
                      </span>
                      <Badge bg={cs.bg} color={cs.color} border={cs.border} style={{ margin: 0 }}>{ct.status}</Badge>
                      {pendingCount > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 100, background: "#f59e0b18", color: "#f59e0b", border: "0.5px solid #f59e0b30" }}>
                          {pendingCount} pending
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>#{ct.contract_id}</span>
                      <span>Freelancer #{ct.freelancer_id}</span>
                      <span>{new Date(ct.created_at).toLocaleDateString()}</span>
                      {proj && <span style={{ color: "#22c55e" }}>{fmt(proj.budget)}</span>}
                    </div>
                  </div>

                  {/* Milestone progress bar (shown after detail is loaded) */}
                  {det && !det.loading && totalCount > 0 && (
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: c.subtext, marginBottom: 3 }}>{paidCount}/{totalCount} paid</div>
                      <div style={{ width: 72, height: 4, background: c.border, borderRadius: 100, overflow: "hidden" }}>
                        <div style={{ width: `${(paidCount / totalCount) * 100}%`, height: "100%", background: "#22c55e", borderRadius: 100, transition: "width .4s" }} />
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: c.subtext, flexShrink: 0, transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "none" }}>▼</div>
                </div>

                {/* ── Expanded milestone panel ── */}
                {isOpen && (
                  <div style={{ borderTop: `0.5px solid ${c.border}`, background: c.bg, padding: 16 }}>
                    {det?.loading ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[1, 2].map(i => <Skeleton key={i} h={60} />)}</div>
                    ) : (
                      <>
                        {/* Escrow summary bar */}
                        {det?.escrow && (
                          <div style={{ display: "flex", marginBottom: 14, background: c.surface, borderRadius: 10, border: `0.5px solid ${c.border}`, overflow: "hidden" }}>
                            {[
                              { label: "Escrow Total", val: fmt(det.escrow.amount),                               color: c.text },
                              { label: "Released",     val: fmt(det.escrow.released_amount),                      color: "#22c55e" },
                              { label: "Remaining",    val: fmt(det.escrow.amount - det.escrow.released_amount),  color: "#f59e0b" },
                            ].map((item, idx) => (
                              <div key={item.label} style={{ flex: 1, padding: "10px 14px", borderRight: idx < 2 ? `0.5px solid ${c.border}` : "none" }}>
                                <div style={{ fontSize: 10, color: c.subtext, marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>{item.label}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.val}</div>
                              </div>
                            ))}
                            <div style={{ flex: 2, padding: "10px 14px", display: "flex", alignItems: "center" }}>
                              <div style={{ width: "100%", height: 5, background: c.border, borderRadius: 100, overflow: "hidden" }}>
                                <div style={{ width: `${Math.min(100, (det.escrow.released_amount / det.escrow.amount) * 100)}%`, height: "100%", background: "#22c55e", borderRadius: 100, transition: "width .6s" }} />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Milestones header */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>
                            Milestones
                            {totalCount > 0 && <span style={{ fontSize: 11, color: c.subtext, fontWeight: 400, marginLeft: 6 }}>{paidCount}/{totalCount} paid</span>}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            {ct.status === "active" && (
                              <button
                                onClick={() => setShowAddMs(ct.contract_id)}
                                style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primary}40`, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
                              >
                                + Add Milestone
                              </button>
                            )}
                            <button
                              onClick={() => navigate(`/contract/${ct.contract_id}`)}
                              style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, background: "transparent", color: c.subtext, border: `0.5px solid ${c.border}`, cursor: "pointer", fontFamily: "inherit" }}
                            >
                              Full View →
                            </button>
                          </div>
                        </div>

                        {/* Milestone list */}
                        {!det?.milestones || det.milestones.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "28px 0", color: c.subtext }}>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>📌</div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 4 }}>No milestones yet</div>
                            {ct.status === "active" && <div style={{ fontSize: 12 }}>Click "+ Add Milestone" to track work and release payments.</div>}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {det.milestones.map(ms => {
                              const msc    = WS_MS_COLORS[ms.status as keyof typeof WS_MS_COLORS] ?? WS_MS_COLORS.pending;
                              const isAct  = actionLoading === ms.milestone_id;
                              return (
                                <div key={ms.milestone_id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "12px 14px" }}>
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: msc.color, marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${msc.color}66` }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                        <div>
                                          <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{ms.title || `Milestone #${ms.milestone_id}`}</div>
                                          {ms.description && <div style={{ fontSize: 11, color: c.subtext, marginTop: 2, lineHeight: 1.4 }}>{ms.description}</div>}
                                          {ms.due_date && <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 3 }}>Due {new Date(ms.due_date).toLocaleDateString()}</div>}
                                        </div>
                                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                                          <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{fmt(ms.amount)}</div>
                                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: msc.bg, color: msc.color }}>{msc.label}</span>
                                        </div>
                                      </div>

                                      {/* Revision feedback */}
                                      {ms.status === "revision_requested" && ms.revision_feedback && (
                                        <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(249,115,22,.08)", border: "0.5px solid rgba(249,115,22,.2)", borderRadius: 8 }}>
                                          <div style={{ fontSize: 11, color: "#f97316", fontWeight: 600, marginBottom: 3 }}>🔄 Revision Requested</div>
                                          <div style={{ fontSize: 11, color: c.text, lineHeight: 1.5 }}>{ms.revision_feedback}</div>
                                        </div>
                                      )}

                                      {/* AI verdict badge */}
                                      {ms.ai_verification_status && (
                                        <div style={{ marginTop: 6 }}>
                                          <span style={{
                                            fontSize: 10, padding: "2px 8px", borderRadius: 100,
                                            background: ms.ai_verification_status === "passed" ? "rgba(34,197,94,.1)" : ms.ai_verification_status === "flagged" ? "rgba(239,68,68,.1)" : "rgba(245,158,11,.1)",
                                            color:      ms.ai_verification_status === "passed" ? "#22c55e"            : ms.ai_verification_status === "flagged" ? "#ef4444"           : "#f59e0b",
                                          }}>
                                            {ms.ai_verification_status === "passed" ? "🤖 AI: Passed ✓" : ms.ai_verification_status === "flagged" ? "🤖 AI: Flagged ⚠" : "🤖 AI: Needs more files"}
                                          </span>
                                        </div>
                                      )}

                                      {/* Client actions */}
                                      {ct.status === "active" && (
                                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                                          {ms.status === "pending" && (
                                            <>
                                              <button
                                                onClick={() => setRevisionTarget({ milestoneId: ms.milestone_id, milestoneTitle: ms.title })}
                                                style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, background: "rgba(249,115,22,.1)", border: "0.5px solid rgba(249,115,22,.3)", color: "#f97316", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
                                              >
                                                🔄 Request Revision
                                              </button>
                                              <button
                                                onClick={() => updateMilestone(ct.contract_id, ms.milestone_id, "approved")}
                                                disabled={isAct}
                                                style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "#22c55e", border: "none", color: "#000", cursor: isAct ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: isAct ? 0.6 : 1 }}
                                              >
                                                {isAct ? "…" : "✓ Approve & Release"}
                                              </button>
                                            </>
                                          )}
                                          {ms.status === "approved" && (
                                            <button
                                              onClick={() => updateMilestone(ct.contract_id, ms.milestone_id, "paid")}
                                              disabled={isAct}
                                              style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "rgba(59,130,246,.12)", border: "0.5px solid rgba(59,130,246,.3)", color: "#3b82f6", cursor: isAct ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600 }}
                                            >
                                              {isAct ? "…" : "Mark as Paid"}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Complete contract CTA */}
                        {ct.status === "active" && allPaid && totalCount > 0 && (
                          <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(34,197,94,.06)", border: "0.5px solid rgba(34,197,94,.25)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#22c55e" }}>All milestones paid!</div>
                              <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>Ready to complete this contract.</div>
                            </div>
                            <button
                              onClick={() => completeContract(ct.contract_id)}
                              style={{ fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 9, background: "#22c55e", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
                            >
                              Complete Contract ✓
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Milestone Modal */}
      {showAddMs !== null && (() => {
        const det = details[showAddMs];
        const used  = det?.milestones?.reduce((a, m) => a + m.amount, 0) ?? 0;
        const total = det?.escrow?.amount ?? 0;
        return (
          <WsAddMilestoneModal
            colors={c}
            contractId={showAddMs}
            escrowRemaining={Math.max(0, total - used)}
            onClose={() => setShowAddMs(null)}
            onDone={() => { const id = showAddMs; setShowAddMs(null); loadDetail(id, true); showToast("Milestone added!", true); }}
          />
        );
      })()}

      {/* Revision Modal */}
      {revisionTarget && (
        <WsRevisionModal
          colors={c}
          milestoneId={revisionTarget.milestoneId}
          milestoneTitle={revisionTarget.milestoneTitle}
          onClose={() => setRevisionTarget(null)}
          onDone={() => { setRevisionTarget(null); if (selected) loadDetail(selected, true); showToast("Revision request sent.", true); }}
        />
      )}
    </div>
  );
};

// ─── Main Dashboard Component ─────────────────────────────────────────────────

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


  const isLoading = loadingProjects || loadingContracts;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: c.bg, color: c.text, fontFamily, fontSize: 13 }} dir={isRTL ? "rtl" : "ltr"}>
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
          <LangToggle style={{ color: c.text }} />
          <button
            onClick={() => navigate("/post-project")}
            style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginRight: 8 }}
          >
            {t("cl.postProject")}
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

        {/* ── Sidebar ── */}
        <aside style={{ width: 200, borderRight: `0.5px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", padding: "16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>{t("fl.section.main")}</div>
          <NavItem label={t("common.dashboard")}       active={activeView === "Dashboard"}       onClick={() => setActiveView("Dashboard")}       icon={<IconGrid />}   colors={c} />
          <NavItem label={t("cl.nav.companyProfile")}  active={activeView === "Company Profile"} onClick={() => setActiveView("Company Profile")} icon={<IconUser />}   colors={c} />
          <NavItem label={t("common.messages")}        badge={unreadCount} icon={<IconMsg />}    colors={c} onClick={() => navigate("/messages")} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>{t("cl.section.hiring")}</div>
          <NavItem label={t("cl.nav.findTalent")}    badge="New" active={activeView === "Find Talent"}    onClick={() => setActiveView("Find Talent")}    icon={<IconSearch />} colors={c} />
          <NavItem label={t("common.proposals")}  badge={proposals.filter(p => p.status === "pending").length || undefined} active={activeView === "Proposals"} onClick={() => setActiveView("Proposals")} icon={<IconProp />} colors={c} />
          <NavItem label={t("cl.nav.invitations")}                active={activeView === "Invitations"}     onClick={() => setActiveView("Invitations")}     icon={<IconMsg />}    colors={c} />
          <NavItem label={t("cl.nav.activeProjects")}             active={activeView === "Active Projects"} onClick={() => setActiveView("Active Projects")} icon={<IconClip />}       colors={c} />
          <NavItem label={t("cl.nav.workspace")} badge={contracts.filter((ct: Contract) => ct.status === "active").length || undefined} active={activeView === "Workspace"} onClick={() => setActiveView("Workspace")} icon={<IconBriefcase />} colors={c} />
          <NavItem label={t("cl.nav.invoices")}                   active={activeView === "Invoices"}        onClick={() => setActiveView("Invoices")}        icon={<IconInv />}        colors={c} />

          {/* Upgrade banner */}
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

        {/* ── Main ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>
          {activeView === "Upgrade" && <UpgradeNowSection roleType="client" colors={c} />}

          {activeView === "Dashboard" && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>

              {/* ── Welcome banner with inline stats ── */}
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
                    { label: t("cl.stat.projects"), val: String(stats.totalProjects), color: c.text },
                    { label: t("cl.stat.active"),   val: String(activeContracts),     color: "#22c55e" },
                    { label: t("cl.stat.hired"),     val: String(stats.totalHired),    color: c.primary },
                    { label: t("cl.stat.spent"),     val: fmt(stats.totalSpent),       color: "#f59e0b" },
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

              {/* ── My Projects — horizontal scroll ── */}
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

              {/* ── Active Contracts + AI Match ── */}
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

              {/* ── Pending Proposals ── */}
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

          {activeView === "Invitations" && (
            <SentInvitationsView colors={c} />
          )}

          {activeView === "Workspace" && (
            <ClientWorkspaceView
              colors={c}
              contracts={contracts}
              projects={projects}
              loading={loadingContracts || loadingProjects}
              onRefresh={() => { fetchContracts(); fetchProjects(); }}
            />
          )}

          {activeView === "Proposals" && (
            <ProposalsView colors={c} projects={projects} proposals={proposals} loading={loadingProposals} onRefresh={() => { fetchProposals(); fetchProjects(); fetchContracts(); }} />
          )}
        </main>

      </div>
    </div>
  );
};

export default ClientDashboard;