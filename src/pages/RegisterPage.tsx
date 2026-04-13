/**
 * RegisterPage.tsx
 * ─────────────────
 * POST /auth/register → { email, password, role, company_name? }
 *
 * Backend rules (enforced client-side too):
 *   - Email must be unique (409 if duplicate)
 *   - Password: min 8 chars, ≥1 uppercase, ≥1 digit
 *   - Roles: "freelancer" | "client"  (admin is not self-registered)
 *   - company_name only sent when role === "client"
 *
 * On success → stores tokens and redirects based on role.
 */

import React, { useState } from "react";
import axios, { AxiosError } from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = "freelancer" | "client";

interface RegisterRequest {
  email: string;
  password: string;
  role: UserRole;
  company_name?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  role: UserRole;
  user_id: number;
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const REDIRECT_MAP: Record<UserRole, string> = {
  freelancer: "/dashboard/freelancer",
  client:     "/dashboard/client",
};

const ROLES: { label: string; value: UserRole; description: string; icon: string }[] = [
  { label: "Freelancer", value: "freelancer", description: "I want to find work and projects", icon: "💼" },
  { label: "Client",     value: "client",     description: "I want to hire skilled talent",    icon: "🏢" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? {
        bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333",
        text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640",
        inputBg: "#262626", inputBorder: "#404040",
        errorBg: "#2a1a1a", errorBorder: "#5c2e2e", errorText: "#ff6b6b",
      }
    : {
        bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5",
        text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE",
        inputBg: "#ffffff", inputBorder: "#dddddd",
        errorBg: "#fff0f0", errorBorder: "#f5c6c6", errorText: "#c0392b",
      };

/** Returns null if valid, or an error string. */
function validatePassword(password: string): string | null {
  if (password.length < 8)              return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password))         return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password))         return "Password must contain at least one number.";
  return null;
}

function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "Please enter a valid email address.";
}

// ─── Password Strength Indicator ─────────────────────────────────────────────

const PasswordStrength: React.FC<{ password: string; colors: ThemeColors }> = ({ password, colors }) => {
  if (!password) return null;

  const checks = [
    { label: "8+ characters",   pass: password.length >= 8 },
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

const RegisterPage: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [form, setForm] = useState<RegisterRequest>({ email: "", password: "", role: "freelancer", company_name: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  const handleRoleSelect = (role: UserRole) => {
    setForm((prev) => ({ ...prev, role, company_name: "" }));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    const emailErr = validateEmail(form.email);
    if (emailErr) errs.email = emailErr;

    const pwErr = validatePassword(form.password);
    if (pwErr) errs.password = pwErr;

    if (form.password !== confirmPassword) errs.confirmPassword = "Passwords do not match.";
    if (form.role === "client" && !form.company_name?.trim()) errs.company_name = "Company name is required for clients.";

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);

    const payload: RegisterRequest = {
      email:    form.email,
      password: form.password,
      role:     form.role,
    };
    if (form.role === "client" && form.company_name?.trim()) {
      payload.company_name = form.company_name.trim();
    }

    try {
      const { data } = await axios.post<TokenResponse>(`${API_BASE_URL}/auth/register`, payload);
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("user_id", String(data.user_id));
      window.location.href = REDIRECT_MAP[data.role];
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      if (e.response?.status === 409) {
        setFieldErrors((prev) => ({ ...prev, email: "An account with this email already exists." }));
      } else {
        setError(e.response?.data?.detail ?? "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Shared styles ──
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 };
  const inputBase: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 8, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const errStyle: React.CSSProperties = { fontSize: 11, color: c.errorText, marginTop: 4 };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, fontFamily: "sans-serif", padding: "2rem", position: "relative" }}>

      {/* Theme toggle */}
      <button onClick={toggleTheme} style={{ position: "absolute", top: "2rem", right: "2rem", padding: "8px 12px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>
        {darkMode ? "☀️" : "🌙"}
      </button>

      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 16, padding: "2.5rem 2rem", width: "100%", maxWidth: 460 }}>

        {/* Logo */}
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, textAlign: "center", marginBottom: "2rem" }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.text, textAlign: "center", margin: "0 0 6px" }}>Create your account</h1>
        <p style={{ fontSize: 14, color: c.subtext, textAlign: "center", marginBottom: "2rem" }}>Join SkillLink and start today</p>

        {/* Global error */}
        {error && (
          <div style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.25rem" }}>
            {error}
          </div>
        )}

        {/* Role selector */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={labelStyle}>I am a...</label>
          <div style={{ display: "flex", gap: 10 }}>
            {ROLES.map((r) => {
              const isActive = form.role === r.value;
              return (
                <button
                  key={r.value}
                  onClick={() => handleRoleSelect(r.value)}
                  style={{
                    flex: 1, padding: "12px 10px", borderRadius: 10, cursor: "pointer",
                    textAlign: "left", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 4,
                    border: isActive ? `1.5px solid ${c.primary}` : `0.5px solid ${c.border}`,
                    background: isActive ? c.primarySoft : c.inputBg,
                    transition: "all .15s",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{r.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: isActive ? c.primary : c.text }}>{r.label}</span>
                  <span style={{ fontSize: 11, color: c.subtext }}>{r.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Email */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={labelStyle}>Email</label>
          <input style={{ ...inputBase, borderColor: fieldErrors.email ? c.errorText : c.inputBorder }} type="email" name="email" placeholder="you@example.com" value={form.email} onChange={handleChange} autoComplete="email" />
          {fieldErrors.email && <div style={errStyle}>{fieldErrors.email}</div>}
        </div>

        {/* Company name (clients only) */}
        {form.role === "client" && (
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={labelStyle}>Company Name</label>
            <input style={{ ...inputBase, borderColor: fieldErrors.company_name ? c.errorText : c.inputBorder }} type="text" name="company_name" placeholder="Your Company Ltd." value={form.company_name || ""} onChange={handleChange} autoComplete="organization" />
            {fieldErrors.company_name && <div style={errStyle}>{fieldErrors.company_name}</div>}
          </div>
        )}

        {/* Password */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={labelStyle}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              style={{ ...inputBase, paddingRight: 44, borderColor: fieldErrors.password ? c.errorText : c.inputBorder }}
              type={showPassword ? "text" : "password"} name="password"
              placeholder="Min. 8 chars, 1 uppercase, 1 number"
              value={form.password} onChange={handleChange} autoComplete="new-password"
            />
            <button onClick={() => setShowPassword((s) => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: c.subtext, fontSize: 14, padding: 0 }}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          {fieldErrors.password && <div style={errStyle}>{fieldErrors.password}</div>}
          <PasswordStrength password={form.password} colors={c} />
        </div>

        {/* Confirm password */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Confirm Password</label>
          <input
            style={{ ...inputBase, borderColor: fieldErrors.confirmPassword ? c.errorText : c.inputBorder }}
            type={showPassword ? "text" : "password"} name="confirmPassword"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, confirmPassword: "" })); }}
            autoComplete="new-password"
          />
          {fieldErrors.confirmPassword && <div style={errStyle}>{fieldErrors.confirmPassword}</div>}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit} disabled={loading}
          style={{ width: "100%", padding: 12, background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, transition: "opacity .15s" }}
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <p style={{ textAlign: "center", fontSize: 13, color: c.subtext, marginTop: "1.5rem" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: c.primary, textDecoration: "none", fontWeight: 500 }}>Log in</a>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
