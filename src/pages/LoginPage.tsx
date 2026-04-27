/**
 * LoginPage.tsx
 * ─────────────
 * POST /auth/login   → { email, password }
 *   → success (no MFA): { access_token, refresh_token, role, user_id }
 *   → MFA required:     { mfa_required: true, email }
 *
 * POST /auth/verify-mfa  → { email, totp_code }
 *   → success: { access_token, refresh_token, role, user_id }
 *
 * Redirects:
 *   freelancer → /dashboard/freelancer
 *   client     → /dashboard/client
 *   admin      → /dashboard/admin
 */

import React, { useState, useRef } from "react";
import axios, { AxiosError } from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "freelancer" | "client" | "admin";

interface LoginRequest {
  email: string;
  password: string;
}

interface MFAVerifyRequest {
  email: string;
  totp_code: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  role: Role;
  user_id: number;
}

interface MFARequiredResponse {
  mfa_required: true;
  email: string;
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

const REDIRECT_MAP: Record<Role, string> = {
  freelancer: "/dashboard/freelancer",
  client:     "/dashboard/client",
  admin:      "/dashboard/admin",
};

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

function storeTokens(data: TokenResponse): void {
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);
  localStorage.setItem("role", data.role);
  localStorage.setItem("user_id", String(data.user_id));

}

// ─── MFA Code Input ──────────────────────────────────────────────────────────

const MFACodeInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  colors: ThemeColors;
}> = ({ value, onChange, colors }) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split("").concat(Array(6).fill("")).slice(0, 6);

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      const next = digits.map((d, idx) => (idx === i ? "" : d)).join("");
      onChange(next);
      if (i > 0) inputs.current[i - 1]?.focus();
    }
  };

  const handleChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = digits.map((d, idx) => (idx === i ? digit : d)).join("");
    onChange(next);
    if (digit && i < 5) inputs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted.padEnd(6, "").slice(0, 6));
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          style={{
            width: 44, height: 52, textAlign: "center",
            fontSize: 22, fontWeight: 500,
            background: colors.inputBg, border: `0.5px solid ${digits[i] ? colors.primary : colors.inputBorder}`,
            borderRadius: 8, color: colors.text, fontFamily: "inherit", outline: "none",
            boxSizing: "border-box",
            transition: "border-color .15s",
          }}
        />
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const LoginPage: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [form, setForm] = useState<LoginRequest>({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA step
  const [mfaMode, setMfaMode] = useState(false);
  const [mfaEmail, setMfaEmail] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  const c = getColors(darkMode);

  const toggleTheme = () => {
    setDarkMode((d) => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  // ── Step 1: Email + Password ──
  const handleLogin = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const { data } = await axios.post<TokenResponse | MFARequiredResponse>(
        `${API_BASE_URL}/auth/login`,
        form
      );

      if ("mfa_required" in data && data.mfa_required) {
        setMfaEmail(data.email);
        localStorage.setItem("email", form.email);  
        setMfaMode(true);
        setLoading(false);
        return;
      }

      const token = data as TokenResponse;
      storeTokens(token);
      
      if (token.role === "freelancer") {
        try {
          const profileRes = await axios.get(`${API_BASE_URL}/users/me/profile`, {
            headers: { Authorization: `Bearer ${token.access_token}` }
          });
          if (!profileRes.data.skills || profileRes.data.skills.length === 0) {
            window.location.href = "/profile-setup";
            return;
          }
        } catch { /* ignore and use default */ }
      }
      
      window.location.href = REDIRECT_MAP[token.role];
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      setError(e.response?.data?.detail ?? "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: MFA Code ──
  const handleMFA = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    if (mfaCode.replace(/\D/g, "").length < 6) {
      setError("Please enter all 6 digits of your authenticator code.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const body: MFAVerifyRequest = { email: mfaEmail, totp_code: mfaCode.replace(/\D/g, "") };
      const { data } = await axios.post<TokenResponse>(`${API_BASE_URL}/auth/verify-mfa`, body);
      storeTokens(data);

      if (data.role === "freelancer") {
        try {
          const profileRes = await axios.get(`${API_BASE_URL}/users/me/profile`, {
            headers: { Authorization: `Bearer ${data.access_token}` }
          });
          if (!profileRes.data.skills || profileRes.data.skills.length === 0) {
            window.location.href = "/profile-setup";
            return;
          }
        } catch { /* ignore */ }
      }

      window.location.href = REDIRECT_MAP[data.role];
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      setError(e.response?.data?.detail ?? "Invalid MFA code. Please try again.");
      setMfaCode("");
    } finally {
      setLoading(false);
    }
  };

  // ── Shared styles ──
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: `0.5px solid ${c.inputBorder}`, borderRadius: 8,
    background: c.inputBg, color: c.text, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };
  const btnPrimary: React.CSSProperties = {
    width: "100%", padding: 12, background: c.primary, color: "#fff",
    border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500,
    cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1,
    transition: "opacity .15s", marginTop: 8,
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, fontFamily: "sans-serif", padding: "2rem", position: "relative" }}>

      {/* Theme toggle */}
      <button onClick={toggleTheme} style={{ position: "absolute", top: "2rem", right: "2rem", padding: "8px 12px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>
        {darkMode ? "☀️" : "🌙"}
      </button>

      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 16, padding: "2.5rem 2rem", width: "100%", maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, textAlign: "center", marginBottom: "2rem" }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>

        {/* ── MFA Step ── */}
        {mfaMode ? (
          <>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 22 }}>
                🔐
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 500, color: c.text, margin: "0 0 6px" }}>Two-factor authentication</h1>
              <p style={{ fontSize: 13, color: c.subtext, margin: 0 }}>
                Enter the 6-digit code from your authenticator app for<br />
                <strong style={{ color: c.text }}>{mfaEmail}</strong>
              </p>
            </div>

            {error && (
              <div style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.5rem" }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: "1.5rem" }}>
              <MFACodeInput value={mfaCode} onChange={setMfaCode} colors={c} />
            </div>

            <button onClick={handleMFA} disabled={loading} style={btnPrimary}>
              {loading ? "Verifying..." : "Verify code"}
            </button>

            <button
              onClick={() => { setMfaMode(false); setMfaCode(""); setError(null); }}
              style={{ width: "100%", padding: 10, background: "transparent", border: `0.5px solid ${c.border}`, borderRadius: 8, fontSize: 13, color: c.subtext, cursor: "pointer", fontFamily: "inherit", marginTop: 10 }}
            >
              ← Back to login
            </button>

            <p style={{ textAlign: "center", fontSize: 12, color: c.subtext, marginTop: "1.25rem" }}>
              Code refreshes every 30 seconds. Use Google Authenticator or Authy.
            </p>
          </>
        ) : (
          /* ── Login Step ── */
          <>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: c.text, textAlign: "center", margin: "0 0 6px" }}>Welcome back</h1>
            <p style={{ fontSize: 14, color: c.subtext, textAlign: "center", marginBottom: "2rem" }}>Log in to your SkillLink account</p>

            {error && (
              <div style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.25rem" }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>Email</label>
              <input
                style={inputStyle} type="email" name="email"
                placeholder="you@example.com" value={form.email}
                onChange={handleChange} autoComplete="email"
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ ...labelStyle, margin: 0 }}>Password</label>
                <a href="/forgot-password" style={{ fontSize: 12, color: c.primary, textDecoration: "none" }}>Forgot password?</a>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inputStyle, paddingRight: 44 }} type={showPassword ? "text" : "password"}
                  name="password" placeholder="••••••••" value={form.password}
                  onChange={handleChange} autoComplete="current-password"
                />
                <button
                  onClick={() => setShowPassword((s) => !s)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: c.subtext, fontSize: 14, padding: 0 }}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <button onClick={handleLogin} disabled={loading} style={btnPrimary}>
              {loading ? "Logging in..." : "Log in"}
            </button>

            <p style={{ textAlign: "center", fontSize: 13, color: c.subtext, marginTop: "1.5rem" }}>
              Don't have an account?{" "}
              <a href="/register" style={{ color: c.primary, textDecoration: "none", fontWeight: 500 }}>Sign up</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
