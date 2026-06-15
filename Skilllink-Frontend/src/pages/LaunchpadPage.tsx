/**
 * LaunchpadPage.tsx
 * Route: /launchpad  (freelancer only)
 *
 * AI Launchpad — starter projects curated by ML for new freelancers.
 * Features:
 *   - Beginner-qualification check
 *   - Visual slot tracker (max 3 reservations)
 *   - AI-recommended project cards with match scores
 *   - Reserve / complete reservations
 *   - My Reservations tab with expiry countdowns
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Tooltip from "../shared/Tooltip";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface StarterProject {
  project_id:      number;
  title:           string;
  description:     string;
  required_skills: string[];
  difficulty:      string;
  budget_min:      number;
  budget_max:      number;
  match_score:     number;
  matched_skills:  string[];
  is_reserved:     boolean;
}

interface LaunchpadData {
  is_beginner_qualified: boolean;
  reason:                string;
  slots_used:            number;
  slots_remaining:       number;
  recommended_projects:  StarterProject[];
  latency_ms:            number;
}

interface Reservation {
  reservation_id:       number;
  launchpad_project_id: number;
  project_title:        string;
  difficulty:           string;
  budget_min:           number;
  budget_max:           number;
  match_score:          number;
  status:               "reserved" | "active" | "completed" | "expired";
  reserved_at:          string;
  expires_at:           string | null;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const T = {
  bg:          "#080810",
  surface:     "#10101a",
  card:        "#14141f",
  cardHover:   "#1a1a2a",
  border:      "#1e1e30",
  borderLight: "#252540",
  text:        "#e8e8f4",
  sub:         "#6060a0",
  subLight:    "#8080b0",
  accent:      "#7F77DD",
  accentSoft:  "rgba(127,119,221,0.12)",
  accentGlow:  "rgba(127,119,221,0.25)",
  green:       "#22d3a0",
  greenSoft:   "rgba(34,211,160,0.1)",
  teal:        "#14b8a6",
  tealSoft:    "rgba(20,184,166,0.1)",
  amber:       "#f59e0b",
  amberSoft:   "rgba(245,158,11,0.1)",
  red:         "#f05070",
  redSoft:     "rgba(240,80,112,0.1)",
  gold:        "#fbbf24",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (min: number, max: number) => `$${min}–$${max}`;

const timeLeft = (iso: string | null): string => {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
};

const scoreColor = (s: number) =>
  s >= 0.75 ? T.green : s >= 0.45 ? T.accent : T.amber;

const scoreLabel = (s: number) =>
  s >= 0.75 ? "Excellent" : s >= 0.45 ? "Good" : "Fair";

// ── Sub-components ────────────────────────────────────────────────────────────

const DiffBadge: React.FC<{ diff: string }> = ({ diff }) => {
  const d = diff.toLowerCase();
  const cfg =
    d === "beginner" ? { bg: T.greenSoft, color: T.green, border: T.green + "33", icon: "🌱" }
    : d === "easy"   ? { bg: T.tealSoft,  color: T.teal,  border: T.teal  + "33", icon: "⚡" }
                     : { bg: T.amberSoft, color: T.amber, border: T.amber + "33", icon: "🔥" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600, letterSpacing: ".04em",
      padding: "3px 9px", borderRadius: 100,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.icon} {diff.charAt(0).toUpperCase() + diff.slice(1)}
    </span>
  );
};

const SkillChip: React.FC<{ label: string; highlight?: boolean }> = ({ label, highlight }) => (
  <span style={{
    display: "inline-block", fontSize: 11, padding: "3px 10px",
    borderRadius: 100, lineHeight: 1.4,
    background: highlight ? T.accentSoft : "rgba(255,255,255,0.04)",
    color:      highlight ? T.accent     : T.subLight,
    border:     `0.5px solid ${highlight ? T.accent + "44" : T.border}`,
    fontWeight: highlight ? 500 : 400,
  }}>
    {label}
  </span>
);

const MatchBar: React.FC<{ score: number }> = ({ score }) => {
  const pct = Math.round(score * 100);
  const color = scoreColor(score);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: T.sub }}>
          Match Score{" "}
          <Tooltip text="How well your skills and experience match this project's requirements.">
            <span style={{ cursor: "help", fontSize: 10, opacity: 0.5 }}>ⓘ</span>
          </Tooltip>
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{pct}% · {scoreLabel(score)}</span>
      </div>
      <div style={{ height: 4, background: T.border, borderRadius: 100, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 100,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
};

const SlotTracker: React.FC<{ used: number; total?: number }> = ({ used, total = 3 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{
        width: 28, height: 28, borderRadius: 8,
        border: `1.5px solid ${i < used ? T.accent : T.border}`,
        background: i < used ? T.accentSoft : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s",
      }}>
        {i < used
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          : <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.border }} />
        }
      </div>
    ))}
    <span style={{ fontSize: 12, color: T.sub, marginLeft: 4 }}>
      {used}/{total} slots used
    </span>
  </div>
);

const StatusPill: React.FC<{ status: Reservation["status"] }> = ({ status }) => {
  const cfg = {
    reserved:  { bg: T.accentSoft,  color: T.accent, label: "Reserved",  icon: "🔖" },
    active:    { bg: T.greenSoft,   color: T.green,  label: "Active",    icon: "⚡" },
    completed: { bg: T.tealSoft,    color: T.teal,   label: "Completed", icon: "✅" },
    expired:   { bg: T.redSoft,     color: T.red,    label: "Expired",   icon: "⏰" },
  }[status] ?? { bg: T.accentSoft, color: T.accent, label: status, icon: "●" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, letterSpacing: ".04em",
      padding: "4px 10px", borderRadius: 100,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`,
    }}>
      <span style={{ fontSize: 10 }}>{cfg.icon}</span> {cfg.label}
    </span>
  );
};

// ── Project Card ──────────────────────────────────────────────────────────────

const ProjectCard: React.FC<{
  project:       StarterProject;
  slotsLeft:     number;
  onReserve:     (id: number) => Promise<void>;
  reserving:     number | null;
}> = ({ project: p, slotsLeft, onReserve, reserving }) => {
  const [hover, setHover] = useState(false);
  const isLoading  = reserving === p.project_id;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? T.cardHover : T.card,
        border: `0.5px solid ${hover ? T.borderLight : T.border}`,
        borderRadius: 16, padding: "20px",
        transition: "all 0.2s ease",
        boxShadow: hover ? `0 8px 32px rgba(0,0,0,0.4), 0 0 0 0.5px ${T.accent}22` : "none",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Glow accent top-left for high match */}
      {p.match_score >= 0.75 && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${T.green}88, transparent)`,
          borderRadius: "16px 16px 0 0",
        }} />
      )}

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 }}>
        <h3 style={{
          fontSize: 15, fontWeight: 600, color: T.text,
          lineHeight: 1.3, letterSpacing: "-0.2px", margin: 0, flex: 1,
        }}>
          {p.title}
        </h3>
        <DiffBadge diff={p.difficulty} />
      </div>

      {/* Description */}
      <p style={{
        fontSize: 12, color: T.subLight, lineHeight: 1.6,
        margin: "0 0 14px", display: "-webkit-box",
        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {p.description}
      </p>

      {/* Match bar */}
      <div style={{ marginBottom: 14 }}>
        <MatchBar score={p.match_score} />
      </div>

      {/* Budget */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 13, fontWeight: 500, color: T.text, marginBottom: 12,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
        {fmt$(p.budget_min, p.budget_max)}
        <span style={{ fontSize: 11, color: T.sub, marginLeft: 2 }}>budget range</span>
      </div>

      {/* Skills */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
          Required Skills
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {p.required_skills.map(s => (
            <SkillChip
              key={s}
              label={s}
              highlight={p.matched_skills.map(m => m.toLowerCase()).includes(s.toLowerCase())}
            />
          ))}
        </div>
      </div>

      {/* Matched skills note */}
      {p.matched_skills.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, color: T.green, marginBottom: 14,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          You match {p.matched_skills.length} of {p.required_skills.length} skills
        </div>
      )}

      {/* Action */}
      {p.is_reserved ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
          padding: "10px", borderRadius: 10, fontSize: 12, fontWeight: 500,
          background: T.accentSoft, color: T.accent, border: `0.5px solid ${T.accent}33`,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Already Reserved
        </div>
      ) : slotsLeft <= 0 ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
          padding: "10px", borderRadius: 10, fontSize: 12,
          background: "transparent", color: T.sub, border: `0.5px solid ${T.border}`,
        }}>
          No slots available
        </div>
      ) : (
        <button
          onClick={() => onReserve(p.project_id)}
          disabled={isLoading}
          style={{
            width: "100%", padding: "10px", borderRadius: 10,
            fontSize: 13, fontWeight: 600, letterSpacing: ".02em",
            background: hover
              ? `linear-gradient(135deg, #7F77DD, #6066dd)`
              : T.accentSoft,
            color: hover ? "#fff" : T.accent,
            border: `0.5px solid ${T.accent}55`,
            cursor: isLoading ? "default" : "pointer",
            transition: "all 0.2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            opacity: isLoading ? 0.7 : 1,
            fontFamily: "inherit",
          }}
        >
          {isLoading ? (
            <>
              <SpinnerIcon />
              Reserving…
            </>
          ) : (
            <>
              <RocketIcon />
              Reserve this Project
            </>
          )}
        </button>
      )}
    </div>
  );
};

