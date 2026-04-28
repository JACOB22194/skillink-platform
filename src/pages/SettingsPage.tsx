import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile, useProfileMutation, useChangePassword } from "../api/hooks";
import { Skeleton } from "../components/ui/Skeleton";

// ─── Theme ────────────────────────────────────────────────────────────────────

interface C {
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string; primaryBorder: string;
  inputBg: string; inputBorder: string; errorBg: string; errorBorder: string;
  errorText: string; successBg: string; successBorder: string; successText: string;
}

const getColors = (dark: boolean): C =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640", primaryBorder: "#534AB7", inputBg: "#262626", inputBorder: "#404040", errorBg: "#2a1a1a", errorBorder: "#5c2e2e", errorText: "#ff6b6b", successBg: "#0d2112", successBorder: "#1a4d2e", successText: "#4ade80" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE", primaryBorder: "#AFA9EC", inputBg: "#ffffff", inputBorder: "#dddddd", errorBg: "#fff0f0", errorBorder: "#f5c6c6", errorText: "#c0392b", successBg: "#f0fff4", successBorder: "#bbf7d0", successText: "#15803d" };

type Tab = "profile" | "security" | "payment" | "notifications";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "profile",       label: "Public Profile",        icon: "👤" },
  { id: "security",      label: "Account Security",      icon: "🔐" },
  { id: "payment",       label: "Payment & Withdrawal",  icon: "💳" },
  { id: "notifications", label: "Notifications",         icon: "🔔" },
];

// ─── Alert ────────────────────────────────────────────────────────────────────

const Alert: React.FC<{ type: "error" | "success"; msg: string; c: C }> = ({ type, msg, c }) => {
  const styles = type === "error"
    ? { bg: c.errorBg, border: c.errorBorder, color: c.errorText }
    : { bg: c.successBg, border: c.successBorder, color: c.successText };
  return (
    <div style={{ background: styles.bg, border: `0.5px solid ${styles.border}`, color: styles.color, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1rem" }}>
      {msg}
    </div>
  );
};

// ─── Tab Panels ───────────────────────────────────────────────────────────────

const PublicProfileTab: React.FC<{ c: C }> = ({ c }) => {
  const { data: profile, isLoading } = useProfile();
  const { mutate: save, isLoading: saving, isSuccess, isError, error } = useProfileMutation();

  const [bio, setBio] = useState("");
  const [rate, setRate] = useState("");
  const [skills, setSkills] = useState<string[]>([]);

  useEffect(() => {
    if (!profile) return;
    setBio(profile.bio ?? "");
    setRate(profile.hourly_rate?.toString() ?? "");
    setSkills(profile.skills ?? []);
  }, [profile]);

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 8, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 };

  const handleSave = async () => {
    await save({ profile: { bio, hourly_rate: parseFloat(rate) || 0 }, skills });
  };

  if (isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[80, "100%", "100%", 120].map((w, i) => <Skeleton key={i} width={w} height={i === 2 ? 80 : 14} dark />)}
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: c.text, margin: "0 0 1.5rem" }}>Public Profile</h2>
      {isSuccess && <Alert type="success" msg="Profile saved successfully." c={c} />}
      {isError && <Alert type="error" msg={error ?? "Failed to save."} c={c} />}

      <div style={{ marginBottom: "1.25rem" }}>
        <label style={labelStyle}>Professional Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} placeholder="Tell clients about your experience…" style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <label style={labelStyle}>Hourly Rate (USD)</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: c.subtext }}>$</span>
          <input type="number" value={rate} min={0} onChange={(e) => setRate(e.target.value)} style={{ ...inputStyle, width: 140 }} />
          <span style={{ fontSize: 13, color: c.subtext }}>/ hr</span>
        </div>
      </div>

      <div style={{ marginBottom: "1.75rem" }}>
        <label style={labelStyle}>Skills</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {skills.map((s, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "4px 10px", borderRadius: 100, background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primaryBorder}` }}>
              {s}
              <button onClick={() => setSkills(skills.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: c.primary, fontSize: 14, padding: 0, lineHeight: 1, fontFamily: "inherit" }}>×</button>
            </span>
          ))}
        </div>
        <input
          type="text"
          placeholder="Type a skill and press Enter…"
          style={inputStyle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value.trim();
              if (val && !skills.includes(val)) {
                setSkills((s) => [...s, val]);
                (e.target as HTMLInputElement).value = "";
              }
            }
          }}
        />
      </div>

      <button onClick={handleSave} disabled={saving} style={{ padding: "11px 28px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1, transition: "opacity .15s" }}>
        {saving ? "Saving…" : "Save Profile"}
      </button>
    </div>
  );
};

const SecurityTab: React.FC<{ c: C }> = ({ c }) => {
  const { mutate: changePassword, isLoading, isSuccess, isError, error, reset } = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 8, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 };

  const handleSubmit = async () => {
    setLocalError(null);
    reset();
    if (next !== confirm) { setLocalError("New passwords don't match."); return; }
    if (next.length < 8) { setLocalError("Password must be at least 8 characters."); return; }
    try {
      await changePassword({ current_password: current, new_password: next });
      setCurrent(""); setNext(""); setConfirm("");
    } catch {}
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: c.text, margin: "0 0 1.5rem" }}>Account Security</h2>

      {/* Change Password */}
      <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: c.text, marginBottom: "1rem" }}>Change Password</div>
        {isSuccess && <Alert type="success" msg="Password changed successfully." c={c} />}
        {(isError || localError) && <Alert type="error" msg={localError ?? error ?? "Failed to change password."} c={c} />}

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Current Password</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} style={inputStyle} placeholder="••••••••" />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>New Password</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} style={inputStyle} placeholder="Min. 8 characters" />
        </div>
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={labelStyle}>Confirm New Password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} placeholder="••••••••" />
        </div>
        <button onClick={handleSubmit} disabled={isLoading} style={{ padding: "11px 28px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: isLoading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: isLoading ? 0.7 : 1 }}>
          {isLoading ? "Updating…" : "Update Password"}
        </button>
      </div>

      {/* MFA */}
      <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: c.text, marginBottom: 4 }}>Two-Factor Authentication</div>
            <div style={{ fontSize: 13, color: c.subtext }}>Add an extra layer of security with an authenticator app.</div>
          </div>
          <a href="/settings/mfa" style={{ padding: "9px 18px", background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primaryBorder}`, borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", flexShrink: 0, marginLeft: 16 }}>
            Manage MFA
          </a>
        </div>
      </div>
    </div>
  );
};

