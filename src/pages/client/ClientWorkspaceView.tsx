import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { type ThemeColors, Badge, Skeleton, IconRefresh, fmt, contractStatusColor } from "./clientShared";

interface Project {
  project_id: number;
  title: string;
  budget: number;
}

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
  status: "pending" | "revision_requested" | "approved" | "paid";
  due_date: string | null;
  created_at: string;
  ai_verification_status: "passed" | "flagged" | "insufficient_evidence" | null;
  ai_verification_report: string | null;
  revision_feedback: string | null;
}

interface Escrow {
  escrow_id: number;
  contract_id: number;
  amount: number;
  released_amount: number;
  status: "held" | "released";
}

interface ContractDetail {
  project: Project | null;
  milestones: Milestone[];
  escrow: Escrow | null;
  loading: boolean;
}

const WS_MS_COLORS = {
  pending:            { bg: "rgba(245,158,11,.1)",  color: "#f59e0b",  label: "Pending" },
  revision_requested: { bg: "rgba(249,115,22,.1)",  color: "#f97316",  label: "Revision" },
  approved:           { bg: "rgba(59,130,246,.1)",  color: "#3b82f6",  label: "Approved" },
  paid:               { bg: "rgba(34,197,94,.1)",   color: "#22c55e",  label: "Paid ✓" },
};

const API_WS = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const wsAuth = () => ({ Authorization: `Bearer ${localStorage.getItem("access_token")}` });

// ─── Modals ───────────────────────────────────────────────────────────────────

const WsModal: React.FC<{ colors: ThemeColors; children: React.ReactNode }> = ({ colors: c, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 28, width: "100%", maxWidth: 460 }}>
      {children}
    </div>
  </div>
);

const WsAddMilestoneModal: React.FC<{
  colors: ThemeColors; contractId: number; escrowRemaining: number;
  onClose: () => void; onDone: () => void;
}> = ({ colors: c, contractId, escrowRemaining, onClose, onDone }) => {
  const [title, setTitle]   = useState("");
  const [desc, setDesc]     = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr("Amount must be > $0"); return; }
    if (amt > escrowRemaining + 0.01) { setErr(`Cannot exceed escrow remaining (${fmt(escrowRemaining)})`); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API_WS}/contracts/${contractId}/milestones`, {
        method: "POST",
        headers: { ...wsAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || null, description: desc || null, amount: amt, due_date: dueDate || null }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 13, background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <WsModal colors={c}>
      <div style={{ fontSize: 11, color: c.primary, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>New Milestone</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: c.text, marginBottom: 4 }}>Add Payment Milestone</div>
      <div style={{ fontSize: 12, color: c.subtext, marginBottom: 18 }}>Escrow remaining: <strong style={{ color: "#22c55e" }}>{fmt(escrowRemaining)}</strong></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>Title</div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Initial Mockup" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>Description</div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={{ ...inp, resize: "vertical" } as any} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>Amount (USD) *</div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: c.subtext }}>$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inp, paddingLeft: 24 }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: c.subtext, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>Due Date</div>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp} />
          </div>
        </div>
      </div>
      {err && <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,.1)", color: "#ef4444", borderRadius: 7, fontSize: 12 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8, color: c.subtext, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
        <button onClick={submit} disabled={loading} style={{ flex: 2, padding: "10px 0", background: c.primary, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, opacity: loading ? 0.7 : 1, fontFamily: "inherit" }}>
          {loading ? "Adding…" : "Add Milestone"}
        </button>
      </div>
    </WsModal>
  );
};

const WsRevisionModal: React.FC<{
  colors: ThemeColors; milestoneId: number; milestoneTitle: string | null;
  onClose: () => void; onDone: () => void;
}> = ({ colors: c, milestoneId, milestoneTitle, onClose, onDone }) => {
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");

  const submit = async () => {
    if (!feedback.trim()) { setErr("Please describe what needs to be revised."); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API_WS}/milestones/${milestoneId}/request-revision`, {
        method: "POST",
        headers: { ...wsAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Request failed"); }
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 13, background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <WsModal colors={c}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔄</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: c.text, marginBottom: 6 }}>Request Revision</div>
        <div style={{ fontSize: 12, color: c.subtext, lineHeight: 1.6 }}>
          Tell the freelancer what needs to be changed on <strong style={{ color: c.text }}>{milestoneTitle || `Milestone #${milestoneId}`}</strong>.
        </div>
      </div>
      <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={5}
        placeholder="e.g. The login screen design doesn't match the mockup. Please update the colour scheme…"
        style={{ ...inp, resize: "vertical" } as any} />
      {err && <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,.1)", color: "#ef4444", borderRadius: 7, fontSize: 12 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8, color: c.subtext, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
        <button onClick={submit} disabled={loading} style={{ flex: 2, padding: "10px 0", background: "#f97316", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, opacity: loading ? 0.7 : 1, fontFamily: "inherit" }}>
          {loading ? "Sending…" : "Send Revision Request"}
        </button>
      </div>
    </WsModal>
  );
};

