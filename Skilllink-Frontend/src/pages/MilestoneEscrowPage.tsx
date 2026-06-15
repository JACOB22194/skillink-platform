/**
 * MilestoneEscrowPage.tsx — Strict escrow milestone workflow
 * Route: /contract/:contractId/escrow
 *
 * Shows the full milestone timeline with context-aware action buttons
 * per role and status. Matches the existing ContractPage dark theme.
 */
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Shield, Clock, CheckCircle, XCircle,
  AlertTriangle, DollarSign, Send, RefreshCw, Gavel,
} from "lucide-react";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });
const role = () => localStorage.getItem("role") || "freelancer";

// ── Design tokens (matches ContractPage.tsx) ─────────────────────────────────
const TC = {
  bg: "#07070d", surface: "#0f0f18", card: "#141420", border: "#1e1e30",
  text: "#eaeaf8", sub: "#606088", accent: "#7F77DD", accentSoft: "#7F77DD18",
  green: "#00e5a0", greenSoft: "#00e5a010", red: "#ff4060", redSoft: "#ff406010",
  amber: "#ffb020", amberSoft: "#ffb02012", blue: "#60a5fa", blueSoft: "#60a5fa10",
  orange: "#f97316", orangeSoft: "#f9731610",
};

// ── Status color map ──────────────────────────────────────────────────────────
const msColors: Record<string, { c: string; bg: string }> = {
  awaiting_funds:      { c: TC.sub,    bg: TC.surface },
  funded:              { c: TC.accent, bg: TC.accentSoft },
  in_review:           { c: TC.blue,   bg: TC.blueSoft },
  in_revision:         { c: TC.orange, bg: TC.orangeSoft },
  in_dispute:          { c: TC.red,    bg: TC.redSoft },
  closed_success:      { c: TC.green,  bg: TC.greenSoft },
  closed_refunded:     { c: TC.sub,    bg: TC.surface },
  closed_auto_approve: { c: TC.green,  bg: TC.greenSoft },
  closed_auto_refund:  { c: TC.sub,    bg: TC.surface },
  // legacy
  pending:             { c: TC.amber,  bg: TC.amberSoft },
  revision_requested:  { c: TC.orange, bg: TC.orangeSoft },
  approved:            { c: TC.blue,   bg: TC.blueSoft },
  paid:                { c: TC.green,  bg: TC.greenSoft },
};

const CLOSED_STATES = new Set([
  "closed_success", "closed_refunded", "closed_auto_approve", "closed_auto_refund", "paid",
]);

const fmt = (n: number | null | undefined) =>
  n != null ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MilestoneDetail {
  milestone_id:          number;
  contract_id:           number;
  title:                 string | null;
  description:           string | null;
  amount:                number | null;
  status:                string;
  revision_count:        number;
  funded_at:             string | null;
  submitted_at:          string | null;
  deadline:              string | null;
  due_date:              string | null;
  created_at:            string | null;
  revision_feedback:     string | null;
  ai_verification_status: string | null;
}

interface Contract {
  contract_id:   number;
  project_id:    number;
  freelancer_id: number;
  status:        string;
  project?:      { title: string; budget: number };
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

const Modal: React.FC<{ children: React.ReactNode; accentColor?: string }> = ({ children, accentColor }) => (
  <div style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
    <div style={{ background: TC.card, border: `1px solid ${accentColor ? accentColor + "44" : TC.border}`, borderRadius: 22, padding: 32, width: "100%", maxWidth: 480 }}>
      {children}
    </div>
  </div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 11, color: TC.sub, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>{children}</div>
);

const ErrBox: React.FC<{ msg: string }> = ({ msg }) => (
  <div style={{ marginTop: 10, padding: "9px 13px", background: TC.redSoft, color: TC.red, borderRadius: 8, fontSize: 12 }}>{msg}</div>
);

const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
  width: "100%", background: TC.surface, border: `1px solid ${TC.border}`,
  borderRadius: 10, padding: "11px 14px", color: TC.text, fontSize: 13,
  outline: "none", boxSizing: "border-box", ...extra,
});

