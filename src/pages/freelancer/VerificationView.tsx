import React, { useState, useEffect } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../shared/api";

interface ThemeColors {
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string;
}

type VerifStatus = "not_submitted" | "pending" | "approved" | "rejected";

interface VerifState {
  status: VerifStatus;
  document_type: string | null;
  rejection_note: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

const DOC_TYPES = [
  { value: "national_id",       label: "🪪 National ID" },
  { value: "passport",          label: "🛂 Passport" },
  { value: "drivers_license",   label: "🚗 Driver's License" },
  { value: "residence_permit",  label: "🏠 Residence Permit" },
  { value: "other",             label: "📄 Other" },
];

const VerificationView: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const [verifState, setVerifState]   = useState<VerifState | null>(null);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [cancelling, setCancelling]   = useState(false);
  const [docType, setDocType]         = useState("national_id");
  const [file, setFile]               = useState<File | null>(null);
  const [feedback, setFeedback]       = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/verification/status`, getAuthHeaders());
      const data = await res.json();
      setVerifState(data);
    } catch {
      setFeedback({ ok: false, msg: "Could not load verification status." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (!file) { setFeedback({ ok: false, msg: "Please select a document file." }); return; }
    setSubmitting(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append("document_type", docType);
      form.append("file", file);
      const headers = getAuthHeaders() as RequestInit;
      const res = await fetch(`${API_BASE_URL}/verification/submit`, {
        method: "POST",
        headers: { Authorization: (headers.headers as Record<string, string>)["Authorization"] },
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ ok: true, msg: data.message });
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        load();
      } else {
        setFeedback({ ok: false, msg: data.detail || "Submission failed." });
      }
    } catch {
      setFeedback({ ok: false, msg: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel your pending verification?")) return;
    setCancelling(true);
    setFeedback(null);
    try {
      const headers = getAuthHeaders() as RequestInit;
      const res = await fetch(`${API_BASE_URL}/verification/cancel`, {
        method: "DELETE",
        headers: headers.headers as Record<string, string>,
      });
      const data = await res.json();
      if (res.ok) { setFeedback({ ok: true, msg: data.message }); load(); }
      else setFeedback({ ok: false, msg: data.detail || "Could not cancel." });
    } catch {
      setFeedback({ ok: false, msg: "Network error." });
    } finally {
      setCancelling(false);
    }
  };

  const statusInfo: Record<VerifStatus, { icon: string; label: string; color: string; bg: string }> = {
    not_submitted: { icon: "○", label: "Not Submitted",  color: c.subtext,   bg: "transparent" },
    pending:       { icon: "⏳", label: "Under Review",  color: "#f59e0b",   bg: "rgba(245,158,11,.1)" },
    approved:      { icon: "✓",  label: "Verified",      color: "#22c55e",   bg: "rgba(34,197,94,.1)" },
    rejected:      { icon: "✕",  label: "Rejected",      color: "#ef4444",   bg: "rgba(239,68,68,.1)" },
  };

  const status = verifState?.status ?? "not_submitted";
  const si     = statusInfo[status];

  return (
    <div style={{ animation: "fadeIn 0.5s ease", maxWidth: 600 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Identity Verification</div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Verify your identity to unlock the Verified badge and build trust with clients.</div>
      </div>

      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Current Status</div>
        {loading ? (
          <div style={{ height: 24, background: c.border, borderRadius: 6, width: 140, animation: "pulse 1.5s infinite" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 100, background: si.bg, color: si.color, border: `0.5px solid ${si.color}33` }}>
              {si.icon} {si.label}
            </span>
            {verifState?.document_type && (
              <span style={{ fontSize: 11, color: c.subtext }}>
                · {DOC_TYPES.find(d => d.value === verifState.document_type)?.label ?? verifState.document_type}
              </span>
            )}
            {verifState?.created_at && (
              <span style={{ fontSize: 11, color: c.subtext, marginLeft: "auto" }}>
                Submitted {new Date(verifState.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {status === "rejected" && verifState?.rejection_note && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(239,68,68,.08)", border: "0.5px solid rgba(239,68,68,.2)", borderRadius: 8, fontSize: 12, color: "#ef4444" }}>
            <strong>Reason:</strong> {verifState.rejection_note}
          </div>
        )}

        {status === "approved" && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(34,197,94,.08)", border: "0.5px solid rgba(34,197,94,.2)", borderRadius: 8, fontSize: 12, color: "#22c55e" }}>
            ✓ Your identity has been verified. The <strong>✓ AI Gate Verified</strong> badge is now active on your profile.
          </div>
        )}

        {status === "pending" && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: c.subtext }}>Your document is being reviewed by our team. This usually takes 1–2 business days.</span>
            <button onClick={handleCancel} disabled={cancelling} style={{ marginLeft: 16, flexShrink: 0, fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "0.5px solid rgba(239,68,68,.4)", background: "transparent", color: "#ef4444", cursor: "pointer" }}>
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </div>
        )}
      </div>

      {(status === "not_submitted" || status === "rejected") && (
        <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 16 }}>
            {status === "rejected" ? "Resubmit Document" : "Submit Document"}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: c.subtext, display: "block", marginBottom: 6 }}>Document Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
              {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, color: c.subtext, display: "block", marginBottom: 6 }}>
              Document File <span style={{ opacity: .6 }}>(PDF, JPEG, PNG, Word · max 10 MB)</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e: React.DragEvent<HTMLDivElement>) => e.preventDefault()}
              onDrop={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
              style={{ border: `1.5px dashed ${file ? c.primary : c.border}`, borderRadius: 10, padding: "20px 16px", textAlign: "center", cursor: "pointer", transition: "border-color .2s", background: file ? c.primarySoft : "transparent" }}
            >
              {file ? (
                <div>
                  <div style={{ fontSize: 13, color: c.primary, fontWeight: 500 }}>📎 {file.name}</div>
                  <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB · Click to change</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: c.subtext }}>Click to select file</div>
                  <div style={{ fontSize: 11, color: c.subtext, opacity: .6, marginTop: 4 }}>or drag and drop</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] ?? null)} aria-label="Upload verification document" />
          </div>

          {feedback && (
            <div style={{ marginBottom: 14, padding: "9px 14px", borderRadius: 8, fontSize: 12, background: feedback.ok ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: `0.5px solid ${feedback.ok ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`, color: feedback.ok ? "#22c55e" : "#ef4444" }}>
              {feedback.msg}
            </div>
          )}

          <button onClick={handleSubmit} disabled={submitting || !file} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "none", background: submitting || !file ? c.border : c.primary, color: submitting || !file ? c.subtext : "#fff", fontSize: 13, fontWeight: 600, cursor: submitting || !file ? "not-allowed" : "pointer", transition: "background .2s", fontFamily: "inherit" }}>
            {submitting ? "Uploading…" : status === "rejected" ? "Resubmit for Review" : "Submit for Review"}
          </button>

          <div style={{ marginTop: 12, fontSize: 11, color: c.subtext, lineHeight: 1.6, opacity: .8 }}>
            Your document is reviewed by our team and never shared publicly. We verify identity only — no financial data is stored.
          </div>
        </div>
      )}

      {feedback && (status === "pending" || status === "approved") && (
        <div style={{ marginTop: 12, padding: "9px 14px", borderRadius: 8, fontSize: 12, background: feedback.ok ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: `0.5px solid ${feedback.ok ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`, color: feedback.ok ? "#22c55e" : "#ef4444" }}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
};

export default VerificationView;
