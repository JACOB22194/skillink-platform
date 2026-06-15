import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { type ThemeColors, API_BASE_CLIENT, Skeleton, ScoreTooltip, MATCH_PALETTE, getInitials } from "./clientShared";

interface Project {
  project_id: number;
  title: string;
  status: "open" | "in_progress" | "completed";
  budget: number;
  category: string | null;
  sub_category: string | null;
  required_skills: string[];
}

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

const FindTalentView: React.FC<{ colors: ThemeColors; projects: Project[]; projLoading: boolean }> = ({ colors, projects, projLoading }) => {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [matches, setMatches]       = useState<MatchedFreelancer[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [latency, setLatency]       = useState(0);
  const [viewProfile, setViewProfile] = useState<MatchedFreelancer | null>(null);
  const [invitedIds, setInvitedIds]   = useState<Set<number>>(new Set());
  const [invitingId, setInvitingId]   = useState<number | null>(null);

  const inviteFreelancer = async (freelancerId: number) => {
    if (!selectedId || invitingId !== null) return;
    setInvitingId(freelancerId);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/proposals/invite`, {
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
      if (!selectedProject) setSelectedId(openProjects[0].project_id);
    } else {
      setSelectedId(null);
    }
  }, [projects, selectedId]);

  const runMatch = async () => {
    if (!selectedId) return;
    setLoading(true); setError(""); setMatches([]);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE_CLIENT}/projects/${selectedId}/ai-match`, {
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
            const inits = getInitials(displayName);
            const scoreDisplay = m.ai_match_score != null ? Math.round(m.ai_match_score) : Math.round(m.success_score * 20);
            return (
              <div key={m.freelancer_id} style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: pal.bg, color: pal.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0, overflow: "hidden" }}>
                    {m.avatar_url ? <img src={`${API_BASE_CLIENT}${m.avatar_url}`} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : inits}
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

      {/* Quick-view modal */}
      {viewProfile && (() => {
        const m = viewProfile;
        const pal = MATCH_PALETTE[matches.indexOf(m) % MATCH_PALETTE.length] ?? MATCH_PALETTE[0];
        const displayName = (m.first_name || m.last_name) ? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() : (m.email ? m.email.split("@")[0] : `Freelancer #${m.freelancer_id}`);
        const inits = getInitials(displayName);
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
              <div style={{ background: `linear-gradient(135deg, ${pal.bg} 0%, ${colors.primarySoft} 100%)`, padding: "24px 24px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: pal.color + "20", border: `2px solid ${pal.color}40`, color: pal.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>{inits}</div>
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
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => navigate(`/messages?user=${m.user_id}&email=${encodeURIComponent(m.email)}&name=${encodeURIComponent(displayName)}`)}
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

export default FindTalentView;