// ── Reservation Card ──────────────────────────────────────────────────────────

const ReservationCard: React.FC<{
  r:          Reservation;
  onComplete: (id: number) => Promise<void>;
  onCancel:   (id: number) => Promise<void>;
  completing: number | null;
  cancelling: number | null;
}> = ({ r, onComplete, onCancel, completing, cancelling }) => {
  const [hover, setHover] = useState(false);
  const isCompleting = completing === r.reservation_id;
  const isCancelling = cancelling === r.reservation_id;
  const isLoading    = isCompleting || isCancelling;
  const tl = timeLeft(r.expires_at);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? T.cardHover : T.card,
        border: `0.5px solid ${hover ? T.borderLight : T.border}`,
        borderRadius: 14, padding: "18px 20px",
        transition: "all 0.2s",
        boxShadow: hover ? "0 4px 20px rgba(0,0,0,0.3)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>
            {r.project_title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <DiffBadge diff={r.difficulty} />
            <span style={{ fontSize: 12, color: T.subLight }}>{fmt$(r.budget_min, r.budget_max)}</span>
            {tl && r.status === "reserved" && (
              <span style={{
                fontSize: 11, color: tl === "Expired" ? T.red : T.amber,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {tl}
              </span>
            )}
          </div>
        </div>
        <StatusPill status={r.status} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 11, color: T.sub }}>
          Reserved {new Date(r.reserved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {" · "}Match {Math.round(r.match_score * 100)}%
        </div>
        {(r.status === "reserved" || r.status === "active") && (
          <div style={{ display: "flex", gap: 8 }}>
            {/* Cancel */}
            <button
              onClick={() => onCancel(r.reservation_id)}
              disabled={isLoading}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 12, fontWeight: 500, padding: "7px 14px",
                borderRadius: 8, cursor: isLoading ? "default" : "pointer",
                background: hover ? T.redSoft : "transparent",
                color: T.red, border: `0.5px solid ${T.red}55`,
                transition: "all 0.2s", fontFamily: "inherit",
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isCancelling ? <SpinnerIcon /> : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              )}
              {isCancelling ? "Cancelling…" : "Cancel"}
            </button>
            {/* Mark Complete */}
            <button
              onClick={() => onComplete(r.reservation_id)}
              disabled={isLoading}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 12, fontWeight: 500, padding: "7px 14px",
                borderRadius: 8, cursor: isLoading ? "default" : "pointer",
                background: hover ? T.greenSoft : "transparent",
                color: T.green, border: `0.5px solid ${T.green}55`,
                transition: "all 0.2s", fontFamily: "inherit",
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isCompleting ? <SpinnerIcon /> : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
              {isCompleting ? "Marking…" : "Mark Complete"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Icons ─────────────────────────────────────────────────────────────────────

const RocketIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/>
    <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ animation: "spin 0.8s linear infinite" }}>
    <path d="M21 12a9 9 0 11-6.219-8.56"/>
  </svg>
);

// ── Skeleton loader ───────────────────────────────────────────────────────────

const CardSkeleton = () => (
  <div style={{
    background: T.card, border: `0.5px solid ${T.border}`,
    borderRadius: 16, padding: "20px",
  }}>
    {[120, 80, "100%", 60, 40].map((w, i) => (
      <div key={i} style={{
        height: i === 2 ? 4 : 14,
        width: typeof w === "number" ? w : w,
        background: T.border,
        borderRadius: 8, marginBottom: 14,
        animation: "pulse 1.5s ease-in-out infinite",
        animationDelay: `${i * 0.1}s`,
      }} />
    ))}
  </div>
);

// ── Not Qualified Banner ──────────────────────────────────────────────────────

const NotQualifiedBanner: React.FC<{ reason: string }> = ({ reason }) => (
  <div style={{
    background: T.amberSoft, border: `1px solid ${T.amber}33`,
    borderRadius: 16, padding: "28px 32px",
    display: "flex", flexDirection: "column", alignItems: "center",
    textAlign: "center", gap: 12, marginBottom: 32,
  }}>
    <div style={{ fontSize: 36 }}>🚀</div>
    <div style={{ fontSize: 18, fontWeight: 600, color: T.amber }}>
      Keep Growing Your Skills!
    </div>
    <div style={{ fontSize: 14, color: T.subLight, maxWidth: 480, lineHeight: 1.6 }}>
      {reason}
    </div>
    <div style={{ fontSize: 12, color: T.sub }}>
      The Launchpad is designed for new freelancers with fewer than 5 completed projects.
      As your career grows, you'll unlock the full project marketplace.
    </div>
  </div>
);

// ── Empty reservations ────────────────────────────────────────────────────────

const EmptyReservations = () => (
  <div style={{
    textAlign: "center", padding: "40px 20px",
    border: `0.5px dashed ${T.border}`, borderRadius: 16,
  }}>
    <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
    <div style={{ fontSize: 14, fontWeight: 500, color: T.subLight, marginBottom: 6 }}>
      No reservations yet
    </div>
    <div style={{ fontSize: 12, color: T.sub }}>
      Reserve a starter project above to claim your first spot!
    </div>
  </div>
);

// ── Toast ─────────────────────────────────────────────────────────────────────

interface Toast { id: number; type: "success" | "error"; msg: string; }

const Toasts: React.FC<{ toasts: Toast[] }> = ({ toasts }) => (
  <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000, display: "flex", flexDirection: "column", gap: 10 }}>
    {toasts.map(t => (
      <div key={t.id} style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderRadius: 12, maxWidth: 340,
        background: t.type === "success" ? T.greenSoft : T.redSoft,
        color:      t.type === "success" ? T.green     : T.red,
        border:     `0.5px solid ${t.type === "success" ? T.green : T.red}44`,
        fontSize: 13, fontWeight: 500,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        animation: "slideUp 0.3s ease",
      }}>
        <span style={{ fontSize: 16 }}>{t.type === "success" ? "✅" : "❌"}</span>
        {t.msg}
      </div>
    ))}
  </div>
);