const BtnRow: React.FC<{ onCancel: () => void; onConfirm: () => void; loading: boolean; label: string; color?: string }> =
  ({ onCancel, onConfirm, loading, label, color }) => (
    <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
      <button onClick={onCancel} style={{ flex: 1, padding: "11px 0", background: "transparent", border: `1px solid ${TC.border}`, borderRadius: 10, color: TC.sub, cursor: "pointer", fontSize: 13 }}>Cancel</button>
      <button onClick={onConfirm} disabled={loading} style={{ flex: 2, padding: "11px 0", background: color || TC.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, opacity: loading ? 0.7 : 1 }}>
        {loading ? "Processing…" : label}
      </button>
    </div>
  );

const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const col = msColors[status] ?? { c: TC.sub, bg: TC.surface };
  const label = status.replace(/_/g, " ");
  return (
    <span style={{ background: col.bg, color: col.c, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
      {label}
    </span>
  );
};

// ── Fund Modal ────────────────────────────────────────────────────────────────

const FundModal: React.FC<{ milestoneId: number; amount: number | null; onClose: () => void; onDone: () => void }> =
  ({ milestoneId, amount, onClose, onDone }) => {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const confirm = async () => {
      setLoading(true); setErr("");
      try {
        const key = crypto.randomUUID();
        const r = await fetch(`${API}/milestones/${milestoneId}/fund`, {
          method: "POST",
          headers: { ...auth().headers, "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ payment_reference: `manual-${Date.now()}` }),
        });
        if (!r.ok) { const d = await r.json(); throw new Error(d.detail ?? "Fund failed"); }
        onDone();
      } catch (e: any) { setErr(e.message); }
      finally { setLoading(false); }
    };

    return (
      <Modal accentColor={TC.accent}>
        <div style={{ fontSize: 11, color: TC.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Confirm Payment</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: TC.text, marginBottom: 12 }}>Fund Milestone</div>
        <div style={{ padding: "14px 18px", background: TC.accentSoft, borderRadius: 12, fontSize: 24, fontWeight: 700, color: TC.accent, textAlign: "center" }}>
          {fmt(amount)}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: TC.sub, lineHeight: 1.7 }}>
          Funds will be locked in escrow until you approve the deliverable or an admin resolves a dispute.
        </div>
        {err && <ErrBox msg={err} />}
        <BtnRow onCancel={onClose} onConfirm={confirm} loading={loading} label="Fund Milestone" />
      </Modal>
    );
  };

// ── Submit Modal ──────────────────────────────────────────────────────────────

const SubmitModal: React.FC<{ milestoneId: number; onClose: () => void; onDone: () => void }> =
  ({ milestoneId, onClose, onDone }) => {
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const confirm = async () => {
      setLoading(true); setErr("");
      try {
        const r = await fetch(`${API}/milestones/${milestoneId}/submit`, {
          method: "POST",
          headers: { ...auth().headers, "Content-Type": "application/json" },
          body: JSON.stringify({ submission_note: note || null }),
        });
        if (!r.ok) { const d = await r.json(); throw new Error(d.detail ?? "Submit failed"); }
        onDone();
      } catch (e: any) { setErr(e.message); }
      finally { setLoading(false); }
    };

    return (
      <Modal accentColor={TC.blue}>
        <div style={{ fontSize: 11, color: TC.blue, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Submit Work</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: TC.text, marginBottom: 16 }}>Submit for Review</div>
        <Label>Submission note (optional)</Label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="Describe what you delivered…" style={inp({ resize: "vertical" } as any)} />
        {err && <ErrBox msg={err} />}
        <BtnRow onCancel={onClose} onConfirm={confirm} loading={loading} label="Submit Work" color={TC.blue} />
      </Modal>
    );
  };

// ── Reject Modal ──────────────────────────────────────────────────────────────

