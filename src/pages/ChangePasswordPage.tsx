/**
 * ChangePasswordPage.tsx
 * ───────────────────────
 * POST /auth/change-password → { current_password, new_password }
 *   Requires: Authorization: Bearer <access_token>
 *   Returns:  { message: string }
 *   400 if current password is incorrect
 *
 * Client-side enforces the same backend password rules:
 *   - Min 8 characters
 *   - At least 1 uppercase letter
 *   - At least 1 digit
 */

import React, { useState } from "react";
import axios, { AxiosError } from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

interface MessageResponse {
  message: string;
}

interface ApiError {
  detail: string;
}

interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primarySoft: string;
  inputBg: string;
  inputBorder: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
  successBg: string;
  successBorder: string;
  successText: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? {
        bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333",
        text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640",
        inputBg: "#262626", inputBorder: "#404040",
        errorBg: "#2a1a1a", errorBorder: "#5c2e2e", errorText: "#ff6b6b",
        successBg: "#0f2a1a", successBorder: "#1a5c2e", successText: "#4ade80",
      }
    : {
        bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5",
        text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE",
        inputBg: "#ffffff", inputBorder: "#dddddd",
        errorBg: "#fff0f0", errorBorder: "#f5c6c6", errorText: "#c0392b",
        successBg: "#f0fff4", successBorder: "#c6f5d5", successText: "#1a7a3c",
      };

function validatePassword(password: string): string | null {
  if (password.length < 8)      return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password))  return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password))  return "Password must contain at least one number.";
  return null;
}

function getAuthHeaders() {
  const token = localStorage.getItem("access_token");
  return { Authorization: `Bearer ${token}` };
}

// ─── Password Strength ────────────────────────────────────────────────────────

