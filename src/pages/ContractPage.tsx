/**
 * ContractPage.tsx — Enhanced with cancel, edit project, and withdraw actions
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });
const role = () => localStorage.getItem("role") || "freelancer";

interface Contract { contract_id: number; project_id: number; freelancer_id: number; status: "active"|"completed"|"disputed"; created_at: string; }
interface Milestone { milestone_id: number; contract_id: number; title: string|null; description: string|null; amount: number; status: "pending"|"approved"|"paid"; due_date: string|null; created_at: string; ai_verification_status: "passed"|"flagged"|"insufficient_evidence"|null; ai_verification_report: string|null; }
interface Escrow { escrow_id: number; contract_id: number; amount: number; released_amount: number; status: "held"|"released"; }
interface Project { project_id: number; title: string; description: string|null; budget: number; status: string; }

const T = {
  bg: "#07070d", surface: "#0f0f18", card: "#141420", border: "#1e1e30",
  text: "#eaeaf8", sub: "#606088", accent: "#7F77DD", accentSoft: "#7F77DD18",
  green: "#00e5a0", greenSoft: "#00e5a010", red: "#ff4060", redSoft: "#ff406010",
  amber: "#ffb020", amberSoft: "#ffb02012", blue: "#60a5fa", blueSoft: "#60a5fa10",
  orange: "#f97316", orangeSoft: "#f9731610",
};

const msColors = {
  pending:  { c: T.amber, bg: T.amberSoft, label: "Pending" },
  approved: { c: T.blue,  bg: T.blueSoft,  label: "Approved" },
  paid:     { c: T.green, bg: T.greenSoft, label: "Paid ✓" },
};
const contractColors = {
  active:    { c: T.green, bg: T.greenSoft, label: "Active" },
  completed: { c: T.blue,  bg: T.blueSoft,  label: "Completed" },
  disputed:  { c: T.red,   bg: T.redSoft,   label: "Disputed" },
};

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
};

const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
  width: "100%", background: T.surface, border: `1px solid ${T.border}`,
  borderRadius: 10, padding: "11px 14px", color: T.text, fontSize: 13,
  outline: "none", boxSizing: "border-box", ...extra,
});

// ── Overlay wrapper ───────────────────────────────────────────────────────────
const Modal: React.FC<{ children: React.ReactNode; accentColor?: string }> = ({ children, accentColor }) => (
  <div style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
    <div style={{ background: T.card, border: `1px solid ${accentColor ? accentColor + "44" : T.border}`, borderRadius: 22, padding: 32, width: "100%", maxWidth: 480 }}>
      {children}
    </div>
  </div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 11, color: T.sub, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>{children}</div>
);

const Err: React.FC<{ msg: string }> = ({ msg }) => (
  <div style={{ marginTop: 10, padding: "9px 13px", background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12 }}>{msg}</div>
);

const BtnRow: React.FC<{ onCancel: () => void; onConfirm: () => void; loading: boolean; confirmLabel: string; confirmColor?: string }> = ({ onCancel, onConfirm, loading, confirmLabel, confirmColor }) => (
  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
    <button onClick={onCancel} style={{ flex: 1, padding: "11px 0", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.sub, cursor: "pointer", fontSize: 13 }}>Cancel</button>
    <button onClick={onConfirm} disabled={loading} style={{ flex: 2, padding: "11px 0", background: confirmColor || T.accent, border: "none", borderRadius: 10, color: confirmColor === T.red ? "#fff" : "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, opacity: loading ? 0.7 : 1 }}>
      {loading ? "Please wait…" : confirmLabel}
    </button>
  </div>
);

// ── Cancel Modal ──────────────────────────────────────────────────────────────
const CancelModal: React.FC<{ contractId: number; isClient: boolean; onClose: () => void; onDone: () => void }> = ({ contractId, isClient, onClose, onDone }) => {
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
    <Modal accentColor={T.red}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 42, marginBottom: 10 }}>{isClient ? "🚫" : "🏃"}</div>
        <div style={{ fontSize: 19, fontWeight: 700, color: T.text, marginBottom: 8 }}>
          {isClient ? "Cancel this Contract?" : "Withdraw from this Contract?"}
        </div>
        <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.7 }}>
          {isClient
            ? "The freelancer will be notified immediately. The project will reopen for new proposals. This cannot be undone."
            : "The client will be notified immediately. The project will reopen for new proposals. This cannot be undone."}
        </div>
        <div style={{ marginTop: 14, padding: "10px 16px", background: T.amberSoft, borderRadius: 10, border: `1px solid ${T.amber}33`, fontSize: 12, color: T.amber }}>
          ⚠ Only possible if no milestones have been approved yet.
        </div>
      </div>
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={confirm} loading={loading} confirmLabel={isClient ? "Yes, Cancel Contract" : "Yes, Withdraw"} confirmColor={T.red} />
    </Modal>
  );
};

// ── Edit Project Modal (client) ───────────────────────────────────────────────
const EditProjectModal: React.FC<{ project: Project; onClose: () => void; onDone: (p: Project) => void }> = ({ project, onClose, onDone }) => {
  const [title, setTitle]   = useState(project.title);
  const [desc, setDesc]     = useState(project.description || "");
  const [budget, setBudget] = useState(String(project.budget));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    const b = parseFloat(budget);
    if (!title.trim()) { setErr("Title is required."); return; }
    if (!b || b < 10)  { setErr("Budget must be at least $10."); return; }
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
    <Modal accentColor={T.accent}>
      <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Edit Project</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 20 }}>Update Project Details</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <Label>Title</Label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inp()} />
        </div>
        <div>
          <Label>Description</Label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} style={inp({ resize: "vertical" } as any)} />
        </div>
        <div>
          <Label>Budget (USD)</Label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: T.sub }}>$</span>
            <input type="number" min={10} value={budget} onChange={e => setBudget(e.target.value)} style={inp({ paddingLeft: 26 })} />
          </div>
        </div>
      </div>
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={save} loading={loading} confirmLabel="Save Changes" />
    </Modal>
  );
};

// ── Dispute Modal ─────────────────────────────────────────────────────────────
const DisputeModal: React.FC<{ contractId: number; onClose: () => void; onDone: () => void }> = ({ contractId, onClose, onDone }) => {
  const [reason, setReason] = useState(""); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const submit = async () => {
    if (!reason.trim()) { setErr("Please describe the issue."); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/contracts/${contractId}/dispute`, { method: "POST", headers: { ...auth().headers, "Content-Type": "application/json" }, body: JSON.stringify({ message: reason }) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); } onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal accentColor={T.red}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>Open a Dispute</div>
        <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.7 }}>A dispute flags this contract for <strong style={{ color: T.text }}>admin review</strong>. Both parties will be notified.</div>
      </div>
      <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Describe the issue clearly…"
        style={inp({ resize: "none" } as any)} />
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel="Open Dispute" confirmColor={T.red} />
    </Modal>
  );
};

// ── Add Milestone Modal ───────────────────────────────────────────────────────
const AddMilestoneModal: React.FC<{ contractId: number; escrowRemaining: number; onClose: () => void; onDone: () => void }> = ({ contractId, escrowRemaining, onClose, onDone }) => {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(""); const [dueDate, setDueDate] = useState(""); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr("Amount must be > $0"); return; }
    if (amt > escrowRemaining) { setErr(`Cannot exceed escrow remaining (${fmt(escrowRemaining)})`); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/contracts/${contractId}/milestones`, { method: "POST", headers: { ...auth().headers, "Content-Type": "application/json" }, body: JSON.stringify({ title: title || null, description: desc || null, amount: amt, due_date: dueDate || null }) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); } onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal>
      <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>New Milestone</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 4 }}>Add Payment Milestone</div>
      <div style={{ fontSize: 12, color: T.sub, marginBottom: 20 }}>Escrow remaining: <strong style={{ color: T.green }}>{fmt(escrowRemaining)}</strong></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><Label>Title</Label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Initial Mockup" style={inp()} /></div>
        <div><Label>Description</Label><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={inp({ resize: "vertical" } as any)} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><Label>Amount (USD) *</Label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: T.sub }}>$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inp({ paddingLeft: 26 })} />
            </div>
          </div>
          <div><Label>Due Date</Label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp()} /></div>
        </div>
      </div>
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel="Add Milestone" />
    </Modal>
  );
};

// ── Review Modal ──────────────────────────────────────────────────────────────
const ReviewModal: React.FC<{ contractId: number; endpoint: string; title: string; placeholder: string; onClose: () => void; onDone: () => void }> = ({ contractId, endpoint, title, placeholder, onClose, onDone }) => {
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
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{title}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => setRating(n)} style={{ fontSize: 28, background: "none", border: "none", cursor: "pointer", opacity: n <= rating ? 1 : 0.25, transform: n <= rating ? "scale(1.1)" : "scale(1)", transition: ".1s" }}>⭐</button>
        ))}
      </div>
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} placeholder={placeholder} style={inp({ resize: "none" } as any)} />
      {err && <Err msg={err} />}
      <BtnRow onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel="Submit Review" />
    </Modal>
  );
};

const aiVerdict = {
  passed:               { c: T.green,  bg: T.greenSoft,  label: "AI: Passed ✓" },
  flagged:              { c: T.red,    bg: T.redSoft,    label: "AI: Flagged ⚠" },
  insufficient_evidence:{ c: T.amber,  bg: T.amberSoft,  label: "AI: Needs more files" },
};

// ── Milestone Row ─────────────────────────────────────────────────────────────
const MilestoneRow: React.FC<{ ms: Milestone; isClient: boolean; projectId: number; onApprove: (id: number) => void; onMarkPaid: (id: number) => void; actionLoading: number|null; onToast: (msg: string, ok: boolean) => void; onRefresh: () => void }> = ({ ms, isClient, projectId, onApprove, onMarkPaid, actionLoading, onToast, onRefresh }) => {
  const cfg = msColors[ms.status]; const loading = actionLoading === ms.milestone_id;
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const r = await fetch(`${API}/files/upload/${projectId}`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` }, body: form });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Upload failed"); }
      onToast(`"${file.name}" uploaded!`, true);
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

  const verdict = ms.ai_verification_status ? aiVerdict[ms.ai_verification_status] : null;

  return (
    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.c, marginTop: 5, flexShrink: 0, boxShadow: `0 0 8px ${cfg.c}66` }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{ms.title || `Milestone #${ms.milestone_id}`}</div>
              {ms.description && <div style={{ fontSize: 12, color: T.sub, marginTop: 3, lineHeight: 1.5 }}>{ms.description}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: T.sub }}>Created {timeAgo(ms.created_at)}</span>
                {ms.due_date && <span style={{ fontSize: 11, color: T.amber }}>Due {new Date(ms.due_date).toLocaleDateString()}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{fmt(ms.amount)}</div>
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 100, background: cfg.bg, color: cfg.c }}>{cfg.label}</span>
            </div>
          </div>

          {/* AI Verification badge + report toggle */}
          {verdict && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: verdict.bg, color: verdict.c, fontWeight: 600 }}>
                {verdict.label}
              </span>
              {ms.ai_verification_report && (
                <button onClick={() => setShowReport(v => !v)} style={{ fontSize: 11, background: "none", border: "none", color: T.sub, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  {showReport ? "hide report" : "view report"}
                </button>
              )}
            </div>
          )}
          {showReport && ms.ai_verification_report && (
            <div style={{ marginTop: 8, padding: "10px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.sub, lineHeight: 1.7 }}>
              {ms.ai_verification_report}
            </div>
          )}

          {/* Client actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {isClient && ms.status === "pending" && (
              <button onClick={runAIVerify} disabled={verifying} style={{ padding: "7px 14px", background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 8, color: T.accent, fontWeight: 600, cursor: verifying ? "not-allowed" : "pointer", fontSize: 12, opacity: verifying ? 0.6 : 1 }}>
                {verifying ? "Verifying…" : "🤖 AI Verify Deliverable"}
              </button>
            )}
            {isClient && ms.status === "pending" && (
              <button onClick={() => onApprove(ms.milestone_id)} disabled={loading} style={{ padding: "7px 16px", background: T.green, border: "none", borderRadius: 8, color: "#1a1a1a", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: loading ? 0.6 : 1 }}>
                {loading ? "…" : "Approve & Release Payment"}
              </button>
            )}
            {isClient && ms.status === "approved" && (
              <button onClick={() => onMarkPaid(ms.milestone_id)} disabled={loading} style={{ padding: "7px 16px", background: T.blueSoft, border: `1px solid ${T.blue}44`, borderRadius: 8, color: T.blue, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                {loading ? "…" : "Mark as Paid"}
              </button>
            )}
            {!isClient && ms.status === "pending" && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 8, color: T.accent, fontSize: 12, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.6 : 1 }}>
                {uploading ? "Uploading…" : "📎 Upload Deliverable"}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.zip,.doc,.docx,.txt" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
              </label>
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
  const isClient = role() === "client";

  const [contract, setContract]   = useState<Contract | null>(null);
  const [project, setProject]     = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [escrow, setEscrow]       = useState<Escrow | null>(null);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  // Modal states
  const [showAddMs,       setShowAddMs]       = useState(false);
  const [showReview,      setShowReview]      = useState(false);
  const [showClientReview,setShowClientReview]= useState(false);
  const [showDispute,     setShowDispute]     = useState(false);
  const [showCancel,      setShowCancel]      = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);

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

  if (loading) return <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.sub, fontFamily: "sans-serif" }}>Loading contract…</div>;
  if (!contract) return <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.red, fontFamily: "sans-serif" }}>Contract not found</div>;

  const cCfg = contractColors[contract.status];
  const paidMilestones  = milestones.filter(m => m.status === "paid").length;
  const allPaid         = milestones.length > 0 && paidMilestones === milestones.length;
  const escrowRemaining = escrow ? escrow.amount - milestones.reduce((a, m) => a + m.amount, 0) : 0;
  const hasWorkStarted  = milestones.some(m => m.status === "approved" || m.status === "paid");

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Outfit', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'); *{box-sizing:border-box} button,input,textarea{font-family:inherit}`}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 3000, padding: "12px 20px", borderRadius: 12, background: toast.ok ? T.green : T.red, color: toast.ok ? "#000" : "#fff", fontWeight: 600, fontSize: 13, boxShadow: "0 8px 32px #0008", transition: "all .2s" }}>
          {toast.msg}
        </div>
      )}

      {/* Top bar */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "16px 28px", display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 13, padding: 0 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.sub }}>Contract #{contract.contract_id}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{project?.title || `Project #${contract.project_id}`}</div>
        </div>
        <span style={{ fontSize: 12, padding: "5px 14px", borderRadius: 100, background: cCfg.bg, color: cCfg.c, fontWeight: 600 }}>● {cCfg.label}</span>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px", display: "grid", gridTemplateColumns: "1fr 290px", gap: 20, alignItems: "start" }}>

        {/* ── Left column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Next steps guide */}
          {contract.status === "active" && (() => {
            const steps = isClient ? [
              { done: milestones.length > 0, text: "Add milestones — break the project into tasks with payment amounts" },
              { done: milestones.some(m => m.status !== "pending"), text: "Approve milestones as the freelancer delivers work" },
              { done: allPaid, text: "Mark all milestones paid, then complete the contract" },
            ] : [
              { done: milestones.length > 0, text: "Wait for the client to create milestones (payment tasks)" },
              { done: milestones.some(m => m.status === "approved" || m.status === "paid"), text: "Complete each milestone — client will approve and release payment" },
              { done: allPaid, text: "Once all milestones are paid the client will close the contract" },
            ];
            return (
              <div style={{ background: T.surface, border: `1px solid ${T.accent}33`, borderRadius: 14, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
                  {isClient ? "📋 Client — What to do" : "🛠 Freelancer — What to do"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>{s.done ? "✅" : "⬜"}</span>
                      <span style={{ fontSize: 13, color: s.done ? T.sub : T.text, lineHeight: 1.5, textDecoration: s.done ? "line-through" : "none" }}>{s.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Milestones */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Milestones</div>
                <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{paidMilestones}/{milestones.length} paid</div>
              </div>
              {isClient && contract.status === "active" && (
                <button onClick={() => setShowAddMs(true)} style={{ padding: "8px 16px", background: T.accent, border: "none", borderRadius: 9, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                  + Add Milestone
                </button>
              )}
            </div>
            {milestones.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: T.sub }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📌</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>No milestones yet</div>
                {isClient && <div style={{ fontSize: 12 }}>Add milestones to track progress and release payments</div>}
              </div>
            ) : milestones.map(ms => (
              <MilestoneRow key={ms.milestone_id} ms={ms} isClient={isClient} projectId={contract.project_id}
                onApprove={id => updateMilestone(id, "approved")} onMarkPaid={id => updateMilestone(id, "paid")}
                actionLoading={actionLoading} onToast={showToast} onRefresh={fetchAll} />
            ))}
          </div>

          {/* Project brief */}
          {project && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.sub, textTransform: "uppercase", letterSpacing: ".07em" }}>Project Brief</div>
                {isClient && contract.status === "active" && !hasWorkStarted && (
                  <button onClick={() => setShowEditProject(true)} style={{ padding: "5px 12px", background: T.accentSoft, border: `1px solid ${T.accent}33`, borderRadius: 8, color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    ✏ Edit
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: T.sub }}>Budget: <strong style={{ color: T.green }}>{fmt(project.budget)}</strong></div>
                <div style={{ fontSize: 12, color: T.sub }}>Status: <strong style={{ color: T.text }}>{project.status}</strong></div>
              </div>
              {project.description && <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.8 }}>{project.description}</div>}
              {isClient && contract.status === "active" && !hasWorkStarted && (
                <div style={{ marginTop: 10, fontSize: 11, color: T.amber }}>
                  ⚡ You can edit project details while no milestones have been approved.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Escrow */}
          {escrow && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 11, color: T.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Escrow</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["Total held", fmt(escrow.amount), T.text],
                  ["Released",   fmt(escrow.released_amount), T.green],
                  ["Remaining",  fmt(escrow.amount - escrow.released_amount), T.amber],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.sub }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, height: 6, background: T.border, borderRadius: 100, overflow: "hidden" }}>
                <div style={{ width: `${(escrow.released_amount / escrow.amount) * 100}%`, height: "100%", background: T.green, borderRadius: 100, transition: "width .6s" }} />
              </div>
              <div style={{ fontSize: 10, color: T.sub, marginTop: 5, textAlign: "right" }}>
                {Math.round((escrow.released_amount / escrow.amount) * 100)}% released
              </div>
            </div>
          )}

          {/* Contract info */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 11, color: T.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Contract Info</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Started",      new Date(contract.created_at).toLocaleDateString()],
                ["Freelancer",   `#${contract.freelancer_id}`],
                ["Milestones",   String(milestones.length)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: T.sub }}>{label}</span>
                  <span style={{ fontSize: 12, color: T.text }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {contract.status === "active" && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, color: T.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                {/* Complete (client, all paid) */}
                {isClient && allPaid && (
                  <ActionBtn onClick={completeContract} icon="✅" label="Complete Contract" color={T.green} bg={T.greenSoft} />
                )}

                {/* Edit project (client, before work starts) */}
                {isClient && !hasWorkStarted && (
                  <ActionBtn onClick={() => setShowEditProject(true)} icon="✏️" label="Edit Project Details" color={T.accent} bg={T.accentSoft} />
                )}

                {/* Cancel contract — both parties, before work starts */}
                {!hasWorkStarted && (
                  <ActionBtn
                    onClick={() => setShowCancel(true)}
                    icon={isClient ? "🚫" : "🏃"}
                    label={isClient ? "Cancel Contract" : "Withdraw from Contract"}
                    color={T.orange} bg={T.orangeSoft}
                  />
                )}

                {/* Dispute */}
                <ActionBtn onClick={() => setShowDispute(true)} icon="⚠" label="Open Dispute" color={T.red} bg={T.redSoft} />
              </div>

              {!hasWorkStarted && (
                <div style={{ marginTop: 12, fontSize: 11, color: T.sub, lineHeight: 1.6, padding: "8px 10px", background: T.amberSoft, borderRadius: 8, border: `1px solid ${T.amber}22` }}>
                  ℹ️ Cancel/Withdraw is available until the first milestone is approved.
                </div>
              )}
            </div>
          )}

          {/* Reviews */}
          {contract.status === "completed" && isClient && (
            <ActionBtn onClick={() => setShowReview(true)} icon="⭐" label="Rate the Freelancer" color={T.accent} bg={T.accentSoft} />
          )}
          {contract.status === "completed" && !isClient && (
            <ActionBtn onClick={() => setShowClientReview(true)} icon="⭐" label="Rate the Client" color={T.accent} bg={T.accentSoft} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddMs && <AddMilestoneModal contractId={contract.contract_id} escrowRemaining={escrowRemaining} onClose={() => setShowAddMs(false)} onDone={() => { setShowAddMs(false); fetchAll(); showToast("Milestone added!", true); }} />}
      {showReview && <ReviewModal contractId={contract.contract_id} endpoint="review" title="Rate the Freelancer" placeholder="Share your experience…" onClose={() => setShowReview(false)} onDone={() => { setShowReview(false); showToast("Review submitted! Thank you.", true); }} />}
      {showClientReview && <ReviewModal contractId={contract.contract_id} endpoint="client-review" title="Rate the Client" placeholder="Share your experience…" onClose={() => setShowClientReview(false)} onDone={() => { setShowClientReview(false); showToast("Review submitted! Thank you.", true); }} />}
      {showDispute && <DisputeModal contractId={contract.contract_id} onClose={() => setShowDispute(false)} onDone={() => { setShowDispute(false); showToast("Dispute opened. Admin will review.", true); fetchAll(); }} />}
      {showCancel && <CancelModal contractId={contract.contract_id} isClient={isClient} onClose={() => setShowCancel(false)} onDone={() => { showToast(isClient ? "Contract cancelled. Project is now open." : "Withdrawn successfully.", true); navigate(-1); }} />}
      {showEditProject && project && <EditProjectModal project={project} onClose={() => setShowEditProject(false)} onDone={p => { setProject(p); setShowEditProject(false); showToast("Project updated!", true); }} />}
    </div>
  );
};

export default ContractPage;