const RejectModal: React.FC<{ milestoneId: number; revisionCount: number; onClose: () => void; onDone: () => void }> =
  ({ milestoneId, revisionCount, onClose, onDone }) => {
    const [feedback, setFeedback] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const confirm = async () => {
      if (feedback.length < 10) { setErr("Feedback must be at least 10 characters."); return; }
      setLoading(true); setErr("");
      try {
        const r = await fetch(`${API}/milestones/${milestoneId}/reject`, {
          method: "POST",
          headers: { ...auth().headers, "Content-Type": "application/json" },
          body: JSON.stringify({ feedback }),
        });
        if (!r.ok) { const d = await r.json(); throw new Error(d.detail ?? "Reject failed"); }
        onDone();
      } catch (e: any) { setErr(e.message); }
      finally { setLoading(false); }
    };

    const remaining = 2 - revisionCount;

    return (
      <Modal accentColor={TC.orange}>
        <div style={{ fontSize: 11, color: TC.orange, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Request Revision</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: TC.text, marginBottom: 8 }}>Send Back for Revision</div>
        <div style={{ fontSize: 12, color: TC.amber, background: TC.amberSoft, padding: "8px 12px", borderRadius: 8, marginBottom: 16 }}>
          {remaining === 1 ? "⚠️ This is your last revision — a further rejection will force a dispute." : `${remaining} revision(s) remaining`}
        </div>
        <Label>Feedback (required, 10–1000 chars)</Label>
        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          rows={5}
          maxLength={1000}
          placeholder="Describe what needs to be changed…"
          style={inp({ resize: "vertical" } as any)}
        />
        <div style={{ fontSize: 11, color: TC.sub, textAlign: "right", marginTop: 4 }}>{feedback.length}/1000</div>
        {err && <ErrBox msg={err} />}
        <BtnRow onCancel={onClose} onConfirm={confirm} loading={loading} label="Request Revision" color={TC.orange} />
      </Modal>
    );
  };

// ── Admin Resolve Modal ───────────────────────────────────────────────────────

const AdminResolveModal: React.FC<{ milestoneId: number; amount: number | null; onClose: () => void; onDone: () => void }> =
  ({ milestoneId, amount, onClose, onDone }) => {
    const [resolution, setResolution] = useState<"force_pay" | "force_refund" | "split">("force_pay");
    const [splitPct, setSplitPct] = useState("50");
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const confirm = async () => {
      if (resolution === "split") {
        const pct = parseFloat(splitPct);
        if (isNaN(pct) || pct <= 0 || pct >= 100) { setErr("Split percentage must be between 1 and 99."); return; }
      }
      setLoading(true); setErr("");
      try {
        const key = crypto.randomUUID();
        const r = await fetch(`${API}/milestones/${milestoneId}/admin/resolve`, {
          method: "POST",
          headers: { ...auth().headers, "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({
            resolution,
            split_percentage: resolution === "split" ? parseFloat(splitPct) : undefined,
            note: note || null,
          }),
        });
        if (!r.ok) { const d = await r.json(); throw new Error(d.detail ?? "Resolve failed"); }
        onDone();
      } catch (e: any) { setErr(e.message); }
      finally { setLoading(false); }
    };

    const freelancerShare = resolution === "split" && amount
      ? ((parseFloat(splitPct) || 0) / 100 * amount).toFixed(2) : null;
    const clientShare = resolution === "split" && amount
      ? ((1 - (parseFloat(splitPct) || 0) / 100) * amount).toFixed(2) : null;

    return (
      <Modal accentColor={TC.red}>
        <div style={{ fontSize: 11, color: TC.red, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Admin Arbitration</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: TC.text, marginBottom: 20 }}>Resolve Dispute</div>
        <Label>Resolution type</Label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["force_pay", "force_refund", "split"] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setResolution(opt)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: resolution === opt ? TC.accent : "transparent",
                border: `1px solid ${resolution === opt ? TC.accent : TC.border}`,
                color: resolution === opt ? "#fff" : TC.sub,
              }}
            >
              {opt === "force_pay" ? "Pay Freelancer" : opt === "force_refund" ? "Refund Client" : "Split"}
            </button>
          ))}
        </div>
        {resolution === "split" && (
          <>
            <Label>Freelancer share (%)</Label>
            <input
              type="number" min={1} max={99} value={splitPct}
              onChange={e => setSplitPct(e.target.value)}
              style={inp({ marginBottom: 8 })}
            />
            {freelancerShare && (
              <div style={{ fontSize: 12, color: TC.sub, marginBottom: 16 }}>
                Freelancer: <strong style={{ color: TC.green }}>{fmt(parseFloat(freelancerShare))}</strong>
                {" · "}Client: <strong style={{ color: TC.amber }}>{fmt(parseFloat(clientShare!))}</strong>
              </div>
            )}
          </>
        )}
        <Label>Admin note (optional)</Label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Reason for decision…" style={inp({ resize: "vertical" } as any)} />
        {err && <ErrBox msg={err} />}
        <BtnRow onCancel={onClose} onConfirm={confirm} loading={loading} label="Confirm Resolution" color={TC.red} />
      </Modal>
    );
  };

