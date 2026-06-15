import React, { useState } from "react";
import axios, { AxiosError } from "axios";
import { useLanguage } from "../shared/LanguageContext";

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
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string; inputBg: string; inputBorder: string;
  errorBg: string; errorBorder: string; errorText: string;
  successBg: string; successBorder: string; successText: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640", inputBg: "#262626", inputBorder: "#404040", errorBg: "#2a1a1a", errorBorder: "#5c2e2e", errorText: "#ff6b6b", successBg: "#0f2a1a", successBorder: "#1a5c2e", successText: "#4ade80" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE", inputBg: "#ffffff", inputBorder: "#dddddd", errorBg: "#fff0f0", errorBorder: "#f5c6c6", errorText: "#c0392b", successBg: "#f0fff4", successBorder: "#c6f5d5", successText: "#1a7a3c" };

function getAuthHeaders() {
  const token = localStorage.getItem("access_token");
  return { Authorization: `Bearer ${token}` };
}

const PasswordStrength: React.FC<{ password: string; colors: ThemeColors }> = ({ password, colors }) => {
  const { t } = useLanguage();
  if (!password) return null;
  const checks = [
    { label: t("reg.pw.chars"), pass: password.length >= 8 },
    { label: t("reg.pw.upper"), pass: /[A-Z]/.test(password) },
    { label: t("reg.pw.num"),   pass: /[0-9]/.test(password) },
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

const ChangePasswordPage: React.FC = () => {
  const { t, isRTL } = useLanguage();
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
    setDarkMode((d) => { localStorage.setItem("skilllink-darkMode", JSON.stringify(!d)); return !d; });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    setError(null);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.current_password) errs.current_password = t("chpw.err.current");
    if (!form.new_password) errs.new_password = t("chpw.err.new");
    if (form.new_password !== confirmNew) errs.confirmNew = t("chpw.err.match");
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError(null);
    try {
      await axios.post<MessageResponse>(`${API_BASE_URL}/auth/change-password`, form, { headers: getAuthHeaders() });
      setSuccess(true);
      setForm({ current_password: "", new_password: "" });
      setConfirmNew("");
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      if (e.response?.status === 400) {
        setFieldErrors((prev) => ({ ...prev, current_password: e.response?.data?.detail ?? t("chpw.err.failed") }));
      } else {
        setError(e.response?.data?.detail ?? t("chpw.err.failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 };
  const inputBase: React.CSSProperties = { width: "100%", padding: "10px 12px", paddingRight: 44, fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 8, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const eyeBtn: React.CSSProperties = { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: c.subtext, fontSize: 14, padding: 0 };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: c.bg, fontFamily: "sans-serif", color: c.text }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <a href="/" style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, textDecoration: "none" }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/settings" style={{ fontSize: 13, color: c.subtext, textDecoration: "none" }}>← {t("common.settings")}</a>
          <button onClick={toggleTheme} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 4px" }}>{t("chpw.title")}</h1>
        </div>

        {success ? (
          <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "2.5rem", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>{t("chpw.success")}</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24 }}>
              <a href="/settings" style={{ padding: "8px 20px", background: "transparent", border: `0.5px solid ${c.border}`, borderRadius: 8, color: c.text, textDecoration: "none", fontSize: 13 }}>
                {t("common.settings")}
              </a>
              <button onClick={() => setSuccess(false)} style={{ padding: "8px 20px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                {t("chpw.title")}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "1.5rem" }}>
            {error && (
              <div role="alert" aria-live="assertive" style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.25rem" }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>{t("chpw.current")}</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...inputBase, borderColor: fieldErrors.current_password ? c.errorText : c.inputBorder }}
                  type={showCurrent ? "text" : "password"} name="current_password"
                  value={form.current_password} onChange={handleChange} autoComplete="current-password"
                />
                <button style={eyeBtn} onClick={() => setShowCurrent((s) => !s)} aria-label={showCurrent ? "Hide current password" : "Show current password"}>{showCurrent ? "🙈" : "👁️"}</button>
              </div>
              {fieldErrors.current_password && <div style={{ fontSize: 11, color: c.errorText, marginTop: 4 }}>{fieldErrors.current_password}</div>}
            </div>

            <div style={{ borderTop: `0.5px solid ${c.border}`, margin: "16px 0" }} />

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>{t("chpw.new")}</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...inputBase, borderColor: fieldErrors.new_password ? c.errorText : c.inputBorder }}
                  type={showNew ? "text" : "password"} name="new_password"
                  value={form.new_password} onChange={handleChange} autoComplete="new-password"
                />
                <button style={eyeBtn} onClick={() => setShowNew((s) => !s)} aria-label={showNew ? "Hide new password" : "Show new password"}>{showNew ? "🙈" : "👁️"}</button>
              </div>
              {fieldErrors.new_password && <div style={{ fontSize: 11, color: c.errorText, marginTop: 4 }}>{fieldErrors.new_password}</div>}
              <PasswordStrength password={form.new_password} colors={c} />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>{t("chpw.confirm")}</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...inputBase, borderColor: fieldErrors.confirmNew ? c.errorText : c.inputBorder }}
                  type={showNew ? "text" : "password"} name="confirmNew"
                  value={confirmNew}
                  onChange={(e) => { setConfirmNew(e.target.value); setFieldErrors((prev) => ({ ...prev, confirmNew: "" })); }}
                  autoComplete="new-password"
                />
                <button style={eyeBtn} onClick={() => setShowNew((s) => !s)} aria-label={showNew ? "Hide confirm password" : "Show confirm password"}>{showNew ? "🙈" : "👁️"}</button>
              </div>
              {confirmNew && (
                <div style={{ fontSize: 11, marginTop: 4, color: form.new_password === confirmNew ? "#22c55e" : c.errorText }}>
                  {form.new_password === confirmNew ? "✓ " + t("reg.err.pwMatch").replace("do not match", "match") : "✗ " + t("chpw.err.match")}
                </div>
              )}
              {fieldErrors.confirmNew && !confirmNew && <div style={{ fontSize: 11, color: c.errorText, marginTop: 4 }}>{fieldErrors.confirmNew}</div>}
            </div>

            <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: 12, background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}>
              {loading ? t("chpw.submitting") : t("chpw.submit")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordPage;
