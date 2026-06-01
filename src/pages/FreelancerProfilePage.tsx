/**
 * FreelancerProfilePage.tsx
 * Route: /freelancer/:userId
 * Public profile view for a freelancer — visible to clients
 */
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../shared/LanguageContext";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });

const T = {
  bg: "#0a0a0f",
  surface: "#13131a",
  card: "#1a1a24",
  border: "#252535",
  text: "#e8e8f0",
  sub: "#7070a0",
  accent: "#7F77DD",
  accentSoft: "#7F77DD22",
  green: "#22d3a0",
  greenSoft: "#22d3a015",
  amber: "#f5a623",
  red: "#ef4444",
};

interface FreelancerProfile {
  freelancer_id: number;
  user_id: number;
  email: string;
  bio: string | null;
  hourly_rate: number | null;
  success_score: number;
  skills: string[];
  first_name?: string | null;
  last_name?: string | null;
}

interface GitHubProject {
  title: string;
  company: string;
  duration: string;
  description: string;
  tech_stack: string[];
  github_url: string;
}

interface GitHubProfileData {
  github_score: number;
  github_url: string;
  top_languages: string[];
  username: string;
  name: string;
  avatar_url: string;
  public_repos: number;
  followers: number;
  total_stars: number;
  account_created: string;
  location: string;
  website: string;
  experience: GitHubProject[];
  suggestions: string[];
}

interface ScoreBreakdown {
  score: number;
  avg_rating: number;
  total_reviews: number;
  jobs_completed: number;
}

const StarRating: React.FC<{ rating: number }> = ({ rating }) => {
  const full  = Math.floor(rating);
  const half  = rating - full >= 0.5;
  return (
    <span style={{ fontSize: 16, letterSpacing: 2 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ color: n <= full ? T.amber : (n === full + 1 && half) ? T.amber : T.border, opacity: n === full + 1 && half ? 0.55 : 1 }}>★</span>
      ))}
    </span>
  );
};

