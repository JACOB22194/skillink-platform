import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGitHubParse, useProfileMutation } from "../api/hooks";
import type { GitHubExperience, GitHubParseResult } from "../api/types";

// ─── Theme ────────────────────────────────────────────────────────────────────

interface C {
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string; primaryBorder: string;
  inputBg: string; inputBorder: string; errorBg: string; errorBorder: string; errorText: string;
  successBg: string; successBorder: string; successText: string;
}

const getColors = (dark: boolean): C =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640", primaryBorder: "#534AB7", inputBg: "#262626", inputBorder: "#404040", errorBg: "#2a1a1a", errorBorder: "#5c2e2e", errorText: "#ff6b6b", successBg: "#0d2112", successBorder: "#1a4d2e", successText: "#4ade80" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE", primaryBorder: "#AFA9EC", inputBg: "#ffffff", inputBorder: "#dddddd", errorBg: "#fff0f0", errorBorder: "#f5c6c6", errorText: "#c0392b", successBg: "#f0fff4", successBorder: "#bbf7d0", successText: "#15803d" };

// ─── Small helpers ────────────────────────────────────────────────────────────


const SectionLabel: React.FC<{ children: React.ReactNode; c: C }> = ({ children, c }) => (
  <div style={{ fontSize: 11, fontWeight: 600, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>
    {children}
  </div>
);

const Chip: React.FC<{ label: string; c: C; onRemove?: () => void }> = ({ label, c, onRemove }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, padding: "5px 12px", borderRadius: 100, background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primaryBorder}`, lineHeight: 1 }}>
    {label}
    {onRemove && (
      <button onClick={onRemove} aria-label="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: c.primary, fontSize: 15, padding: 0, lineHeight: 1, marginLeft: 2, fontFamily: "inherit" }}>×</button>
    )}
  </span>
);

const ScorePill: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  const bg    = score >= 70 ? "rgba(34,197,94,.12)" : score >= 40 ? "rgba(245,158,11,.1)" : "rgba(239,68,68,.1)";
  const label = score >= 70 ? "Strong" : score >= 40 ? "Good" : "Needs work";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "5px 12px", borderRadius: 100, background: bg, color, border: `0.5px solid ${color}30` }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      GitHub Score: {score}/100 · {label}
    </span>
  );
};

// ─── Avatar component ─────────────────────────────────────────────────────────

const Avatar: React.FC<{ src: string; name: string; size: number; c: C }> = ({ src, name, size, c }) => {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setImgError(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `3px solid ${c.surface}`, display: "block" }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: c.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 600, border: `3px solid ${c.surface}` }}>
      {initials || "?"}
    </div>
  );
};

// ─── Language Bar ─────────────────────────────────────────────────────────────

const LanguageBar: React.FC<{ lang: string; pct: number; c: C; index: number }> = ({ lang, pct, c, index }) => {
  const colors = ["#7F77DD", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a78bfa", "#ec4899", "#06b6d4"];
  const barColor = colors[index % colors.length];
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: c.text, marginBottom: 4 }}>
        <span style={{ fontWeight: 500 }}>{lang}</span>
        <span style={{ color: c.subtext, fontSize: 11 }}>#{index + 1}</span>
      </div>
      <div style={{ height: 5, borderRadius: 10, background: c.inputBorder }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 10, background: barColor, transition: "width .5s ease" }} />
      </div>
    </div>
  );
};

// ─── Project Card ─────────────────────────────────────────────────────────────

const ProjectCard: React.FC<{ exp: GitHubExperience; index: number; c: C }> = ({ exp, index, c }) => {
  const accent = ["#7F77DD", "#3b82f6", "#22c55e", "#f59e0b", "#a78bfa"][index % 5];
  return (
    <div style={{ border: `0.5px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 12, background: c.bg }}>
      {/* Card header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderBottom: `0.5px solid ${c.border}` }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accent}20`, border: `0.5px solid ${accent}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: c.text }}>{exp.title.replace(/^Lead Developer — |^Developer — /i, "")}</div>
            {exp.github_url && (
              <a href={exp.github_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: c.subtext, textDecoration: "none", flexShrink: 0, padding: "3px 8px", borderRadius: 6, border: `0.5px solid ${c.border}` }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = c.primary; (e.currentTarget as HTMLElement).style.borderColor = c.primaryBorder; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = c.subtext; (e.currentTarget as HTMLElement).style.borderColor = c.border; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                View
              </a>
            )}
          </div>
          <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>{exp.company} · {exp.duration}</div>
        </div>
      </div>
      {/* Card body */}
      <div style={{ padding: "12px 16px" }}>
        <p style={{ fontSize: 13, color: c.subtext, lineHeight: 1.65, margin: "0 0 10px" }}>{exp.description}</p>
        {exp.tech_stack?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {exp.tech_stack.map((t) => (
              <span key={t} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 100, background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primaryBorder}` }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Step 1 — URL input ───────────────────────────────────────────────────────

const StepOne: React.FC<{
  c: C; darkMode: boolean;
  githubUrl: string; setGithubUrl: (v: string) => void;
  onParse: () => void; parsing: boolean; error: string | null;
  onSkip: () => void;
}> = ({ c, githubUrl, setGithubUrl, onParse, parsing, error, onSkip }) => {
  const input: React.CSSProperties = { width: "100%", padding: "12px 14px", fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 10, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, padding: "2rem", fontFamily: "sans-serif" }}>
      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 20, padding: "2.5rem 2rem", width: "100%", maxWidth: 500 }}>
        {/* Logo */}
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, textAlign: "center", marginBottom: "2rem" }}>
          Skil<span style={{ color: c.primary }}>Link</span>
        </div>

        {/* Hero text */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: c.primarySoft, border: `0.5px solid ${c.primaryBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.primary} strokeWidth="1.8"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: c.text, margin: "0 0 8px" }}>Connect your GitHub</h1>
          <p style={{ fontSize: 14, color: c.subtext, margin: 0, lineHeight: 1.6 }}>We'll read your public repositories, languages, and contributions to build your professional profile.</p>
        </div>

        {/* Features */}
        {["AI-generated professional bio from your repos", "Skills auto-detected from your tech stack", "Portfolio cards for each top project"].map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13, color: c.subtext }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {f}
          </div>
        ))}

        <div style={{ height: "0.5px", background: c.border, margin: "1.5rem 0" }} />

        {error && (
          <div style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 8 }}>GitHub Profile URL</label>
          <input
            type="text"
            placeholder="https://github.com/username"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onParse()}
            style={input}
            autoFocus
          />
        </div>

        <button
          onClick={onParse}
          disabled={parsing || !githubUrl.trim()}
          style={{ width: "100%", padding: "13px", background: c.primary, color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: parsing || !githubUrl.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: parsing || !githubUrl.trim() ? 0.7 : 1, transition: "opacity .15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {parsing ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
              Analyzing Profile…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
              Import from GitHub
            </>
          )}
        </button>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button onClick={onSkip} style={{ background: "none", border: "none", color: c.subtext, fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
            Skip — set up profile manually
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

// ─── Step 2 — Full profile review ─────────────────────────────────────────────

const StepTwo: React.FC<{
  c: C; parsed: GitHubParseResult;
  bio: string; setBio: (v: string) => void;
  title: string; setTitle: (v: string) => void;
  skills: string[]; setSkills: (v: string[]) => void;
  hourlyRate: string; setHourlyRate: (v: string) => void;
  onSave: () => void; saving: boolean; saveError: string | null;
  onBack: () => void;
}> = ({ c, parsed, bio, setBio, title, setTitle, skills, setSkills, hourlyRate, setHourlyRate, onSave, saving, saveError, onBack }) => {
  const skillInput = useRef<HTMLInputElement>(null);
  const stats = parsed.github_stats;

  const addSkill = (val: string) => {
    const t = val.trim();
    if (t && !skills.includes(t)) setSkills([...skills, t]);
  };

  const memberSince = stats?.account_created
    ? new Date(stats.account_created).getFullYear()
    : null;

  const langBars = (stats?.top_languages ?? []).slice(0, 8).map((l, i, arr) => ({
    lang: l,
    pct: Math.round(100 - (i / arr.length) * 55),
  }));

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 8, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", background: c.bg, fontFamily: "sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", background: c.surface, borderBottom: `0.5px solid ${c.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: c.subtext, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Change URL
          </button>
          <div style={{ height: 18, width: "0.5px", background: c.border }} />
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Skil<span style={{ color: c.primary }}>Link</span></div>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 22px", background: c.primary, color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1, transition: "opacity .15s" }}
        >
          {saving ? "Saving…" : "Save Profile & Continue →"}
        </button>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>

        {/* Save error */}
        {saveError && (
          <div style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.25rem" }}>
            {saveError}
          </div>
        )}

        {/* ── Hero card ── */}
        <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
          {/* Banner */}
          <div style={{ height: 100, background: `linear-gradient(135deg, ${c.primary}30 0%, ${c.primary}10 50%, transparent 100%)`, borderBottom: `0.5px solid ${c.border}`, position: "relative" }}>
            {/* Score pill top-right */}
            <div style={{ position: "absolute", top: 12, right: 16 }}>
              <ScorePill score={parsed.score} />
            </div>
          </div>

          {/* Avatar + identity */}
          <div style={{ padding: "0 24px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: -36 }}>
              <Avatar
                src={stats?.avatar_url ?? ""}
                name={parsed.name || stats?.username || "?"}
                size={80}
                c={c}
              />
              {stats?.profile_url && (
                <a href={stats.profile_url} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: c.subtext, textDecoration: "none", padding: "6px 12px", border: `0.5px solid ${c.border}`, borderRadius: 8, marginBottom: 4 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = c.primary; (e.currentTarget as HTMLElement).style.borderColor = c.primaryBorder; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = c.subtext; (e.currentTarget as HTMLElement).style.borderColor = c.border; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
                  @{stats?.username}
                </a>
              )}
            </div>

            {/* Name + title */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.text, letterSpacing: "-0.3px" }}>
                {parsed.name || stats?.username || "Developer"}
              </div>
              {/* Editable title inline */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Your professional title (e.g. Full Stack Engineer)"
                style={{ ...inputStyle, fontSize: 15, color: c.primary, fontWeight: 500, padding: "6px 0", background: "transparent", border: "none", borderBottom: `1px dashed ${c.inputBorder}`, borderRadius: 0, marginTop: 4, marginBottom: 6, width: "100%" }}
              />
              {/* Location + member since */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: c.subtext }}>
                {(parsed.location || stats?.location) && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {parsed.location || stats?.location}
                  </span>
                )}
                {memberSince && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Member since {memberSince}
                  </span>
                )}
                {(parsed.website || stats?.website) && (
                  <a href={(parsed.website || stats?.website)!} target="_blank" rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 5, color: c.primary, textDecoration: "none" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
                    Website
                  </a>
                )}
              </div>
            </div>

            {/* Rate input */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: c.subtext }}>$</span>
                <input
                  type="number"
                  value={hourlyRate}
                  min={0}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  style={{ width: 70, fontSize: 20, fontWeight: 700, color: c.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }}
                />
                <span style={{ fontSize: 13, color: c.subtext }}>/hr</span>
              </div>
              <span style={{ fontSize: 12, color: c.subtext }}>Tap to edit your hourly rate</span>
            </div>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { icon: "📦", value: stats?.public_repos ?? 0, label: "Repositories" },
            { icon: "⭐", value: stats?.total_stars ?? 0,  label: "Total Stars" },
            { icon: "👥", value: stats?.followers ?? 0,     label: "Followers" },
            { icon: "📊", value: `${parsed.score}/100`,     label: "Profile Score" },
          ].map(({ icon, value, label }) => (
            <div key={label} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.text, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Two-column layout ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>

          {/* Left column */}
          <div>

            {/* About */}
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "20px 20px 16px", marginBottom: 16 }}>
              <SectionLabel c={c}>About</SectionLabel>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={6}
                placeholder="Tell clients about your experience, expertise, and what makes you unique…"
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }}
              />
              <p style={{ fontSize: 11, color: c.subtext, margin: "8px 0 0" }}>This bio will appear on your public profile. AI-generated from your GitHub — edit freely.</p>
            </div>

            {/* Portfolio */}
            {parsed.experience?.length > 0 && (
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "20px 20px 8px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <SectionLabel c={c}>Portfolio ({parsed.experience.length} projects)</SectionLabel>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primaryBorder}` }}>From GitHub</span>
                </div>
                {parsed.experience.map((exp, i) => <ProjectCard key={i} exp={exp} index={i} c={c} />)}
              </div>
            )}
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Skills */}
            <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "20px" }}>
              <SectionLabel c={c}>Skills ({skills.length})</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: skills.length ? 10 : 0 }}>
                {skills.map((s, i) => (
                  <Chip key={i} label={s} c={c} onRemove={() => setSkills(skills.filter((_, idx) => idx !== i))} />
                ))}
              </div>
              <input
                ref={skillInput}
                type="text"
                placeholder="+ Add a skill, press Enter"
                style={{ ...inputStyle, fontSize: 13, marginTop: skills.length ? 0 : 0 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addSkill((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </div>

            {/* Top languages */}
            {langBars.length > 0 && (
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "20px" }}>
                <SectionLabel c={c}>Top Languages</SectionLabel>
                {langBars.map(({ lang, pct }, i) => <LanguageBar key={lang} lang={lang} pct={pct} index={i} c={c} />)}
              </div>
            )}

            {/* Suggestions */}
            {parsed.suggestions?.length > 0 && (
              <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "20px" }}>
                <SectionLabel c={c}>Profile Improvement Tips</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {parsed.suggestions.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: c.subtext }}>
                      <span style={{ color: "#f59e0b", marginTop: 1, flexShrink: 0 }}>💡</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={{ padding: "14px 48px", background: c.primary, color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1, transition: "opacity .15s, transform .1s", boxShadow: "0 4px 20px rgba(127,119,221,.35)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "none"; }}
          >
            {saving ? "Saving…" : "Save Profile & Continue →"}
          </button>
          <div style={{ fontSize: 12, color: c.subtext, marginTop: 8 }}>You can always update your profile from Settings.</div>
        </div>
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const GitHubReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const s = localStorage.getItem("skilllink-darkMode");
    return s !== null ? JSON.parse(s) : true;
  });
  const c = getColors(darkMode);

  const [step, setStep]           = useState<1 | 2>(1);
  const [githubUrl, setGithubUrl] = useState("");

  const { mutate: parseGitHub, isLoading: parsing, error: parseError } = useGitHubParse();
  const { mutate: saveProfile, isLoading: saving, error: saveError }   = useProfileMutation();

  const [parsed,     setParsed]     = useState<GitHubParseResult | null>(null);
  const [bio,        setBio]        = useState("");
  const [title,      setTitle]      = useState("");
  const [skills,     setSkills]     = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState("50");

  const handleParse = async () => {
    if (!githubUrl.trim()) return;
    try {
      const result = await parseGitHub({ url: githubUrl.trim() });
      setParsed(result);
      setBio(result.summary ?? "");
      setTitle(result.title ?? "");
      setSkills(result.skills ?? []);
      setStep(2);
    } catch {}
  };

  const handleSave = async () => {
    try {
      await saveProfile({ profile: { bio, hourly_rate: parseFloat(hourlyRate) || 0 }, skills });
      navigate("/dashboard/freelancer");
    } catch {}
  };

  // Theme toggle button — shown on step 1 only (step 2 has inline topbar)
  const themeBtn = (
    <button
      onClick={() => setDarkMode((d) => { localStorage.setItem("skilllink-darkMode", JSON.stringify(!d)); return !d; })}
      style={{ position: "fixed", top: "1.25rem", right: "1.25rem", padding: "7px 11px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, cursor: "pointer", fontSize: 15, zIndex: 100 }}
    >
      {darkMode ? "☀️" : "🌙"}
    </button>
  );

  const handleSkip = () => {
    setParsed({
      name: "", title: "", summary: "", location: "", website: "",
      skills: [], experience: [], education: [], languages: [],
      certifications: [], score: 0, suggestions: [],
      github_stats: { username: "", public_repos: 0, followers: 0, total_stars: 0, top_languages: [] },
    });
    setBio("");
    setTitle("");
    setSkills([]);
    setHourlyRate("50");
    setStep(2);
  };

  if (step === 1) {
    return (
      <>
        {themeBtn}
        <StepOne
          c={c} darkMode={darkMode}
          githubUrl={githubUrl} setGithubUrl={setGithubUrl}
          onParse={handleParse} parsing={parsing} error={parseError}
          onSkip={handleSkip}
        />
      </>
    );
  }

  if (!parsed) {
    return (
      <div style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: c.subtext }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ marginBottom: 12 }}>No GitHub data parsed yet.</div>
          <button onClick={() => setStep(1)} style={{ color: c.primary, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 14, fontFamily: "inherit" }}>
            Go back and import from GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {themeBtn}
      <StepTwo
        c={c}
        parsed={parsed}
        bio={bio}         setBio={setBio}
        title={title}     setTitle={setTitle}
        skills={skills}   setSkills={setSkills}
        hourlyRate={hourlyRate} setHourlyRate={setHourlyRate}
        onSave={handleSave}   saving={saving} saveError={saveError}
        onBack={() => setStep(1)}
      />
    </>
  );
};

export default GitHubReviewPage;