const PasswordStrength: React.FC<{ password: string; colors: ThemeColors }> = ({ password, colors }) => {
  if (!password) return null;
  const checks = [
    { label: "8+ characters",    pass: password.length >= 8 },
    { label: "Uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Number",           pass: /[0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const barColor = score === 1 ? "#ef4444" : score === 2 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 20, background: i <= score ? barColor : colors.inputBorder, transition: "background .2s" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {checks.map((ch) => (
          <span key={ch.label} style={{ fontSize: 11, color: ch.pass ? "#22c55e" : colors.subtext, display: "flex", alignItems: "center", gap: 3 }}>
            <span>{ch.pass ? "✓" : "○"}</span> {ch.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ChangePasswordPage: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [form, setForm] = useState<ChangePasswordRequest>({ current_password: "", new_password: "" });
  const [confirmNew, setConfirmNew] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const c = getColors(darkMode);

  const toggleTheme = () => {
    setDarkMode((d) => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    setError(null);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.current_password) errs.current_password = "Please enter your current password.";

    const pwErr = validatePassword(form.new_password);
    if (pwErr) errs.new_password = pwErr;

    if (form.new_password === form.current_password) {
      errs.new_password = "New password must be different from your current password.";
    }
    if (form.new_password !== confirmNew) errs.confirmNew = "Passwords do not match.";

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      await axios.post<MessageResponse>(
        `${API_BASE_URL}/auth/change-password`,
        form,
        { headers: getAuthHeaders() }
      );
      setSuccess(true);
      setForm({ current_password: "", new_password: "" });
      setConfirmNew("");
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      if (e.response?.status === 400) {
        setFieldErrors((prev) => ({ ...prev, current_password: e.response?.data?.detail ?? "Current password is incorrect." }));
      } else if (e.response?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else {
        setError(e.response?.data?.detail ?? "Failed to change password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 };
  const inputBase: React.CSSProperties = { width: "100%", padding: "10px 12px", paddingRight: 44, fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 8, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const eyeBtn: React.CSSProperties = { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: c.subtext, fontSize: 14, padding: 0 };

  return (
    <div style={{ minHeight: "100vh", background: c.bg, fontFamily: "sans-serif", color: c.text }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <a href="/" style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, textDecoration: "none" }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/settings" style={{ fontSize: 13, color: c.subtext, textDecoration: "none" }}>← Back to settings</a>
          <button onClick={toggleTheme} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem" }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 4px" }}>Change Password</h1>
          <p style={{ fontSize: 13, color: c.subtext, margin: 0 }}>Update your SkillLink account password.</p>
        </div>

        {/* Success state */}
        {success ? (
          <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "2.5rem", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Password changed successfully</div>
            <div style={{ fontSize: 13, color: c.subtext, marginBottom: 24 }}>
              Your password has been updated. You'll use your new password at your next login.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <a href="/settings" style={{ padding: "8px 20px", background: "transparent", border: `0.5px solid ${c.border}`, borderRadius: 8, color: c.text, textDecoration: "none", fontSize: 13 }}>
                Back to settings
              </a>
              <button onClick={() => setSuccess(false)} style={{ padding: "8px 20px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Change again
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "1.5rem" }}>

            {error && (
              <div style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.25rem" }}>
                {error}
              </div>
            )}

            {/* Current password */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>Current password</label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inputBase, borderColor: fieldErrors.current_password ? c.errorText : c.inputBorder }}
                  type={showCurrent ? "text" : "password"} name="current_password"
                  placeholder="Your current password" value={form.current_password}
                  onChange={handleChange} autoComplete="current-password"
                />
                <button style={eyeBtn} onClick={() => setShowCurrent((s) => !s)}>{showCurrent ? "🙈" : "👁️"}</button>
              </div>
              {fieldErrors.current_password && <div style={{ fontSize: 11, color: c.errorText, marginTop: 4 }}>{fieldErrors.current_password}</div>}
            </div>

            {/* Divider */}
            <div style={{ borderTop: `0.5px solid ${c.border}`, margin: "16px 0" }} />

            {/* New password */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>New password</label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inputBase, borderColor: fieldErrors.new_password ? c.errorText : c.inputBorder }}
                  type={showNew ? "text" : "password"} name="new_password"
                  placeholder="Min. 8 chars, 1 uppercase, 1 number"
                  value={form.new_password} onChange={handleChange} autoComplete="new-password"
                />
                <button style={eyeBtn} onClick={() => setShowNew((s) => !s)}>{showNew ? "🙈" : "👁️"}</button>
              </div>
              {fieldErrors.new_password && <div style={{ fontSize: 11, color: c.errorText, marginTop: 4 }}>{fieldErrors.new_password}</div>}
              <PasswordStrength password={form.new_password} colors={c} />
            </div>

            {/* Confirm new password */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>Confirm new password</label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inputBase, borderColor: fieldErrors.confirmNew ? c.errorText : c.inputBorder }}
                  type={showNew ? "text" : "password"} name="confirmNew"
                  placeholder="Repeat new password"
                  value={confirmNew}
                  onChange={(e) => { setConfirmNew(e.target.value); setFieldErrors((prev) => ({ ...prev, confirmNew: "" })); }}
                  autoComplete="new-password"
                />
                <button style={eyeBtn} onClick={() => setShowNew((s) => !s)}>{showNew ? "🙈" : "👁️"}</button>
              </div>
              {/* Live match indicator */}
              {confirmNew && (
                <div style={{ fontSize: 11, marginTop: 4, color: form.new_password === confirmNew ? "#22c55e" : c.errorText }}>
                  {form.new_password === confirmNew ? "✓ Passwords match" : "✗ Passwords do not match"}
                </div>
              )}
              {fieldErrors.confirmNew && !confirmNew && <div style={{ fontSize: 11, color: c.errorText, marginTop: 4 }}>{fieldErrors.confirmNew}</div>}
            </div>

            <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: 12, background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, transition: "opacity .15s" }}>
              {loading ? "Updating password..." : "Update password"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordPage;
