/**
 * ForgotPasswordPage.tsx
 * ───────────────────────
 * Flow A — Email Link:
 *   POST /auth/forgot-password          → { email }         → sends reset link to inbox
 *   GET  /reset-password?token=...      → lands on this page in "reset" mode
 *   POST /auth/reset-password           → { token, new_password }
 *
 * Flow B — OTP Code:
 *   POST /auth/forgot-password-otp      → { email }         → sends 6-digit OTP to inbox
 *   POST /auth/verify-reset-otp         → { email, otp, new_password }
 *
 * Add to App.tsx:
 *   <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
 *   <Route path="/reset-password"   element={<ForgotPasswordPage />} />
 */

import React, { useState, useRef, useEffect } from "react";
import axios, { AxiosError } from "axios";
import { useLanguage } from "../shared/LanguageContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiError { detail: string; }

interface ThemeColors {
  bg: string; surface: string; border: string;
  text: string; subtext: string; primary: string; primarySoft: string;
  inputBg: string; inputBorder: string;
  errorBg: string; errorBorder: string; errorText: string;
  successBg: string; successBorder: string; successText: string;
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

function validatePassword(p: string): string | null {
  if (p.length < 8)            return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(p))        return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(p))        return "Password must contain at least one number.";
  return null;
}

// ─── OTP Input ────────────────────────────────────────────────────────────────

const OTPInput: React.FC<{ value: string; onChange: (v: string) => void; c: ThemeColors }> = ({ value, onChange, c }) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split("").concat(Array(6).fill("")).slice(0, 6);

  const handleChange = (idx: number, char: string) => {
    const digit = char.replace(/\D/g, "").slice(-1);
    const next = digits.map((d, i) => (i === idx ? digit : d)).join("");
    onChange(next);
    if (digit && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        onChange(digits.map((d, i) => (i === idx ? "" : d)).join(""));
      } else if (idx > 0) {
        inputs.current[idx - 1]?.focus();
        onChange(digits.map((d, i) => (i === idx - 1 ? "" : d)).join(""));
      }
    } else if (e.key === "ArrowLeft" && idx > 0) inputs.current[idx - 1]?.focus();
    else if (e.key === "ArrowRight" && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) { onChange(pasted); inputs.current[Math.min(pasted.length, 5)]?.focus(); e.preventDefault(); }
  };

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {Array.from({ length: 6 }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => { inputs.current[idx] = el; }}
          type="tel" inputMode="numeric" maxLength={1}
          value={digits[idx] ?? ""}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          style={{
            width: 44, height: 52, textAlign: "center", fontSize: 22, fontWeight: 600,
            fontFamily: "monospace", background: c.inputBg,
            border: `1.5px solid ${digits[idx] ? c.primary : c.inputBorder}`,
            borderRadius: 10, color: c.text, outline: "none", transition: "border-color 0.15s",
          }}
        />
      ))}
    </div>
  );
};

// ─── Password Input with show/hide ────────────────────────────────────────────

const PasswordInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; style: React.CSSProperties }> = ({ value, onChange, placeholder, style }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...style, paddingRight: 44 }}
      />
      <button
        onClick={() => setShow((s) => !s)}
        type="button"
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0 }}
      >
        {show ? "🙈" : "👁️"}
      </button>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

type Method = "choose" | "email" | "otp";
type Screen =
  | "choose"          // pick email or OTP
  | "email-sent"      // email link sent, waiting
  | "otp-sent"        // OTP sent, enter code
  | "new-password"    // set new password (both flows converge here)
  | "done";           // success