const PaymentTab: React.FC<{ c: C }> = ({ c }) => {
  const { data: profile, isLoading } = useProfile();
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: c.text, margin: "0 0 1.5rem" }}>Payment & Withdrawal</h2>

      <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Wallet Balance</div>
        {isLoading
          ? <Skeleton width={100} height={32} dark />
          : <div style={{ fontSize: 32, fontWeight: 500, color: c.text }}>${profile?.wallet_balance?.toFixed(2) ?? "0.00"}</div>
        }
      </div>

      <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "1.25rem", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: c.subtext, marginBottom: 8 }}>Withdrawal methods coming soon.</div>
        <div style={{ fontSize: 12, color: c.subtext }}>Bank transfer, PayPal, and crypto withdrawals are in development.</div>
      </div>
    </div>
  );
};

const NotificationsTab: React.FC<{ c: C }> = ({ c }) => {
  const [prefs, setPrefs] = useState({
    newMatch: true, projectUpdate: true, messageReceived: true, weeklyDigest: false, promotions: false,
  });

  const toggle = (key: keyof typeof prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const items: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "newMatch",       label: "New AI Match",        desc: "When the engine finds a new project match." },
    { key: "projectUpdate",  label: "Project Updates",     desc: "Status changes in your active workrooms." },
    { key: "messageReceived",label: "New Messages",        desc: "When a client sends you a message." },
    { key: "weeklyDigest",   label: "Weekly Digest",       desc: "A summary of your activity every Monday." },
    { key: "promotions",     label: "Tips & Promotions",   desc: "Platform news and feature announcements." },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: c.text, margin: "0 0 1.5rem" }}>Notifications</h2>
      <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
        {items.map(({ key, label, desc }, i) => (
          <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < items.length - 1 ? `0.5px solid ${c.border}` : "none" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>{label}</div>
              <div style={{ fontSize: 12, color: c.subtext, marginTop: 2 }}>{desc}</div>
            </div>
            <div
              onClick={() => toggle(key)}
              style={{ width: 40, height: 22, borderRadius: 11, background: prefs[key] ? c.primary : c.inputBorder, position: "relative", cursor: "pointer", transition: "background .2s", flexShrink: 0 }}
            >
              <div style={{ position: "absolute", top: 3, left: prefs[key] ? 20 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: c.subtext, marginTop: 12 }}>
        Notification delivery is in development — preferences will be saved for when email/push is enabled.
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const s = localStorage.getItem("skilllink-darkMode");
    return s !== null ? JSON.parse(s) : true;
  });
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const c = getColors(darkMode);

  const toggleTheme = () => {
    setDarkMode((d) => { localStorage.setItem("skilllink-darkMode", JSON.stringify(!d)); return !d; });
  };

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif", fontSize: 13 }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: c.subtext, cursor: "pointer", fontSize: 18, padding: 0, fontFamily: "inherit" }}>←</button>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Skill<span style={{ color: c.primary }}>Link</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={toggleTheme} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      {/* Layout */}
      <div style={{ display: "flex", maxWidth: 1000, margin: "0 auto", padding: "2rem 1rem", gap: 24 }}>
        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Settings</div>
          {TABS.map(({ id, label, icon }) => (
            <div
              key={id}
              onClick={() => setActiveTab(id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, marginBottom: 2, cursor: "pointer", fontSize: 13, fontWeight: activeTab === id ? 500 : 400, color: activeTab === id ? c.primary : c.text, background: activeTab === id ? c.primarySoft : "transparent", border: activeTab === id ? `0.5px solid ${c.primaryBorder}` : "0.5px solid transparent", transition: "all .15s" }}
            >
              <span style={{ fontSize: 15 }}>{icon}</span>
              {label}
            </div>
          ))}
        </aside>

        {/* Content */}
        <main style={{ flex: 1, background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 16, padding: "2rem" }}>
          {activeTab === "profile"       && <PublicProfileTab c={c} />}
          {activeTab === "security"      && <SecurityTab c={c} />}
          {activeTab === "payment"       && <PaymentTab c={c} />}
          {activeTab === "notifications" && <NotificationsTab c={c} />}
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