// ── CSS Keyframes ──────────────────────────────────────────────────────────────

const cssKeyframes = `
  @keyframes fadeIn  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @keyframes pulse   { 0%,100% { opacity: .4; } 50% { opacity: .8; } }
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  @keyframes glow    { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
`;

// ── Main Component ────────────────────────────────────────────────────────────

const LaunchpadPage: React.FC = () => {
  const navigate = useNavigate();

  const [data,        setData]        = useState<LaunchpadData | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [resLoading,  setResLoading]  = useState(true);
  const [error,       setError]       = useState("");
  const [tab,         setTab]         = useState<"discover" | "my">("discover");
  const [reserving,   setReserving]   = useState<number | null>(null);
  const [completing,  setCompleting]  = useState<number | null>(null);
  const [cancelling,  setCancelling]  = useState<number | null>(null);
  const [toasts,      setToasts]      = useState<Toast[]>([]);
  const [resFilter,   setResFilter]   = useState<"all" | "reserved" | "active" | "completed" | "expired">("all");

  const toast = useCallback((type: "success" | "error", msg: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/launchpad`, auth());
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || "Failed to load Launchpad.");
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReservations = useCallback(async (filter = resFilter) => {
    setResLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`${API}/launchpad/my-reservations${params}`, auth());
      if (res.ok) setReservations(await res.json());
    } catch {}
    finally { setResLoading(false); }
  }, [resFilter]);

  useEffect(() => {
    fetchData();
    fetchReservations("all");
  }, []);

  useEffect(() => {
    fetchReservations(resFilter);
  }, [resFilter]);

  const handleReserve = async (projectId: number) => {
    setReserving(projectId);
    try {
      const res = await fetch(`${API}/launchpad/reserve/${projectId}`, {
        method: "POST", ...auth(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Reservation failed.");
      toast("success", body.message || "Project reserved!");
      await fetchData();
      await fetchReservations("all");
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setReserving(null);
    }
  };

  const handleComplete = async (reservationId: number) => {
    setCompleting(reservationId);
    try {
      const res = await fetch(`${API}/launchpad/complete/${reservationId}`, {
        method: "POST", ...auth(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Could not mark as complete.");
      toast("success", body.message || "Reservation completed!");
      await fetchData();
      await fetchReservations("all");
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setCompleting(null);
    }
  };

  const handleCancel = async (reservationId: number) => {
    setCancelling(reservationId);
    try {
      const res = await fetch(`${API}/launchpad/cancel/${reservationId}`, {
        method: "POST", ...auth(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Could not cancel reservation.");
      toast("success", body.message || "Reservation cancelled.");
      await fetchData();
      await fetchReservations("all");
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setCancelling(null);
    }
  };

  const filteredReservations =
    resFilter === "all" ? reservations : reservations.filter(r => r.status === resFilter);

  return (
    <div style={{
      minHeight: "100vh", background: T.bg,
      fontFamily: "'Inter', 'SF Pro', system-ui, sans-serif",
      color: T.text,
    }}>
      <style>{cssKeyframes}</style>

      {/* ── Navbar ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 56,
        borderBottom: `0.5px solid ${T.border}`,
        position: "sticky", top: 0, background: T.bg + "ee",
        backdropFilter: "blur(12px)", zIndex: 100,
      }}>
        <button
          onClick={() => navigate("/dashboard/freelancer")}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "none", border: "none", cursor: "pointer",
            color: T.sub, fontSize: 13, fontFamily: "inherit",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
          </svg>
          Dashboard
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: T.accentSoft,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <RocketIcon />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.text, letterSpacing: "-0.2px" }}>
            AI Launchpad
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px",
            borderRadius: 100, background: T.accentSoft, color: T.accent,
            border: `0.5px solid ${T.accent}44`, letterSpacing: ".04em",
          }}>
            BETA
          </span>
        </div>

        <button
          onClick={() => { fetchData(); fetchReservations(resFilter); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: `0.5px solid ${T.border}`,
            borderRadius: 8, padding: "6px 12px",
            color: T.sub, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </nav>

      {/* ── Hero ── */}
      <div style={{
        padding: "40px 28px 0",
        maxWidth: 1100, margin: "0 auto",
      }}>
        {/* Decorative glow */}
        <div style={{
          position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)",
          width: 600, height: 200,
          background: `radial-gradient(ellipse at center, ${T.accentGlow} 0%, transparent 70%)`,
          pointerEvents: "none", zIndex: 0,
        }} />

        <div style={{ position: "relative", zIndex: 1, textAlign: "center", marginBottom: 36 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontSize: 11, fontWeight: 600, color: T.accent, letterSpacing: ".08em",
            padding: "5px 14px", borderRadius: 100,
            background: T.accentSoft, border: `0.5px solid ${T.accent}44`,
            marginBottom: 16,
          }}>
            <span style={{ animation: "glow 2s ease-in-out infinite" }}>●</span>
            AI-POWERED STARTER PROJECTS
          </div>

          <h1 style={{
            fontSize: 36, fontWeight: 700, letterSpacing: "-1px",
            color: T.text, margin: "0 0 12px",
            lineHeight: 1.2,
          }}>
            Your AI{" "}
            <span style={{
              background: `linear-gradient(135deg, ${T.accent}, #a78bfa)`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Launchpad
            </span>
          </h1>

          <p style={{
            fontSize: 15, color: T.subLight, maxWidth: 520,
            margin: "0 auto 28px", lineHeight: 1.6,
          }}>
            Starter projects hand-picked by our AI to match your skills —
            no bidding war, just reserve and deliver.
          </p>

          {/* Slot tracker & latency */}
          {data && (
            <div style={{
              display: "flex", justifyContent: "center", alignItems: "center",
              gap: 24, flexWrap: "wrap",
            }}>
              <SlotTracker used={data.slots_used} total={3} />
              {data.latency_ms > 0 && (
                <span style={{ fontSize: 11, color: T.sub, display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  AI matched in {data.latency_ms.toFixed(0)}ms
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            background: T.redSoft, border: `1px solid ${T.red}33`,
            borderRadius: 12, padding: "14px 18px",
            color: T.red, fontSize: 13, marginBottom: 24,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
            <button onClick={fetchData} style={{ marginLeft: "auto", background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 12, fontFamily: "inherit", textDecoration: "underline" }}>
              Retry
            </button>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{
          display: "flex", gap: 2,
          borderBottom: `0.5px solid ${T.border}`,
          marginBottom: 28,
        }}>
          {(["discover", "my"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "10px 20px", fontSize: 13, fontWeight: 500,
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit",
                color: tab === t ? T.accent : T.sub,
                borderBottom: `2px solid ${tab === t ? T.accent : "transparent"}`,
                transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 7,
              }}
            >
              {t === "discover" ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Discover Projects
                  {data && data.recommended_projects.filter(p => !p.is_reserved).length > 0 && (
                    <span style={{
                      background: T.accentSoft, color: T.accent,
                      fontSize: 10, fontWeight: 700, padding: "1px 6px",
                      borderRadius: 100,
                    }}>
                      {data.recommended_projects.filter(p => !p.is_reserved).length}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                  </svg>
                  My Reservations
                  {reservations.filter(r => r.status === "reserved" || r.status === "active").length > 0 && (
                    <span style={{
                      background: T.greenSoft, color: T.green,
                      fontSize: 10, fontWeight: 700, padding: "1px 6px",
                      borderRadius: 100,
                    }}>
                      {reservations.filter(r => r.status === "reserved" || r.status === "active").length}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {/* ── DISCOVER TAB ── */}
        {tab === "discover" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : !data ? null
            : !data.is_beginner_qualified ? (
              <NotQualifiedBanner reason={data.reason} />
            ) : data.recommended_projects.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "48px 20px",
                border: `0.5px dashed ${T.border}`, borderRadius: 16,
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.subLight, marginBottom: 6 }}>
                  No matching projects right now
                </div>
                <div style={{ fontSize: 12, color: T.sub }}>
                  Add more skills to your profile to unlock starter projects.
                </div>
                <button
                  onClick={() => navigate("/settings/profile")}
                  style={{
                    marginTop: 16, padding: "9px 20px", borderRadius: 10,
                    background: T.accentSoft, color: T.accent,
                    border: `0.5px solid ${T.accent}44`,
                    fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Update Profile
                </button>
              </div>
            ) : (
              <>
                {/* Qualification banner */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: T.greenSoft, border: `0.5px solid ${T.green}33`,
                  borderRadius: 12, padding: "12px 16px", marginBottom: 24,
                }}>
                  <span style={{ fontSize: 18 }}>✅</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.green }}>
                      You qualify for AI Launchpad!
                    </div>
                    <div style={{ fontSize: 12, color: T.subLight, marginTop: 2 }}>
                      {data.reason}
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: T.sub }}>Slots remaining</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: data.slots_remaining > 0 ? T.green : T.red }}>
                      {data.slots_remaining}
                    </div>
                  </div>
                </div>

                {/* Project grid — hide already-reserved projects */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                  {data.recommended_projects.filter((p: StarterProject) => !p.is_reserved).map((p: StarterProject) => (
                    <div key={p.project_id} style={{ animation: "fadeIn 0.4s ease" }}>
                      <ProjectCard
                        project={p}
                        slotsLeft={data.slots_remaining}
                        onReserve={handleReserve}
                        reserving={reserving}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── MY RESERVATIONS TAB ── */}
        {tab === "my" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {/* Filter pills */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
              {(["all", "reserved", "active", "completed", "expired"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setResFilter(f)}
                  style={{
                    fontSize: 11, padding: "5px 14px", borderRadius: 100,
                    cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                    border: `0.5px solid ${resFilter === f ? T.accent : T.border}`,
                    background: resFilter === f ? T.accentSoft : "transparent",
                    color: resFilter === f ? T.accent : T.sub,
                    transition: "all 0.15s",
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === "all" && reservations.length > 0 && (
                    <span style={{ marginLeft: 5, opacity: .7 }}>{reservations.length}</span>
                  )}
                </button>
              ))}
            </div>

            {resLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{
                    height: 90, background: T.card, border: `0.5px solid ${T.border}`,
                    borderRadius: 14, animation: "pulse 1.5s ease-in-out infinite",
                    animationDelay: `${i * 0.1}s`,
                  }} />
                ))}
              </div>
            ) : filteredReservations.length === 0 ? (
              <EmptyReservations />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredReservations.map(r => (
                  <div key={r.reservation_id} style={{ animation: "fadeIn 0.3s ease" }}>
                    <ReservationCard
                      r={r}
                      onComplete={handleComplete}
                      onCancel={handleCancel}
                      completing={completing}
                      cancelling={cancelling}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom padding */}
        <div style={{ height: 80 }} />
      </div>

      {/* ── Toasts ── */}
      <Toasts toasts={toasts} />
    </div>
  );
};

export default LaunchpadPage;
