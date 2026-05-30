import React, { useState, useEffect } from "react";
import apiClient from "../../api/client";
import { type ThemeColors, API_BASE_CLIENT } from "./clientShared";

const INDUSTRIES = ["Technology", "Finance", "Healthcare", "Education", "E-Commerce", "Marketing", "Design", "Consulting", "Real Estate", "Other"];
const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–500", "500+"];

interface ClientProfile { client_id: number; company_name: string | null; }
interface VerifStatus { status: string; document_type: string | null; rejection_note: string | null; reviewed_at: string | null; created_at: string | null; }

const CompanyProfileView: React.FC<{ colors: ThemeColors; onSave: (name: string) => void }> = ({ colors: c, onSave }) => {
  const [companyName,  setCompanyName]  = useState("");
  const [website,      setWebsite]      = useState("");
  const [industry,     setIndustry]     = useState("");
  const [size,         setSize]         = useState("");
  const [description,  setDescription]  = useState("");
  const [location,     setLocation]     = useState("");
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [feedback,     setFeedback]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeTab,    setActiveTab]    = useState<"general" | "details" | "verification">("general");

  const [verifStatus,  setVerifStatus]  = useState<VerifStatus | null>(null);
  const [verifLoading, setVerifLoading] = useState(false);
  const [verifDocType, setVerifDocType] = useState("passport");
  const [verifFile,    setVerifFile]    = useState<File | null>(null);
  const [verifMsg,     setVerifMsg]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [cancelling,   setCancelling]   = useState(false);

  const fetchVerifStatus = async () => {
    try {
      const r = await apiClient.get<VerifStatus>("/verification/status");
      setVerifStatus(r.data);
    } catch {}
  };

  useEffect(() => {
    apiClient.get<ClientProfile>("/users/me/profile")
      .then(r => {
        setCompanyName(r.data.company_name || "");
        const saved = JSON.parse(localStorage.getItem("skilllink-company-meta") || "{}");
        setWebsite(saved.website || "");
        setIndustry(saved.industry || "");
        setSize(saved.size || "");
        setDescription(saved.description || "");
        setLocation(saved.location || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchVerifStatus();
  }, []);

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await apiClient.put("/users/me/profile", { company_name: companyName });
      localStorage.setItem("skilllink-company-meta", JSON.stringify({ website, industry, size, description, location }));
      onSave(companyName);
      setFeedback({ msg: "✓ Profile saved successfully!", ok: true });
    } catch {
      setFeedback({ msg: "✗ Failed to save changes.", ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const submitVerification = async () => {
    if (!verifFile) return;
    setVerifLoading(true);
    setVerifMsg(null);
    try {
      const fd = new FormData();
      fd.append("document_type", verifDocType);
      fd.append("file", verifFile);
      const res = await fetch(`${API_BASE_CLIENT}/verification/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed.");
      setVerifMsg({ msg: "✓ Document submitted. Under review.", ok: true });
      setVerifFile(null);
      await fetchVerifStatus();
    } catch (e: any) {
      setVerifMsg({ msg: (e as Error).message || "Upload failed.", ok: false });
    } finally {
      setVerifLoading(false);
      setTimeout(() => setVerifMsg(null), 5000);
    }
  };

  const cancelVerification = async () => {
    setCancelling(true);
    try {
      await apiClient.delete("/verification/cancel");
      await fetchVerifStatus();
    } catch {} finally {
      setCancelling(false);
    }
  };

  const initials = companyName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "CO";
  const completeness = [companyName, website, industry, size, description, location].filter(Boolean).length;
  const completePct = Math.round((completeness / 6) * 100);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", fontSize: 13,
    background: c.bg, color: c.text,
    border: `1px solid ${c.border}`, borderRadius: 8,
    outline: "none", boxSizing: "border-box", transition: "border-color .2s",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600,
    color: c.subtext, marginBottom: 6,
    textTransform: "uppercase", letterSpacing: ".06em",
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${c.border}`, borderTopColor: c.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", maxWidth: 800, animation: "fadeIn 0.4s ease" }}>

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: c.text, margin: 0 }}>Company Profile</h2>
        <p style={{ fontSize: 13, color: c.subtext, margin: "4px 0 0" }}>Manage your corporate identity and visibility on SkillLink.</p>
      </div>

      {/* Hero card */}
      <div style={{ background: `linear-gradient(135deg, ${c.primarySoft} 0%, ${c.surface} 60%)`, border: `1px solid ${c.border}`, borderRadius: 16, padding: 24, marginBottom: 24, display: "flex", alignItems: "center", gap: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -40, top: -40, width: 160, height: 160, borderRadius: "50%", background: `rgba(127,119,221,.08)`, pointerEvents: "none" }} />
        <div style={{ width: 72, height: 72, borderRadius: 18, background: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "#fff", flexShrink: 0, boxShadow: `0 4px 20px rgba(127,119,221,.35)` }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: c.text }}>{companyName || "Your Company"}</div>
          <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>
            {industry && <span style={{ marginRight: 12 }}>🏢 {industry}</span>}
            {location && <span style={{ marginRight: 12 }}>📍 {location}</span>}
            {size     && <span>👥 {size} employees</span>}
          </div>
          {website && (
            <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: c.primary, textDecoration: "none", marginTop: 4, display: "inline-block" }}>
              🔗 {website}
            </a>
          )}
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ position: "relative", width: 56, height: 56, margin: "0 auto 6px" }}>
            <svg viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)", width: 56, height: 56 }}>
              <circle cx="28" cy="28" r="22" fill="none" stroke={c.border} strokeWidth="5" />
              <circle cx="28" cy="28" r="22" fill="none" stroke={c.primary} strokeWidth="5"
                strokeDasharray={`${2 * Math.PI * 22}`}
                strokeDashoffset={`${2 * Math.PI * 22 * (1 - completePct / 100)}`}
                strokeLinecap="round" style={{ transition: "stroke-dashoffset .6s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: c.text }}>{completePct}%</div>
          </div>
          <div style={{ fontSize: 10, color: c.subtext, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Complete</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {(["general", "details", "verification"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: "7px 20px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all .2s",
              background: activeTab === tab ? c.primary : "transparent",
              color:      activeTab === tab ? "#fff" : c.subtext,
            }}>
            {tab === "general" ? "General" : tab === "details" ? "Details" : "Verification"}
          </button>
        ))}
      </div>

      {/* Form card */}
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 24 }}>

        {activeTab === "general" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Company Name *</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corporation" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = c.primary)}
                onBlur={e  => (e.target.style.borderColor = c.border)} />
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input value={website} onChange={e => setWebsite(e.target.value)}
                placeholder="https://yourcompany.com" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = c.primary)}
                onBlur={e  => (e.target.style.borderColor = c.border)} />
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <input value={location} onChange={e => setLocation(e.target.value)}
                placeholder="e.g. New York, USA" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = c.primary)}
                onBlur={e  => (e.target.style.borderColor = c.border)} />
            </div>
          </div>
        )}

        {activeTab === "details" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <label style={labelStyle}>Industry</label>
              <select value={industry} onChange={e => setIndustry(e.target.value)}
                style={{ ...inputStyle, appearance: "none" }}>
                <option value="">Select industry…</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Company Size</label>
              <select value={size} onChange={e => setSize(e.target.value)}
                style={{ ...inputStyle, appearance: "none" }}>
                <option value="">Select size…</option>
                {COMPANY_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>About the Company</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                rows={4} placeholder="Briefly describe what your company does…"
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
                onFocus={e => (e.target.style.borderColor = c.primary)}
                onBlur={e  => (e.target.style.borderColor = c.border)} />
              <div style={{ fontSize: 11, color: c.subtext, marginTop: 4, textAlign: "right" }}>{description.length} / 500</div>
            </div>
          </div>
        )}

        {activeTab === "verification" && (() => {
          const statusMap: Record<string, { label: string; color: string; bg: string; icon: string }> = {
            approved:      { label: "Verified",      color: "#22c55e", bg: "rgba(34,197,94,.12)",   icon: "✓" },
            pending:       { label: "Under Review",  color: "#f59e0b", bg: "rgba(245,158,11,.10)", icon: "⏳" },
            rejected:      { label: "Rejected",      color: "#ef4444", bg: "rgba(239,68,68,.10)",  icon: "✗" },
            not_submitted: { label: "Not Submitted", color: "#888",    bg: "rgba(128,128,128,.1)", icon: "○" },
          };
          const vs = statusMap[verifStatus?.status ?? "not_submitted"] ?? statusMap["not_submitted"];
          const canSubmit = !verifStatus || verifStatus.status === "not_submitted" || verifStatus.status === "rejected";

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ background: vs.bg, border: `1px solid ${vs.color}30`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28 }}>{vs.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: vs.color }}>{vs.label}</div>
                  {verifStatus?.document_type && (
                    <div style={{ fontSize: 12, color: c.subtext, marginTop: 2 }}>Document: {verifStatus.document_type.replace(/_/g, " ")}</div>
                  )}
                  {verifStatus?.created_at && (
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 1 }}>Submitted: {new Date(verifStatus.created_at).toLocaleDateString()}</div>
                  )}
                  {verifStatus?.reviewed_at && verifStatus.status === "approved" && (
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 1 }}>Reviewed: {new Date(verifStatus.reviewed_at).toLocaleDateString()}</div>
                  )}
                </div>
                {verifStatus?.status === "pending" && (
                  <button onClick={cancelVerification} disabled={cancelling}
                    style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, border: `1px solid rgba(239,68,68,.4)`, background: "rgba(239,68,68,.08)", color: "#ef4444", cursor: cancelling ? "not-allowed" : "pointer", opacity: cancelling ? 0.6 : 1 }}>
                    {cancelling ? "Cancelling…" : "Cancel Submission"}
                  </button>
                )}
              </div>

              {verifStatus?.rejection_note && (
                <div style={{ background: "rgba(239,68,68,.08)", border: `1px solid rgba(239,68,68,.25)`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>Rejection Reason</div>
                  <div style={{ fontSize: 13, color: c.text }}>{verifStatus.rejection_note}</div>
                </div>
              )}

              {canSubmit && (
                <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: "20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 16 }}>
                    {verifStatus?.status === "rejected" ? "Resubmit Document" : "Submit Business Verification"}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Document Type</label>
                      <select value={verifDocType} onChange={e => setVerifDocType(e.target.value)}
                        style={{ ...inputStyle, appearance: "none" }}>
                        <option value="passport">Passport</option>
                        <option value="national_id">National ID</option>
                        <option value="drivers_license">Driver's License</option>
                        <option value="residence_permit">Residence Permit</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Document File</label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: c.surface, border: `1px dashed ${verifFile ? c.primary : c.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, color: verifFile ? c.primary : c.subtext, boxSizing: "border-box" as const }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {verifFile ? verifFile.name : "Choose file (PDF, JPEG, PNG)"}
                        </span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setVerifFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                      </label>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: c.subtext, marginTop: 10 }}>Accepted formats: PDF, JPEG, PNG, Word — max 10 MB.</div>
                  {verifMsg && (
                    <div style={{ marginTop: 12, fontSize: 13, fontWeight: 500, color: verifMsg.ok ? "#22c55e" : "#f87171" }}>{verifMsg.msg}</div>
                  )}
                  <button onClick={submitVerification} disabled={verifLoading || !verifFile}
                    style={{ marginTop: 16, background: c.primary, color: "#fff", border: "none", borderRadius: 9, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: verifLoading || !verifFile ? "not-allowed" : "pointer", opacity: verifLoading || !verifFile ? 0.7 : 1 }}>
                    {verifLoading ? "Uploading…" : "Submit for Verification"}
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {activeTab !== "verification" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, paddingTop: 20, borderTop: `1px solid ${c.border}` }}>
            {feedback ? (
              <span style={{ fontSize: 13, fontWeight: 500, color: feedback.ok ? "#22c55e" : "#f87171" }}>{feedback.msg}</span>
            ) : (
              <span style={{ fontSize: 12, color: c.subtext }}>
                {completePct < 100 ? `${6 - completeness} field${6 - completeness !== 1 ? "s" : ""} remaining to complete your profile` : "✓ Profile is complete"}
              </span>
            )}
            <button onClick={save} disabled={saving || !companyName.trim()}
              style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 9, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: saving || !companyName.trim() ? "not-allowed" : "pointer", opacity: saving || !companyName.trim() ? 0.7 : 1, transition: "opacity .2s" }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyProfileView;
