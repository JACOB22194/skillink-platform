import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, getAuthHeaders } from "../shared/api";
import { useLanguage } from "../shared/LanguageContext";

interface C {
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string; inputBg: string; inputBorder: string;
  successText: string; errorText: string;
}

const getColors = (dark: boolean): C =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640", inputBg: "#262626", inputBorder: "#404040", successText: "#4ade80", errorText: "#ff6b6b" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE", inputBg: "#ffffff", inputBorder: "#dddddd", successText: "#15803d", errorText: "#c0392b" };

const ClientSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const [darkMode] = useState(() => {
    const s = localStorage.getItem("skilllink-darkMode");
    return s !== null ? JSON.parse(s) : true;
  });
  const c = getColors(darkMode);

  const [companyName, setCompanyName] = useState("");
  const [avatarUrl, setAvatarUrl]     = useState<string | null>(null);
  const [avatarFile, setAvatarFile]   = useState<File | null>(null);

  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, profileRes] = await Promise.all([
          fetch(`${API_BASE_URL}/users/me`, getAuthHeaders()),
          fetch(`${API_BASE_URL}/users/me/profile`, getAuthHeaders()),
        ]);
        if (meRes.ok) {
          const me = await meRes.json();
          setAvatarUrl(me.avatar_url ?? null);
        }
        if (profileRes.ok) {
          const p = await profileRes.json();
          setCompanyName(p.company_name ?? "");
          if (p.avatar_url) setAvatarUrl(p.avatar_url);
        }
      } catch {}
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const params = new URLSearchParams();
      if (companyName.trim()) params.append("company_name", companyName.trim());
      const res = await fetch(`${API_BASE_URL}/users/me/profile?${params}`, {
        method: "PUT",
        ...getAuthHeaders(),
      });
      if (!res.ok) throw new Error();
      setSaveMsg({ text: t("clset.saved"), ok: true });
    } catch {
      setSaveMsg({ text: t("clset.saveFailed"), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) return;
    setAvatarMsg(null);
    const fd = new FormData();
    fd.append("file", avatarFile);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE_URL}/users/me/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAvatarUrl(data.avatar_url);
      setAvatarFile(null);
      setAvatarMsg(t("clset.saved"));
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    } catch {
      setAvatarMsg(t("clset.uploadFailed"));
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: `0.5px solid ${c.inputBorder}`, borderRadius: 8,
    background: c.inputBg, color: c.text, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6,
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <button onClick={() => navigate("/dashboard/client")} style={{ background: "none", border: "none", cursor: "pointer", color: c.subtext, fontSize: 18, padding: 0 }}>
          {isRTL ? "→" : "←"}
        </button>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{t("clset.title")}</span>
      </div>

      <div style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem" }}>
        <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "1.5rem" }}>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 1.5rem", color: c.text }}>{t("clset.company")}</h2>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={labelStyle}>{t("clset.logo")}</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {avatarUrl ? (
                <img src={`${API_BASE_URL}${avatarUrl}`} alt="avatar" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: `0.5px solid ${c.border}` }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, border: `0.5px solid ${c.border}` }}>
                  {(companyName?.[0] ?? "C").toUpperCase()}
                </div>
              )}
              <div>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={e => setAvatarFile(e.target.files?.[0] ?? null)} aria-label="Upload profile picture" />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => avatarInputRef.current?.click()} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: c.inputBg, color: c.text, border: `0.5px solid ${c.inputBorder}`, cursor: "pointer", fontFamily: "inherit" }}>
                    {avatarFile ? avatarFile.name : t("clset.choose")}
                  </button>
                  {avatarFile && (
                    <button onClick={handleAvatarUpload} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: c.primary, color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      {t("clset.upload")}
                    </button>
                  )}
                </div>
                {avatarMsg && <div style={{ fontSize: 12, marginTop: 6, color: avatarMsg.includes("failed") || avatarMsg.includes("فشل") ? c.errorText : c.successText }}>{avatarMsg}</div>}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={labelStyle}>{t("clset.companyName")}</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Corp" style={inputStyle} />
          </div>

          {saveMsg && (
            <div style={{ fontSize: 13, marginBottom: "1rem", color: saveMsg.ok ? c.successText : c.errorText }}>{saveMsg.text}</div>
          )}

          <button onClick={handleSave} disabled={saving} style={{ padding: "11px 28px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
            {saving ? t("clset.saving") : t("clset.save")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientSettingsPage;