// ─── Main view ────────────────────────────────────────────────────────────────

const ClientWorkspaceView: React.FC<{
  colors: ThemeColors;
  contracts: Contract[];
  projects: Project[];
  loading: boolean;
  onRefresh: () => void;
}> = ({ colors: c, contracts, projects, loading, onRefresh }) => {
  const navigate = useNavigate();
  const [filter, setFilter]             = useState<"all" | "active" | "completed" | "disputed">("active");
  const [selected, setSelected]         = useState<number | null>(null);
  const [details, setDetails]           = useState<Record<number, ContractDetail>>({});
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAddMs, setShowAddMs]       = useState<number | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<{ milestoneId: number; milestoneTitle: string | null } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadDetail = useCallback(async (contractId: number, force = false) => {
    if (details[contractId] && !force) return;
    const ct = contracts.find(x => x.contract_id === contractId);
    if (!ct) return;
    setDetails(prev => ({ ...prev, [contractId]: { project: null, milestones: [], escrow: null, loading: true } }));
    try {
      const [mr, pr, er] = await Promise.all([
        fetch(`${API_WS}/contracts/${contractId}/milestones`, { headers: wsAuth() }),
        fetch(`${API_WS}/projects/${ct.project_id}`, { headers: wsAuth() }),
        fetch(`${API_WS}/escrow/contract/${contractId}`, { headers: wsAuth() }),
      ]);
      const [milestones, project, escrow] = await Promise.all([
        mr.ok ? mr.json() : Promise.resolve([]),
        pr.ok ? pr.json() : Promise.resolve(null),
        er.ok ? er.json() : Promise.resolve(null),
      ]);
      setDetails((prev: Record<number, ContractDetail>) => ({
        ...prev,
        [contractId]: { milestones, project, escrow, loading: false },
      }));
    } catch {
      setDetails(prev => ({ ...prev, [contractId]: { ...prev[contractId], loading: false } }));
    }
  }, [contracts]);

  const handleSelect = (contractId: number) => {
    if (selected === contractId) { setSelected(null); return; }
    setSelected(contractId);
    loadDetail(contractId);
  };

  const updateMilestone = async (contractId: number, milestoneId: number, status: "approved" | "paid") => {
    setActionLoading(milestoneId);
    try {
      const r = await fetch(`${API_WS}/milestones/${milestoneId}/status`, {
        method: "PUT",
        headers: { ...wsAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      showToast(status === "approved" ? "Payment released! 💸" : "Milestone marked as paid ✓", true);
      await loadDetail(contractId, true);
      onRefresh();
    } catch (e: any) { showToast(e.message, false); } finally { setActionLoading(null); }
  };

  const completeContract = async (contractId: number) => {
    try {
      const r = await fetch(`${API_WS}/contracts/${contractId}/complete`, { method: "POST", headers: wsAuth() });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      showToast("Contract completed! 🎉", true);
      await loadDetail(contractId, true);
      onRefresh();
    } catch (e: any) { showToast(e.message, false); }
  };

  const filtered = filter === "all" ? contracts : contracts.filter(ct => ct.status === filter);
  const counts = {
    all:       contracts.length,
    active:    contracts.filter(ct => ct.status === "active").length,
    completed: contracts.filter(ct => ct.status === "completed").length,
    disputed:  contracts.filter(ct => ct.status === "disputed").length,
  };

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 3000, padding: "12px 20px", borderRadius: 12, background: toast.ok ? "#22c55e" : "#ef4444", color: toast.ok ? "#000" : "#fff", fontWeight: 600, fontSize: 13, boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Workspace</div>
          <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Manage your contracts and milestones</div>
        </div>
        <button onClick={onRefresh} style={{ background: "transparent", border: `0.5px solid ${c.border}`, color: c.subtext, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          <IconRefresh /> Refresh
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["all", "active", "completed", "disputed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 11, padding: "5px 14px", borderRadius: 100, border: `0.5px solid ${filter === f ? c.primary : c.border}`, background: filter === f ? c.primarySoft : "transparent", color: filter === f ? c.primary : c.subtext, cursor: "pointer", fontFamily: "inherit", fontWeight: filter === f ? 600 : 400 }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}{counts[f] > 0 ? ` (${counts[f]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2, 3].map(i => <Skeleton key={i} h={72} />)}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>
            {filter === "all" ? "No contracts yet" : `No ${filter} contracts`}
          </div>
          <div style={{ fontSize: 12, color: c.subtext }}>Accept a proposal to create a contract with a freelancer.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(ct => {
            const proj = projects.find(p => p.project_id === ct.project_id);
            const cs   = contractStatusColor(ct.status);
            const det  = details[ct.contract_id];
            const isOpen      = selected === ct.contract_id;
            const paidCount   = det?.milestones.filter(m => m.status === "paid").length ?? 0;
            const totalCount  = det?.milestones.length ?? 0;
            const pendingCount = det?.milestones.filter(m => m.status === "pending").length ?? 0;
            const allPaid     = totalCount > 0 && paidCount === totalCount;

            return (
              <div key={ct.contract_id} style={{ background: c.surface, border: `0.5px solid ${isOpen ? c.primary + "60" : c.border}`, borderRadius: 14, overflow: "hidden", transition: "border-color .2s" }}>

                {/* Contract header row */}
                <div
                  onClick={() => handleSelect(ct.contract_id)}
                  style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = c.bg + "80"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: cs.color, flexShrink: 0, boxShadow: `0 0 8px ${cs.color}88` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {proj?.title ?? `Project #${ct.project_id}`}
                      </span>
                      <Badge bg={cs.bg} color={cs.color} border={cs.border} style={{ margin: 0 }}>{ct.status}</Badge>
                      {pendingCount > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 100, background: "#f59e0b18", color: "#f59e0b", border: "0.5px solid #f59e0b30" }}>
                          {pendingCount} pending
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: c.subtext, marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>#{ct.contract_id}</span>
                      <span>Freelancer #{ct.freelancer_id}</span>
                      <span>{new Date(ct.created_at).toLocaleDateString()}</span>
                      {proj && <span style={{ color: "#22c55e" }}>{fmt(proj.budget)}</span>}
                    </div>
                  </div>
                  {det && !det.loading && totalCount > 0 && (
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: c.subtext, marginBottom: 3 }}>{paidCount}/{totalCount} paid</div>
                      <div style={{ width: 72, height: 4, background: c.border, borderRadius: 100, overflow: "hidden" }}>
                        <div style={{ width: `${(paidCount / totalCount) * 100}%`, height: "100%", background: "#22c55e", borderRadius: 100, transition: "width .4s" }} />
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: c.subtext, flexShrink: 0, transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "none" }}>▼</div>
                </div>

                {/* Expanded milestone panel */}
                {isOpen && (
                  <div style={{ borderTop: `0.5px solid ${c.border}`, background: c.bg, padding: 16 }}>
                    {det?.loading ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[1, 2].map(i => <Skeleton key={i} h={60} />)}</div>
                    ) : (
                      <>
                        {det?.escrow && (
                          <div style={{ display: "flex", marginBottom: 14, background: c.surface, borderRadius: 10, border: `0.5px solid ${c.border}`, overflow: "hidden" }}>
                            {[
                              { label: "Escrow Total", val: fmt(det.escrow.amount),                               color: c.text },
                              { label: "Released",     val: fmt(det.escrow.released_amount),                      color: "#22c55e" },
                              { label: "Remaining",    val: fmt(det.escrow.amount - det.escrow.released_amount),  color: "#f59e0b" },
                            ].map((item, idx) => (
                              <div key={item.label} style={{ flex: 1, padding: "10px 14px", borderRight: idx < 2 ? `0.5px solid ${c.border}` : "none" }}>
                                <div style={{ fontSize: 10, color: c.subtext, marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>{item.label}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.val}</div>
                              </div>
                            ))}
                            <div style={{ flex: 2, padding: "10px 14px", display: "flex", alignItems: "center" }}>
                              <div style={{ width: "100%", height: 5, background: c.border, borderRadius: 100, overflow: "hidden" }}>
                                <div style={{ width: `${Math.min(100, (det.escrow.released_amount / det.escrow.amount) * 100)}%`, height: "100%", background: "#22c55e", borderRadius: 100, transition: "width .6s" }} />
                              </div>
                            </div>
                          </div>
                        )}

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>
                            Milestones
                            {totalCount > 0 && <span style={{ fontSize: 11, color: c.subtext, fontWeight: 400, marginLeft: 6 }}>{paidCount}/{totalCount} paid</span>}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            {ct.status === "active" && (
                              <button
                                onClick={() => setShowAddMs(ct.contract_id)}
                                style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primary}40`, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
                              >
                                + Add Milestone
                              </button>
                            )}
                            <button
                              onClick={() => navigate(`/contract/${ct.contract_id}`)}
                              style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, background: "transparent", color: c.subtext, border: `0.5px solid ${c.border}`, cursor: "pointer", fontFamily: "inherit" }}
                            >
                              Full View →
                            </button>
                          </div>
                        </div>

                        {!det?.milestones || det.milestones.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "28px 0", color: c.subtext }}>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>📌</div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 4 }}>No milestones yet</div>
                            {ct.status === "active" && <div style={{ fontSize: 12 }}>Click "+ Add Milestone" to track work and release payments.</div>}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {det.milestones.map(ms => {
                              const msc  = WS_MS_COLORS[ms.status as keyof typeof WS_MS_COLORS] ?? WS_MS_COLORS.pending;
                              const isAct = actionLoading === ms.milestone_id;
                              return (
                                <div key={ms.milestone_id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "12px 14px" }}>
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: msc.color, marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${msc.color}66` }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                        <div>
                                          <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{ms.title || `Milestone #${ms.milestone_id}`}</div>
                                          {ms.description && <div style={{ fontSize: 11, color: c.subtext, marginTop: 2, lineHeight: 1.4 }}>{ms.description}</div>}
                                          {ms.due_date && <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 3 }}>Due {new Date(ms.due_date).toLocaleDateString()}</div>}
                                        </div>
                                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                                          <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{fmt(ms.amount)}</div>
                                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: msc.bg, color: msc.color }}>{msc.label}</span>
                                        </div>
                                      </div>

                                      {ms.status === "revision_requested" && ms.revision_feedback && (
                                        <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(249,115,22,.08)", border: "0.5px solid rgba(249,115,22,.2)", borderRadius: 8 }}>
                                          <div style={{ fontSize: 11, color: "#f97316", fontWeight: 600, marginBottom: 3 }}>🔄 Revision Requested</div>
                                          <div style={{ fontSize: 11, color: c.text, lineHeight: 1.5 }}>{ms.revision_feedback}</div>
                                        </div>
                                      )}

                                      {ms.ai_verification_status && (
                                        <div style={{ marginTop: 6 }}>
                                          <span style={{
                                            fontSize: 10, padding: "2px 8px", borderRadius: 100,
                                            background: ms.ai_verification_status === "passed" ? "rgba(34,197,94,.1)" : ms.ai_verification_status === "flagged" ? "rgba(239,68,68,.1)" : "rgba(245,158,11,.1)",
                                            color:      ms.ai_verification_status === "passed" ? "#22c55e"            : ms.ai_verification_status === "flagged" ? "#ef4444"           : "#f59e0b",
                                          }}>
                                            {ms.ai_verification_status === "passed" ? "🤖 AI: Passed ✓" : ms.ai_verification_status === "flagged" ? "🤖 AI: Flagged ⚠" : "🤖 AI: Needs more files"}
                                          </span>
                                        </div>
                                      )}

                                      {ct.status === "active" && (
                                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                                          {ms.status === "pending" && (
                                            <>
                                              <button
                                                onClick={() => setRevisionTarget({ milestoneId: ms.milestone_id, milestoneTitle: ms.title })}
                                                style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, background: "rgba(249,115,22,.1)", border: "0.5px solid rgba(249,115,22,.3)", color: "#f97316", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
                                              >
                                                🔄 Request Revision
                                              </button>
                                              <button
                                                onClick={() => updateMilestone(ct.contract_id, ms.milestone_id, "approved")}
                                                disabled={isAct}
                                                style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "#22c55e", border: "none", color: "#000", cursor: isAct ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: isAct ? 0.6 : 1 }}
                                              >
                                                {isAct ? "…" : "✓ Approve & Release"}
                                              </button>
                                            </>
                                          )}
                                          {ms.status === "approved" && (
                                            <button
                                              onClick={() => updateMilestone(ct.contract_id, ms.milestone_id, "paid")}
                                              disabled={isAct}
                                              style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "rgba(59,130,246,.12)", border: "0.5px solid rgba(59,130,246,.3)", color: "#3b82f6", cursor: isAct ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600 }}
                                            >
                                              {isAct ? "…" : "Mark as Paid"}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {ct.status === "active" && allPaid && totalCount > 0 && (
                          <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(34,197,94,.06)", border: "0.5px solid rgba(34,197,94,.25)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#22c55e" }}>All milestones paid!</div>
                              <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>Ready to complete this contract.</div>
                            </div>
                            <button
                              onClick={() => completeContract(ct.contract_id)}
                              style={{ fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 9, background: "#22c55e", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
                            >
                              Complete Contract ✓
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddMs !== null && (() => {
        const det = details[showAddMs];
        const used  = det?.milestones?.reduce((a, m) => a + m.amount, 0) ?? 0;
        const total = det?.escrow?.amount ?? 0;
        return (
          <WsAddMilestoneModal
            colors={c}
            contractId={showAddMs}
            escrowRemaining={Math.max(0, total - used)}
            onClose={() => setShowAddMs(null)}
            onDone={() => { const id = showAddMs; setShowAddMs(null); loadDetail(id, true); showToast("Milestone added!", true); }}
          />
        );
      })()}

      {revisionTarget && (
        <WsRevisionModal
          colors={c}
          milestoneId={revisionTarget.milestoneId}
          milestoneTitle={revisionTarget.milestoneTitle}
          onClose={() => setRevisionTarget(null)}
          onDone={() => { setRevisionTarget(null); if (selected) loadDetail(selected, true); showToast("Revision request sent.", true); }}
        />
      )}
    </div>
  );
};

export default ClientWorkspaceView;
