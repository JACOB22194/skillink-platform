/**
 * ContractPage.tsx — Enhanced with cancel, edit project, and withdraw actions
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../shared/LanguageContext";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });
const role = () => localStorage.getItem("role") || "freelancer";

interface Contract { contract_id: number; project_id: number; freelancer_id: number; status: "active"|"completed"|"disputed"; created_at: string; }
interface Milestone { milestone_id: number; contract_id: number; title: string|null; description: string|null; amount: number; status: "pending"|"revision_requested"|"approved"|"paid"; due_date: string|null; created_at: string; ai_verification_status: "passed"|"flagged"|"insufficient_evidence"|null; ai_verification_report: string|null; revision_feedback: string|null; }
interface Escrow { escrow_id: number; contract_id: number; amount: number; released_amount: number; status: "held"|"released"; }
interface Project { project_id: number; title: string; description: string|null; budget: number; status: string; }

const TC = {
  bg: "#07070d", surface: "#0f0f18", card: "#141420", border: "#1e1e30",
  text: "#eaeaf8", sub: "#606088", accent: "#7F77DD", accentSoft: "#7F77DD18",
  green: "#00e5a0", greenSoft: "#00e5a010", red: "#ff4060", redSoft: "#ff406010",
  amber: "#ffb020", amberSoft: "#ffb02012", blue: "#60a5fa", blueSoft: "#60a5fa10",
  orange: "#f97316", orangeSoft: "#f9731610",
};

const msColors = {
  pending:             { c: TC.amber,  bg: TC.amberSoft  },
  revision_requested:  { c: TC.orange, bg: TC.orangeSoft },
  approved:            { c: TC.blue,   bg: TC.blueSoft   },
  paid:                { c: TC.green,  bg: TC.greenSoft  },
};
const contractColors = {
  active:    { c: TC.green, bg: TC.greenSoft },
  completed: { c: TC.blue,  bg: TC.blueSoft  },
  disputed:  { c: TC.red,   bg: TC.redSoft   },
};

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
};

const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
  width: "100%", background: TC.surface, border: `1px solid ${TC.border}`,
  borderRadius: 10, padding: "11px 14px", color: TC.text, fontSize: 13,
  outline: "none", boxSizing: "border-box", ...extra,
});

// ── Overlay wrapper ───────────────────────────────────────────────────────────
const Modal: React.FC<{ children: React.ReactNode; accentColor?: string }> = ({ children, accentColor }) => (
  <div style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
    <div style={{ background: TC.card, border: `1px solid ${accentColor ? accentColor + "44" : TC.border}`, borderRadius: 22, padding: 32, width: "100%", maxWidth: 480 }}>
      {children}
    </div>
  </div>
);

const MLabelEl: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 11, color: TC.sub, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>{children}</div>
);

const Err: React.FC<{ msg: string }> = ({ msg }) => (
  <div style={{ marginTop: 10, padding: "9px 13px", background: TC.redSoft, color: TC.red, borderRadius: 8, fontSize: 12 }}>{msg}</div>
);

const BtnRow: React.FC<{ onCancel: () => void; onConfirm: () => void; loading: boolean; confirmLabel: string; confirmColor?: string }> = ({ onCancel, onConfirm, loading, confirmLabel, confirmColor }) => {
  const { t } = useLanguage();
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
      <button onClick={onCancel} style={{ flex: 1, padding: "11px 0", background: "transparent", border: `1px solid ${TC.border}`, borderRadius: 10, color: TC.sub, cursor: "pointer", fontSize: 13 }}>{t("common.cancel")}</button>
      <button onClick={onConfirm} disabled={loading} style={{ flex: 2, padding: "11px 0", background: confirmColor || TC.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, opacity: loading ? 0.7 : 1 }}>
        {loading ? t("common.wait") : confirmLabel}
      </button>
    </div>
  );
};

// ── Cancel Modal ──────────────────────────────────────────────────────────────
const CancelModal: React.FC<{ contractId: number; isClient: boolean; onClose: () => void; onDone: () => void }> = ({ contractId, isClient, onClose, onDone }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const confirm = async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/contracts/${contractId}/cancel`, { method: "POST", ...auth() });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal accentColor={TC.red}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 42, marginBottom: 10 }}>{isClient ? "🚫" : "🏃"}</div>
        <div style={{ fontSize: 19, fontWeight: 700, color: TC.text, marginBottom: 8 }}>
          {isClient ? t("contract.cancel.title") : t("contract.withdraw")}
        </div>
        <div style={{ fontSize: 13, color: TC.sub, lineHeight: 1.7 }}>
          {isClient ? t("contract.cancelClient") : t("contract.cancelFree")}
        </div>
        <div style={{ marginTop: 14, padding: "10px 16px", background: TC.amberSoft, borderRadius: 10, border: `1px solid ${TC.amber}33`, fontSize: 12, color: TC.amber }}>
          {t("contract.cancelWarn")}
        </div>
      </div>
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={confirm} loading={loading}
        confirmLabel={isClient ? t("contract.yesCancel") : t("contract.yesWithdraw")}
        confirmColor={TC.red} />
    </Modal>
  );
};

// ── Edit Project Modal (client) ───────────────────────────────────────────────
const EditProjectModal: React.FC<{ project: Project; onClose: () => void; onDone: (p: Project) => void }> = ({ project, onClose, onDone }) => {
  const { t } = useLanguage();
  const [title, setTitle]   = useState(project.title);
  const [desc, setDesc]     = useState(project.description || "");
  const [budget, setBudget] = useState(String(project.budget));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    const b = parseFloat(budget);
    if (!title.trim()) { setErr(t("contract.titleReq")); return; }
    if (!b || b < 10)  { setErr(t("contract.budgetMin")); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/projects/${project.project_id}`, {
        method: "PUT",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: desc || null, budget: b }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      onDone(await r.json());
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal accentColor={TC.accent}>
      <div style={{ fontSize: 11, color: TC.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>{t("contract.edit.title")}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TC.text, marginBottom: 20 }}>{t("contract.editUpdate")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <MLabelEl>{t("contract.titleLabel")}</MLabelEl>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inp()} />
        </div>
        <div>
          <MLabelEl>{t("contract.description")}</MLabelEl>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} style={inp({ resize: "vertical" } as any)} />
        </div>
        <div>
          <MLabelEl>{t("contract.budget")} (USD)</MLabelEl>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: TC.sub }}>$</span>
            <input type="number" min={10} value={budget} onChange={e => setBudget(e.target.value)} style={inp({ paddingLeft: 26 })} />
          </div>
        </div>
      </div>
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={save} loading={loading} confirmLabel={t("contract.edit.save")} />
    </Modal>
  );
};

// ── Dispute Modal ─────────────────────────────────────────────────────────────
const DisputeModal: React.FC<{ contractId: number; onClose: () => void; onDone: () => void }> = ({ contractId, onClose, onDone }) => {
  const { t } = useLanguage();
  const [reason, setReason] = useState(""); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const submit = async () => {
    if (!reason.trim()) { setErr(t("contract.disputeDescErr")); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/contracts/${contractId}/dispute`, { method: "POST", headers: { ...auth().headers, "Content-Type": "application/json" }, body: JSON.stringify({ message: reason }) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); } onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal accentColor={TC.red}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: TC.text, marginBottom: 6 }}>{t("contract.dispute.title")}</div>
        <div style={{ fontSize: 12, color: TC.sub, lineHeight: 1.7 }}>{t("contract.disputeDesc")}</div>
      </div>
      <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder={t("contract.disputeInput")}
        style={inp({ resize: "none" } as any)} />
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel={t("contract.dispute.btn")} confirmColor={TC.red} />
    </Modal>
  );
};

// ── Add Milestone Modal ───────────────────────────────────────────────────────
const AddMilestoneModal: React.FC<{ contractId: number; escrowRemaining: number; onClose: () => void; onDone: () => void }> = ({ contractId, escrowRemaining, onClose, onDone }) => {
  const { t } = useLanguage();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(""); const [dueDate, setDueDate] = useState(""); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr(t("contract.amtMustPos")); return; }
    if (amt > escrowRemaining) { setErr(`Cannot exceed escrow remaining (${fmt(escrowRemaining)})`); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/contracts/${contractId}/milestones`, { method: "POST", headers: { ...auth().headers, "Content-Type": "application/json" }, body: JSON.stringify({ title: title || null, description: desc || null, amount: amt, due_date: dueDate || null }) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); } onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal>
      <div style={{ fontSize: 11, color: TC.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>{t("contract.addMsNew")}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TC.text, marginBottom: 4 }}>{t("contract.addPayMs")}</div>
      <div style={{ fontSize: 12, color: TC.sub, marginBottom: 20 }}>{t("contract.escrowRem")} <strong style={{ color: TC.green }}>{fmt(escrowRemaining)}</strong></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><MLabelEl>{t("contract.ms.add.name")}</MLabelEl><input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("contract.namePlch")} style={inp()} /></div>
        <div><MLabelEl>{t("contract.description")}</MLabelEl><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={inp({ resize: "vertical" } as any)} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><MLabelEl>{t("contract.amtReq")}</MLabelEl>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: TC.sub }}>$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inp({ paddingLeft: 26 })} />
            </div>
          </div>
          <div><MLabelEl>{t("contract.ms.add.due")}</MLabelEl><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp()} /></div>
        </div>
      </div>
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel={t("contract.ms.add.btn")} />
    </Modal>
  );
};

// ── Review Modal ──────────────────────────────────────────────────────────────
const ReviewModal: React.FC<{ contractId: number; endpoint: string; title: string; placeholder: string; onClose: () => void; onDone: () => void }> = ({ contractId, endpoint, title, placeholder, onClose, onDone }) => {
  const { t } = useLanguage();
  const [rating, setRating] = useState(5); const [comment, setComment] = useState(""); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const submit = async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/contracts/${contractId}/${endpoint}`, { method: "POST", headers: { ...auth().headers, "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment }) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); } onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>⭐</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: TC.text }}>{title}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => setRating(n)} style={{ fontSize: 28, background: "none", border: "none", cursor: "pointer", opacity: n <= rating ? 1 : 0.25, transform: n <= rating ? "scale(1.1)" : "scale(1)", transition: ".1s" }} aria-label={`Rate ${n} out of 5 stars`} aria-pressed={n <= rating}>⭐</button>
        ))}
      </div>
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} placeholder={placeholder} style={inp({ resize: "none" } as any)} />
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel={t("contract.review.btn")} />
    </Modal>
  );
};

// ── Revision Modal ────────────────────────────────────────────────────────────
const RevisionModal: React.FC<{ milestoneId: number; milestoneTitle: string|null; onClose: () => void; onDone: () => void }> = ({ milestoneId, milestoneTitle, onClose, onDone }) => {
  const { t } = useLanguage();
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!feedback.trim()) { setErr(t("contract.revDescErr")); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/milestones/${milestoneId}/request-revision`, {
        method: "POST",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Request failed"); }
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal accentColor={TC.orange}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔄</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: TC.text, marginBottom: 6 }}>{t("contract.rev.title")}</div>
        <div style={{ fontSize: 12, color: TC.sub, lineHeight: 1.7 }}>
          {t("contract.revision.what")} <strong style={{ color: TC.text }}>{milestoneTitle || `Milestone #${milestoneId}`}</strong>.
        </div>
      </div>
      <textarea
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        rows={5}
        placeholder={t("contract.revFeedPlch")}
        style={inp({ resize: "vertical" } as any)}
      />
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel={t("contract.revSentFree")} confirmColor={TC.orange} />
    </Modal>
  );
};

// ── Milestone Row ─────────────────────────────────────────────────────────────
const MilestoneRow: React.FC<{ ms: Milestone; isClient: boolean; projectId: number; onApprove: (id: number) => void; onMarkPaid: (id: number) => void; actionLoading: number|null; onToast: (msg: string, ok: boolean) => void; onRefresh: () => void; onRequestRevision: (ms: Milestone) => void }> = ({ ms, isClient, projectId, onApprove, onMarkPaid, actionLoading, onToast, onRefresh, onRequestRevision }) => {
  const { t } = useLanguage();
  const cfg = msColors[ms.status as keyof typeof msColors] ?? msColors.pending;
  const loading = actionLoading === ms.milestone_id;
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const msLabel = (status: string): string => ({
    pending:            t("contract.ms.pending"),
    revision_requested: t("contract.ms.revision"),
    approved:           t("contract.ms.approved"),
    paid:               t("contract.ms.paid"),
  }[status] ?? status);

  const aiVerdictLabel = (v: string): { label: string; c: string; bg: string } => ({
    passed:               { label: t("contract.aiPassed"),  c: TC.green, bg: TC.greenSoft },
    flagged:              { label: t("contract.aiFlagged"), c: TC.red,   bg: TC.redSoft   },
    insufficient_evidence:{ label: t("contract.aiInsuff"),  c: TC.amber, bg: TC.amberSoft },
  }[v] ?? { label: v, c: TC.accent, bg: TC.accentSoft });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const r = await fetch(`${API}/files/upload/${projectId}`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` }, body: form });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Upload failed"); }
      onToast(`"${file.name}" ${t("contract.uploaded")}`, true);
    } catch (err: any) { onToast(err.message, false); } finally { setUploading(false); e.target.value = ""; }
  };

  const runAIVerify = async () => {
    setVerifying(true);
    try {
      const r = await fetch(`${API}/milestones/${ms.milestone_id}/verify-deliverable`, { method: "POST", ...auth() });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Verification failed"); }
      const data = await r.json();
      onToast(`AI verdict: ${data.ai_verification_status}`, data.ai_verification_status === "passed");
      onRefresh();
    } catch (err: any) { onToast(err.message, false); } finally { setVerifying(false); }
  };

  const verdict = ms.ai_verification_status ? aiVerdictLabel(ms.ai_verification_status) : null;

  return (
    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${TC.border}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.c, marginTop: 5, flexShrink: 0, boxShadow: `0 0 8px ${cfg.c}66` }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TC.text }}>{ms.title || `Milestone #${ms.milestone_id}`}</div>
              {ms.description && <div style={{ fontSize: 12, color: TC.sub, marginTop: 3, lineHeight: 1.5 }}>{ms.description}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: TC.sub }}>Created {timeAgo(ms.created_at)}</span>
                {ms.due_date && <span style={{ fontSize: 11, color: TC.amber }}>Due {new Date(ms.due_date).toLocaleDateString()}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: TC.text }}>{fmt(ms.amount)}</div>
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 100, background: cfg.bg, color: cfg.c }}>{msLabel(ms.status)}</span>
            </div>
          </div>

          {/* AI Verification badge */}
          {verdict && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: verdict.bg, color: verdict.c, fontWeight: 600 }}>
                {verdict.label}
              </span>
              {ms.ai_verification_report && (
                <button onClick={() => setShowReport(v => !v)} style={{ fontSize: 11, background: "none", border: "none", color: TC.sub, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  {showReport ? t("contract.hideReport") : t("contract.viewReport")}
                </button>
              )}
            </div>
          )}
          {showReport && ms.ai_verification_report && (
            <div style={{ marginTop: 8, padding: "10px 14px", background: TC.surface, border: `1px solid ${TC.border}`, borderRadius: 8, fontSize: 12, color: TC.sub, lineHeight: 1.7 }}>
              {ms.ai_verification_report}
            </div>
          )}

          {/* Revision feedback banner */}
          {ms.status === "revision_requested" && ms.revision_feedback && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: TC.orangeSoft, border: `1px solid ${TC.orange}33`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: TC.orange, fontWeight: 600, marginBottom: 4 }}>{t("contract.reviewed")}</div>
              <div style={{ fontSize: 12, color: TC.text, lineHeight: 1.6 }}>{ms.revision_feedback}</div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {isClient && ms.status === "pending" && (
              <button onClick={runAIVerify} disabled={verifying} style={{ padding: "7px 14px", background: TC.accentSoft, border: `1px solid ${TC.accent}44`, borderRadius: 8, color: TC.accent, fontWeight: 600, cursor: verifying ? "not-allowed" : "pointer", fontSize: 12, opacity: verifying ? 0.6 : 1 }}>
                {verifying ? t("contract.verifying") : t("contract.aiVerify")}
              </button>
            )}
            {isClient && ms.status === "pending" && (
              <button onClick={() => onRequestRevision(ms)} style={{ padding: "7px 14px", background: TC.orangeSoft, border: `1px solid ${TC.orange}44`, borderRadius: 8, color: TC.orange, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                {t("contract.reqRevision")}
              </button>
            )}
            {isClient && ms.status === "pending" && (
              <button onClick={() => onApprove(ms.milestone_id)} disabled={loading} style={{ padding: "7px 16px", background: TC.green, border: "none", borderRadius: 8, color: "#1a1a1a", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: loading ? 0.6 : 1 }}>
                {loading ? "…" : t("contract.approveRelease")}
              </button>
            )}
            {isClient && ms.status === "approved" && (
              <button onClick={() => onMarkPaid(ms.milestone_id)} disabled={loading} style={{ padding: "7px 16px", background: TC.blueSoft, border: `1px solid ${TC.blue}44`, borderRadius: 8, color: TC.blue, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                {loading ? "…" : t("contract.markPaid")}
              </button>
            )}
            {!isClient && (ms.status === "pending" || ms.status === "revision_requested") && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: TC.accentSoft, border: `1px solid ${TC.accent}44`, borderRadius: 8, color: TC.accent, fontSize: 12, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.6 : 1 }}>
                {uploading ? t("contract.uploading") : t("contract.uploadDeli")}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.zip,.doc,.docx,.txt" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
              </label>
            )}
            {!isClient && ms.status === "revision_requested" && (
              <button
                onClick={async () => {
                  try {
                    const r = await fetch(`${API}/milestones/${ms.milestone_id}/status`, { method: "PUT", headers: { ...auth().headers, "Content-Type": "application/json" }, body: JSON.stringify({ status: "pending" }) });
                    if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
                    onToast(t("contract.resubmitted"), true); onRefresh();
                  } catch (e: any) { onToast(e.message, false); }
                }}
                style={{ padding: "7px 14px", background: TC.accentSoft, border: `1px solid ${TC.accent}44`, borderRadius: 8, color: TC.accent, fontWeight: 600, cursor: "pointer", fontSize: 12 }}
              >
                {t("contract.resubmit")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Action Button ─────────────────────────────────────────────────────────────
const ActionBtn: React.FC<{ onClick: () => void; icon: string; label: string; color: string; bg: string }> = ({ onClick, icon, label, color, bg }) => (
  <button onClick={onClick} style={{ padding: "11px 16px", background: bg, border: `1px solid ${color}33`, borderRadius: 12, color, fontWeight: 600, cursor: "pointer", fontSize: 12, width: "100%", display: "flex", alignItems: "center", gap: 8, transition: "opacity .15s" }}
    onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")} onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
    <span style={{ fontSize: 16 }}>{icon}</span>{label}
  </button>
);

// ── Main Page ─────────────────────────────────────────────────────────────────
export const ContractPage: React.FC = () => {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const isClient = role() === "client";

  const [contract, setContract]   = useState<Contract | null>(null);
  const [project, setProject]     = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [escrow, setEscrow]       = useState<Escrow | null>(null);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  const [showAddMs,       setShowAddMs]       = useState(false);
  const [showReview,      setShowReview]      = useState(false);
  const [showClientReview,setShowClientReview]= useState(false);
  const [showDispute,     setShowDispute]     = useState(false);
  const [showCancel,      setShowCancel]      = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [revisionTarget,  setRevisionTarget]  = useState<Milestone | null>(null);

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const fetchAll = useCallback(async () => {
    if (!contractId) return; setLoading(true);
    try {
      const [cr, mr] = await Promise.all([
        fetch(`${API}/contracts/${contractId}`, auth()),
        fetch(`${API}/contracts/${contractId}/milestones`, auth()),
      ]);
      if (cr.ok) {
        const c: Contract = await cr.json(); setContract(c);
        const [pr, er] = await Promise.all([
          fetch(`${API}/projects/${c.project_id}`, auth()),
          fetch(`${API}/escrow/contract/${contractId}`, auth()),
        ]);
        if (pr.ok) setProject(await pr.json());
        if (er.ok) setEscrow(await er.json());
      }
      if (mr.ok) setMilestones(await mr.json());
    } finally { setLoading(false); }
  }, [contractId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateMilestone = async (milestoneId: number, status: "approved"|"paid") => {
    setActionLoading(milestoneId);
    try {
      const r = await fetch(`${API}/milestones/${milestoneId}/status`, { method: "PUT", headers: { ...auth().headers, "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      showToast(status === "approved" ? "Payment released! 💸" : "Milestone marked as paid ✓", true);
      await fetchAll();
    } catch (e: any) { showToast(e.message, false); } finally { setActionLoading(null); }
  };

  const completeContract = async () => {
    try {
      const r = await fetch(`${API}/contracts/${contractId}/complete`, { method: "POST", ...auth() });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      showToast("Contract completed! 🎉", true); await fetchAll();
    } catch (e: any) { showToast(e.message, false); }
  };

  const contractStatusLabel = (status: string): string => ({
    active:    t("contract.st.active"),
    completed: t("contract.st.completed"),
    disputed:  t("contract.st.disputed"),
  }[status] ?? status);

  if (loading) return <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: TC.bg, display: "flex", alignItems: "center", justifyContent: "center", color: TC.sub, fontFamily: "sans-serif" }}>{t("contract.loading")}</div>;
  if (!contract) return <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: TC.bg, display: "flex", alignItems: "center", justifyContent: "center", color: TC.red, fontFamily: "sans-serif" }}>{t("contract.notFound")}</div>;

  const cCfg = contractColors[contract.status];
  const paidMilestones  = milestones.filter(m => m.status === "paid").length;
  const allPaid         = milestones.length > 0 && paidMilestones === milestones.length;
  const escrowRemaining = escrow ? escrow.amount - milestones.reduce((a, m) => a + m.amount, 0) : 0;
  const hasWorkStarted  = milestones.some(m => m.status === "approved" || m.status === "paid");

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: TC.bg, color: TC.text, fontFamily: "'Outfit', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'); *{box-sizing:border-box} button,input,textarea{font-family:inherit}`}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 3000, padding: "12px 20px", borderRadius: 12, background: toast.ok ? TC.green : TC.red, color: toast.ok ? "#000" : "#fff", fontWeight: 600, fontSize: 13, boxShadow: "0 8px 32px #0008", transition: "all .2s" }}>
          {toast.msg}
        </div>
      )}

      {/* Top bar */}
      <div style={{ background: TC.surface, borderBottom: `1px solid ${TC.border}`, padding: "16px 28px", display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: TC.sub, cursor: "pointer", fontSize: 13, padding: 0 }}>{isRTL ? "→" : "←"} {t("common.back").replace(/[←→]\s*/, "")}</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: TC.sub }}>Contract #{contract.contract_id}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TC.text }}>{project?.title || `Project #${contract.project_id}`}</div>
        </div>
        <span style={{ fontSize: 12, padding: "5px 14px", borderRadius: 100, background: cCfg.bg, color: cCfg.c, fontWeight: 600 }}>● {contractStatusLabel(contract.status)}</span>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px", display: "grid", gridTemplateColumns: "1fr 290px", gap: 20, alignItems: "start" }}>

        {/* ── Left column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Next steps guide */}
          {contract.status === "active" && (() => {
            const steps = isClient ? [
              { done: milestones.length > 0,                                               text: t("contract.step1.client") },
              { done: milestones.some(m => m.status !== "pending"),                        text: t("contract.step2.client") },
              { done: allPaid,                                                              text: t("contract.step3.client") },
            ] : [
              { done: milestones.length > 0,                                               text: t("contract.step1.free") },
              { done: milestones.some(m => m.status === "approved" || m.status === "paid"),text: t("contract.step2.free") },
              { done: allPaid,                                                              text: t("contract.step3.free") },
            ];
            return (
              <div style={{ background: TC.surface, border: `1px solid ${TC.accent}33`, borderRadius: 14, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: TC.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
                  {isClient ? t("contract.nextSteps.client") : t("contract.nextSteps.free")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>{s.done ? "✅" : "⬜"}</span>
                      <span style={{ fontSize: 13, color: s.done ? TC.sub : TC.text, lineHeight: 1.5, textDecoration: s.done ? "line-through" : "none" }}>{s.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Milestones */}
          <div style={{ background: TC.surface, border: `1px solid ${TC.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${TC.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: TC.text }}>{t("contract.milestones")}</div>
                <div style={{ fontSize: 11, color: TC.sub, marginTop: 2 }}>{paidMilestones}/{milestones.length} {t("contract.ms.paid").toLowerCase()}</div>
              </div>
              {isClient && contract.status === "active" && (
                <button onClick={() => setShowAddMs(true)} style={{ padding: "8px 16px", background: TC.accent, border: "none", borderRadius: 9, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                  {t("contract.addMs.btn")}
                </button>
              )}
            </div>
            {milestones.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: TC.sub }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📌</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: TC.text, marginBottom: 4 }}>{t("contract.noMilestones")}</div>
                {isClient && <div style={{ fontSize: 12 }}>{t("contract.noMsYet")}</div>}
              </div>
            ) : milestones.map(ms => (
              <MilestoneRow key={ms.milestone_id} ms={ms} isClient={isClient} projectId={contract.project_id}
                onApprove={id => updateMilestone(id, "approved")} onMarkPaid={id => updateMilestone(id, "paid")}
                actionLoading={actionLoading} onToast={showToast} onRefresh={fetchAll}
                onRequestRevision={setRevisionTarget} />
            ))}
          </div>

          {/* Project brief */}
          {project && (
            <div style={{ background: TC.surface, border: `1px solid ${TC.border}`, borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TC.sub, textTransform: "uppercase", letterSpacing: ".07em" }}>{t("contract.projectBrief")}</div>
                {isClient && contract.status === "active" && !hasWorkStarted && (
                  <button onClick={() => setShowEditProject(true)} style={{ padding: "5px 12px", background: TC.accentSoft, border: `1px solid ${TC.accent}33`, borderRadius: 8, color: TC.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    ✏ {t("contract.editProj")}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: TC.sub }}>{t("contract.budget")}: <strong style={{ color: TC.green }}>{fmt(project.budget)}</strong></div>
                <div style={{ fontSize: 12, color: TC.sub }}>Status: <strong style={{ color: TC.text }}>{project.status}</strong></div>
              </div>
              {project.description && <div style={{ fontSize: 13, color: TC.sub, lineHeight: 1.8 }}>{project.description}</div>}
              {isClient && contract.status === "active" && !hasWorkStarted && (
                <div style={{ marginTop: 10, fontSize: 11, color: TC.amber }}>
                  {t("contract.editAvail")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Escrow */}
          {escrow && (
            <div style={{ background: TC.surface, border: `1px solid ${TC.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 11, color: TC.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>{t("contract.escrow")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  [t("contract.totalHeld"), fmt(escrow.amount),                              TC.text],
                  [t("contract.released"),  fmt(escrow.released_amount),                     TC.green],
                  [t("contract.remaining"), fmt(escrow.amount - escrow.released_amount),     TC.amber],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: TC.sub }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, height: 6, background: TC.border, borderRadius: 100, overflow: "hidden" }}>
                <div style={{ width: `${(escrow.released_amount / escrow.amount) * 100}%`, height: "100%", background: TC.green, borderRadius: 100, transition: "width .6s" }} />
              </div>
              <div style={{ fontSize: 10, color: TC.sub, marginTop: 5, textAlign: "right" }}>
                {Math.round((escrow.released_amount / escrow.amount) * 100)}% released
              </div>
            </div>
          )}

          {/* Contract info */}
          <div style={{ background: TC.surface, border: `1px solid ${TC.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 11, color: TC.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>{t("contract.info")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                [t("contract.started"),    new Date(contract.created_at).toLocaleDateString()],
                [t("contract.freelancer"), `#${contract.freelancer_id}`],
                [t("contract.milestones"), String(milestones.length)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: TC.sub }}>{label}</span>
                  <span style={{ fontSize: 12, color: TC.text }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {contract.status === "active" && (
            <div style={{ background: TC.surface, border: `1px solid ${TC.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, color: TC.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>{t("contract.actions")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                {isClient && allPaid && (
                  <ActionBtn onClick={completeContract} icon="✅" label={t("contract.complete")} color={TC.green} bg={TC.greenSoft} />
                )}

                {isClient && !hasWorkStarted && (
                  <ActionBtn onClick={() => setShowEditProject(true)} icon="✏️" label={t("contract.editProj")} color={TC.accent} bg={TC.accentSoft} />
                )}

                {!hasWorkStarted && (
                  <ActionBtn
                    onClick={() => setShowCancel(true)}
                    icon={isClient ? "🚫" : "🏃"}
                    label={isClient ? t("contract.cancelCont") : t("contract.withdraw")}
                    color={TC.orange} bg={TC.orangeSoft}
                  />
                )}

                <ActionBtn onClick={() => setShowDispute(true)} icon="⚠" label={t("contract.openDisp")} color={TC.red} bg={TC.redSoft} />
              </div>

              {!hasWorkStarted && (
                <div style={{ marginTop: 12, fontSize: 11, color: TC.sub, lineHeight: 1.6, padding: "8px 10px", background: TC.amberSoft, borderRadius: 8, border: `1px solid ${TC.amber}22` }}>
                  {t("contract.cancelAvail")}
                </div>
              )}
            </div>
          )}

          {/* Reviews */}
          {contract.status === "completed" && isClient && (
            <ActionBtn onClick={() => setShowReview(true)} icon="⭐" label={t("contract.reviewFreelancer")} color={TC.accent} bg={TC.accentSoft} />
          )}
          {contract.status === "completed" && !isClient && (
            <ActionBtn onClick={() => setShowClientReview(true)} icon="⭐" label={t("contract.reviewClient")} color={TC.accent} bg={TC.accentSoft} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddMs && <AddMilestoneModal contractId={contract.contract_id} escrowRemaining={escrowRemaining} onClose={() => setShowAddMs(false)} onDone={() => { setShowAddMs(false); fetchAll(); showToast("Milestone added!", true); }} />}
      {revisionTarget && <RevisionModal milestoneId={revisionTarget.milestone_id} milestoneTitle={revisionTarget.title} onClose={() => setRevisionTarget(null)} onDone={() => { setRevisionTarget(null); fetchAll(); showToast("Revision request sent to freelancer.", true); }} />}
      {showReview && <ReviewModal contractId={contract.contract_id} endpoint="review" title={t("contract.reviewFreelancer")} placeholder={t("contract.revPlaceholder")} onClose={() => setShowReview(false)} onDone={() => { setShowReview(false); showToast("Review submitted! Thank you.", true); }} />}
      {showClientReview && <ReviewModal contractId={contract.contract_id} endpoint="client-review" title={t("contract.reviewClient")} placeholder={t("contract.revPlaceholder")} onClose={() => setShowClientReview(false)} onDone={() => { setShowClientReview(false); showToast("Review submitted! Thank you.", true); }} />}
      {showDispute && <DisputeModal contractId={contract.contract_id} onClose={() => setShowDispute(false)} onDone={() => { setShowDispute(false); showToast("Dispute opened. Admin will review.", true); fetchAll(); }} />}
      {showCancel && <CancelModal contractId={contract.contract_id} isClient={isClient} onClose={() => setShowCancel(false)} onDone={() => { showToast(isClient ? "Contract cancelled. Project is now open." : "Withdrawn successfully.", true); navigate(-1); }} />}
      {showEditProject && project && <EditProjectModal project={project} onClose={() => setShowEditProject(false)} onDone={p => { setProject(p); setShowEditProject(false); showToast("Project updated!", true); }} />}
    </div>
  );
};

export default ContractPage;
