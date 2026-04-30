import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, getAuthHeaders } from "../shared/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primarySoft: string;
}

interface AnalysisResult {
  label: string;
  score: number;
  category: string;
  alternatives: { sub_category: string; confidence: number }[];
}

interface MatchedFreelancer {
  freelancer_id: number;
  name: string;
  professional_title: string;
  github_url: string;
  hourly_rate: number;
  github_score: number;
  match_score: number;
  matched_skills: string[];
  explanation: string;
  text_score: number;
  skill_score: number;
  quality_score: number;
  activity_score: number;
  classifier_weight: number;
  matched_on: string;
}

interface RecommendResponse {
  job_id: number | null;
  sub_category: string;
  category: string;
  matches: MatchedFreelancer[];
  latency_ms: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPINNER = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
  </svg>
);

const MATCH_COLORS = [
  { bg: "#2a2640", color: "#7F77DD" },
  { bg: "rgba(34,197,94,.12)", color: "#22c55e" },
  { bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
  { bg: "rgba(245,158,11,.1)", color: "#f59e0b" },
  { bg: "rgba(239,68,68,.1)", color: "#ef4444" },
  { bg: "rgba(168,85,247,.12)", color: "#a855f7" },
];

// ─── Helper Functions ─────────────────────────────────────────────────────────

const getColors = (darkMode: boolean): ThemeColors => {
  if (darkMode) {
    return {
      bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333",
      text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640",
    };
  } else {
    return {
      bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5",
      text: "#1a1a1a", subtext: "#666666", primary: "#7F77DD", primarySoft: "#EEEDFE",
    };
  }
};

const getInitials = (name: string): string => {
  const parts = name.split(/[@.\s]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const PostProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const colors = getColors(darkMode);

  // Workflow states
  const [step, setStep] = useState<"input" | "matching">("input");
  
  // Data state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [extraLabels, setExtraLabels] = useState<string[]>([]);
  const [removedPrimaryLabel, setRemovedPrimaryLabel] = useState(false);

  // Matching state
  const [matches, setMatches] = useState<MatchedFreelancer[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [matchLatency, setMatchLatency] = useState(0);

  useEffect(() => {
    localStorage.setItem("skilllink-darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    e.target.style.borderColor = colors.primary;
  };
  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    e.target.style.borderColor = colors.border;
  };

  // Real-time classification
  useEffect(() => {
    if (description.trim().length < 10) {
      setAnalysisResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("http://localhost:8001/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            top_k: 5
          })
        });

        const data = await res.json();
        if (data.sub_category) {
          setAnalysisResult({
            label: data.sub_category,
            score: (data.confidence || 0) / 100,
            category: data.category || "General",
            alternatives: data.top_alternatives || []
          });
        }
      } catch (err) {
        console.error("AI Service Error:", err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [title, description]);

  // Fetch matches when entering step 2
  const goToMatching = async () => {
    if (!description.trim() || !title.trim()) return;
    setStep("matching");
    setMatchLoading(true);
    setMatchError("");
    setMatches([]);

    try {
      const res = await fetch(`${API_BASE_URL}/recommend/preview`, {
        method: "POST",
        headers: { ...getAuthHeaders().headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          budget_min: 0,
          budget_max: 0,
          top_k: 10,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        let msg = "Failed to save project";
        if (typeof errorData.detail === "string") {
          msg = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          msg = errorData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ");
        } else if (errorData.message) {
          msg = errorData.message;
        }
        throw new Error(msg);
      }
      if (false) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setMatchError("Session conflict: you appear to be logged in as a freelancer in another tab. Please sign out and log back in as a client.");
        } else {
          setMatchError(err.detail || "Failed to get recommendations.");
        }
        return;
      }

      const data: RecommendResponse = await res.json();
      setMatches(data.matches || []);
      setMatchLatency(data.latency_ms || 0);
    } catch {
      setMatchError("Could not reach the recommendation service.");
    } finally {
      setMatchLoading(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const finish = async () => {
    setIsSaving(true);
    setErrorMsg("");
    
    try {
      const token = localStorage.getItem("access_token");
      if (!token) throw new Error("Auth token missing! Please login again.");
      
      const res = await fetch(`${API_BASE_URL}/projects`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          budget: 0,
          required_skills: (analysisResult?.label && !removedPrimaryLabel) ? [analysisResult.label, ...extraLabels] : extraLabels,
          sub_category: removedPrimaryLabel ? null : (analysisResult?.label || null),
          category: removedPrimaryLabel ? null : (analysisResult?.category || null),
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        let msg = "Failed to save project";
        if (typeof errorData.detail === "string") {
          msg = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          msg = errorData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ");
        } else if (errorData.message) {
          msg = errorData.message;
        }
        throw new Error(msg);
      }
      
      navigate("/dashboard/client");
    } catch (err: any) {
      setErrorMsg(err.message || "Network Error");
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "1rem",
    fontSize: 15,
    background: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.text, fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
      {/* ── Navbar ── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 2rem", borderBottom: `0.5px solid ${colors.border}`, background: colors.surface }}>
        <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.3px", cursor: "pointer" }} onClick={() => navigate("/dashboard/client")}>
          Skill<span style={{ color: colors.primary }}>Link</span>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <button
            style={{ background: "transparent", border: `0.5px solid ${colors.border}`, color: colors.text, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 16 }}
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button
            style={{ background: "transparent", border: "none", color: colors.subtext, cursor: "pointer", fontSize: 14 }}
            onClick={() => navigate("/dashboard/client")}
          >
            Cancel
          </button>
        </div>
      </nav>

      {/* ── Main Content Container ── */}
      <main style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: step === "matching" ? "flex-start" : "center", padding: "2rem", overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: step === "matching" ? 860 : 680, background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 16, padding: "3rem", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>

          {/* STEP 1: Description Input */}
          {step === "input" && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>
              <div style={{ display: "inline-block", fontSize: 12, padding: "4px 12px", borderRadius: 100, marginBottom: "1.5rem", background: colors.primarySoft, color: colors.primary }}>
                Step 1 of 2
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-1px", marginBottom: "1rem" }}>
                What are you looking to <em style={{ fontStyle: "normal", color: colors.primary }}>build</em>?
              </h1>
              <p style={{ fontSize: 15, color: colors.subtext, marginBottom: "2rem", lineHeight: 1.6 }}>
                Give your project a title, describe what you need.
              </p>

              <input
                type="text"
                placeholder="Project Title (e.g. Build a Fintech Dashboard)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={{ ...inputStyle, marginBottom: "1rem" }}
              />

              <textarea
                placeholder="Describe your project requirements in detail..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onFocus={handleFocus as any}
                onBlur={handleBlur as any}
                style={{
                  ...inputStyle,
                  height: 180,
                  padding: "1.25rem",
                  resize: "vertical",
                  lineHeight: 1.6,
                  marginBottom: "1.5rem",
                }}
              />

              {/* Real-time AI prediction badges + extras */}
              {analysisResult && (
                <div style={{ animation: "fadeIn 0.3s ease", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    {/* Primary predictions */}
                    {!removedPrimaryLabel && (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: colors.primarySoft, padding: "8px 16px", borderRadius: 100,
                        border: `1px solid ${colors.primary}30`,
                      }}>
                        <span style={{ fontSize: 13, color: colors.primary, fontWeight: 500 }}>
                          {analysisResult.label}
                        </span>
                        <span
                          onClick={() => setRemovedPrimaryLabel(true)}
                          style={{ fontSize: 14, color: colors.subtext, cursor: "pointer", lineHeight: 1, marginLeft: 2 }}
                        >×</span>
                      </div>
                    )}
                    <div style={{
                      display: "inline-flex", alignItems: "center",
                      background: colors.primarySoft, padding: "8px 16px", borderRadius: 100,
                      border: `1px solid ${colors.primary}30`,
                    }}>
                      <span style={{ fontSize: 13, color: colors.primary, fontWeight: 500 }}>
                        {analysisResult.category}
                      </span>
                    </div>
                    {/* Extra labels added from alternatives */}
                    {extraLabels.map((lbl, i) => (
                      <div key={`extra-${i}`} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: colors.primarySoft, padding: "8px 16px", borderRadius: 100,
                        border: `1px solid ${colors.primary}30`,
                      }}>
                        <span style={{ fontSize: 13, color: colors.primary, fontWeight: 500 }}>{lbl}</span>
                        <span
                          onClick={() => setExtraLabels(extraLabels.filter((_, j) => j !== i))}
                          style={{ fontSize: 14, color: colors.subtext, cursor: "pointer", lineHeight: 1, marginLeft: 2 }}
                        >×</span>
                      </div>
                    ))}
                  </div>

                  {/* Alternative predictions — clickable to ADD */}
                  {analysisResult.alternatives && analysisResult.alternatives.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, color: colors.subtext, marginBottom: "0.5rem" }}>Alternatives — click to add</div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {removedPrimaryLabel && !extraLabels.includes(analysisResult.label) && (
                          <button
                            onClick={() => setExtraLabels([...extraLabels, analysisResult.label])}
                            style={{
                              border: `1px solid ${colors.border}`,
                              display: "inline-flex", alignItems: "center",
                              padding: "6px 14px", borderRadius: 100, fontSize: 12,
                              background: colors.bg, color: colors.subtext,
                              cursor: "pointer", fontWeight: 500,
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.color = colors.primary; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.subtext; }}
                          >
                            + {analysisResult.label}
                          </button>
                        )}
                        {analysisResult.alternatives
                          .filter(alt => alt.sub_category !== analysisResult.label && !extraLabels.includes(alt.sub_category))
                          .map((alt, i) => (
                          <button
                            key={i}
                            onClick={() => setExtraLabels([...extraLabels, alt.sub_category])}
                            style={{
                              border: `1px solid ${colors.border}`,
                              display: "inline-flex", alignItems: "center",
                              padding: "6px 14px", borderRadius: 100, fontSize: 12,
                              background: colors.bg, color: colors.subtext,
                              cursor: "pointer", fontWeight: 500,
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.color = colors.primary; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.subtext; }}
                          >
                            + {alt.sub_category}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                <button
                  onClick={goToMatching}
                  disabled={!description.trim() || !title.trim()}
                  style={{
                    background: (description.trim() && title.trim()) ? colors.primary : colors.border,
                    color: "#fff",
                    border: "none",
                    padding: "12px 28px",
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: (description.trim() && title.trim()) ? "pointer" : "not-allowed",
                    transition: "opacity 0.2s",
                  }}
                >
                  Next — Find Matches
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: AI-Matched Freelancers */}
          {step === "matching" && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.5rem" }}>
                <button
                  onClick={() => setStep("input")}
                  style={{ background: "transparent", border: `0.5px solid ${colors.border}`, color: colors.subtext, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}
                >
                  ← Back
                </button>
                <div style={{ display: "inline-block", fontSize: 12, padding: "4px 12px", borderRadius: 100, background: colors.primarySoft, color: colors.primary }}>
                  Step 2 of 2
                </div>
              </div>

              <h1 style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-1px", marginBottom: "0.5rem" }}>
                Top matched <em style={{ fontStyle: "normal", color: colors.primary }}>freelancers</em>
              </h1>
              <p style={{ fontSize: 15, color: colors.subtext, marginBottom: "2rem", lineHeight: 1.6 }}>
                {matchLoading
                  ? "Running AI matching engine..."
                  : matches.length > 0
                    ? <>Found <strong style={{ color: colors.text }}>{matches.length}</strong> matches for "{analysisResult?.label || title}" in <strong style={{ color: colors.primary }}>{matchLatency.toFixed(0)}ms</strong></>
                    : "We ran your project through our matching engine."}
              </p>

              {/* Loading state */}
              {matchLoading && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "3rem 0", gap: 16 }}>
                  <div style={{ color: colors.primary }}>{SPINNER}</div>
                  <div style={{ fontSize: 14, color: colors.subtext }}>Scoring freelancer profiles against your project...</div>
                  <div style={{ fontSize: 12, color: colors.subtext, opacity: 0.6 }}>TF-IDF similarity · skill overlap · GitHub quality · activity</div>
                </div>
              )}

              {/* Error state */}
              {matchError && (
                <div style={{ background: "rgba(239,68,68,.08)", color: "#ef4444", padding: "16px 20px", borderRadius: 12, fontSize: 14, marginBottom: "1.5rem", border: "1px solid rgba(239,68,68,.15)" }}>
                  ⚠ {matchError}
                </div>
              )}

              {/* Empty state */}
              {!matchLoading && !matchError && matches.length === 0 && (
                <div style={{ textAlign: "center", padding: "3rem 0", color: colors.subtext }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: colors.text, marginBottom: 6 }}>No matches yet</div>
                  <div style={{ fontSize: 13, maxWidth: 360, margin: "0 auto", lineHeight: 1.6 }}>
                    No freelancers have connected their GitHub profiles yet. Matches will appear once freelancers set up their profiles.
                  </div>
                </div>
              )}

              {/* Match results */}
              {!matchLoading && matches.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "2.5rem" }}>
                  {matches.map((f, i) => {
                    const palette = MATCH_COLORS[i % MATCH_COLORS.length];
                    const initials = getInitials(f.name);
                    const scorePct = Math.round(f.match_score * 100);

                    return (
                      <div key={f.freelancer_id} style={{
                        display: "flex", alignItems: "flex-start", padding: "1.25rem",
                        border: `0.5px solid ${i === 0 ? colors.primary + "40" : colors.border}`,
                        borderRadius: 14, background: i === 0 ? colors.primarySoft + "30" : colors.bg,
                        transition: "border-color 0.2s",
                      }}>
                        {/* Avatar */}
                        <div style={{
                          width: 48, height: 48, borderRadius: "50%", background: palette.bg,
                          color: palette.color, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, fontWeight: 600, flexShrink: 0, marginRight: "1rem",
                        }}>
                          {initials}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>{f.name}</span>
                            {i === 0 && (
                              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: colors.primary, color: "#fff", fontWeight: 600 }}>BEST MATCH</span>
                            )}
                            {f.classifier_weight < 0.3 && f.matched_on && (
                              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "rgba(168, 85, 247, 0.1)", color: colors.primary, fontWeight: 500, marginLeft: i === 0 ? 0 : 8 }}>
                                via {f.matched_on}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: colors.subtext, marginBottom: 6 }}>
                            {f.professional_title || "Freelancer"}
                            {f.hourly_rate > 0 && <> · <span style={{ color: colors.text, fontWeight: 500 }}>${f.hourly_rate}/hr</span></>}
                            {f.github_url && (
                              <> · <a href={f.github_url} target="_blank" rel="noreferrer" style={{ color: colors.primary, textDecoration: "none" }}>GitHub ↗</a></>
                            )}
                          </div>

                          {/* Explanation */}
                          <div style={{ fontSize: 12, color: colors.subtext, lineHeight: 1.5, marginBottom: 8, opacity: 0.85 }}>
                            {f.explanation}
                          </div>

                          {/* Matched skills */}
                          {f.matched_skills.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {f.matched_skills.map(skill => (
                                <span key={skill} style={{
                                  fontSize: 10, padding: "2px 9px", borderRadius: 20,
                                  background: colors.primarySoft, color: colors.primary, fontWeight: 500,
                                }}>
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Score */}
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                          <div style={{ fontSize: 24, fontWeight: 600, color: scorePct >= 50 ? colors.primary : colors.subtext, lineHeight: 1 }}>
                            {scorePct}%
                          </div>
                          <div style={{ fontSize: 10, color: colors.subtext, marginTop: 4 }}>match</div>

                          {/* Score breakdown */}
                          <div style={{ marginTop: 8, fontSize: 10, color: colors.subtext, textAlign: "right", lineHeight: 1.8 }}>
                            <div>Text {Math.round(f.text_score * 100)}%</div>
                            <div>Skill {Math.round(f.skill_score * 100)}%</div>
                            <div>Quality {Math.round(f.quality_score * 100)}%</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {errorMsg && (
                <div style={{ background: "rgba(239,68,68,.1)", color: "#ef4444", padding: "12px 16px", borderRadius: 8, fontSize: 14, marginBottom: "1.5rem", border: "1px solid rgba(239,68,68,.2)" }}>
                  ❌ {errorMsg}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={finish}
                  disabled={isSaving}
                  style={{ background: isSaving ? colors.border : colors.primary, color: "#fff", border: "none", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.7 : 1 }}
                >
                  {isSaving ? "Saving to Database..." : "Save & Post to Marketplace"}
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}
      </style>
    </div>
  );
};

export default PostProjectPage;