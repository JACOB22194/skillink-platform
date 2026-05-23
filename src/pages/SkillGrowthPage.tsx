/**
 * SkillGrowthPage.tsx
 * Route: /skill-growth  (freelancer only)
 *
 * DEV-07: Skill Growth & Analytics
 * - Market gap radar showing category coverage
 * - Trending skills the freelancer is missing
 * - Coursera course recommendations per gap
 * - Animated demand bars + skill chips
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface KnownSkillDetail {
  category:     string;
  demand_score: number;
  level:        string;
  trending:     boolean;
}

interface GapSkill {
  skill:        string;
  category:     string;
  demand_score: number;
  level:        string;
}

interface RecommendedCourse {
  course_name:  string;
  difficulty:   string;
  rating:       number;
  url:          string;
  category:     string;
  match_score:  number;
}

interface SkillGrowthData {
  freelancer_id:        number;
  known_skills:         string[];
  known_skills_detail:  KnownSkillDetail[];
  top_categories:       string[];
  market_gap:           GapSkill[];
  recommended_courses:  RecommendedCourse[];
  category_scores:      Record<string, number>;
  latency_ms:           number;
}

// ── Theme (matches LaunchpadPage exactly) ─────────────────────────────────────

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
  purple:      "#a78bfa",
  purpleSoft:  "rgba(167,139,250,0.1)",
  pink:        "#f472b6",
  pinkSoft:    "rgba(244,114,182,0.1)",
  cyan:        "#22d3ee",
  cyanSoft:    "rgba(34,211,238,0.1)",
};

// ── Category color map ─────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, { color: string; soft: string; icon: string }> = {
  "Web Development":    { color: T.cyan,   soft: T.cyanSoft,   icon: "🌐" },
  "Data Science & ML":  { color: T.purple, soft: T.purpleSoft, icon: "🧠" },
  "Cloud & DevOps":     { color: T.amber,  soft: T.amberSoft,  icon: "☁️" },
  "Cybersecurity":      { color: T.red,    soft: T.redSoft,    icon: "🔒" },
  "Mobile Development": { color: T.green,  soft: T.greenSoft,  icon: "📱" },
  "Databases":          { color: T.teal,   soft: T.tealSoft,   icon: "🗄️" },
};

const catColor = (cat: string) =>
  CAT_COLOR[cat] ?? { color: T.accent, soft: T.accentSoft, icon: "💡" };

// ── Level badge ────────────────────────────────────────────────────────────────

const LevelBadge: React.FC<{ level: string }> = ({ level }) => {
  const cfg =
    level === "Beginner"     ? { bg: T.greenSoft,  color: T.green,  icon: "🌱" }
    : level === "Intermediate" ? { bg: T.amberSoft,  color: T.amber,  icon: "⚡" }
    :                            { bg: T.redSoft,    color: T.red,    icon: "🔥" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: ".04em",
      padding: "2px 8px", borderRadius: 100,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}33`,
    }}>
      {cfg.icon} {level}
    </span>
  );
};

// ── Skill chip ─────────────────────────────────────────────────────────────────

const SkillChip: React.FC<{ label: string; trending?: boolean; color?: string }> = ({
  label, trending, color,
}) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 11, padding: "3px 10px", borderRadius: 100,
    background: color ? `${color}15` : T.accentSoft,
    color:      color ?? T.accent,
    border:     `0.5px solid ${color ? `${color}33` : T.accent + "44"}`,
    fontWeight: 500,
  }}>
    {trending && <span style={{ fontSize: 8 }}>🔥</span>}
    {label}
  </span>
);

// ── Animated demand bar ────────────────────────────────────────────────────────

const DemandBar: React.FC<{ score: number; color: string; animated?: boolean }> = ({
  score, color, animated = true,
}) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), animated ? 200 : 0);
    return () => clearTimeout(t);
  }, [score, animated]);

  return (
    <div style={{ flex: 1, height: 4, background: T.border, borderRadius: 100, overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${width}%`,
        background: `linear-gradient(90deg, ${color}88, ${color})`,
        borderRadius: 100,
        transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
        boxShadow: `0 0 8px ${color}66`,
      }} />
    </div>
  );
};

// ── Radar / Category coverage hexagons ────────────────────────────────────────

const CategoryRadar: React.FC<{ scores: Record<string, number> }> = ({ scores }) => {
  const entries = Object.entries(scores);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 10,
    }}>
      {entries.map(([cat, score]) => {
        const cc = catColor(cat);
        const r = score / 100;
        const circumference = 2 * Math.PI * 28;
        const offset = circumference * (1 - r);
        return (
          <div key={cat} style={{
            background: T.card,
            border: `0.5px solid ${T.border}`,
            borderRadius: 14,
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            transition: "border-color 0.2s",
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = cc.color + "66")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}
          >
            {/* SVG ring */}
            <svg width="68" height="68" viewBox="0 0 68 68">
              <circle cx="34" cy="34" r="28" fill="none" stroke={T.border} strokeWidth="5" />
              <circle
                cx="34" cy="34" r="28"
                fill="none"
                stroke={cc.color}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                transform="rotate(-90 34 34)"
                style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)", filter: `drop-shadow(0 0 4px ${cc.color}88)` }}
              />
              <text x="34" y="38" textAnchor="middle" fontSize="14" fontWeight="700" fill={cc.color}>
                {score}%
              </text>
            </svg>
            <span style={{ fontSize: 9, color: cc.color, textAlign: "center", lineHeight: 1.3 }}>
              {cc.icon} {cat.replace(" & ", "\n& ")}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── Gap Skill Card ─────────────────────────────────────────────────────────────

