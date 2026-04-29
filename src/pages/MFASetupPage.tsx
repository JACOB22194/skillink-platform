/**
 * MFASetupPage.tsx
 * ─────────────────
 * POST /auth/mfa/setup → { enable: boolean }
 *   Enable  → returns { message, secret, qr_code?: "data:image/png;base64,...", provisioning_uri?: "otpauth://..." }
 *   Disable → returns { message }
 *
 * POST /auth/mfa/verify → { totp_code: string }
 *   → returns { message } on success
 *   → 400/422 with { detail: string } on failure
 *
 * Requires: Authorization header with access_token
 * Used by: Any logged-in user from their account settings
 *
 * QR Code: Uses the base64 PNG returned directly from the backend.
 * No external QR library needed.
 */

import React, { useRef, useState } from "react";
import axios, { AxiosError } from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MFASetupRequest {
  enable: boolean;
}

interface MFASetupResponse {
  message: string;
  secret?: string;
  provisioning_uri?: string;
  /** Backend-rendered base64 PNG, e.g. "data:image/png;base64,..." */
  qr_code?: string;
}

interface MFAVerifyRequest {
  totp_code: string;
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
        inputBg: "#262626",
        errorBg: "#2a1a1a", errorBorder: "#5c2e2e", errorText: "#ff6b6b",
        successBg: "#0f2a1a", successBorder: "#1a5c2e", successText: "#4ade80",
      }
    : {
        bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5",
        text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE",
        inputBg: "#ffffff",
        errorBg: "#fff0f0", errorBorder: "#f5c6c6", errorText: "#c0392b",
        successBg: "#f0fff4", successBorder: "#c6f5d5", successText: "#1a7a3c",
      };

function getAuthHeaders() {
  const token = localStorage.getItem("access_token");
  return { Authorization: `Bearer ${token}` };
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const Step: React.FC<{ num: number; label: string; active: boolean; done: boolean; colors: ThemeColors }> =
  ({ num, label, active, done, colors }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 600,
        background: done ? "#22c55e" : active ? colors.primary : colors.inputBg,
        color: done || active ? "#fff" : colors.subtext,
        border: `0.5px solid ${done ? "#22c55e" : active ? colors.primary : colors.border}`,
        flexShrink: 0,
      }}>
        {done ? "✓" : num}
      </div>
      <span style={{ fontSize: 12, color: active ? colors.text : colors.subtext, fontWeight: active ? 500 : 400 }}>{label}</span>
    </div>
  );

// ─── OTP Input ────────────────────────────────────────────────────────────────
// Six individual digit boxes for a polished TOTP code entry experience.

