/**
 * ContractPage.tsx
 * Route: /contract/:contractId
 * Full contract view: milestones, escrow status, actions (complete, dispute, review)
 * Works for both client and freelancer
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });
const role = () => localStorage.getItem("role") || "freelancer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contract {
  contract_id: number;
  project_id: number;
  freelancer_id: number;
  status: "active" | "completed" | "disputed";
  created_at: string;
}

interface Milestone {
  milestone_id: number;
  contract_id: number;
  title: string | null;
  description: string | null;
  amount: number;
  status: "pending" | "approved" | "paid";
  due_date: string | null;
  created_at: string;
}

interface Escrow {
  escrow_id: number;
  contract_id: number;
  amount: number;
  released_amount: number;
  status: "held" | "released";
}

interface Project {
  project_id: number;
  title: string;
  description: string | null;
  budget: number;
  status: string;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const T = {
  bg: "#07070d",
  surface: "#0f0f18",
  card: "#141420",
  border: "#1e1e30",
  text: "#eaeaf8",
  sub: "#606088",
  accent: "#7F77DD",
  accentSoft: "#7F77DD18",
  green: "#00e5a0",
  greenSoft: "#00e5a010",
  red: "#ff4060",
  redSoft: "#ff406010",
  amber: "#ffb020",
  amberSoft: "#ffb02012",
  blue: "#60a5fa",
  blueSoft: "#60a5fa10",
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
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
};

// ── Dispute Modal ─────────────────────────────────────────────────────────────

const DisputeModal: React.FC<{ contractId: number; onClose: () => void; onDone: () => void }> = ({ contractId, onClose, onDone }) => {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!reason.trim()) { setErr("Please describe the issue."); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/contracts/${contractId}/dispute`, {
        method: "POST",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: reason }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000d0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.card, border: `1px solid ${T.red}44`, borderRadius: 20, padding: 32, width: "100%", maxWidth: 460 }}>
        <div style={{ fontSize: 28, marginBottom: 8, textAlign: "center" }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, textAlign: "center", marginBottom: 6 }}>Open a Dispute</div>
        <div style={{ fontSize: 12, color: T.sub, textAlign: "center", marginBottom: 20, lineHeight: 1.7 }}>
          A dispute flags this contract for <strong style={{ color: T.text }}>admin review</strong>.<br />
          Use this if work was not delivered, payment was withheld, or there is any disagreement.<br />
          Both parties will be notified and an admin will mediate.
        </div>
        <textarea
          value={reason} onChange={e => setReason(e.target.value)} rows={4}
          placeholder="Describe the issue clearly (e.g. 'Freelancer did not deliver the agreed UI mockups by the deadline')…"
          style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", color: T.text, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", lineHeight: 1.6 }}
        />
        {err && <div style={{ marginTop: 10, padding: "9px 13px", background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.sub, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 2, padding: 12, background: T.red, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Submitting…" : "Open Dispute"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Add Milestone Modal ───────────────────────────────────────────────────────

const AddMilestoneModal: React.FC<{
  contractId: number;
  escrowRemaining: number;
  onClose: () => void;
  onDone: () => void;
}> = ({ contractId, escrowRemaining, onClose, onDone }) => {
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [amount, setAmount]     = useState("");
  const [dueDate, setDueDate]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr("Amount must be > $0"); return; }
    if (amt > escrowRemaining) { setErr(`Amount cannot exceed escrow remaining (${fmt(escrowRemaining)})`); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/contracts/${contractId}/milestones`, {
        method: "POST",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || null, description: desc || null, amount: amt, due_date: dueDate || null }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000d0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 32, width: "100%", maxWidth: 480 }}>
        <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>New Milestone</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>Add Payment Milestone</div>
        <div style={{ fontSize: 12, color: T.sub, marginBottom: 24 }}>
          Escrow remaining: <strong style={{ color: T.green }}>{fmt(escrowRemaining)}</strong>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: T.sub, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>Title</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Initial Design Mockup"
              style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: "11px 13px", color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.sub, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>Description</div>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Describe what deliverables are expected..."
              style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: "11px 13px", color: T.text, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: T.sub, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>Amount (USD) *</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.sub }}>$</span>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={0.01} placeholder="0.00"
                  style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: "11px 12px 11px 24px", color: T.text, fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.sub, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>Due Date</div>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: "11px 12px", color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
        </div>

        {err && <div style={{ marginTop: 14, padding: "10px 13px", background: T.redSoft, border: `1px solid ${T.red}33`, borderRadius: 8, color: T.red, fontSize: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.sub, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 2, padding: 12, background: T.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Creating…" : "Add Milestone"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Review Modal ──────────────────────────────────────────────────────────────

const ReviewModal: React.FC<{ contractId: number; onClose: () => void; onDone: () => void }> = ({ contractId, onClose, onDone }) => {
  const [rating, setRating]   = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  const submit = async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/contracts/${contractId}/review`, {
        method: "POST",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000d0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 32, maxWidth: 440, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⭐</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>Leave a Review</div>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>Rate the freelancer's work</div>
        </div>

        {/* Star selector */}
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => setRating(n)} style={{
              fontSize: 28, background: "none", border: "none", cursor: "pointer",
              opacity: n <= rating ? 1 : 0.25, transition: "opacity .15s, transform .1s",
              transform: n <= rating ? "scale(1.1)" : "scale(1)",
            }}>⭐</button>
          ))}
        </div>

        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4}
          placeholder="Share your experience working with this freelancer…"
          style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", color: T.text, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", lineHeight: 1.6 }} />

        {err && <div style={{ marginTop: 12, padding: "9px 13px", background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.sub, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 2, padding: 12, background: T.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Submitting…" : "Submit Review"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Milestone Row ─────────────────────────────────────────────────────────────

const MilestoneRow: React.FC<{
  ms: Milestone;
  isClient: boolean;
  onApprove: (id: number) => void;
  onMarkPaid: (id: number) => void;
  actionLoading: number | null;
}> = ({ ms, isClient, onApprove, onMarkPaid, actionLoading }) => {
  const cfg = msColors[ms.status];
  const loading = actionLoading === ms.milestone_id;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
      {/* Status dot */}
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.c, marginTop: 5, flexShrink: 0, boxShadow: `0 0 8px ${cfg.c}66` }} />

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{ms.title || `Milestone #${ms.milestone_id}`}</div>
            {ms.description && <div style={{ fontSize: 12, color: T.sub, marginTop: 3, lineHeight: 1.5 }}>{ms.description}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: T.sub }}>Created {timeAgo(ms.created_at)}</span>
              {ms.due_date && <span style={{ fontSize: 11, color: T.amber }}>Due {new Date(ms.due_date).toLocaleDateString()}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{fmt(ms.amount)}</div>
            <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 100, background: cfg.bg, color: cfg.c }}>{cfg.label}</span>
          </div>
        </div>

        {/* Actions (client only) */}
        {isClient && ms.status === "pending" && (
          <button onClick={() => onApprove(ms.milestone_id)} disabled={loading} style={{ marginTop: 10, padding: "7px 16px", background: T.green, border: "none", borderRadius: 8, color: "#1a1a1a", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: loading ? 0.6 : 1 }}>
            {loading ? "…" : "Approve & Release Payment"}
          </button>
        )}
        {isClient && ms.status === "approved" && (
          <button onClick={() => onMarkPaid(ms.milestone_id)} disabled={loading} style={{ marginTop: 10, padding: "7px 16px", background: T.blueSoft, border: `1px solid ${T.blue}44`, borderRadius: 8, color: T.blue, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
            {loading ? "…" : "Mark as Paid"}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const ContractPage: React.FC = () => {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const isClient = role() === "client";

  const [contract, setContract]     = useState<Contract | null>(null);
  const [project, setProject]       = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [escrow, setEscrow]         = useState<Escrow | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showAddMs, setShowAddMs]     = useState(false);
  const [showReview, setShowReview]   = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = useCallback(async () => {
    if (!contractId) return;
    setLoading(true);
    try {
      const [cr, mr] = await Promise.all([
        fetch(`${API}/contracts/${contractId}`, auth()),
        fetch(`${API}/contracts/${contractId}/milestones`, auth()),
      ]);
      if (cr.ok) {
        const c: Contract = await cr.json();
        setContract(c);
        // Fetch project
        const pr = await fetch(`${API}/projects/${c.project_id}`, auth());
        if (pr.ok) setProject(await pr.json());
        // Fetch escrow
        const er = await fetch(`${API}/escrow/contract/${contractId}`, auth());
        if (er.ok) setEscrow(await er.json());
      }
      if (mr.ok) setMilestones(await mr.json());
    } finally { setLoading(false); }
  }, [contractId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateMilestone = async (milestoneId: number, status: "approved" | "paid") => {
    setActionLoading(milestoneId);
    try {
      const r = await fetch(`${API}/milestones/${milestoneId}/status`, {
        method: "PUT",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      showToast(status === "approved" ? "Payment released to freelancer!" : "Milestone marked as paid", true);
      await fetchAll();
    } catch (e: any) { showToast(e.message, false); }
    finally { setActionLoading(null); }
  };

  const completeContract = async () => {
    try {
      const r = await fetch(`${API}/contracts/${contractId}/complete`, { method: "POST", ...auth() });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      showToast("Contract completed! 🎉", true);
      await fetchAll();
    } catch (e: any) { showToast(e.message, false); }
  };


  if (loading) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.sub }}>Loading contract…</div>
  );

  if (!contract) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.red }}>Contract not found</div>
  );

  const cCfg = contractColors[contract.status];
  const paidMilestones   = milestones.filter(m => m.status === "paid").length;
  const allPaid          = milestones.length > 0 && paidMilestones === milestones.length;
  const escrowRemaining  = escrow ? escrow.amount - milestones.reduce((a, m) => a + m.amount, 0) : 0;
  const paidTotal        = milestones.filter(m => m.status !== "pending").reduce((a, m) => a + m.amount, 0);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Outfit', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'); *{box-sizing:border-box} button,input,textarea{font-family:inherit}`}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 3000, padding: "12px 20px", borderRadius: 12, background: toast.ok ? T.green : T.red, color: toast.ok ? "#000" : "#fff", fontWeight: 600, fontSize: 13, boxShadow: "0 8px 32px #0008" }}>
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
        <span style={{ fontSize: 12, padding: "5px 14px", borderRadius: 100, background: cCfg.bg, color: cCfg.c, fontWeight: 600 }}>
          ● {cCfg.label}
        </span>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Next Steps guidance */}
          {contract.status === "active" && (() => {
            const steps = isClient ? [
              { done: milestones.length > 0, text: "Add milestones — break the project into tasks with payment amounts" },
              { done: milestones.some((m: Milestone) => m.status !== "pending"), text: "Approve milestones as the freelancer delivers work" },
              { done: allPaid, text: "Mark all milestones paid, then complete the contract" },
            ] : [
              { done: milestones.length > 0, text: "Wait for the client to create milestones (payment tasks)" },
              { done: milestones.some((m: Milestone) => m.status === "approved" || m.status === "paid"), text: "Complete each milestone — client will approve and release payment" },
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

          {/* Milestones card */}
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
            ) : (
              milestones.map(ms => (
                <MilestoneRow
                  key={ms.milestone_id} ms={ms} isClient={isClient}
                  onApprove={id => updateMilestone(id, "approved")}
                  onMarkPaid={id => updateMilestone(id, "paid")}
                  actionLoading={actionLoading}
                />
              ))
            )}
          </div>

          {/* Project description */}
          {project?.description && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.sub, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Project Brief</div>
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.8 }}>{project.description}</div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Escrow */}
          {escrow && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 11, color: T.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Escrow</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: T.sub }}>Total held</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{fmt(escrow.amount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: T.sub }}>Released</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.green }}>{fmt(escrow.released_amount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: T.sub }}>Remaining</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.amber }}>{fmt(escrow.amount - escrow.released_amount)}</span>
                </div>
              </div>
              {/* Progress bar */}
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
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: T.sub }}>Started</span>
                <span style={{ fontSize: 12, color: T.text }}>{new Date(contract.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: T.sub }}>Freelancer ID</span>
                <span style={{ fontSize: 12, color: T.text }}>#{contract.freelancer_id}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: T.sub }}>Milestones</span>
                <span style={{ fontSize: 12, color: T.text }}>{milestones.length}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          {contract.status === "active" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {isClient && allPaid && (
                <button onClick={completeContract} style={{ padding: "12px 16px", background: T.green, border: "none", borderRadius: 12, color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                  ✓ Complete Contract
                </button>
              )}
              <button onClick={() => setShowDispute(true)} style={{ padding: "11px 16px", background: "transparent", border: `1px solid ${T.red}44`, borderRadius: 12, color: T.red, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                ⚠ Open Dispute
              </button>
            </div>
          )}

          {/* Review */}
          {contract.status === "completed" && isClient && (
            <button onClick={() => setShowReview(true)} style={{ padding: "12px 16px", background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 12, color: T.accent, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              ⭐ Leave a Review
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddMs && (
        <AddMilestoneModal
          contractId={contract.contract_id}
          escrowRemaining={escrowRemaining}
          onClose={() => setShowAddMs(false)}
          onDone={() => { setShowAddMs(false); fetchAll(); showToast("Milestone added!", true); }}
        />
      )}
      {showReview && (
        <ReviewModal
          contractId={contract.contract_id}
          onClose={() => setShowReview(false)}
          onDone={() => { setShowReview(false); showToast("Review submitted! Thank you.", true); }}
        />
      )}
      {showDispute && (
        <DisputeModal
          contractId={contract.contract_id}
          onClose={() => setShowDispute(false)}
          onDone={() => { setShowDispute(false); showToast("Dispute opened. Admin will review.", true); fetchAll(); }}
        />
      )}
    </div>
  );
};

export default ContractPage;