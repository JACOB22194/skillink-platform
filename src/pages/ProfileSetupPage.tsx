import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../shared/useAuth";
import { useLanguage } from "../shared/LanguageContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExperienceItem {
  title: string;
  company: string;
  duration: string;
  description: string;
  tech_stack: string[];
  github_url: string;
}

interface GithubParseResponse {
  name: string;
  title: string;
  summary: string;
  skills: string[];
  experience: ExperienceItem[];
  score: number;
  suggestions: string[];
  github_stats: {
    username: string;
    public_repos: number;
    followers: number;
    total_stars: number;
    top_languages: string[];
  };
}

interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primarySoft: string;
  primaryBorder: string;
  inputBg: string;
  inputBorder: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? {
        bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333",
        text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD",
        primarySoft: "#2a2640", primaryBorder: "#534AB7",
        inputBg: "#262626", inputBorder: "#404040",
        errorBg: "#2a1a1a", errorBorder: "#5c2e2e", errorText: "#ff6b6b",
      }
    : {
        bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5",
        text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD",
        primarySoft: "#EEEDFE", primaryBorder: "#AFA9EC",
        inputBg: "#ffffff", inputBorder: "#dddddd",
        errorBg: "#fff0f0", errorBorder: "#f5c6c6", errorText: "#c0392b",
      };

// ─── Score Bar ────────────────────────────────────────────────────────────────