const GapCard: React.FC<{ gap: GapSkill; index: number }> = ({ gap, index }) => {
  const cc = catColor(gap.category);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 16px",
      background: T.card,
      border: `0.5px solid ${T.border}`,
      borderRadius: 12,
      animation: `fadeIn 0.3s ease ${index * 0.05}s both`,
      transition: "border-color 0.2s, background 0.2s",
      cursor: "default",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${cc.color}55`;
        e.currentTarget.style.background = T.cardHover;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = T.border;
        e.currentTarget.style.background = T.card;
      }}
    >
      {/* Rank */}
      <div style={{
        width: 26, height: 26, borderRadius: 8,
        background: cc.soft, color: cc.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>
        {index + 1}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{gap.skill}</span>
          <LevelBadge level={gap.level} />
          <span style={{
            marginLeft: "auto", fontSize: 10, fontWeight: 700,
            color: cc.color, background: cc.soft,
            padding: "2px 7px", borderRadius: 100,
          }}>
            {gap.demand_score}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DemandBar score={gap.demand_score} color={cc.color} />
          <span style={{ fontSize: 10, color: T.sub, whiteSpace: "nowrap" }}>{cc.icon} {gap.category}</span>
        </div>
      </div>
    </div>
  );
};

// ── Course Card ────────────────────────────────────────────────────────────────

const CourseCard: React.FC<{ course: RecommendedCourse; index: number }> = ({ course, index }) => {
  const cc = catColor(course.category);
  const diff = course.difficulty.toLowerCase();
  const diffCfg =
    diff === "beginner"     ? { color: T.green,  bg: T.greenSoft,  icon: "🌱" }
    : diff === "intermediate" ? { color: T.amber,  bg: T.amberSoft,  icon: "⚡" }
    : diff === "advanced"     ? { color: T.red,    bg: T.redSoft,    icon: "🔥" }
    :                           { color: T.accent, bg: T.accentSoft, icon: "📚" };

  const stars = Math.round(course.rating);

  return (
    <a
      href={course.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        textDecoration: "none",
        background: T.card,
        border: `0.5px solid ${T.border}`,
        borderRadius: 14,
        padding: "16px",
        animation: `fadeIn 0.3s ease ${index * 0.07}s both`,
        transition: "border-color 0.2s, background 0.2s, transform 0.2s",
        cursor: "pointer",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${cc.color}55`;
        e.currentTarget.style.background = T.cardHover;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = T.border;
        e.currentTarget.style.background = T.card;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: cc.soft, border: `1px solid ${cc.color}33`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, flexShrink: 0,
        }}>
          {cc.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.35, marginBottom: 4 }}>
            {course.course_name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 100,
              background: diffCfg.bg, color: diffCfg.color,
              border: `0.5px solid ${diffCfg.color}33`, fontWeight: 600,
            }}>
              {diffCfg.icon} {course.difficulty}
            </span>
            <span style={{ fontSize: 10, color: T.sub }}>{cc.icon} {course.category}</span>
          </div>
        </div>
        {/* External link icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </div>

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Stars */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ display: "flex", gap: 1 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <svg key={i} width="11" height="11" viewBox="0 0 24 24"
                fill={i < stars ? T.gold : "none"}
                stroke={i < stars ? T.gold : T.border}
                strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            ))}
          </div>
          <span style={{ fontSize: 11, color: T.subLight, fontWeight: 600 }}>{course.rating.toFixed(1)}</span>
        </div>
        {/* Match score */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.sub }}>Relevance</span>
          <span style={{
            fontSize: 11, fontWeight: 700, color: T.accent,
            background: T.accentSoft, padding: "2px 8px", borderRadius: 100,
          }}>
            {Math.round(course.match_score * 100)}%
          </span>
        </div>
      </div>
    </a>
  );
};

