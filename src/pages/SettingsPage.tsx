import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  useProfile, useProfileMutation, useChangePassword,
  useOptimizeBio, usePortfolio, usePortfolioAddLink,
  usePortfolioUpload, usePortfolioDelete,
} from "../api/hooks";
import type { AvailabilityStatus, PortfolioItem } from "../api/types";
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

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string; color: string; bg: string }[] = [
  { value: "available",   label: "Available",   color: "#16a34a", bg: "#dcfce7" },
  { value: "busy",        label: "Busy",        color: "#b45309", bg: "#fef3c7" },
  { value: "unavailable", label: "Unavailable", color: "#6b7280", bg: "#f3f4f6" },
];

const PublicProfileTab: React.FC<{ c: C }> = ({ c }) => {
  const { data: profile, isLoading, refetch } = useProfile();
  const { mutate: save, isLoading: saving, isSuccess, isError, error } = useProfileMutation();
  const { mutate: optimizeBio, isLoading: optimizing } = useOptimizeBio();
  const { data: portfolioItems, isLoading: portfolioLoading, refetch: refetchPortfolio } = usePortfolio();
  const { mutate: addLink, isLoading: addingLink } = usePortfolioAddLink();
  const { mutate: uploadFile, isLoading: uploading } = usePortfolioUpload();
  const { mutate: deleteItem } = usePortfolioDelete();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [bio, setBio] = useState("");
  const [rate, setRate] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [availability, setAvailability] = useState<AvailabilityStatus>("available");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [bioOptimizeMsg, setBioOptimizeMsg] = useState<string | null>(null);

  const [portfolioMode, setPortfolioMode] = useState<"idle" | "link" | "file">("idle");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [selectedPortfolioFile, setSelectedPortfolioFile] = useState<File | null>(null);
  const [portfolioMsg, setPortfolioMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

  useEffect(() => {
    if (!profile) return;
    setFirstName((profile as any).first_name ?? "");
    setLastName((profile as any).last_name ?? "");
    setBio(profile.bio ?? "");
    setRate(profile.hourly_rate?.toString() ?? "");
    setSkills(profile.skills ?? []);
    setAvailability(profile.availability_status ?? "available");
    setAvatarUrl((profile as any).avatar_url ?? null);
  }, [profile]);

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 8, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 };

  const handleSave = async () => {
    await save({
      profile: {
        bio,
        hourly_rate: parseFloat(rate) || 0,
        availability_status: availability,
        first_name: firstName.trim() || undefined,
        last_name:  lastName.trim()  || undefined,
      },
      skills,
    });
    refetch();
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) return;
    setAvatarMsg(null);
    const fd = new FormData();
    fd.append("file", avatarFile);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE}/users/me/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAvatarUrl(data.avatar_url);
      setAvatarFile(null);
      setAvatarMsg("Profile picture updated!");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    } catch {
      setAvatarMsg("Upload failed. Try again.");
    }
  };

  const handleOptimizeBio = async () => {
    setBioOptimizeMsg(null);
    try {
      const result = await optimizeBio({ bio, skills });
      setBio(result.optimized_bio);
      setBioOptimizeMsg("Bio optimized — review and save when ready.");
    } catch {
      setBioOptimizeMsg("Could not reach AI service. Try again.");
    }
  };

  const handleAddLink = async () => {
    if (!linkTitle.trim() || !linkUrl.trim()) return;
    setPortfolioMsg(null);
    try {
      await addLink({ title: linkTitle.trim(), url: linkUrl.trim() });
      setLinkTitle(""); setLinkUrl(""); setPortfolioMode("idle");
      refetchPortfolio();
      setPortfolioMsg({ text: "Link added.", ok: true });
    } catch {
      setPortfolioMsg({ text: "Failed to add link.", ok: false });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setSelectedPortfolioFile(f);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setSelectedPortfolioFile(f);
  };

  const handleUploadFile = async () => {
    if (!selectedPortfolioFile || !fileTitle.trim()) {
      setPortfolioMsg({ text: !fileTitle.trim() ? "Please enter a title first." : "Please select a file.", ok: false });
      return;
    }
    setPortfolioMsg(null);
    try {
      await uploadFile({ file: selectedPortfolioFile, title: fileTitle.trim() });
      setFileTitle(""); setSelectedPortfolioFile(null); setPortfolioMode("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
      refetchPortfolio();
      setPortfolioMsg({ text: "File uploaded.", ok: true });
    } catch {
      setPortfolioMsg({ text: "Upload failed.", ok: false });
    }
  };

  const handleDelete = async (itemId: number) => {
    try {
      await deleteItem(itemId);
      refetchPortfolio();
    } catch {}
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

      {/* ── Avatar ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={labelStyle}>Profile Picture</label>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {avatarUrl ? (
            <img src={`http://localhost:8000${avatarUrl}`} alt="avatar" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: `0.5px solid ${c.border}` }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 600, border: `0.5px solid ${c.primaryBorder}` }}>
              {(firstName?.[0] ?? "") + (lastName?.[0] ?? "") || "?"}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={e => setAvatarFile(e.target.files?.[0] ?? null)} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => avatarInputRef.current?.click()} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: c.inputBg, color: c.text, border: `0.5px solid ${c.inputBorder}`, cursor: "pointer", fontFamily: "inherit" }}>
                {avatarFile ? avatarFile.name : "Choose Image"}
              </button>
              {avatarFile && (
                <button onClick={handleAvatarUpload} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: c.primary, color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Upload</button>
              )}
            </div>
            {avatarMsg && <div style={{ fontSize: 12, marginTop: 6, color: avatarMsg.includes("failed") ? "#ef4444" : "#16a34a" }}>{avatarMsg}</div>}
          </div>
        </div>
      </div>

      {/* ── Name ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: "1.25rem" }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>First Name</label>
          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Last Name</label>
          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" style={inputStyle} />
        </div>
      </div>

      {/* ── Availability Status ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={labelStyle}>Availability Status</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {AVAILABILITY_OPTIONS.map(({ value, label, color, bg }) => (
            <button
              key={value}
              onClick={() => setAvailability(value)}
              style={{
                padding: "7px 16px", borderRadius: 100, fontSize: 13, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
                background: availability === value ? bg : c.inputBg,
                color: availability === value ? color : c.subtext,
                border: `0.5px solid ${availability === value ? color : c.inputBorder}`,
              }}
            >
              {availability === value ? "● " : "○ "}{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bio + Optimize ── */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Professional Bio</label>
          <button
            onClick={handleOptimizeBio}
            disabled={optimizing}
            style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primaryBorder}`,
              cursor: optimizing ? "not-allowed" : "pointer", fontFamily: "inherit",
              opacity: optimizing ? 0.6 : 1,
            }}
          >
            {optimizing ? "Optimizing…" : "✦ Optimize Bio"}
          </button>
        </div>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} placeholder="Tell clients about your experience…" style={{ ...inputStyle, resize: "vertical" }} />
        {bioOptimizeMsg && (
          <div style={{ fontSize: 12, marginTop: 6, color: bioOptimizeMsg.includes("Could not") ? "#ef4444" : "#16a34a" }}>
            {bioOptimizeMsg}
          </div>
        )}
      </div>

      {/* ── Hourly Rate ── */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label style={labelStyle}>Hourly Rate (USD)</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: c.subtext }}>$</span>
          <input type="number" value={rate} min={0} onChange={(e) => setRate(e.target.value)} style={{ ...inputStyle, width: 140 }} />
          <span style={{ fontSize: 13, color: c.subtext }}>/ hr</span>
        </div>
      </div>

      {/* ── Skills ── */}
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

      {/* ── Save Profile ── */}
      <button onClick={handleSave} disabled={saving} style={{ padding: "11px 28px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1, transition: "opacity .15s", marginBottom: "2rem" }}>
        {saving ? "Saving…" : "Save Profile"}
      </button>

      {/* ── Portfolio ── */}
      <div style={{ borderTop: `0.5px solid ${c.border}`, paddingTop: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: c.text }}>Portfolio</div>
            <div style={{ fontSize: 12, color: c.subtext, marginTop: 2 }}>Upload files or add external links (GitHub, Behance, etc.)</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPortfolioMode(m => m === "link" ? "idle" : "link")} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: portfolioMode === "link" ? c.primarySoft : c.bg, color: portfolioMode === "link" ? c.primary : c.text, border: `0.5px solid ${portfolioMode === "link" ? c.primaryBorder : c.border}`, cursor: "pointer", fontFamily: "inherit" }}>
              + Add Link
            </button>
            <button onClick={() => setPortfolioMode(m => m === "file" ? "idle" : "file")} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: portfolioMode === "file" ? c.primarySoft : c.bg, color: portfolioMode === "file" ? c.primary : c.text, border: `0.5px solid ${portfolioMode === "file" ? c.primaryBorder : c.border}`, cursor: "pointer", fontFamily: "inherit" }}>
              + Upload File
            </button>
          </div>
        </div>

        {portfolioMsg && (
          <div style={{ fontSize: 12, marginBottom: 10, color: portfolioMsg.ok ? "#16a34a" : "#ef4444" }}>{portfolioMsg.text}</div>
        )}

        {/* Add link form */}
        {portfolioMode === "link" && (
          <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 10 }}>Add External Link</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="text" placeholder="Title (e.g. GitHub Profile, Behance Portfolio)" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} style={inputStyle} />
              <input type="url" placeholder="https://github.com/username" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} style={inputStyle} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleAddLink} disabled={addingLink || !linkTitle.trim() || !linkUrl.trim()} style={{ padding: "8px 18px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: addingLink ? 0.6 : 1 }}>
                  {addingLink ? "Adding…" : "Add"}
                </button>
                <button onClick={() => { setPortfolioMode("idle"); setLinkTitle(""); setLinkUrl(""); }} style={{ padding: "8px 14px", background: "transparent", border: `0.5px solid ${c.border}`, color: c.subtext, borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload file form */}
        {portfolioMode === "file" && (
          <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 10 }}>Upload Portfolio File</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="text" placeholder="Title (e.g. UI Design Mockup)" value={fileTitle} onChange={e => setFileTitle(e.target.value)} style={inputStyle} />
              {/* Custom drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                style={{ border: `1.5px dashed ${selectedPortfolioFile ? c.primary : c.inputBorder}`, borderRadius: 8, padding: "16px 12px", textAlign: "center", cursor: "pointer", background: selectedPortfolioFile ? c.primarySoft : "transparent", transition: "border-color .2s" }}
              >
                {selectedPortfolioFile ? (
                  <div>
                    <div style={{ fontSize: 13, color: c.primary, fontWeight: 500 }}>📎 {selectedPortfolioFile.name}</div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 3 }}>{(selectedPortfolioFile.size / 1024).toFixed(0)} KB · Click to change</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, color: c.subtext }}>Click to select file</div>
                    <div style={{ fontSize: 11, color: c.subtext, opacity: .6, marginTop: 3 }}>or drag and drop · PDF, PNG, JPG, ZIP, Word</div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.zip,.doc,.docx" onChange={handleFileSelect} style={{ display: "none" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleUploadFile} disabled={uploading || !selectedPortfolioFile || !fileTitle.trim()} style={{ padding: "8px 18px", background: uploading || !selectedPortfolioFile || !fileTitle.trim() ? c.inputBorder : c.primary, color: uploading || !selectedPortfolioFile || !fileTitle.trim() ? c.subtext : "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: uploading || !selectedPortfolioFile || !fileTitle.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 500, transition: "background .2s" }}>
                  {uploading ? "Uploading…" : "Upload"}
                </button>
                <button onClick={() => { setPortfolioMode("idle"); setFileTitle(""); setSelectedPortfolioFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} style={{ padding: "8px 14px", background: "transparent", border: `0.5px solid ${c.border}`, color: c.subtext, borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Portfolio items list */}
        {portfolioLoading ? (
          <div style={{ fontSize: 13, color: c.subtext }}>Loading portfolio…</div>
        ) : !portfolioItems || portfolioItems.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", background: c.bg, border: `0.5px dashed ${c.border}`, borderRadius: 10, fontSize: 13, color: c.subtext }}>
            No portfolio items yet. Add links or upload files above.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {portfolioItems.map((item: PortfolioItem) => (
              <div key={item.item_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 16 }}>{item.type === "file" ? "📎" : "🔗"}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: c.primary, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                        {item.url}
                      </a>
                    )}
                  </div>
                </div>
                <button onClick={() => handleDelete(item.item_id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18, padding: "0 4px", flexShrink: 0, fontFamily: "inherit" }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
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

interface WalletTx { transaction_id: number; amount: number; type: string; description: string; created_at: string; }

const PaymentTab: React.FC<{ c: C }> = ({ c }) => {
  const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("access_token")}` });

  const { data: profile, isLoading, refetch } = useProfile();
  const [amount, setAmount]   = useState("");
  const [txs, setTxs]         = useState<WalletTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    setTxLoading(true);
    fetch(`${API}/wallet/transactions`, { headers: auth() })
      .then(r => r.ok ? r.json() : [])
      .then(setTxs)
      .finally(() => setTxLoading(false));
  }, []);

  const withdraw = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 5) { setMsg({ text: "Minimum withdrawal is $5.00", ok: false }); return; }
    setWithdrawing(true); setMsg(null);
    try {
      const r = await fetch(`${API}/wallet/withdraw`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setMsg({ text: d.message, ok: true });
      setAmount("");
      refetch();
      const tr = await fetch(`${API}/wallet/transactions`, { headers: auth() });
      if (tr.ok) setTxs(await tr.json());
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally { setWithdrawing(false); }
  };

  const inputStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 8, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: c.text, margin: "0 0 1.5rem" }}>Payment & Withdrawal</h2>

      {/* Balance */}
      <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Wallet Balance</div>
        {isLoading
          ? <Skeleton width={100} height={32} dark />
          : <div style={{ fontSize: 32, fontWeight: 500, color: c.text }}>${profile?.wallet_balance?.toFixed(2) ?? "0.00"}</div>
        }
      </div>

      {/* Withdraw form */}
      <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: c.text, marginBottom: "1rem" }}>Withdraw Funds</div>
        {msg && <Alert type={msg.ok ? "success" : "error"} msg={msg.text} c={c} />}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "0.75rem" }}>
          <span style={{ color: c.subtext, fontSize: 14 }}>$</span>
          <input type="number" min={5} step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" style={{ ...inputStyle, width: 140 }} />
          <span style={{ fontSize: 12, color: c.subtext }}>min. $5.00</span>
        </div>
        <button onClick={withdraw} disabled={withdrawing} style={{ padding: "10px 24px", background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: withdrawing ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: withdrawing ? 0.7 : 1 }}>
          {withdrawing ? "Processing…" : "Withdraw"}
        </button>
      </div>

      {/* Transaction history */}
      <div style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: `0.5px solid ${c.border}`, fontSize: 15, fontWeight: 500, color: c.text }}>Transaction History</div>
        {txLoading ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: c.subtext, fontSize: 13 }}>Loading…</div>
        ) : txs.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: c.subtext, fontSize: 13 }}>No transactions yet.</div>
        ) : txs.map((tx, i) => (
          <div key={tx.transaction_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 1.25rem", borderBottom: i < txs.length - 1 ? `0.5px solid ${c.border}` : "none" }}>
            <div>
              <div style={{ fontSize: 13, color: c.text, fontWeight: 500 }}>{tx.description}</div>
              <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{new Date(tx.created_at).toLocaleDateString()}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: tx.type === "withdraw" ? "#f05070" : "#22d3a0" }}>
              {tx.type === "withdraw" ? "-" : "+"}${tx.amount.toFixed(2)}
            </div>
          </div>
        ))}
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