// ── Milestone Card ────────────────────────────────────────────────────────────

const MilestoneCard: React.FC<{
  milestone: MilestoneDetail;
  index: number;
  userRole: string;
  onRefresh: () => void;
}> = ({ milestone, index, userRole, onRefresh }) => {
  const [modal, setModal] = useState<"fund" | "submit" | "reject" | "admin" | null>(null);
  const [escalating, setEscalating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [err, setErr] = useState("");

  const col = msColors[milestone.status] ?? { c: TC.sub, bg: TC.surface };
  const isClosed = CLOSED_STATES.has(milestone.status);

  const escalate = async () => {
    setEscalating(true); setErr("");
    try {
      const r = await fetch(`${API}/milestones/${milestone.milestone_id}/escalate`, {
        method: "POST", ...auth(),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail ?? "Escalate failed"); }
      onRefresh();
    } catch (e: any) { setErr(e.message); }
    finally { setEscalating(false); }
  };

  const approve = async () => {
    setApproving(true); setErr("");
    try {
      const key = crypto.randomUUID();
      const r = await fetch(`${API}/milestones/${milestone.milestone_id}/approve`, {
        method: "POST",
        headers: { ...auth().headers, "Idempotency-Key": key },
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail ?? "Approve failed"); }
      onRefresh();
    } catch (e: any) { setErr(e.message); }
    finally { setApproving(false); }
  };

  const isClient = userRole === "client";
  const isFreelancer = userRole === "freelancer";
  const isAdmin = userRole === "admin";

  return (
    <>
      <div style={{
        background: TC.card, border: `1px solid ${isClosed ? TC.border : col.c + "33"}`,
        borderRadius: 14, padding: 20, position: "relative", overflow: "hidden",
      }}>
        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: col.bg, border: `2px solid ${col.c}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: col.c, flexShrink: 0,
          }}>
            {isClosed ? "✓" : index + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: TC.text }}>
                {milestone.title || `Milestone ${index + 1}`}
              </span>
              <StatusChip status={milestone.status} />
              <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: col.c }}>
                {fmt(milestone.amount)}
              </span>
            </div>

            {/* Timestamps */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
              {milestone.deadline && (
                <span style={{ fontSize: 12, color: TC.sub }}>
                  <Clock size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />
                  Deadline: {fmtDate(milestone.deadline)}
                </span>
              )}
              {milestone.funded_at && (
                <span style={{ fontSize: 12, color: TC.green }}>
                  <DollarSign size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />
                  Funded: {fmtDate(milestone.funded_at)}
                </span>
              )}
              {milestone.submitted_at && (
                <span style={{ fontSize: 12, color: TC.blue }}>
                  <Send size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />
                  Submitted: {fmtDate(milestone.submitted_at)}
                </span>
              )}
              {milestone.revision_count > 0 && (
                <span style={{ fontSize: 12, color: TC.orange }}>
                  <RefreshCw size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />
                  Revisions: {milestone.revision_count}/2
                </span>
              )}
            </div>

            {/* Revision feedback */}
            {milestone.revision_feedback && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: TC.orangeSoft, borderRadius: 10, fontSize: 13, color: TC.orange, border: `1px solid ${TC.orange}33` }}>
                <strong>Client feedback:</strong> {milestone.revision_feedback}
              </div>
            )}

            {/* Action buttons */}
            {!isClosed && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                {/* CLIENT actions */}
                {isClient && milestone.status === "awaiting_funds" && (
                  <button onClick={() => setModal("fund")} style={actionBtn(TC.accent)}>
                    <DollarSign size={14} /> Fund Milestone
                  </button>
                )}
                {isClient && milestone.status === "in_review" && (
                  <>
                    <button onClick={approve} disabled={approving} style={actionBtn(TC.green)}>
                      <CheckCircle size={14} /> {approving ? "Approving…" : "Approve"}
                    </button>
                    <button onClick={() => setModal("reject")} style={actionBtn(TC.orange)}>
                      <XCircle size={14} /> Request Revision
                    </button>
                  </>
                )}
                {isClient && milestone.status === "in_revision" && (
                  <span style={{ fontSize: 13, color: TC.sub }}>Waiting for freelancer to resubmit…</span>
                )}

                {/* FREELANCER actions */}
                {isFreelancer && milestone.status === "awaiting_funds" && (
                  <span style={{ fontSize: 13, color: TC.sub }}>Waiting for client to fund…</span>
                )}
                {isFreelancer && milestone.status === "funded" && (
                  <button onClick={() => setModal("submit")} style={actionBtn(TC.blue)}>
                    <Send size={14} /> Submit Work
                  </button>
                )}
                {isFreelancer && milestone.status === "in_review" && (
                  <span style={{ fontSize: 13, color: TC.sub }}>Awaiting client review…</span>
                )}
                {isFreelancer && milestone.status === "in_revision" && (
                  <button onClick={() => setModal("submit")} style={actionBtn(TC.blue)}>
                    <RefreshCw size={14} /> Resubmit Work
                  </button>
                )}

                {/* Escalate (either party) */}
                {(isClient || isFreelancer) && ["in_review", "in_revision"].includes(milestone.status) && (
                  <button onClick={escalate} disabled={escalating} style={actionBtn(TC.red)}>
                    <AlertTriangle size={14} /> {escalating ? "Escalating…" : "Escalate to Dispute"}
                  </button>
                )}

                {/* Admin arbitration */}
                {isAdmin && milestone.status === "in_dispute" && (
                  <button onClick={() => setModal("admin")} style={actionBtn(TC.red)}>
                    <Gavel size={14} /> Resolve Dispute
                  </button>
                )}
              </div>
            )}

            {err && <ErrBox msg={err} />}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === "fund"   && <FundModal milestoneId={milestone.milestone_id} amount={milestone.amount} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); }} />}
      {modal === "submit" && <SubmitModal milestoneId={milestone.milestone_id} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); }} />}
      {modal === "reject" && <RejectModal milestoneId={milestone.milestone_id} revisionCount={milestone.revision_count} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); }} />}
      {modal === "admin"  && <AdminResolveModal milestoneId={milestone.milestone_id} amount={milestone.amount} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); }} />}
    </>
  );
};

function actionBtn(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
    background: color + "22", border: `1px solid ${color}55`,
    borderRadius: 10, color, cursor: "pointer", fontSize: 13, fontWeight: 600,
  };
}

// ── Auto-split Banner ─────────────────────────────────────────────────────────

const AutoSplitBanner: React.FC<{ contractId: number; budget: number; onDone: () => void }> =
  ({ contractId, budget, onDone }) => {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const split = async () => {
      setLoading(true); setErr("");
      try {
        const r = await fetch(`${API}/contracts/${contractId}/auto-split`, {
          method: "POST", ...auth(),
        });
        if (!r.ok) { const d = await r.json(); throw new Error(d.detail ?? "Split failed"); }
        onDone();
      } catch (e: any) { setErr(e.message); }
      finally { setLoading(false); }
    };

    return (
      <div style={{ background: TC.card, border: `1px solid ${TC.accent}44`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ padding: 12, background: TC.accentSoft, borderRadius: 12 }}>
            <Shield size={22} color={TC.accent} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: TC.text }}>Enable Strict Escrow</div>
            <div style={{ fontSize: 13, color: TC.sub, marginTop: 4 }}>
              Auto-split your {fmt(budget)} budget into protected milestones. Funds release only on your approval.
            </div>
          </div>
          <button onClick={split} disabled={loading} style={{
            padding: "11px 20px", background: TC.accent, border: "none", borderRadius: 10,
            color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, opacity: loading ? 0.7 : 1,
          }}>
            {loading ? "Creating…" : "Auto-Split Milestones"}
          </button>
        </div>
        {err && <ErrBox msg={err} />}
      </div>
    );
  };

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MilestoneEscrowPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();

  const [contract, setContract]     = useState<Contract | null>(null);
  const [milestones, setMilestones] = useState<MilestoneDetail[]>([]);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState("");
  const userRole                    = role();

  const NEW_STATUSES = new Set([
    "awaiting_funds", "funded", "in_review", "in_revision",
    "in_dispute", "closed_success", "closed_refunded",
    "closed_auto_approve", "closed_auto_refund",
  ]);

  const load = useCallback(async () => {
    if (!contractId) return;
    setLoading(true); setErr("");
    try {
      const [cRes, mRes] = await Promise.all([
        fetch(`${API}/contracts/${contractId}`, auth()),
        fetch(`${API}/contracts/${contractId}/milestones`, auth()),
      ]);
      if (!cRes.ok) throw new Error("Could not load contract.");
      if (!mRes.ok) throw new Error("Could not load milestones.");
      setContract(await cRes.json());
      setMilestones(await mRes.json());
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  const hasNewStyle = milestones.some(m => NEW_STATUSES.has(m.status));
  const showAutoSplit = !hasNewStyle && userRole === "client" && contract?.status === "active";

  return (
    <div style={{ minHeight: "100vh", background: TC.bg, padding: "32px 16px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button onClick={() => navigate(`/contract/${contractId}`)} style={{ background: "transparent", border: "none", color: TC.sub, cursor: "pointer", padding: 4 }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ fontSize: 11, color: TC.accent, textTransform: "uppercase", letterSpacing: ".08em" }}>Escrow Workflow</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: TC.text }}>
              {contract?.project?.title ?? `Contract #${contractId}`}
            </div>
          </div>
          {contract?.project?.budget && (
            <div style={{ marginLeft: "auto", padding: "8px 14px", background: TC.accentSoft, borderRadius: 10, fontSize: 14, fontWeight: 700, color: TC.accent }}>
              {fmt(contract.project.budget)}
            </div>
          )}
        </div>

        {/* Loading / Error */}
        {loading && <div style={{ color: TC.sub, fontSize: 14, textAlign: "center", padding: 40 }}>Loading milestones…</div>}
        {err && <div style={{ padding: "14px 18px", background: TC.redSoft, color: TC.red, borderRadius: 12, marginBottom: 20 }}>{err}</div>}

        {/* Auto-split banner */}
        {!loading && showAutoSplit && contract && (
          <AutoSplitBanner contractId={Number(contractId)} budget={contract.project?.budget ?? 0} onDone={load} />
        )}

        {/* Milestone timeline */}
        {!loading && milestones.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: TC.sub }}>
            No milestones yet. {userRole === "client" ? "Use Auto-Split or add milestones manually." : "Waiting for client to set up milestones."}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {milestones.map((m, i) => (
            <MilestoneCard key={m.milestone_id} milestone={m} index={i} userRole={userRole} onRefresh={load} />
          ))}
        </div>
      </div>
    </div>
  );
}
