import React, { useState, useEffect } from "react";
import { API_BASE_URL, getAuthHeaders } from "../shared/api";

interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primarySoft: string;
}

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE" };

interface Experience {
  title: string;
  company: string;
  duration: string;
  description: string;
  tech_stack: string[];
  github_url: string;
}

interface GitHubStats {
  username: string;
  public_repos: number;
  followers: number;
  total_stars: number;
  top_languages: string[];
  profile_url: string;
}

interface ParsedGitHub {
  name: string;
  title: string;
  summary: string;
  location: string;
  website: string;
  skills: string[];
  experience: Experience[];
  score: number;
  suggestions: string[];
  github_stats: GitHubStats;
}

const ProfileSettingsPage: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const c = getColors(darkMode);

  const [githubUrl, setGithubUrl]   = useState("");
  const [bio, setBio]               = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [skills, setSkills]         = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [parsed, setParsed]         = useState<ParsedGitHub | null>(null);

  const [parsing, setParsing]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [parseError, setParseError]   = useState("");
  const [saveError, setSaveError]     = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/users/me/profile`, getAuthHeaders());
        if (res.ok) {
          const data = await res.json();
          if (data.bio)         setBio(data.bio);
          if (data.hourly_rate) setHourlyRate(String(data.hourly_rate));
          if (data.skills)      setSkills(data.skills);
        }
      } catch {}
    };
    load();
  }, []);

  const handleParse = async () => {
    if (!githubUrl.trim()) return;
    setParsing(true);
    setParseError("");
    setParsed(null);
    try {
      const res = await fetch(`${API_BASE_URL}/github/parse`, {
        method: "POST",
        headers: { ...getAuthHeaders().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ url: githubUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setParseError(err.detail || "Parse failed.");
        return;
      }
      const data: ParsedGitHub = await res.json();
      setParsed(data);
      if (data.summary) setBio(data.summary);
      if (data.skills?.length) {
        setSkills(prev => [...new Set([...prev, ...data.skills])]);
      }
    } catch {
      setParseError("Could not reach AI service.");
    } finally {
      setParsing(false);
    }
  };

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed)) setSkills(prev => [...prev, trimmed]);
    setSkillInput("");
  };

  const removeSkill = (skill: string) => setSkills(prev => prev.filter(s => s !== skill));

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      const params = new URLSearchParams();
      if (bio)        params.append("bio", bio);
      if (hourlyRate) params.append("hourly_rate", hourlyRate);

      const profileRes = await fetch(`${API_BASE_URL}/users/me/profile?${params}`, {
        method: "PUT",
        ...getAuthHeaders(),
      });
      if (!profileRes.ok) {
        const err = await profileRes.json().catch(() => ({}));
        setSaveError(err.detail || "Failed to save profile.");
        return;
      }

      if (skills.length > 0) {
        const skillsRes = await fetch(`${API_BASE_URL}/users/me/skills`, {
          method: "POST",
          headers: { ...getAuthHeaders().headers, "Content-Type": "application/json" },
          body: JSON.stringify({ skill_names: skills }),
        });
        if (!skillsRes.ok) {
          const err = await skillsRes.json().catch(() => ({}));
          setSaveError(err.detail || "Failed to save skills.");
          return;
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const input: React.CSSProperties = {
    padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${c.border}`,
    background: c.bg, color: c.text, fontSize: 13, fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif", fontSize: 13 }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <a href="/dashboard/freelancer" style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, textDecoration: "none" }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </a>
        <button
          onClick={() => setDarkMode(d => { localStorage.setItem("skilllink-darkMode", JSON.stringify(!d)); return !d; })}
          style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}
        >
          {darkMode ? "☀️" : "🌙"}
        </button>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: 28 }}>

        {/* Breadcrumb + title */}
        <div style={{ marginBottom: 24 }}>
          <a href="/dashboard/freelancer" style={{ fontSize: 12, color: c.subtext, textDecoration: "none" }}>← Back to Dashboard</a>
          <div style={{ fontSize: 20, fontWeight: 500, marginTop: 8, color: c.text }}>Profile Settings</div>
          <div style={{ fontSize: 12, color: c.subtext, marginTop: 4 }}>Import from GitHub or edit manually, then save.</div>
        </div>

        {/* ── GitHub import ── */}
        <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 12 }}>Import from GitHub</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              placeholder="https://github.com/username"
              value={githubUrl}
              onChange={e => setGithubUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleParse()}
              style={{ ...input, flex: 1 }}
            />
            <button
              onClick={handleParse}
              disabled={parsing || !githubUrl.trim()}
              style={{ padding: "9px 18px", borderRadius: 8, background: c.primary, color: "#fff", border: "none", cursor: parsing ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", opacity: parsing ? 0.7 : 1 }}
            >
              {parsing ? "Parsing…" : "Parse"}
            </button>
          </div>
          {parseError && <div style={{ marginTop: 10, fontSize: 12, color: "#ef4444" }}>{parseError}</div>}

          {/* Parsed result */}
          {parsed && (
            <div style={{ marginTop: 16, padding: 16, background: c.bg, borderRadius: 8, border: `0.5px solid ${c.border}` }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>{parsed.name}</div>
                  <div style={{ fontSize: 12, color: c.primary, marginTop: 2 }}>{parsed.title}</div>
                  {parsed.location && <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{parsed.location}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: c.primary, lineHeight: 1 }}>{parsed.score}</div>
                  <div style={{ fontSize: 10, color: c.subtext, marginTop: 2 }}>Profile score</div>
                </div>
              </div>

              {/* Stats row */}
              {parsed.github_stats && (
                <div style={{ display: "flex", gap: 18, fontSize: 11, color: c.subtext, marginBottom: 12, paddingBottom: 12, borderBottom: `0.5px solid ${c.border}` }}>
                  <span>{parsed.github_stats.public_repos} repos</span>
                  <span>{parsed.github_stats.followers} followers</span>
                  <span>⭐ {parsed.github_stats.total_stars}</span>
                  <a href={parsed.github_stats.profile_url} target="_blank" rel="noreferrer" style={{ color: c.primary, textDecoration: "none", marginLeft: "auto" }}>↗ GitHub</a>
                </div>
              )}

              {/* Suggestions */}
              {parsed.suggestions?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: c.subtext, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Suggestions</div>
                  {parsed.suggestions.map((s, i) => (
                    <div key={i} style={{ fontSize: 11, color: c.subtext, paddingLeft: 10, borderLeft: `2px solid ${c.border}`, marginBottom: 5, lineHeight: 1.5 }}>{s}</div>
                  ))}
                </div>
              )}

              {/* Projects */}
              {parsed.experience?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: c.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Projects</div>
                  {parsed.experience.map((exp, i) => (
                    <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < parsed.experience.length - 1 ? `0.5px solid ${c.border}` : "none" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{exp.title}</div>
                          <div style={{ fontSize: 11, color: c.subtext, marginTop: 1 }}>{exp.duration}</div>
                          <div style={{ fontSize: 11, color: c.subtext, marginTop: 5, lineHeight: 1.6 }}>{exp.description}</div>
                        </div>
                        {exp.github_url && (
                          <a href={exp.github_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: c.primary, textDecoration: "none", marginLeft: 12, flexShrink: 0 }}>↗ View</a>
                        )}
                      </div>
                      {exp.tech_stack?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                          {exp.tech_stack.map(t => (
                            <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: c.primarySoft, color: c.primary }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Editable profile fields ── */}
        <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 18 }}>Profile Details</div>

          {/* Bio */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, color: c.subtext, display: "block", marginBottom: 6 }}>Bio / Summary</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={5}
              style={{ ...input, width: "100%", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>

          {/* Hourly rate */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, color: c.subtext, display: "block", marginBottom: 6 }}>Hourly Rate (USD)</label>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 75"
              value={hourlyRate}
              onChange={e => setHourlyRate(e.target.value)}
              style={{ ...input, width: 160 }}
            />
          </div>

          {/* Skills */}
          <div>
            <label style={{ fontSize: 11, color: c.subtext, display: "block", marginBottom: 8 }}>Skills</label>
            {skills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {skills.map(skill => (
                  <span key={skill} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: c.primarySoft, color: c.primary, fontSize: 11 }}>
                    {skill}
                    <span onClick={() => removeSkill(skill)} style={{ cursor: "pointer", fontSize: 15, lineHeight: 1, opacity: 0.6 }}>×</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="Add a skill…"
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addSkill()}
                style={{ ...input, flex: 1 }}
              />
              <button
                onClick={addSkill}
                style={{ padding: "9px 14px", borderRadius: 8, background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "10px 26px", borderRadius: 8, background: c.primary, color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 500, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
          {saveSuccess && <span style={{ fontSize: 12, color: "#22c55e" }}>✓ Saved</span>}
          {saveError  && <span style={{ fontSize: 12, color: "#ef4444" }}>{saveError}</span>}
        </div>

      </div>
    </div>
  );
};

export default ProfileSettingsPage;
