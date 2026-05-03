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

const StarRating: React.FC<{ score: number }> = ({ score }) => {
  const stars = Math.round(score);
  return (
    <span style={{ fontSize: 16, letterSpacing: 2 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ color: n <= stars ? T.amber : T.border }}>★</span>
      ))}
    </span>
  );
};

export const FreelancerProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate   = useNavigate();
  const [profile, setProfile]   = useState<FreelancerProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const r = await fetch(`${API}/freelancers/user/${userId}`, auth());
        if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Not found"); }
        setProfile(await r.json());
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  const initials = profile?.email
    ? profile.email.split("@")[0].slice(0, 2).toUpperCase()
    : "?";

  if (loading) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.sub, fontFamily: "'DM Sans', sans-serif" }}>
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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); *{box-sizing:border-box}`}</style>

      {/* Top bar */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "16px 28px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 13 }}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Skill<span style={{ color: T.accent }}>Link</span></div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>

        {/* Profile header card */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: "32px 36px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 28, flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: T.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              {profile.email.split("@")[0]}
            </div>
            <div style={{ fontSize: 13, color: T.sub, marginBottom: 10 }}>{profile.email}</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <StarRating score={profile.success_score} />
              <span style={{ fontSize: 12, color: T.sub }}>{profile.success_score.toFixed(1)} / 5.0</span>
            </div>
          </div>

          {/* Rate */}
          {profile.hourly_rate && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: T.green }}>${profile.hourly_rate}</div>
              <div style={{ fontSize: 12, color: T.sub }}>/ hour</div>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Bio */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "24px 28px" }}>
            <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>About</div>
            {profile.bio ? (
              <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.8, margin: 0 }}>{profile.bio}</p>
            ) : (
              <p style={{ fontSize: 13, color: T.sub, opacity: 0.5, margin: 0, fontStyle: "italic" }}>No bio provided.</p>
            )}
          </div>

          {/* Skills */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "24px 28px" }}>
            <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>Skills</div>
            {profile.skills.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {profile.skills.map(s => (
                  <span key={s} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 100, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accent}33` }}>{s}</span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: T.sub, opacity: 0.5, margin: 0, fontStyle: "italic" }}>No skills listed.</p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 20 }}>
          {[
            { label: "Success Score", value: `${profile.success_score.toFixed(1)} / 5`, color: T.amber },
            { label: "Skills Listed", value: profile.skills.length, color: T.accent },
            { label: "Hourly Rate",   value: profile.hourly_rate ? `$${profile.hourly_rate}/hr` : "—", color: T.green },
          ].map(s => (
            <div key={s.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "20px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em" }}>{s.label}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default FreelancerProfilePage;
