import React, { useState } from "react";

export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primarySoft: string;
}

export const API_BASE_CLIENT = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
export const authHdr = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });

export const NOTIF_ICON: Record<string, string> = {
  message: "💬", proposal: "📄", contract: "📝", milestone: "✅",
  dispute: "⚠️", verification: "🛡️", review: "⭐", payment: "💰", system: "📢",
};

export const MATCH_PALETTE = [
  { bg: "#2a2640", color: "#7F77DD" },
  { bg: "rgba(34,197,94,.12)", color: "#22c55e" },
  { bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
  { bg: "rgba(245,158,11,.1)", color: "#f59e0b" },
  { bg: "rgba(239,68,68,.1)", color: "#ef4444" },
];

export const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE" };

export const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export const fmt = (n: number): string => {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

export const _timeAgo = (iso: string): string => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export const projectStatusColor = (status: "open" | "in_progress" | "completed"): { bg: string; color: string; border: string; label: string } => {
  if (status === "in_progress") return { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)", label: "In Progress" };
  if (status === "completed")   return { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)", label: "Completed" };
  return { bg: "rgba(245,158,11,.1)", color: "#f59e0b", border: "rgba(245,158,11,.2)", label: "Open" };
};

export const contractStatusColor = (status: "active" | "completed" | "disputed"): { bg: string; color: string; border: string } => {
  if (status === "active")    return { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" };
  if (status === "completed") return { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)" };
  return { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "rgba(239,68,68,.2)" };
};

export const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  "In Progress": { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" },
  "Open":        { bg: "rgba(245,158,11,.1)", color: "#f59e0b", border: "rgba(245,158,11,.2)" },
  "Completed":   { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)" },
  "active":      { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" },
  "completed":   { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)" },
  "disputed":    { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "rgba(239,68,68,.2)" },
  "pending":     { bg: "rgba(245,158,11,.1)", color: "#f59e0b", border: "rgba(245,158,11,.2)" },
};

export const Badge: React.FC<{
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

export const Skeleton: React.FC<{ w?: number | string; h?: number; r?: number; style?: React.CSSProperties }> =
  ({ w = "100%", h = 16, r = 6, style }) => (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg, rgba(255,255,255,.05) 25%, rgba(255,255,255,.1) 50%, rgba(255,255,255,.05) 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.4s infinite",
      ...style,
    }} />
  );

export const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 4v6h6"/>
    <path d="M23 20v-6h-6"/>
    <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
  </svg>
);

interface ScoreBreakdown { score: number; avg_rating: number; total_reviews: number; jobs_completed: number; }

export const ScoreTooltip: React.FC<{
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

  const load = async () => {
    if (fetched) return;
    setFetched(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/freelancers/${freelancerId}/score-breakdown`, {
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
