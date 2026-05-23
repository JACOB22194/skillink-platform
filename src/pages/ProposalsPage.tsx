/**
 * ProposalsPage.tsx
 * Route: /proposals  (freelancer view)
 * Shows all proposals submitted + allows submitting new ones
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });

// ── Types ────────────────────────────────────────────────────────────────────

interface Project {
  project_id: number;
  title: string;
  description: string | null;
  budget: number;
  status: string;
  sub_category: string | null;
}

interface Proposal {
  proposal_id: number;
  project_id: number;
  freelancer_id: number;
  bid_amount: number;
  cover_letter: string | null;
  ai_relevance_score: number | null;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

// ── Theme ────────────────────────────────────────────────────────────────────

const T = {
  bg: "#0a0a0f",
  surface: "#13131a",
  card: "#1a1a24",
  border: "#252535",
  text: "#e8e8f0",
  sub: "#7070a0",
  accent: "#7F77DD",
  accentSoft: "#7F77DD22",
  green: "#22d3a0",
  greenSoft: "#22d3a015",
  red: "#f05070",
  redSoft: "#f0507015",
  amber: "#f5a623",
  amberSoft: "#f5a62315",
};

const statusConfig = {
  pending:  { color: T.amber,  bg: T.amberSoft,  label: "Pending Review",  dot: "●" },
  accepted: { color: T.green,  bg: T.greenSoft,  label: "Accepted 🎉",     dot: "●" },
  rejected: { color: T.red,    bg: T.redSoft,    label: "Not Selected",    dot: "●" },
};

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ── Sub-components ────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ s: Proposal["status"] }> = ({ s }) => {
  const cfg = statusConfig[s];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, letterSpacing: ".04em",
      padding: "4px 10px", borderRadius: 100,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}33`,
    }}>
      <span style={{ fontSize: 8 }}>{cfg.dot}</span>
      {cfg.label}
    </span>
  );
};

// ── Submit Proposal Modal ─────────────────────────────────────────────────────

const SCORE_THRESHOLD = 0.40;

interface ScoreResult { score: number; reasoning: string; passes: boolean; }

const SubmitModal: React.FC<{
  project: Project;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ project, onClose, onSuccess }) => {
  const [bid, setBid]         = useState(String(Math.round(project.budget * 0.9)));
  const [letter, setLetter]   = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  const [scoreResult, setScoreResult]   = useState<ScoreResult | null>(null);
  const [checking, setChecking]         = useState(false);
  const [scoreErr, setScoreErr]         = useState("");
  const [scoredLetter, setScoredLetter] = useState("");
  const [scoredBid, setScoredBid]       = useState("");

  const scoreStale = scoreResult !== null && (letter !== scoredLetter || bid !== scoredBid);

  const checkScore = async () => {
    const amount = parseFloat(bid);
    if (!amount || amount < 1) { setErr("Bid must be at least $1"); return; }
    setChecking(true); setScoreErr("");
    try {
      const r = await fetch(`${API}/proposals/score-draft`, {
        method: "POST",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.project_id, cover_letter: letter, bid_amount: amount }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Score check failed"); }
      const data: ScoreResult = await r.json();
      setScoreResult(data);
      setScoredLetter(letter);
      setScoredBid(bid);
    } catch (e: any) { setScoreErr(e.message); }
    finally { setChecking(false); }
  };

  const submit = async () => {
    if (!scoreResult?.passes || scoreStale) return;
    const amount = parseFloat(bid);
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/proposals`, {
        method: "POST",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.project_id, bid_amount: amount, cover_letter: letter || null }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Failed"); }
      onSuccess();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const pct = scoreResult ? Math.round(scoreResult.score * 100) : 0;
  const scoreColor = scoreResult
    ? scoreResult.passes ? T.green : pct >= 25 ? T.amber : T.red
    : T.sub;
  const canSubmit = !!scoreResult?.passes && !scoreStale;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, overflowY: "auto" }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 32, width: "100%", maxWidth: 540, position: "relative", margin: "auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Submit Proposal</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{project.title}</div>
          <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>Budget: ${project.budget.toLocaleString()}</div>
        </div>

        {/* AI Gate explanation */}
        <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: T.accent, lineHeight: 1.5 }}>
          AI Comprehension Gate — Your proposal must score ≥ 40% relevance before it can be submitted. Write a specific cover letter explaining your approach to this project.
        </div>

        {/* Bid */}
        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: T.sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Your Bid Amount (USD)</div>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.sub, fontSize: 14 }}>$</span>
            <input
              type="number" value={bid}
              onChange={e => setBid(e.target.value)}
              min={1}
              style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px 12px 28px", color: T.text, fontSize: 16, fontWeight: 600, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        </label>

        {/* Cover Letter */}
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: T.sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Cover Letter
            <span style={{ color: T.accent, marginLeft: 6, fontSize: 10, textTransform: "none" }}>* required for AI gate</span>
          </div>
          <textarea
            value={letter}
            onChange={e => setLetter(e.target.value)}
            rows={5}
            placeholder="Explain your approach, relevant experience, and why you're the best fit for this specific project…"
            style={{ width: "100%", background: T.surface, border: `1px solid ${scoreStale ? T.amber : T.border}`, borderRadius: 10, padding: "12px 14px", color: T.text, fontSize: 13, outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box", transition: "border-color .2s" }}
          />
        </label>

        {/* Check Score Button */}
        <button
          onClick={checkScore}
          disabled={checking}
          style={{ width: "100%", padding: "11px", marginBottom: 14, background: T.accentSoft, border: `1px solid ${T.accent}55`, borderRadius: 10, color: T.accent, fontWeight: 600, cursor: checking ? "not-allowed" : "pointer", fontSize: 13, opacity: checking ? 0.7 : 1 }}
        >
          {checking ? "Analyzing proposal…" : (scoreResult && !scoreStale) ? "Re-check AI Score →" : "Check AI Relevance Score →"}
        </button>

        {/* Score Error */}
        {scoreErr && (
          <div style={{ background: T.redSoft, border: `1px solid ${T.red}33`, borderRadius: 8, padding: "10px 14px", color: T.red, fontSize: 13, marginBottom: 14 }}>{scoreErr}</div>
        )}

        {/* Stale warning */}
        {scoreStale && (
          <div style={{ fontSize: 12, color: T.amber, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            ⚠ You've edited your proposal — re-check your AI score before submitting.
          </div>
        )}

        {/* Score Result Panel */}
        {scoreResult && !scoreStale && (
          <div style={{ background: T.surface, border: `1px solid ${scoreColor}55`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>AI Relevance Score</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: scoreColor }}>{pct}%</span>
            </div>

            {/* Score bar */}
            <div style={{ position: "relative", height: 8, background: T.border, borderRadius: 100, marginBottom: 6, overflow: "visible" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: scoreColor, borderRadius: 100, transition: "width .5s" }} />
              {/* Threshold marker at 40% */}
              <div style={{ position: "absolute", left: "40%", top: -4, height: 16, width: 2, background: T.amber, borderRadius: 1 }} />
            </div>
            <div style={{ fontSize: 10, color: T.sub, marginBottom: 10 }}>
              Minimum threshold: <span style={{ color: T.amber }}>40%</span>
            </div>

            {scoreResult.passes ? (
              <div style={{ fontSize: 12, color: T.green, fontWeight: 600 }}>
                ✓ Proposal meets the relevance threshold — you may submit.
              </div>
            ) : (
              <div style={{ fontSize: 12, color: T.red }}>
                ✗ Score is below 40%. Improve your cover letter by explaining how your skills address the specific project requirements, then re-check.
              </div>
            )}

            {scoreResult.reasoning && (
              <div style={{ fontSize: 11, color: T.sub, marginTop: 10, lineHeight: 1.5, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                {scoreResult.reasoning}
              </div>
            )}
          </div>
        )}

        {err && <div style={{ background: T.redSoft, border: `1px solid ${T.red}33`, borderRadius: 8, padding: "10px 14px", color: T.red, fontSize: 13, marginBottom: 14 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.sub, cursor: "pointer", fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || loading}
            title={!scoreResult ? "Check AI score first" : !scoreResult.passes ? "Improve your proposal to meet the 40% threshold" : scoreStale ? "Re-check AI score after editing" : ""}
            style={{
              flex: 2, padding: "12px",
              background: canSubmit ? T.accent : T.border,
              border: "none", borderRadius: 10, color: "#fff", fontWeight: 700,
              cursor: (!canSubmit || loading) ? "not-allowed" : "pointer",
              fontSize: 14, opacity: loading ? 0.7 : 1, transition: "background .3s",
            }}
          >
            {loading ? "Submitting…" : "Submit Proposal →"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Edit Proposal Modal ───────────────────────────────────────────────────────

const EditModal: React.FC<{
  proposal: Proposal;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ proposal, onClose, onSuccess }) => {
  const [bid, setBid]       = useState(String(proposal.bid_amount));
  const [letter, setLetter] = useState(proposal.cover_letter ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState("");

  const submit = async () => {
    const amount = parseFloat(bid);
    if (!amount || amount < 1) { setErr("Bid must be at least $1"); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/proposals/${proposal.proposal_id}`, {
        method: "PATCH",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ bid_amount: amount, cover_letter: letter || null }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || "Failed"); }
      onSuccess();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 32, width: "100%", maxWidth: 520 }}>
        <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Edit Proposal</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 20 }}>Update Your Bid</div>

        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: T.sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Your Bid Amount (USD)</div>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.sub, fontSize: 14 }}>$</span>
            <input type="number" value={bid} onChange={e => setBid(e.target.value)} min={1}
              style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px 12px 28px", color: T.text, fontSize: 16, fontWeight: 600, outline: "none", boxSizing: "border-box" }} />
          </div>
        </label>

        <label style={{ display: "block", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Cover Letter <span style={{ color: T.border }}>(optional)</span></div>
          <textarea value={letter} onChange={e => setLetter(e.target.value)} rows={5}
            style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", color: T.text, fontSize: 13, outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />
        </label>

        {err && <div style={{ background: T.redSoft, border: `1px solid ${T.red}33`, borderRadius: 8, padding: "10px 14px", color: T.red, fontSize: 13, marginBottom: 16 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.sub, cursor: "pointer", fontSize: 13 }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 2, padding: "12px", background: T.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Withdraw Confirm ──────────────────────────────────────────────────────────

const WithdrawConfirm: React.FC<{ id: number; onClose: () => void; onDone: () => void }> = ({ id, onClose, onDone }) => {
  const [loading, setLoading] = useState(false);
  const go = async () => {
    setLoading(true);
    await fetch(`${API}/proposals/${id}`, { method: "DELETE", ...auth() });
    onDone();
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 28, maxWidth: 380, width: "90%", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>Withdraw Proposal?</div>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 24 }}>This action cannot be undone. Your proposal will be permanently removed.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.sub, cursor: "pointer" }}>Keep It</button>
          <button onClick={go} disabled={loading} style={{ flex: 1, padding: 12, background: T.red, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            {loading ? "…" : "Withdraw"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const ProposalsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [proposals, setProposals]       = useState<Proposal[]>([]);
  const [openProjects, setOpenProjects] = useState<Project[]>([]);
  const [tab, setTab]                   = useState<"my" | "browse">("my");
  const [submitFor, setSubmitFor]       = useState<Project | null>(null);
  const [withdrawId, setWithdrawId]     = useState<number | null>(null);
  const [editProposal, setEditProposal] = useState<Proposal | null>(null);
  const [filterText, setFilterText]     = useState("");
  const [filterMin, setFilterMin]       = useState("");
  const [filterMax, setFilterMax]       = useState("");
  const [loading, setLoading]           = useState(true);
  const [projLoading, setProjLoading]   = useState(false);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);
  const applyProjectId = searchParams.get("apply") ? Number(searchParams.get("apply")) : null;

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchMyProposals = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/proposals/my`, auth());
      if (r.ok) setProposals(await r.json());
    } finally { setLoading(false); }
  }, []);

  const fetchOpenProjects = useCallback(async () => {
    setProjLoading(true);
    try {
      const r = await fetch(`${API}/projects?status=open`, auth());
      if (r.ok) {
        const data = await r.json();
        const myProjectIds = new Set(proposals.map(p => p.project_id));
        setOpenProjects((Array.isArray(data) ? data : data.projects || []).filter((p: Project) => !myProjectIds.has(p.project_id)));
      }
    } finally { setProjLoading(false); }
  }, [proposals]);

  useEffect(() => { fetchMyProposals(); }, [fetchMyProposals]);
  useEffect(() => { if (tab === "browse") fetchOpenProjects(); }, [tab, fetchOpenProjects]);
  useEffect(() => {
    if (applyProjectId) { setTab("browse"); }
  }, [applyProjectId]);
  useEffect(() => {
    if (applyProjectId && openProjects.length > 0 && !submitFor) {
      const p = openProjects.find((x: Project) => x.project_id === applyProjectId);
      if (p) setSubmitFor(p);
    }
  }, [applyProjectId, openProjects, submitFor]);

  const stats = {
    total: proposals.length,
    pending: proposals.filter(p => p.status === "pending").length,
    accepted: proposals.filter(p => p.status === "accepted").length,
    rejected: proposals.filter(p => p.status === "rejected").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); input,textarea { font-family: inherit; } button { font-family: inherit; } *{box-sizing:border-box}`}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 2000, background: toast.ok ? T.green : T.red, color: toast.ok ? "#000" : "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 32px #0008", maxWidth: 360 }}>
          {toast.ok ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>

      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 28, padding: 0 }}>
        ← Back to Dashboard
      </button>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, background: `linear-gradient(135deg, ${T.text}, ${T.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>My Proposals</h1>
        <p style={{ color: T.sub, margin: "6px 0 0", fontSize: 14 }}>Track your bids and find new opportunities</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Total", value: stats.total, color: T.text },
          { label: "Pending", value: stats.pending, color: T.amber },
          { label: "Accepted", value: stats.accepted, color: T.green },
          { label: "Rejected", value: stats.rejected, color: T.red },
        ].map(s => (
          <div key={s.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 10, color: T.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, background: T.surface, borderRadius: 12, padding: 4, marginBottom: 24, border: `1px solid ${T.border}` }}>
        {(["my", "browse"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "9px 16px", borderRadius: 9, border: "none", background: tab === t ? T.accent : "transparent", color: tab === t ? "#fff" : T.sub, fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all .2s" }}>
            {t === "my" ? `My Proposals (${stats.total})` : "Browse Open Projects"}
          </button>
        ))}
      </div>

      {/* My Proposals Tab */}
      {tab === "my" && (
        <div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 60, color: T.sub }}>Loading proposals…</div>
          ) : proposals.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>No proposals yet</div>
              <div style={{ fontSize: 13, color: T.sub, marginBottom: 20 }}>Browse open projects and submit your first bid</div>
              <button onClick={() => setTab("browse")} style={{ padding: "10px 24px", background: T.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Browse Projects →</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {proposals.map(p => (
                <div key={p.proposal_id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: T.sub, marginBottom: 4 }}>Project #{p.project_id} · {timeAgo(p.created_at)}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>
                        ${p.bid_amount.toLocaleString()}
                        <span style={{ fontSize: 12, color: T.sub, fontWeight: 400, marginLeft: 6 }}>bid</span>
                      </div>
                    </div>
                    <StatusBadge s={p.status} />
                  </div>

                  {p.cover_letter && (
                    <div style={{ background: T.surface, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: T.sub, lineHeight: 1.6, borderLeft: `3px solid ${T.accent}` }}>
                      {p.cover_letter}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {p.ai_relevance_score != null && (
                      <span style={{ fontSize: 11, color: T.accent, background: T.accentSoft, padding: "3px 10px", borderRadius: 100 }}>
                        AI Score: {Math.round(p.ai_relevance_score * 100)}%
                      </span>
                    )}
                    {p.status === "accepted" && (
                      <button onClick={() => navigate(`/contracts`)} style={{ padding: "6px 14px", background: T.greenSoft, border: `1px solid ${T.green}44`, borderRadius: 8, color: T.green, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        View Contract →
                      </button>
                    )}
                    {p.status === "pending" && (
                      <>
                        <button onClick={() => setEditProposal(p)} style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${T.accent}44`, borderRadius: 8, color: T.accent, fontSize: 11, cursor: "pointer" }}>
                          Edit
                        </button>
                        <button onClick={() => setWithdrawId(p.proposal_id)} style={{ marginLeft: "auto", padding: "6px 14px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.red, fontSize: 11, cursor: "pointer" }}>
                          Withdraw
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Browse Projects Tab */}
      {tab === "browse" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              placeholder="Search by title or description…"
              value={filterText} onChange={e => setFilterText(e.target.value)}
              style={{ flex: "2 1 200px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontSize: 13, outline: "none" }}
            />
            <input
              type="number" placeholder="Min $" value={filterMin} onChange={e => setFilterMin(e.target.value)}
              style={{ flex: "1 1 80px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 13, outline: "none" }}
            />
            <input
              type="number" placeholder="Max $" value={filterMax} onChange={e => setFilterMax(e.target.value)}
              style={{ flex: "1 1 80px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 13, outline: "none" }}
            />
            {(filterText || filterMin || filterMax) && (
              <button onClick={() => { setFilterText(""); setFilterMin(""); setFilterMax(""); }}
                style={{ padding: "10px 14px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.sub, cursor: "pointer", fontSize: 12 }}>
                Clear
              </button>
            )}
          </div>

          {projLoading ? (
            <div style={{ textAlign: "center", padding: 60, color: T.sub }}>Finding open projects…</div>
          ) : openProjects.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>No new projects available</div>
              <div style={{ fontSize: 13, color: T.sub }}>You've already bid on all open projects, or there are none right now.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {openProjects
                .filter((p: Project) => !filterText || p.title.toLowerCase().includes(filterText.toLowerCase()) || (p.description ?? "").toLowerCase().includes(filterText.toLowerCase()))
                .filter((p: Project) => !filterMin || p.budget >= Number(filterMin))
                .filter((p: Project) => !filterMax || p.budget <= Number(filterMax))
                .map((proj: Project) => (
                <div key={proj.project_id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
                    <div>
                      {proj.sub_category && (
                        <span style={{ fontSize: 10, color: T.accent, background: T.accentSoft, padding: "3px 8px", borderRadius: 100, marginBottom: 6, display: "inline-block" }}>{proj.sub_category}</span>
                      )}
                      <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginTop: 4 }}>{proj.title}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: T.green }}>${proj.budget.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: T.sub }}>budget</div>
                    </div>
                  </div>
                  {proj.description && (
                    <div style={{ fontSize: 13, color: T.sub, marginBottom: 14, lineHeight: 1.6 }}>
                      {proj.description.length > 160 ? proj.description.slice(0, 160) + "…" : proj.description}
                    </div>
                  )}
                  <button onClick={() => setSubmitFor(proj)} style={{ padding: "10px 22px", background: T.accent, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Submit Proposal
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      </div>{/* end inner maxWidth wrapper */}

      {/* Modals */}
      {submitFor && (
        <SubmitModal
          project={submitFor}
          onClose={() => setSubmitFor(null)}
          onSuccess={() => { setSubmitFor(null); setTab("my"); fetchMyProposals(); showToast("Proposal sent! The client will review it shortly."); }}
        />
      )}
      {withdrawId !== null && (
        <WithdrawConfirm
          id={withdrawId}
          onClose={() => setWithdrawId(null)}
          onDone={() => { setWithdrawId(null); fetchMyProposals(); showToast("Proposal withdrawn.", false); }}
        />
      )}
      {editProposal && (
        <EditModal
          proposal={editProposal}
          onClose={() => setEditProposal(null)}
          onSuccess={() => { setEditProposal(null); fetchMyProposals(); showToast("Proposal updated!"); }}
        />
      )}
    </div>
  );
};

export default ProposalsPage;