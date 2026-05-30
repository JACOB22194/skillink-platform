import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, getAuthHeaders } from "../../shared/api";

interface ThemeColors {
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string;
}

interface MatchedProject {
  project_id:     number;
  title:          string;
  description:    string;
  budget:         number;
  contract_type:  string;
  match_score:    number;
  matched_skills: string[];
  text_score:     number;
  skill_score:    number;
  quality_score:  number;
}

type DifficultyFilter = "all" | "beginner" | "intermediate" | "expert";
type ContractFilter   = "all" | "fixed" | "hourly";

const MATCH_PALETTE = [
  { bg: "#2a2640", color: "#7F77DD" },
  { bg: "rgba(34,197,94,.12)", color: "#22c55e" },
  { bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
  { bg: "rgba(245,158,11,.1)", color: "#f59e0b" },
  { bg: "rgba(239,68,68,.1)", color: "#ef4444" },
];

const DIFFICULTY_RANGES: Record<DifficultyFilter, [number, number]> = {
  all:          [0,    Infinity],
  beginner:     [0,    500],
  intermediate: [500,  2000],
  expert:       [2000, Infinity],
};

const ProjectMatchView: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const navigate = useNavigate();
  const [allMatches, setAllMatches] = useState<MatchedProject[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [latency, setLatency]       = useState(0);
  const [ran, setRan]               = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [minBudget,    setMinBudget]    = useState("");
  const [maxBudget,    setMaxBudget]    = useState("");
  const [difficulty,   setDifficulty]   = useState<DifficultyFilter>("all");
  const [contractType, setContractType] = useState<ContractFilter>("all");

  const fetchMatches = async (minB?: string, maxB?: string, ct?: ContractFilter) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ top_k: "20" });
      if (minB && !isNaN(Number(minB))) params.set("min_budget", minB);
      if (maxB && !isNaN(Number(maxB))) params.set("max_budget", maxB);
      if (ct && ct !== "all") params.set("contract_type", ct);

      const res = await fetch(`${API_BASE_URL}/recommend/my-matches?${params}`, getAuthHeaders());
      if (res.ok) {
        const data = await res.json();
        setAllMatches(data.matches || []);
        setLatency(data.latency_ms || 0);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Failed to load matches.");
      }
    } catch {
      setError("Could not reach the recommendation service.");
    } finally {
      setLoading(false);
      setRan(true);
    }
  };

  useEffect(() => { fetchMatches(); }, []);

  const applyFilters = () => fetchMatches(minBudget, maxBudget, contractType);

  const resetFilters = () => {
    setMinBudget(""); setMaxBudget("");
    setDifficulty("all"); setContractType("all");
    fetchMatches();
  };

  const [diffMin, diffMax] = DIFFICULTY_RANGES[difficulty as DifficultyFilter];
  const matches = allMatches.filter((p: MatchedProject) => p.budget >= diffMin && p.budget <= diffMax);

  const pillStyle = (active: boolean) => ({
    fontSize: 11, padding: "4px 12px", borderRadius: 20, cursor: "pointer" as const,
    border: `0.5px solid ${active ? c.primary : c.border}`,
    background: active ? c.primarySoft : "transparent",
    color: active ? c.primary : c.subtext,
    fontFamily: "inherit",
  });

  const inputStyle: React.CSSProperties = {
    width: 90, padding: "5px 8px", borderRadius: 8, fontSize: 11,
    background: c.surface, border: `0.5px solid ${c.border}`,
    color: c.text, fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>AI Matches</div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Open projects matched to your profile by TF-IDF · skill overlap · GitHub quality.</div>
      </div>

      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: c.subtext, width: 56 }}>Budget</span>
          <input type="number" placeholder="Min $" value={minBudget} onChange={e => setMinBudget(e.target.value)} style={inputStyle} aria-label="Minimum budget filter" />
          <span style={{ fontSize: 11, color: c.subtext }}>–</span>
          <input type="number" placeholder="Max $" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} style={inputStyle} aria-label="Maximum budget filter" />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: c.subtext, width: 56 }}>Difficulty</span>
          {(["all", "beginner", "intermediate", "expert"] as DifficultyFilter[]).map(d => (
            <button key={d} style={pillStyle(difficulty === d)} onClick={() => setDifficulty(d)}>
              {d === "all" ? "All" : d === "beginner" ? "Beginner (<$500)" : d === "intermediate" ? "Intermediate ($500–$2k)" : "Expert (>$2k)"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: c.subtext, width: 56 }}>Duration</span>
          {(["all", "fixed", "hourly"] as ContractFilter[]).map(ct => (
            <button key={ct} style={pillStyle(contractType === ct)} onClick={() => setContractType(ct)}>
              {ct === "all" ? "Any" : ct === "fixed" ? "Short-term · Fixed" : "Long-term · Hourly"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={resetFilters} style={{ ...pillStyle(false), padding: "5px 14px" }}>Reset</button>
          <button onClick={applyFilters} style={{ fontSize: 11, padding: "5px 16px", borderRadius: 20, background: c.primary, color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>Apply Filters</button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: c.subtext }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Loading your matches...</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Querying cached recommendations</div>
        </div>
      )}

      {!loading && error && (
        <div style={{ background: "rgba(239,68,68,.08)", color: "#ef4444", padding: "12px 16px", borderRadius: 10, fontSize: 13, border: "1px solid rgba(239,68,68,.15)" }}>⚠ {error}</div>
      )}

      {!loading && !error && ran && matches.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: c.subtext }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: c.text, marginBottom: 8 }}>No matches found</div>
          <div style={{ fontSize: 13, maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>
            {allMatches.length > 0
              ? "No projects match the active filters. Try adjusting or resetting them."
              : "Matches appear here once clients run AI scoring. Keep your profile and GitHub up to date."}
          </div>
        </div>
      )}

      {!loading && matches.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: c.subtext, marginBottom: 12 }}>
            Showing <strong style={{ color: c.text }}>{matches.length}</strong> of {allMatches.length} match{allMatches.length !== 1 ? "es" : ""} · <strong style={{ color: c.primary }}>{latency.toFixed(0)}ms</strong>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {matches.map((p, i) => {
              const pal = MATCH_PALETTE[i % MATCH_PALETTE.length];
              const pct = Math.round(p.match_score * 100);
              return (
                <div key={p.project_id} style={{ display: "flex", alignItems: "flex-start", padding: 16, border: `0.5px solid ${i === 0 ? c.primary + "40" : c.border}`, borderRadius: 12, background: i === 0 ? c.primarySoft + "20" : c.surface }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: pal.bg, color: pal.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, marginRight: 14 }}>📋</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{p.title}</span>
                      {i === 0 && <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 20, background: c.primary, color: "#fff", fontWeight: 600 }}>BEST FIT</span>}
                    </div>
                    <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5, display: "flex", gap: 10 }}>
                      <span>Budget: <strong style={{ color: c.text }}>${p.budget.toLocaleString()}</strong></span>
                      <span style={{ textTransform: "capitalize", color: c.subtext }}>{p.contract_type}</span>
                    </div>
                    {expandedId === p.project_id ? (
                      <>
                        <div style={{ fontSize: 11, color: c.subtext, lineHeight: 1.5, marginBottom: 10 }}>{p.description}</div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Score Breakdown</div>
                          {[
                            { label: "Text Relevance", val: p.text_score },
                            { label: "Skill Match",    val: p.skill_score },
                            { label: "GitHub Quality", val: p.quality_score },
                          ].map(({ label, val }) => (
                            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                              <div style={{ fontSize: 10, color: c.subtext, width: 100, flexShrink: 0 }}>{label}</div>
                              <div style={{ flex: 1, height: 4, background: c.border, borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${Math.round(val * 100)}%`, height: "100%", background: c.primary, borderRadius: 4 }} />
                              </div>
                              <div style={{ fontSize: 10, color: c.primary, width: 28, textAlign: "right" }}>{Math.round(val * 100)}%</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: c.subtext, lineHeight: 1.5, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{p.description}</div>
                    )}
                    {p.matched_skills.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                        {p.matched_skills.map(s => (
                          <span key={s} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: c.primarySoft, color: c.primary, fontWeight: 500 }}>{s}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                      <button onClick={() => navigate(`/proposals?apply=${p.project_id}`)} style={{ fontSize: 11, padding: "5px 14px", borderRadius: 8, background: c.primary, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Apply →</button>
                      <button onClick={() => setExpandedId(expandedId === p.project_id ? null : p.project_id)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, background: "transparent", color: c.subtext, border: `0.5px solid ${c.border}`, cursor: "pointer", fontFamily: "inherit" }}>{expandedId === p.project_id ? "Show less" : "View details"}</button>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: pct >= 50 ? c.primary : c.subtext, lineHeight: 1 }}>{pct}%</div>
                    <div style={{ fontSize: 9, color: c.subtext, marginTop: 3 }}>match</div>
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

export default ProjectMatchView;