const ForgotPasswordPage: React.FC = () => {
  const { t, isRTL } = useLanguage();

  const [darkMode] = useState<boolean>(() => {
    const s = localStorage.getItem("skilllink-darkMode");
    return s !== null ? JSON.parse(s) : true;
  });

  const c = getColors(darkMode);

  // Detect if we landed here via a reset link (?token=...)
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get("token");

  const [screen, setScreen]       = useState<Screen>(resetToken ? "new-password" : "choose");
  const [method, setMethod]       = useState<Method>("choose");
  const [email, setEmail]         = useState("");
  const [otp, setOtp]             = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: `0.5px solid ${c.inputBorder}`, borderRadius: 8,
    background: c.inputBg, color: c.text, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };
  const btnPrimary: React.CSSProperties = {
    width: "100%", padding: 12, background: c.primary, color: "#fff",
    border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500,
    cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
    opacity: loading ? 0.7 : 1, transition: "opacity .15s", marginTop: 8,
  };
  const btnOutline: React.CSSProperties = {
    width: "100%", padding: 11, background: "transparent",
    border: `0.5px solid ${c.border}`, borderRadius: 8, fontSize: 14,
    color: c.subtext, cursor: "pointer", fontFamily: "inherit", marginTop: 8,
  };

  // ── Send email link ──
  const handleSendEmailLink = async () => {
    if (!email) { setError(t("forgot.email.label")); return; }
    setLoading(true); setError(null);
    try {
      await axios.post(`${API_BASE_URL}/auth/forgot-password`, { email });
      setMethod("email");
      setScreen("email-sent");
      setResendCooldown(60);
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      setError(e.response?.data?.detail ?? t("forgot.sending"));
    } finally { setLoading(false); }
  };

  // ── Send OTP ──
  const handleSendOTP = async () => {
    if (!email) { setError(t("forgot.email.label")); return; }
    setLoading(true); setError(null);
    try {
      await axios.post(`${API_BASE_URL}/auth/forgot-password-otp`, { email });
      setMethod("otp");
      setScreen("otp-sent");
      setResendCooldown(60);
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      setError(e.response?.data?.detail ?? t("forgot.sending"));
    } finally { setLoading(false); }
  };

  // ── Verify OTP → go to new password screen ──
  const handleVerifyOTP = async () => {
    if (otp.length !== 6) { setError(t("mfa.setup.err.digits")); return; }
    setLoading(true); setError(null);
    try {
      await axios.post(`${API_BASE_URL}/auth/verify-reset-otp-check`, { email, otp });
      setScreen("new-password");
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      setError(e.response?.data?.detail ?? t("mfa.setup.err.invalid"));
      setOtp("");
    } finally { setLoading(false); }
  };

  // ── Set new password (OTP flow) ──
  const handleResetWithOTP = async () => {
    const pwErr = validatePassword(newPassword);
    if (pwErr) { setError(pwErr); return; }
    if (newPassword !== confirmPassword) { setError(t("chpw.err.match")); return; }
    setLoading(true); setError(null);
    try {
      await axios.post(`${API_BASE_URL}/auth/verify-reset-otp`, { email, otp, new_password: newPassword });
      setScreen("done");
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      setError(e.response?.data?.detail ?? t("forgot.newpw.sub"));
    } finally { setLoading(false); }
  };

  // ── Set new password (email link flow) ──
  const handleResetWithToken = async () => {
    const pwErr = validatePassword(newPassword);
    if (pwErr) { setError(pwErr); return; }
    if (newPassword !== confirmPassword) { setError(t("chpw.err.match")); return; }
    setLoading(true); setError(null);
    try {
      await axios.post(`${API_BASE_URL}/auth/reset-password`, { token: resetToken, new_password: newPassword });
      setScreen("done");
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      setError(e.response?.data?.detail ?? t("forgot.newpw.sub"));
    } finally { setLoading(false); }
  };

  const handleResend = () => {
    setOtp(""); setError(null);
    if (method === "otp") handleSendOTP();
    else handleSendEmailLink();
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, fontFamily: "sans-serif", padding: "2rem" }}>
      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 16, padding: "2.5rem 2rem", width: "100%", maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, textAlign: "center", marginBottom: "2rem" }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>

        {/* Error banner */}
        {error && (
          <div role="alert" aria-live="assertive" style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.25rem", display: "flex", gap: 8 }}>
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        {/* ── Screen: Choose method ── */}
        {screen === "choose" && (
          <>
            <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 22 }}>🔑</div>
              <h1 style={{ fontSize: 20, fontWeight: 500, color: c.text, margin: "0 0 6px" }}>{t("forgot.choose.title")}</h1>
              <p style={{ fontSize: 13, color: c.subtext, margin: 0 }}>{t("forgot.choose.sub")}</p>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 }}>{t("forgot.email.label")}</label>
              <input
                type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="you@example.com"
                style={inputStyle}
                onKeyDown={(e) => e.key === "Enter" && email && handleSendEmailLink()}
              />
            </div>

            {/* Method choice cards */}
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 10 }}>{t("forgot.choose.sub")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                {/* Email link card */}
                <div
                  onClick={() => !loading && email && handleSendEmailLink()}
                  style={{
                    border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "14px 16px",
                    cursor: email ? "pointer" : "not-allowed", opacity: email ? 1 : 0.5,
                    background: c.bg, transition: "border-color .15s",
                    display: "flex", alignItems: "flex-start", gap: 12,
                  }}
                  onMouseEnter={(e) => email && ((e.currentTarget as HTMLDivElement).style.borderColor = c.primary)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = c.border)}
                >
                  <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>📧</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 3 }}>{t("forgot.method.email")}</div>
                    <div style={{ fontSize: 12, color: c.subtext }}>{t("forgot.method.email.d")}</div>
                  </div>
                </div>

                {/* OTP card */}
                <div
                  onClick={() => !loading && email && handleSendOTP()}
                  style={{
                    border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "14px 16px",
                    cursor: email ? "pointer" : "not-allowed", opacity: email ? 1 : 0.5,
                    background: c.bg, transition: "border-color .15s",
                    display: "flex", alignItems: "flex-start", gap: 12,
                  }}
                  onMouseEnter={(e) => email && ((e.currentTarget as HTMLDivElement).style.borderColor = c.primary)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = c.border)}
                >
                  <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>🔢</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 3 }}>{t("forgot.method.otp")}</div>
                    <div style={{ fontSize: 12, color: c.subtext }}>{t("forgot.method.otp.d")}</div>
                  </div>
                </div>

              </div>
            </div>

            {loading && (
              <div style={{ textAlign: "center", fontSize: 13, color: c.subtext, padding: "8px 0" }}>{t("forgot.sending")}</div>
            )}

            <a href="/login" style={{ display: "block", textAlign: "center", fontSize: 13, color: c.subtext, textDecoration: "none", marginTop: 12 }}>
              {t("forgot.back.login")}
            </a>
          </>
        )}

        {/* ── Screen: Email sent ── */}
        {screen === "email-sent" && (
          <>
            <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📬</div>
              <h1 style={{ fontSize: 20, fontWeight: 500, color: c.text, margin: "0 0 8px" }}>{t("forgot.sent.title")}</h1>
              <p style={{ fontSize: 13, color: c.subtext, margin: 0, lineHeight: 1.6 }}>
                {t("forgot.sent.msg")} <strong style={{ color: c.text }}>{email}</strong>.
              </p>
            </div>

            <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: "1.25rem" }}>
              <div style={{ fontSize: 12, color: c.subtext, lineHeight: 1.6 }}>
                ⏱ {t("forgot.sent.hint")}
              </div>
            </div>

            <button onClick={handleResend} disabled={resendCooldown > 0 || loading} style={{ ...btnOutline, opacity: resendCooldown > 0 ? 0.5 : 1, cursor: resendCooldown > 0 ? "not-allowed" : "pointer" }}>
              {resendCooldown > 0 ? `${resendCooldown}s` : t("forgot.send.link")}
            </button>

            <button onClick={() => { setScreen("choose"); setError(null); }} style={btnOutline}>
              {t("forgot.choose.sub")}
            </button>

            <a href="/login" style={{ display: "block", textAlign: "center", fontSize: 13, color: c.subtext, textDecoration: "none", marginTop: 12 }}>
              {t("forgot.back.login")}
            </a>
          </>
        )}

        {/* ── Screen: OTP sent ── */}
        {screen === "otp-sent" && (
          <>
            <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 22 }}>🔢</div>
              <h1 style={{ fontSize: 20, fontWeight: 500, color: c.text, margin: "0 0 6px" }}>{t("forgot.otp.title")}</h1>
              <p style={{ fontSize: 13, color: c.subtext, margin: 0, lineHeight: 1.6 }}>
                {t("forgot.otp.sent")} <strong style={{ color: c.text }}>{email}</strong>.
              </p>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <OTPInput value={otp} onChange={setOtp} c={c} />
            </div>

            <button
              onClick={handleVerifyOTP}
              disabled={loading || otp.length !== 6}
              style={{ ...btnPrimary, opacity: (loading || otp.length !== 6) ? 0.6 : 1 }}
            >
              {loading ? t("forgot.otp.verifying") : t("forgot.otp.verify")}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
              <button onClick={handleResend} disabled={resendCooldown > 0 || loading}
                style={{ background: "none", border: "none", cursor: resendCooldown > 0 ? "not-allowed" : "pointer", color: c.primary, fontSize: 12, fontFamily: "inherit", opacity: resendCooldown > 0 ? 0.5 : 1, padding: 0 }}>
                {resendCooldown > 0 ? `${resendCooldown}s` : t("forgot.otp.resend")}
              </button>
              <button onClick={() => { setScreen("choose"); setOtp(""); setError(null); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: c.subtext, fontSize: 12, fontFamily: "inherit", padding: 0 }}>
                {t("forgot.choose.sub")}
              </button>
            </div>
          </>
        )}

        {/* ── Screen: New password ── */}
        {screen === "new-password" && (
          <>
            <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 22 }}>🔒</div>
              <h1 style={{ fontSize: 20, fontWeight: 500, color: c.text, margin: "0 0 6px" }}>{t("forgot.newpw.title")}</h1>
              <p style={{ fontSize: 13, color: c.subtext, margin: 0 }}>{t("chpw.title")}</p>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 }}>{t("forgot.newpw.new")}</label>
              <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Min. 8 chars, 1 uppercase, 1 number" style={inputStyle} />
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 }}>{t("forgot.newpw.confirm")}</label>
              <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" style={inputStyle} />
            </div>

            {/* Password strength hints */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.25rem" }}>
              {[
                { label: t("reg.pw.chars"), ok: newPassword.length >= 8 },
                { label: t("reg.pw.upper"), ok: /[A-Z]/.test(newPassword) },
                { label: t("reg.pw.num"),   ok: /[0-9]/.test(newPassword) },
                { label: t("chpw.err.match"), ok: newPassword.length > 0 && newPassword === confirmPassword },
              ].map(({ label, ok }) => (
                <span key={label} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 100, background: ok ? "rgba(34,197,94,.12)" : c.bg, color: ok ? "#22c55e" : c.subtext, border: `0.5px solid ${ok ? "#22c55e44" : c.border}`, transition: "all .2s" }}>
                  {ok ? "✓" : "·"} {label}
                </span>
              ))}
            </div>

            <button
              onClick={resetToken ? handleResetWithToken : handleResetWithOTP}
              disabled={loading}
              style={btnPrimary}
            >
              {loading ? t("forgot.newpw.sub") : t("forgot.newpw.submit")}
            </button>
          </>
        )}

        {/* ── Screen: Done ── */}
        {screen === "done" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
            <h1 style={{ fontSize: 20, fontWeight: 500, color: c.text, margin: "0 0 8px" }}>{t("forgot.done.title")}</h1>
            <p style={{ fontSize: 13, color: c.subtext, margin: "0 0 1.75rem", lineHeight: 1.6 }}>
              {t("forgot.done.msg")}
            </p>
            <a
              href="/login"
              style={{ display: "inline-block", padding: "11px 32px", background: c.primary, color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 500 }}
            >
              {t("forgot.done.login")}
            </a>
          </div>
        )}

      </div>
    </div>
  );
};

export default ForgotPasswordPage;
