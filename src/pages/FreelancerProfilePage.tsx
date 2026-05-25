/**
 * FreelancerProfilePage.tsx
 * Route: /freelancer/:userId
 * Public profile view for a freelancer — visible to clients
 */
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

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

  const [profile,   setProfile]   = useState<FreelancerProfile | null>(null);
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const r = await fetch(`${API}/freelancers/user/${userId}`, auth());
        if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Not found"); }
        const data: FreelancerProfile = await r.json();
        setProfile(data);

        // Fetch score breakdown separately (non-blocking)
        try {
          const rb = await fetch(`${API}/freelancers/${data.freelancer_id}/score-breakdown`, auth());
          if (rb.ok) setBreakdown(await rb.json());
        } catch {}
      } catch (e: any) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  const initials = profile?.email
    ? profile.email.split("@")[0].slice(0, 2).toUpperCase()
    : "?";

  const displayName = profile?.email ? profile.email.split("@")[0] : `Freelancer #${userId}`;
  const trustScore  = breakdown?.score ?? Math.round((profile?.success_score ?? 0) * 20);
  const avgRating   = breakdown?.avg_rating ?? profile?.success_score ?? 0;

  const trustColor =
    trustScore >= 80 ? T.green :
    trustScore >= 50 ? T.amber :
    trustScore > 0   ? "#f97316" : T.sub;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.sub, fontFamily: "'DM Sans', sans-serif", gap: 12 }}>
      <div style={{ width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      Loading profile…
    </div>
  );

  if (error || !profile) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ fontSize: 40 }}>😕</div>
      <div style={{ color: T.sub, fontSize: 14 }}>{error || "Freelancer not found"}</div>
      <button onClick={() => navigate(-1)} style={{ padding: "10px 24px", background: T.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Go Back</button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); *{box-sizing:border-box} @keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Top bar */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: `1px solid ${T.border}`, color: T.sub, cursor: "pointer", fontSize: 12, borderRadius: 8, padding: "6px 12px" }}>← Back</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Skill<span style={{ color: T.accent }}>Link</span></div>
        </div>
        <button
          onClick={() => navigate(`/messages?user=${profile.user_id}&email=${encodeURIComponent(profile.email)}`)}
          style={{ background: T.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, padding: "9px 22px", display: "flex", alignItems: "center", gap: 7 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Message
        </button>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 24px", animation: "fadeIn 0.4s ease" }}>

        {/* ── Profile header card ── */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: "28px 32px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: T.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, flexShrink: 0, boxShadow: `0 4px 20px ${T.accent}40` }}>
            {initials}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 3 }}>{displayName}</div>
            <div style={{ fontSize: 13, color: T.sub, marginBottom: 10 }}>{profile.email}</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <StarRating rating={avgRating} />
              <span style={{ fontSize: 12, color: T.sub }}>{avgRating.toFixed(1)} / 5.0</span>
              {breakdown && (
                <span style={{ fontSize: 12, color: T.sub }}>· {breakdown.total_reviews} review{breakdown.total_reviews !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>

          {/* Rate + Trust */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            {profile.hourly_rate != null && profile.hourly_rate > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: T.green }}>${profile.hourly_rate}</div>
                <div style={{ fontSize: 12, color: T.sub }}>/ hour</div>
              </div>
            )}
            <div style={{ background: `${trustColor}18`, border: `1px solid ${trustColor}40`, borderRadius: 10, padding: "6px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: trustColor }}>{trustScore}<span style={{ fontSize: 11, fontWeight: 400 }}>/100</span></div>
              <div style={{ fontSize: 10, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em" }}>Trust Score</div>
            </div>
          </div>
        </div>

        {/* ── Bio + Skills row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

          {/* Bio */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "22px 26px" }}>
            <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12, fontWeight: 600 }}>About</div>
            {profile.bio ? (
              <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.8, margin: 0 }}>{profile.bio}</p>
            ) : (
              <p style={{ fontSize: 13, color: T.sub, opacity: 0.45, margin: 0, fontStyle: "italic" }}>No bio provided.</p>
            )}
          </div>

          {/* Skills */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "22px 26px" }}>
            <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12, fontWeight: 600 }}>
              Skills <span style={{ color: T.sub, fontWeight: 400 }}>({profile.skills.length})</span>
            </div>
            {profile.skills.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {profile.skills.map(s => (
                  <span key={s} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 100, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accent}33` }}>{s}</span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: T.sub, opacity: 0.45, margin: 0, fontStyle: "italic" }}>No skills listed.</p>
            )}
          </div>
        </div>

        {/* ── Stats row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          {[
            { label: "Trust Score",     value: `${trustScore}/100`,                              color: trustColor },
            { label: "Avg Rating",      value: `${avgRating.toFixed(1)}/5`,                      color: T.amber },
            { label: "Jobs Completed",  value: breakdown?.jobs_completed ?? "—",                 color: T.accent },
            { label: "Total Reviews",   value: breakdown?.total_reviews  ?? "—",                 color: T.green  },
          ].map(s => (
            <div key={s.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginBottom: 5 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Trust score bar ── */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "20px 26px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14, fontWeight: 600 }}>Trust Score Breakdown</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, height: 8, background: T.border, borderRadius: 100, overflow: "hidden" }}>
              <div style={{ width: `${trustScore}%`, height: "100%", background: trustColor, borderRadius: 100, transition: "width .6s ease" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: trustColor, flexShrink: 0 }}>{trustScore}/100</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: T.sub }}>
            {trustScore >= 80 ? "Highly trusted freelancer with a strong track record." :
             trustScore >= 50 ? "Good reputation — a reliable choice for most projects." :
             trustScore > 0   ? "Building reputation — newer freelancer." :
             "New freelancer — no completed jobs yet."}
          </div>
        </div>

        {/* ── CTA footer ── */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={() => navigate(`/messages?user=${profile.user_id}&email=${encodeURIComponent(profile.email)}`)}
            style={{ flex: 1, maxWidth: 260, padding: "13px 0", borderRadius: 12, background: T.accent, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            Send Message
          </button>
          <button
            onClick={() => navigate(-1)}
            style={{ padding: "13px 28px", borderRadius: 12, background: "transparent", color: T.sub, border: `1px solid ${T.border}`, fontSize: 14, cursor: "pointer" }}
          >
            ← Back
          </button>
        </div>

      </div>
    </div>
  );
};

export default FreelancerProfilePage;