// ── Skeleton ───────────────────────────────────────────────────────────────────

const Skeleton: React.FC<{ h?: number; w?: string; r?: number }> = ({
  h = 16, w = "100%", r = 6,
}) => (
  <div style={{
    height: h, width: w, borderRadius: r,
    background: T.border,
    animation: "pulse 1.5s ease-in-out infinite",
  }} />
);

const PageSkeleton = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={110} r={14} />)}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={64} r={12} />)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={120} r={14} />)}
    </div>
  </div>
);

// ── Section header ─────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}> = ({ icon, title, subtitle, badge }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
    <div style={{
      width: 36, height: 36, borderRadius: 10,
      background: T.accentSoft, border: `1px solid ${T.accent}33`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      {icon}
    </div>
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</span>
        {badge}
      </div>
      <div style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>{subtitle}</div>
    </div>
  </div>
);

// ── Toast ──────────────────────────────────────────────────────────────────────

interface Toast { id: number; msg: string; type: "success" | "error" }

const Toasts: React.FC<{ toasts: Toast[] }> = ({ toasts }) => (
  <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999 }}>
    {toasts.map(t => (
      <div key={t.id} style={{
        padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 500,
        background: t.type === "success" ? T.greenSoft : T.redSoft,
        color: t.type === "success" ? T.green : T.red,
        border: `0.5px solid ${t.type === "success" ? T.green : T.red}44`,
        animation: "fadeIn 0.2s ease",
        backdropFilter: "blur(8px)",
      }}>
        {t.type === "success" ? "✅" : "❌"} {t.msg}
      </div>
    ))}
  </div>
);

// ── Main Page ──────────────────────────────────────────────────────────────────

const SkillGrowthPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData]       = useState<SkillGrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"gap" | "courses" | "known">("gap");
  const [toasts, setToasts]   = useState<Toast[]>([]);
  const [catFilter, setCatFilter] = useState<string>("all");

  const toast = useCallback((msg: string, type: "success" | "error" = "success") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/skill-growth/my`, auth());
      if (r.status === 401) { navigate("/"); return; }
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail ?? "Failed to load skill data");
      }
      setData(await r.json());
    } catch (e: any) {
      toast(e.message ?? "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  }, [navigate, toast]);

  useEffect(() => { load(); }, [load]);

  // Filtered gap skills
  const filteredGap = data?.market_gap.filter(g =>
    catFilter === "all" || g.category === catFilter
  ) ?? [];

  const uniqueCats = data ? Array.from(new Set(data.market_gap.map(g => g.category))) : [];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse  { 0%,100% { opacity:.4; } 50% { opacity:.8; } }
        @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 4px; }
        a { color: inherit; }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32, animation: "fadeIn 0.4s ease" }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "none", border: "none", cursor: "pointer",
              color: T.sub, fontSize: 12, fontFamily: "inherit",
              padding: "4px 0", marginBottom: 20,
              transition: "color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = T.text)}
            onMouseLeave={e => (e.currentTarget.style.color = T.sub)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: `linear-gradient(135deg, ${T.accentSoft}, ${T.purpleSoft})`,
                  border: `1px solid ${T.accent}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20,
                }}>
                  📈
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-.02em" }}>
                    Skill Growth
                  </h1>
                  <div style={{ fontSize: 12, color: T.sub, marginTop: 1 }}>
                    Market gap analysis & personalized course recommendations
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 10, fontSize: 12,
                background: T.accentSoft, color: T.accent,
                border: `0.5px solid ${T.accent}44`,
                cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
                opacity: loading ? 0.6 : 1,
                transition: "all 0.15s",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {/* Stats row */}
          {data && !loading && (
            <div style={{
              display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap",
              animation: "fadeIn 0.4s ease 0.1s both",
            }}>
              {[
                { label: "Skills Matched", value: data.known_skills.length, color: T.accent, icon: "✅" },
                { label: "Skill Gaps", value: data.market_gap.length, color: T.amber, icon: "🎯" },
                { label: "Courses Ready", value: data.recommended_courses.length, color: T.green, icon: "📚" },
                { label: "Top Category", value: data.top_categories[0] ?? "—", color: T.purple, icon: "🏆", small: true },
              ].map(s => (
                <div key={s.label} style={{
                  flex: "1 1 160px",
                  background: T.card, border: `0.5px solid ${T.border}`,
                  borderRadius: 12, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
                    {s.icon} {s.label}
                  </div>
                  <div style={{
                    fontSize: s.small ? 13 : 22, fontWeight: 700, color: s.color,
                    lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Category Coverage ── */}
        {!loading && data && (
          <div style={{
            marginBottom: 28,
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 16, padding: "20px",
            animation: "fadeIn 0.4s ease 0.15s both",
          }}>
            <SectionHeader
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><polygon points="12 2 2 7 12 22 22 7 12 2"/></svg>}
              title="Category Coverage"
              subtitle="Your skill coverage % per IT domain"
            />
            <CategoryRadar scores={data.category_scores} />
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{
          display: "flex", gap: 2,
          borderBottom: `0.5px solid ${T.border}`,
          marginBottom: 24,
        }}>
          {([
            { key: "gap",     label: "Market Gap",  icon: "🎯", count: data?.market_gap.length },
            { key: "courses", label: "Courses",      icon: "📚", count: data?.recommended_courses.length },
            { key: "known",   label: "Known Skills", icon: "✅", count: data?.known_skills.length },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 18px", fontSize: 13, fontWeight: 500,
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit",
                color: tab === t.key ? T.accent : T.sub,
                borderBottom: `2px solid ${tab === t.key ? T.accent : "transparent"}`,
                transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {t.icon} {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span style={{
                  background: tab === t.key ? T.accentSoft : T.border,
                  color: tab === t.key ? T.accent : T.sub,
                  fontSize: 10, fontWeight: 700,
                  padding: "1px 6px", borderRadius: 100,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {loading ? <PageSkeleton /> : !data ? null : (
          <>
            {/* GAP TAB */}
            {tab === "gap" && (
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                <SectionHeader
                  icon={<span style={{ fontSize: 16 }}>🎯</span>}
                  title="Your Market Gap"
                  subtitle="High-demand trending skills you don't have yet — ranked by demand score"
                  badge={
                    <span style={{
                      background: T.amberSoft, color: T.amber,
                      fontSize: 10, fontWeight: 700,
                      padding: "2px 8px", borderRadius: 100,
                    }}>
                      {data.market_gap.length} skills missing
                    </span>
                  }
                />

                {/* Category filter */}
                {uniqueCats.length > 1 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    {(["all", ...uniqueCats] as string[]).map(cat => {
                      const cc = cat === "all" ? { color: T.accent } : catColor(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => setCatFilter(cat)}
                          style={{
                            fontSize: 11, padding: "4px 12px", borderRadius: 100,
                            cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                            border: `0.5px solid ${catFilter === cat ? cc.color : T.border}`,
                            background: catFilter === cat ? `${cc.color}15` : "transparent",
                            color: catFilter === cat ? cc.color : T.sub,
                            transition: "all 0.15s",
                          }}
                        >
                          {cat === "all" ? "All Categories" : `${catColor(cat).icon} ${cat}`}
                        </button>
                      );
                    })}
                  </div>
                )}

                {filteredGap.length === 0 ? (
                  <div style={{
                    textAlign: "center", padding: "40px 20px",
                    border: `0.5px dashed ${T.border}`, borderRadius: 16,
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🎉</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.green, marginBottom: 6 }}>
                      No gaps in this category!
                    </div>
                    <div style={{ fontSize: 12, color: T.sub }}>
                      You have all trending skills covered here.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filteredGap.map((g, i) => <GapCard key={g.skill} gap={g} index={i} />)}
                  </div>
                )}
              </div>
            )}

            {/* COURSES TAB */}
            {tab === "courses" && (
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                <SectionHeader
                  icon={<span style={{ fontSize: 16 }}>📚</span>}
                  title="Recommended Courses"
                  subtitle="Personalized Coursera courses to close your skill gaps"
                  badge={
                    <span style={{
                      background: T.greenSoft, color: T.green,
                      fontSize: 10, fontWeight: 700,
                      padding: "2px 8px", borderRadius: 100,
                    }}>
                      {data.recommended_courses.length} courses
                    </span>
                  }
                />
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 12,
                }}>
                  {data.recommended_courses.map((c, i) => (
                    <CourseCard key={c.url} course={c} index={i} />
                  ))}
                </div>
                {data.recommended_courses.length === 0 && (
                  <div style={{
                    textAlign: "center", padding: "40px 20px",
                    border: `0.5px dashed ${T.border}`, borderRadius: 16,
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                    <div style={{ fontSize: 13, color: T.subLight }}>No courses found for your gaps.</div>
                  </div>
                )}
              </div>
            )}

            {/* KNOWN SKILLS TAB */}
            {tab === "known" && (
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                <SectionHeader
                  icon={<span style={{ fontSize: 16 }}>✅</span>}
                  title="Your Known Skills"
                  subtitle="Skills matched against the IT taxonomy"
                />

                {data.known_skills.length === 0 ? (
                  <div style={{
                    textAlign: "center", padding: "40px 20px",
                    border: `0.5px dashed ${T.border}`, borderRadius: 16,
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>💼</div>
                    <div style={{ fontSize: 13, color: T.subLight, marginBottom: 12 }}>
                      No IT skills matched yet.
                    </div>
                    <button
                      onClick={() => navigate("/settings/profile")}
                      style={{
                        padding: "8px 18px", borderRadius: 10, fontSize: 12,
                        background: T.accentSoft, color: T.accent,
                        border: `0.5px solid ${T.accent}44`,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Update Skills
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Group by category */}
                    {Array.from(new Set(data.known_skills_detail.map(s => s.category))).map(cat => {
                      const cc = catColor(cat);
                      const catSkills = data.known_skills.filter(
                        (_, i) => data.known_skills_detail[i]?.category === cat
                      );
                      const catDetails = data.known_skills_detail.filter(s => s.category === cat);
                      return (
                        <div key={cat} style={{
                          background: T.card, border: `0.5px solid ${T.border}`,
                          borderRadius: 14, padding: "16px",
                          animation: "fadeIn 0.3s ease",
                        }}>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                          }}>
                            <span style={{ fontSize: 16 }}>{cc.icon}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: cc.color }}>{cat}</span>
                            <span style={{
                              marginLeft: "auto", fontSize: 10, color: cc.color,
                              background: cc.soft, padding: "2px 8px", borderRadius: 100,
                            }}>
                              {catSkills.length} skill{catSkills.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {catDetails.map((sd, i) => (
                              <SkillChip
                                key={catSkills[i]}
                                label={catSkills[i] ?? ""}
                                trending={sd.trending}
                                color={cc.color}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Spacing */}
        <div style={{ height: 80 }} />
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
};

export default SkillGrowthPage;