import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

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

interface FreelancerMatch {
  initials: string;
  name: string;
  role: string;
  matchScore: number;
  bg: string;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPINNER = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
  </svg>
);

const MOCK_FREELANCERS: FreelancerMatch[] = [
  { initials: "HJ", name: "Hugh Jordan", role: "Specialist", matchScore: 98, bg: "#2a2640", color: "#7F77DD" },
  { initials: "LM", name: "Lena Müller", role: "Expert", matchScore: 94, bg: "rgba(34,197,94,.12)", color: "#22c55e" },
  { initials: "KO", name: "Kwame Osei", role: "Developer", matchScore: 89, bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
];

// ─── Helper Functions ─────────────────────────────────────────────────────────

const getColors = (darkMode: boolean): ThemeColors => {
  if (darkMode) {
    return {
      bg: "#0f0f0f",
      surface: "#1a1a1a",
      border: "#333333",
      text: "#ffffff",
      subtext: "#b0b0b0",
      primary: "#7F77DD",
      primarySoft: "#2a2640",
    };
  } else {
    return {
      bg: "#f9f9f9",
      surface: "#ffffff",
      border: "#e5e5e5",
      text: "#1a1a1a",
      subtext: "#666666",
      primary: "#7F77DD",
      primarySoft: "#EEEDFE",
    };
  }
};

const PostProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  const colors = getColors(darkMode);

  // Workflow states
  const [step, setStep] = useState<"input" | "pricing" | "matching">("input");
  const [description, setDescription] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    localStorage.setItem("skilllink-darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    e.target.style.borderColor = colors.primary;
  };
  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    e.target.style.borderColor = colors.border;
  };

  // Real-time classification effect
  useEffect(() => {
    if (description.trim().length < 15) {
      setAnalysisResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("http://localhost:8001/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            title: "", 
            description: description,
            top_k: 1
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
    }, 300); // 300ms debounce prevents spam

    return () => clearTimeout(timer);
  }, [description]);

  const goToPricing = () => {
    if (!description.trim()) return;
    setStep("pricing");
  };

  const proceedToMatching = () => {
    setStep("matching");
  };

  const finish = () => {
    navigate("/dashboard/client");
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
      <main style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "2rem" }}>
        <div style={{ width: "100%", maxWidth: 680, background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 16, padding: "3rem", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
          
          {/* STEP 1: Description Input */}
          {step === "input" && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>
              <div style={{ display: "inline-block", fontSize: 12, padding: "4px 12px", borderRadius: 100, marginBottom: "1.5rem", background: colors.primarySoft, color: colors.primary }}>
                Step 1 of 3
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-1px", marginBottom: "1rem" }}>
                What are you looking to <em style={{ fontStyle: "normal", color: colors.primary }}>build</em>?
              </h1>
              <p style={{ fontSize: 15, color: colors.subtext, marginBottom: "2rem", lineHeight: 1.6 }}>
                Describe your project, the features you need, and any technical requirements. Our AI will automatically categorize it and find the perfect talent.
              </p>

              <textarea 
                placeholder="e.g. I need a modern React application with a dark mode, Stripe integration, and..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={{
                  width: "100%",
                  height: 180,
                  padding: "1.25rem",
                  fontSize: 15,
                  background: colors.bg,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "inherit",
                  lineHeight: 1.6,
                  transition: "border-color 0.2s",
                  marginBottom: "1.5rem",
                  boxSizing: "border-box"
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, visibility: analysisResult ? "visible" : "hidden", animation: "fadeIn 0.3s ease" }}>
                  <span style={{ fontSize: 13, color: colors.subtext }}>Predicted Category:</span>
                  <span style={{ background: colors.primarySoft, color: colors.primary, padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                    {analysisResult?.category} &rarr; {analysisResult?.label} ({analysisResult ? (analysisResult.score * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <button 
                  onClick={goToPricing}
                  disabled={!description.trim()}
                  style={{
                    background: description.trim() ? colors.primary : colors.border,
                    color: "#fff",
                    border: "none",
                    padding: "12px 28px",
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: description.trim() ? "pointer" : "not-allowed",
                    transition: "opacity 0.2s",
                  }}
                >
                  Next Step
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Classification & Pricing */}
          {step === "pricing" && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>
              <div style={{ display: "inline-block", fontSize: 12, padding: "4px 12px", borderRadius: 100, marginBottom: "1.5rem", background: colors.primarySoft, color: colors.primary }}>
                Step 2 of 3
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-1px", marginBottom: "1rem" }}>
                AI Analysis <em style={{ fontStyle: "normal", color: colors.primary }}>Complete</em>
              </h1>
              <p style={{ fontSize: 15, color: colors.subtext, marginBottom: "2.5rem", lineHeight: 1.6 }}>
                Based on your description, we have automatically tagged your project and generated a dynamic fair-price estimate.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                <div style={{ background: colors.bg, padding: "1.5rem", borderRadius: 12, border: `0.5px solid ${colors.border}` }}>
                   <div style={{ fontSize: 12, color: colors.subtext, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "0.5rem" }}>Parent Category</div>
                   <div style={{ fontSize: 20, fontWeight: 500, color: colors.text }}>{analysisResult?.category || "Loading..."}</div>
                </div>
                <div style={{ background: colors.bg, padding: "1.5rem", borderRadius: 12, border: `0.5px solid ${colors.border}` }}>
                   <div style={{ fontSize: 12, color: colors.subtext, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "0.5rem" }}>Predicted Skill</div>
                   <div style={{ fontSize: 20, fontWeight: 500, color: colors.text }}>{analysisResult?.label || "Loading..."}</div>
                   <div style={{ fontSize: 12, color: colors.primary, marginTop: "0.5rem" }}>Confidence: {analysisResult ? (analysisResult.score * 100).toFixed(1) : 0}%</div>
                </div>
              </div>

              {analysisResult?.alternatives && analysisResult.alternatives.length > 0 && (
                <div style={{ marginBottom: "2.5rem" }}>
                  <div style={{ fontSize: 13, color: colors.subtext, marginBottom: "0.75rem", fontWeight: 500 }}>Alternative Predictions</div>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    {analysisResult.alternatives.map((alt, i) => (
                      <div key={i} style={{ border: `1px solid ${colors.border}`, display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 100, fontSize: 13, background: colors.bg, color: colors.text }}>
                        {alt.sub_category} <span style={{ color: colors.subtext, marginLeft: 6 }}>{alt.confidence.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button 
                  onClick={() => setStep("input")}
                  style={{ background: "transparent", color: colors.subtext, border: "none", padding: "12px", cursor: "pointer", fontSize: 15 }}
                >
                  Edit description
                </button>
                <button 
                  onClick={proceedToMatching}
                  style={{ background: colors.primary, color: "#fff", border: "none", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer" }}
                >
                  Find Talent
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Matching Freelancers */}
          {step === "matching" && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>
               <div style={{ display: "inline-block", fontSize: 12, padding: "4px 12px", borderRadius: 100, marginBottom: "1.5rem", background: colors.primarySoft, color: colors.primary }}>
                Step 3 of 3
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-1px", marginBottom: "1rem" }}>
                Top matched <em style={{ fontStyle: "normal", color: colors.primary }}>freelancers</em>
              </h1>
              <p style={{ fontSize: 15, color: colors.subtext, marginBottom: "2rem", lineHeight: 1.6 }}>
                We ran your project through our matching engine. Here are the best fits for "{analysisResult?.label || "your project"}".
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2.5rem" }}>
                {MOCK_FREELANCERS.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", padding: "1rem", border: `0.5px solid ${colors.border}`, borderRadius: 12, background: colors.bg }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: f.bg, color: f.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 500, flexShrink: 0, marginRight: "1rem" }}>
                      {f.initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 500, color: colors.text }}>{f.name}</div>
                      <div style={{ fontSize: 13, color: colors.subtext, marginTop: "0.25rem" }}>{analysisResult?.label || f.role} · Verified</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 500, color: colors.primary }}>{f.matchScore}% filter</div>
                      <button style={{ marginTop: "0.5rem", background: "transparent", color: colors.text, border: `0.5px solid ${colors.border}`, padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Invite</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button 
                  onClick={finish}
                  style={{ background: colors.primary, color: "#fff", border: "none", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer" }}
                >
                  Save & Go to Dashboard
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
        `}
      </style>
    </div>
  );
};

export default PostProjectPage;