const OTPInput: React.FC<{ value: string; onChange: (v: string) => void; colors: ThemeColors }> = ({ value, onChange, colors }) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split("").concat(Array(6).fill("")).slice(0, 6);

  const handleChange = (idx: number, char: string) => {
    const digit = char.replace(/\D/g, "").slice(-1);
    const next = digits.map((d, i) => (i === idx ? digit : d)).join("").slice(0, 6);
    onChange(next);
    if (digit && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        const next = digits.map((d, i) => (i === idx ? "" : d)).join("");
        onChange(next);
      } else if (idx > 0) {
        inputs.current[idx - 1]?.focus();
        const next = digits.map((d, i) => (i === idx - 1 ? "" : d)).join("");
        onChange(next);
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      inputs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < 5) {
      inputs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      inputs.current[Math.min(pasted.length, 5)]?.focus();
      e.preventDefault();
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {Array.from({ length: 6 }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => { inputs.current[idx] = el; }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={digits[idx] ?? ""}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          style={{
            width: 44,
            height: 52,
            textAlign: "center",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 0,
            fontFamily: "monospace",
            background: colors.inputBg,
            border: `1.5px solid ${digits[idx] ? colors.primary : colors.border}`,
            borderRadius: 10,
            color: colors.text,
            outline: "none",
            caretColor: colors.primary,
            transition: "border-color 0.15s",
          }}
        />
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const MFASetupPage: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  React.useEffect(() => {
    axios.get(`${API_BASE_URL}/users/me`, { headers: getAuthHeaders() })
      .then(res => {
        console.log("MFA Status loaded:", res.data.mfa_enabled);
        setMfaEnabled(res.data.mfa_enabled);
      })
      .catch((err) => {
        console.error("Failed to load MFA status:", err);
      })
      .finally(() => setInitLoading(false));
  }, []);

  /**
   * step 1 = intro / "enable" CTA
   * step 2 = scan QR code
   * step 3 = enter 6-digit confirmation code   ← NEW
   * step 4 = success / done
   */
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Enable flow data
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [qrCodeFallback, setQrCodeFallback] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);

  // Confirmation step
  const [otpCode, setOtpCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const c = getColors(darkMode);

  const toggleTheme = () => {
    setDarkMode((d) => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  // ── Enable MFA (Step 1 → 2) ──
  const handleEnable = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setProvisioningUri(null);
    setQrCodeFallback(null);
    setSecret(null);
    
    // Validate token exists
    const token = localStorage.getItem("access_token");
    if (!token) {
      setError("Authentication required. Please log in again.");
      setLoading(false);
      return;
    }
    
    try {
      console.log("Enabling MFA... Sending request to:", `${API_BASE_URL}/auth/mfa/setup`);
      const response = await axios.post<MFASetupResponse>(
        `${API_BASE_URL}/auth/mfa/setup`,
        { enable: true } as MFASetupRequest,
        { 
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );
      const data = response.data;
      console.log("MFA Setup Response:", data);
      
      // Backend returns qr_code (base64 PNG) — use it directly
      // Also accept provisioning_uri as a fallback signal
      if (!data.qr_code && !data.provisioning_uri) {
        setError("Server did not return QR code data. Please try again.");
        setLoading(false);
        return;
      }
      
      // Use backend-provided base64 PNG (qr_code field)
      setQrCodeFallback(data.qr_code || null);
      setProvisioningUri(data.provisioning_uri || null);
      setSecret(data.secret || null);
      setOtpCode("");
      setSuccessMsg("QR code generated! Scan it with your authenticator app.");
      setStep(2);
    } catch (err) {
      console.error("MFA Setup Error:", err);
      const e = err as AxiosError<ApiError>;
      const errorMsg = e.response?.data?.detail 
        || e.response?.statusText 
        || e.message 
        || "Failed to enable MFA. Please check your connection and try again.";
      setError(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Advance Scan → Confirm (Step 2 → 3) ──
  const handleScanned = () => {
    setError(null);
    setSuccessMsg(null);
    setOtpCode("");
    setStep(3);
  };

  // ── Verify 6-digit code (Step 3 → 4) ──
  const handleVerify = async () => {
    if (otpCode.length !== 6) {
      setError("Please enter the full 6-digit code from your authenticator app.");
      return;
    }
    
    const token = localStorage.getItem("access_token");
    if (!token) {
      setError("Authentication required. Please log in again.");
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      console.log("Verifying MFA code...");
      await axios.post<{ message: string }>(
        `${API_BASE_URL}/auth/mfa/verify`,
        { totp_code: otpCode },
        { 
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );
      console.log("MFA verification successful!");
      setMfaEnabled(true);
      setSuccessMsg("✅ MFA has been successfully enabled on your account!");
      setStep(4);
    } catch (err) {
      console.error("MFA Verification Error:", err);
      const e = err as AxiosError<ApiError>;
      const errorMsg = e.response?.data?.detail 
        || e.response?.statusText 
        || e.message 
        || "Invalid code. Please try again.";
      setError(`${errorMsg}`);
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  };

  // ── Disable MFA ──
  const handleDisable = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setError("Authentication required. Please log in again.");
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      console.log("Disabling MFA...");
      const { data } = await axios.post<MFASetupResponse>(
        `${API_BASE_URL}/auth/mfa/setup`,
        { enable: false } as MFASetupRequest,
        { 
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );
      console.log("MFA disabled successfully");
      setMfaEnabled(false);
      setSuccessMsg(data.message || "MFA has been disabled on your account.");
      setStep(1);
    } catch (err) {
      console.error("MFA Disable Error:", err);
      const e = err as AxiosError<ApiError>;
      const errorMsg = e.response?.data?.detail 
        || e.response?.statusText 
        || e.message 
        || "Failed to disable MFA.";
      setError(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const sharedCard: React.CSSProperties = { background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 };
  const btnPrimary: React.CSSProperties = { padding: "10px 20px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 };
  const btnOutline: React.CSSProperties = { padding: "10px 20px", background: "transparent", color: c.text, border: `0.5px solid ${c.border}`, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };

  // Step indicators shared between steps 2 & 3
  const stepIndicators = (
    <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
      <Step num={1} label="Install app"  active={false}    done={true}      colors={c} />
      <div style={{ color: c.subtext, alignSelf: "center" }}>→</div>
      <Step num={2} label="Scan QR code" active={step === 2} done={step > 2} colors={c} />
      <div style={{ color: c.subtext, alignSelf: "center" }}>→</div>
      <Step num={3} label="Confirm code" active={step === 3} done={step > 3} colors={c} />
      <div style={{ color: c.subtext, alignSelf: "center" }}>→</div>
      <Step num={4} label="Done"         active={false}    done={step === 4} colors={c} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: c.bg, fontFamily: "sans-serif", color: c.text }}>
      {initLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: c.subtext }}>Loading...</div>
      ) : (
        <>
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

      <div style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>

        {/* Page title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 4px" }}>Two-Factor Authentication</h1>
          <p style={{ fontSize: 13, color: c.subtext, margin: 0 }}>
            Add an extra layer of security to your SkillLink account using your authenticator app.
          </p>
        </div>

        {/* Status card */}
        <div style={{ ...sharedCard, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: mfaEnabled ? "rgba(34,197,94,.15)" : c.primarySoft, color: mfaEnabled ? "#22c55e" : c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              {mfaEnabled ? "🔒" : "🔓"}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                MFA is currently <span style={{ color: mfaEnabled ? "#22c55e" : "#f59e0b" }}>{mfaEnabled ? "enabled" : "disabled"}</span>
              </div>
              <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>
                {mfaEnabled ? "Your account is protected with TOTP authentication." : "Enable MFA to secure your account."}
              </div>
            </div>
          </div>
          {mfaEnabled && (
            <button onClick={handleDisable} disabled={loading} style={{ ...btnOutline, fontSize: 12, padding: "6px 14px", borderColor: "#ef4444", color: "#ef4444" }}>
              {loading ? "..." : "Disable"}
            </button>
          )}
        </div>

        {/* Error / success banners */}
        {error && (
          <div style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "12px 14px", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ flexShrink: 0, marginTop: 2 }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div style={{ background: c.successBg, border: `0.5px solid ${c.successBorder}`, color: c.successText, borderRadius: 8, padding: "12px 14px", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ flexShrink: 0, marginTop: 2 }}>✅</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* ── Step 1: Intro ── */}
        {!mfaEnabled && step === 1 && (
          <div style={sharedCard}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>How it works</div>
              {[
                { icon: "📱", title: "Install an authenticator app", desc: "Download Google Authenticator or Authy on your phone." },
                { icon: "📷", title: "Scan the QR code", desc: "Use the app to scan a QR code unique to your account." },
                { icon: "🔑", title: "Enter the 6-digit code", desc: "Confirm setup, then use the code at each login." },
              ].map((item) => (
                <div key={item.title} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleEnable} disabled={loading} style={btnPrimary}>
              {loading ? "Setting up..." : "Enable two-factor authentication"}
            </button>
          </div>
        )}

        {/* ── Step 2: Scan QR ── */}
        {step === 2 && qrCodeFallback ? (
          <div style={sharedCard}>
            {stepIndicators}

            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Scan this QR code with your authenticator app</div>
              <div style={{ display: "inline-block", background: "#fff", padding: 12, borderRadius: 8, border: `0.5px solid ${c.border}` }}>
                {qrCodeFallback ? (
                  // Backend-rendered base64 PNG QR code
                  <img src={qrCodeFallback} alt="MFA QR code" style={{ width: 180, height: 180, display: "block" }} />
                ) : (
                  <div style={{ fontSize: 12, color: c.subtext, padding: "20px", textAlign: "center", width: 180 }}>QR code unavailable</div>
                )}
              </div>
            </div>

            {/* Manual entry */}
            <div style={{ background: c.inputBg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: c.subtext }}>Can't scan? Enter this secret manually:</span>
                <button onClick={() => setSecretVisible((s) => !s)} style={{ background: "none", border: "none", cursor: "pointer", color: c.primary, fontSize: 11, fontFamily: "inherit", padding: 0 }}>
                  {secretVisible ? "Hide" : "Show"}
                </button>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 13, letterSpacing: ".1em", color: c.text, wordBreak: "break-all" }}>
                {secretVisible ? secret : "••••••••••••••••••••••••••••••••"}
              </div>
              {secretVisible && secret && (
                <button
                  onClick={() => navigator.clipboard.writeText(secret)}
                  style={{ marginTop: 8, fontSize: 11, color: c.primary, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                >
                  📋 Copy to clipboard
                </button>
              )}
            </div>

            <div style={{ background: "rgba(245,158,11,.08)", border: "0.5px solid rgba(245,158,11,.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#f59e0b" }}>
                ⚠️ Save this secret somewhere safe. If you lose access to your authenticator app and don't have this secret, you'll be locked out of your account.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setStep(1); setError(null); setSuccessMsg(null); }} style={btnOutline}>Back</button>
              <button onClick={handleScanned} style={{ ...btnPrimary, flex: 1 }}>I've scanned the code →</button>
            </div>
          </div>
        ) : step === 2 ? (
          <div style={sharedCard}>
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div style={{ color: c.errorText, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>QR Code Generation Failed</div>
              <div style={{ fontSize: 12, color: c.subtext, marginBottom: 16 }}>
                {error || "The server didn't return QR code data. Please try again."}
              </div>
              <button onClick={() => { setStep(1); setError(null); setSuccessMsg(null); setProvisioningUri(null); setQrCodeFallback(null); }} style={btnPrimary}>
                Back to start
              </button>
            </div>
          </div>
        ) : null}

        {/* ── Step 3: Confirm 6-digit code ── */}
        {step === 3 && (
          <div style={sharedCard}>
            {stepIndicators}

            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 18, marginBottom: 8 }}>🔢</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Enter the code from your authenticator app</div>
              <div style={{ fontSize: 11, color: c.subtext }}>
                Open your authenticator app and enter the 6-digit code shown for SkillLink.
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <OTPInput value={otpCode} onChange={setOtpCode} colors={c} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setStep(2); setError(null); setSuccessMsg(null); setOtpCode(""); }} style={btnOutline}>Back</button>
              <button
                onClick={handleVerify}
                disabled={loading || otpCode.length !== 6}
                style={{ ...btnPrimary, flex: 1, opacity: (loading || otpCode.length !== 6) ? 0.6 : 1 }}
              >
                {loading ? "Verifying..." : "Confirm & enable MFA"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <div style={{ ...sharedCard, textAlign: "center", padding: "2.5rem" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>MFA is now enabled</div>
            <div style={{ fontSize: 13, color: c.subtext, marginBottom: 24 }}>
              Your account is now protected with two-factor authentication. You'll need your authenticator app at every login.
            </div>
            <a href="/dashboard/freelancer" style={{ display: "inline-block", padding: "10px 24px", background: c.primary, color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
              Back to dashboard
            </a>
          </div>
        )}

      </div>
        </>
      )}
    </div>
  );
};

export default MFASetupPage;