export const FreelancerProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate   = useNavigate();
  const { t, isRTL } = useLanguage();

  const [profile,       setProfile]       = useState<FreelancerProfile | null>(null);
  const [breakdown,     setBreakdown]     = useState<ScoreBreakdown | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [ghData,        setGhData]        = useState<GitHubProfileData | null>(null);
  const [ghModalOpen,   setGhModalOpen]   = useState(false);
  const [ghLoading,     setGhLoading]     = useState(false);
  const [ghError,       setGhError]       = useState("");

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const r = await fetch(`${API}/freelancers/user/${userId}`, auth());
        if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Not found"); }
        const data: FreelancerProfile = await r.json();
        setProfile(data);

        try {
          const rb = await fetch(`${API}/freelancers/${data.freelancer_id}/score-breakdown`, auth());
          if (rb.ok) setBreakdown(await rb.json());
        } catch {}
      } catch (e: any) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  const openGitHub = async () => {
    if (!profile) return;
    setGhModalOpen(true);
    if (ghData) return;
    setGhLoading(true);
    setGhError("");
    try {
      const r = await fetch(`${API}/freelancers/${profile.freelancer_id}/github-profile`, auth());
      if (!r.ok) throw new Error("Failed to load GitHub profile");
      setGhData(await r.json());
    } catch (e: any) {
      setGhError((e as Error).message);
    } finally {
      setGhLoading(false);
    }
  };

  const displayName = (profile?.first_name || profile?.last_name)
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
    : (profile?.email ? profile.email.split("@")[0] : `Freelancer #${userId}`);

  const initials = (profile?.first_name || profile?.last_name)
    ? `${profile.first_name?.charAt(0) ?? ""}${profile.last_name?.charAt(0) ?? ""}`.toUpperCase()
    : (profile?.email ? profile.email.split("@")[0].slice(0, 2).toUpperCase() : "?");
  const trustScore  = breakdown?.score ?? Math.round((profile?.success_score ?? 0) * 20);
  const avgRating   = breakdown?.avg_rating ?? profile?.success_score ?? 0;

  const trustColor =
    trustScore >= 80 ? T.green :
    trustScore >= 50 ? T.amber :
    trustScore > 0   ? "#f97316" : T.sub;

  if (loading) return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.sub, fontFamily: "'DM Sans', sans-serif", gap: 12 }}>
      <div style={{ width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {t("flprof.loading")}
    </div>
  );

  if (error || !profile) return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ fontSize: 40 }}>😕</div>
      <div style={{ color: T.sub, fontSize: 14 }}>{error || t("flprof.notFound")}</div>
      <button onClick={() => navigate(-1)} style={{ padding: "10px 24px", background: T.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{t("flprof.goBack")}</button>
    </div>
  );

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); *{box-sizing:border-box} @keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Top bar */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: `1px solid ${T.border}`, color: T.sub, cursor: "pointer", fontSize: 12, borderRadius: 8, padding: "6px 12px" }}>{t("flprof.back")}</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Skill<span style={{ color: T.accent }}>Link</span></div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={openGitHub}
            style={{ background: "#24292e", border: "1px solid #444", borderRadius: 10, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, padding: "9px 18px", display: "flex", alignItems: "center", gap: 7 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
            {t("flprof.review")}
          </button>
          <button
            onClick={() => navigate(`/messages?user=${profile.user_id}&email=${encodeURIComponent(profile.email)}&name=${encodeURIComponent(displayName)}`)}
            style={{ background: T.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, padding: "9px 22px", display: "flex", alignItems: "center", gap: 7 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            {t("flprof.message")}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 24px", animation: "fadeIn 0.4s ease" }}>

        {/* ── Profile header card ── */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: "28px 32px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: T.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, flexShrink: 0, boxShadow: `0 4px 20px ${T.accent}40` }}>
            {initials}
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 3 }}>{displayName}</div>
            <div style={{ fontSize: 13, color: T.sub, marginBottom: 10 }}>{profile.email}</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <StarRating rating={avgRating} />
              <span style={{ fontSize: 12, color: T.sub }}>{avgRating.toFixed(1)} / 5.0</span>
              {breakdown && (
                <span style={{ fontSize: 12, color: T.sub }}>· {breakdown.total_reviews} {t("flprof.reviews").toLowerCase()}</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            {profile.hourly_rate != null && profile.hourly_rate > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: T.green }}>${profile.hourly_rate}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{t("flprof.perHour")}</div>
              </div>
            )}
            <div style={{ background: `${trustColor}18`, border: `1px solid ${trustColor}40`, borderRadius: 10, padding: "6px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: trustColor }}>{trustScore}<span style={{ fontSize: 11, fontWeight: 400 }}>/100</span></div>
              <div style={{ fontSize: 10, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em" }}>{t("flprof.trustScore")}</div>
            </div>
          </div>
        </div>

        {/* ── Bio + Skills row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "22px 26px" }}>
            <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12, fontWeight: 600 }}>{t("flprof.about")}</div>
            {profile.bio ? (
              <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.8, margin: 0 }}>{profile.bio}</p>
            ) : (
              <p style={{ fontSize: 13, color: T.sub, opacity: 0.45, margin: 0, fontStyle: "italic" }}>{t("flprof.noBio")}</p>
            )}
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "22px 26px" }}>
            <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12, fontWeight: 600 }}>
              {t("flprof.skills")} <span style={{ color: T.sub, fontWeight: 400 }}>({profile.skills.length})</span>
            </div>
            {profile.skills.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {profile.skills.map(s => (
                  <span key={s} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 100, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accent}33` }}>{s}</span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: T.sub, opacity: 0.45, margin: 0, fontStyle: "italic" }}>{t("flprof.noSkills")}</p>
            )}
          </div>
        </div>

        {/* ── Stats row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          {[
            { label: t("flprof.trustScore"),  value: `${trustScore}/100`,                 color: trustColor },
            { label: t("flprof.avgRating"),   value: `${avgRating.toFixed(1)}/5`,         color: T.amber },
            { label: t("flprof.jobsDone"),    value: breakdown?.jobs_completed ?? "—",    color: T.accent },
            { label: t("flprof.reviews"),     value: breakdown?.total_reviews  ?? "—",    color: T.green  },
          ].map(s => (
            <div key={s.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginBottom: 5 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Trust score bar ── */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "20px 26px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14, fontWeight: 600 }}>{t("flprof.trustBreak")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, height: 8, background: T.border, borderRadius: 100, overflow: "hidden" }}>
              <div style={{ width: `${trustScore}%`, height: "100%", background: trustColor, borderRadius: 100, transition: "width .6s ease" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: trustColor, flexShrink: 0 }}>{trustScore}/100</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: T.sub }}>
            {trustScore >= 80 ? t("flprof.highTrust") :
             trustScore >= 50 ? t("flprof.goodRep") :
             trustScore > 0   ? t("flprof.building") :
             t("flprof.newFl")}
          </div>
        </div>

        {/* ── CTA footer ── */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={() => navigate(`/messages?user=${profile.user_id}&email=${encodeURIComponent(profile.email)}&name=${encodeURIComponent(displayName)}`)}
            style={{ flex: 1, maxWidth: 260, padding: "13px 0", borderRadius: 12, background: T.accent, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            {t("flprof.sendMsg")}
          </button>
          <button
            onClick={() => navigate(-1)}
            style={{ padding: "13px 28px", borderRadius: 12, background: "transparent", color: T.sub, border: `1px solid ${T.border}`, fontSize: 14, cursor: "pointer" }}
          >
            {t("flprof.back")}
          </button>
        </div>

      </div>

      {/* ── GitHub Review Modal ── */}
      {ghModalOpen && (
      <div
        onClick={() => setGhModalOpen(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,.5)", fontFamily: "'DM Sans', sans-serif" }}
        >
          {/* Modal header */}
          <div style={{ padding: "22px 28px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={T.text}><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t("flprof.gh.title")}</span>
            </div>
            <button onClick={() => setGhModalOpen(false)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
          </div>

          <div style={{ padding: "22px 28px 28px" }}>
            {ghLoading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: T.sub }}>
                <div style={{ width: 20, height: 20, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                {t("flprof.gh.loading")}
              </div>
            )}

            {ghError && (
              <div style={{ textAlign: "center", padding: "40px 0", color: T.sub }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
                <div style={{ fontSize: 13 }}>{ghError}</div>
              </div>
            )}

            {ghData && !ghLoading && (
              <>
                {/* Score + link row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {ghData.avatar_url && (
                      <img src={ghData.avatar_url} alt="avatar" style={{ width: 52, height: 52, borderRadius: "50%", border: `2px solid ${T.border}` }} />
                    )}
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{ghData.name || ghData.username || "—"}</div>
                      {ghData.location && <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>📍 {ghData.location}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {ghData.github_score > 0 && (() => {
                      const sc = ghData.github_score;
                      const col = sc >= 70 ? T.green : sc >= 40 ? T.amber : T.sub;
                      return (
                        <div style={{ background: `${col}18`, border: `1px solid ${col}40`, borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: col }}>{sc}<span style={{ fontSize: 10, fontWeight: 400 }}>/100</span></div>
                          <div style={{ fontSize: 9, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em" }}>GitHub Score</div>
                        </div>
                      );
                    })()}
                    {ghData.github_url && (
                      <a href={ghData.github_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.accent, textDecoration: "none", border: `1px solid ${T.accent}40`, borderRadius: 8, padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        {t("flprof.gh.open")}
                      </a>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: t("flprof.gh.repos"),     value: ghData.public_repos },
                    { label: t("flprof.gh.stars"),      value: ghData.total_stars  },
                    { label: t("flprof.gh.followers"),  value: ghData.followers    },
                  ].map(s => (
                    <div key={s.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em", marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Top languages */}
                {ghData.top_languages.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, marginBottom: 10 }}>{t("flprof.gh.langs")}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {ghData.top_languages.map(lang => (
                        <span key={lang} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 100, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accent}33` }}>{lang}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Projects */}
                {ghData.experience.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, marginBottom: 12 }}>{t("flprof.gh.projects")} ({ghData.experience.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {ghData.experience.map((proj, i) => (
                        <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 18px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{proj.title}</div>
                            {proj.github_url && (
                              <a href={proj.github_url} target="_blank" rel="noreferrer" style={{ color: T.accent, fontSize: 11, textDecoration: "none", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                {t("flprof.gh.viewRepo")}
                              </a>
                            )}
                          </div>
                          {proj.duration && <div style={{ fontSize: 11, color: T.sub, marginBottom: 6 }}>{proj.duration}</div>}
                          {proj.description && <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, marginBottom: 8 }}>{proj.description}</div>}
                          {proj.tech_stack?.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {proj.tech_stack.map(tk => (
                                <span key={tk} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 100, background: `${T.green}15`, color: T.green, border: `1px solid ${T.green}30` }}>{tk}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ghData.experience.length === 0 && ghData.github_score === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 0", color: T.sub, fontSize: 13 }}>{t("flprof.gh.noData")}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default FreelancerProfilePage;