const ScoreBar: React.FC<{ score: number; c: ThemeColors }> = ({ score, c }) => {
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  const label = score >= 70 ? "Strong" : score >= 40 ? "Good" : "Needs work";
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>GitHub Score</span>
        <span style={{ fontSize: 13, fontWeight: 500, color }}>{score} / 100 · {label}</span>
      </div>
      <div style={{ height: 6, borderRadius: 20, background: c.inputBorder }}>
        <div style={{ height: "100%", width: `${score}%`, borderRadius: 20, background: color, transition: "width .4s" }} />
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ProfileSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [githubUrl, setGithubUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parsedData, setParsedData] = useState<GithubParseResponse | null>(null);
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState("50");

  const c = getColors(darkMode);

  const toggleTheme = () => {
    setDarkMode((d) => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
  });

  const handleParse = async () => {
    if (!githubUrl.trim()) {
      setError("Please enter a valid GitHub URL.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<GithubParseResponse>(
        `${API_BASE_URL}/github/parse`,
        { url: githubUrl.trim() },
        getAuthHeaders()
      );
      setParsedData(res.data);
      setBio(res.data.summary || "");
      setSkills(res.data.skills || []);
      setStep(2);
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Failed to parse GitHub profile. Make sure the URL is correct."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await axios.put(
        `${API_BASE_URL}/users/me/profile`,
        null,
        {
          ...getAuthHeaders(),
          params: { bio, hourly_rate: parseFloat(hourlyRate) || 0 },
        }
      );
      if (skills.length > 0) {
        await axios.post(
          `${API_BASE_URL}/users/me/skills`,
          { skill_names: skills },
          getAuthHeaders()
        );
      }
      navigate("/dashboard/freelancer");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save profile.");
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.role !== "freelancer") {
    return (
      <div style={{ padding: 40, textAlign: "center", color: c.subtext, fontFamily: "sans-serif" }}>
        Only freelancers can set up a profile.
      </div>
    );
  }

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6,
  };
  const inputBase: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: `0.5px solid ${c.inputBorder}`, borderRadius: 8,
    background: c.inputBg, color: c.text, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, fontFamily: "sans-serif", padding: "2rem", position: "relative" }}>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        style={{ position: "absolute", top: "2rem", right: "2rem", padding: "8px 12px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}
      >
        {darkMode ? "☀️" : "🌙"}
      </button>

      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 16, padding: "2.5rem 2rem", width: "100%", maxWidth: 560 }}>

        {/* Logo */}
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, textAlign: "center", marginBottom: "2rem" }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.text, textAlign: "center", margin: "0 0 6px" }}>
          {step === 1 ? t("setup.title") : t("setup.review")}
        </h1>
        <p style={{ fontSize: 14, color: c.subtext, textAlign: "center", marginBottom: "2rem" }}>
          {step === 1
            ? t("setup.step1of2")
            : t("setup.step2of2")}
        </p>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 8, marginBottom: "2rem" }}>
          {[1, 2].map((s) => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 20, background: s <= step ? c.primary : c.inputBorder, transition: "background .2s" }} />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.25rem" }}>
            {error}
          </div>
        )}

        {/* ── STEP 1: GitHub URL ── */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>{t("setup.github.label")}</label>
              <input
                type="text"
                placeholder="https://github.com/username"
                value={githubUrl}
                onChange={(e) => { setGithubUrl(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleParse()}
                style={inputBase}
              />
            </div>

            <button
              onClick={handleParse}
              disabled={loading}
              style={{ width: "100%", padding: 12, background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, transition: "opacity .15s" }}
            >
              {loading ? t("setup.github.analyzing") : t("setup.github.import")}
            </button>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={() => setStep(2)}
                style={{ background: "none", border: "none", color: c.subtext, fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
              >
                {t("setup.github.skip")}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Review & Save ── */}
        {step === 2 && (
          <div>
            {parsedData && (
              <>
                {/* Import banner */}
                <div style={{ background: c.primarySoft, border: `0.5px solid ${c.primaryBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: c.primary, marginBottom: "1.25rem" }}>
                  <strong>{t("setup.github.done")}</strong> We found {parsedData.skills.length} skills and generated a bio based on your top repositories.
                </div>

                <ScoreBar score={parsedData.score} c={c} />

                {/* Stats strip */}
                {parsedData.github_stats && (
                  <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem" }}>
                    {[
                      { label: t("ghrev.repos"),     value: parsedData.github_stats.public_repos },
                      { label: t("ghrev.stars"),     value: parsedData.github_stats.total_stars },
                      { label: t("ghrev.followers"), value: parsedData.github_stats.followers },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ flex: 1, background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 500, color: c.text }}>{value}</div>
                        <div style={{ fontSize: 11, color: c.subtext }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggestions */}
                {parsedData.suggestions.length > 0 && (
                  <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: "1.25rem" }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: c.subtext, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("setup.github.tips")}</div>
                    {parsedData.suggestions.map((s, i) => (
                      <div key={i} style={{ fontSize: 13, color: c.subtext, marginBottom: 4, display: "flex", gap: 6 }}>
                        <span style={{ color: c.primary }}>·</span> {s}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Bio */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>{t("setup.bio")}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={5}
                placeholder="Tell clients about your experience and what you can build..."
                style={{ ...inputBase, resize: "vertical" }}
              />
            </div>

            {/* Skills */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>{t("setup.skills")}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {skills.map((s, i) => (
                  <div key={i} style={{ background: c.primarySoft, border: `0.5px solid ${c.primaryBorder}`, padding: "4px 10px", borderRadius: 100, fontSize: 12, color: c.primary, display: "flex", alignItems: "center", gap: 6 }}>
                    {s}
                    <button
                      onClick={() => setSkills(skills.filter((_, idx) => idx !== i))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: c.primary, fontSize: 14, padding: 0, lineHeight: 1, fontFamily: "inherit" }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <input
                type="text"
                placeholder={t("set.profile.addSkill")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val && !skills.includes(val)) {
                      setSkills([...skills, val]);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
                style={inputBase}
              />
            </div>

            {/* Hourly rate */}
            <div style={{ marginBottom: "2rem" }}>
              <label style={labelStyle}>{t("setup.rate")}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, color: c.subtext }}>$</span>
                <input
                  type="number"
                  value={hourlyRate}
                  min={0}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  style={{ ...inputBase, width: 120 }}
                />
                <span style={{ fontSize: 13, color: c.subtext }}>/ hr</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep(1)}
                style={{ flex: 1, padding: 12, background: "transparent", color: c.text, border: `0.5px solid ${c.border}`, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
              >
                {t("setup.back")}
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{ flex: 2, padding: 12, background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, transition: "opacity .15s" }}
              >
                {loading ? t("setup.saving") : t("setup.save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileSetupPage;
