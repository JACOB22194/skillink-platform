/**
 * ClientProposalsPage.tsx
 * Route: /client/proposals
 * Client reviews incoming proposals for each project and accepts/rejects them
 */
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../shared/LanguageContext";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  project_id: number;
  title: string;
  budget: number;
  status: "open" | "in_progress" | "completed";
  sub_category: string | null;
}

interface FreelancerInfo {
  freelancer_id: number;
  bio: string | null;
  hourly_rate: number | null;
  success_score: number;
  skills: string[];
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
  _freelancer?: FreelancerInfo;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const T = {
  bg: "#08080e",
  surface: "#10101a",
  card: "#161620",
  cardAlt: "#1a1a28",
  border: "#232335",
  text: "#e8e8f5",
  sub: "#6a6a95",
  accent: "#7F77DD",
  accentSoft: "#7F77DD1a",
  green: "#1ddd98",
  greenSoft: "#1ddd9812",
  red: "#e84060",
  redSoft: "#e8406012",
  amber: "#f0a030",
  amberSoft: "#f0a03015",
};

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ── Score Tooltip ─────────────────────────────────────────────────────────────

interface ScoreBreakdown { score: number; avg_rating: number; total_reviews: number; jobs_completed: number; }

const ScoreTooltip: React.FC<{ freelancerId: number; rawScore: number }> = ({ freelancerId, rawScore }) => {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [data, setData]       = useState<ScoreBreakdown | null>(null);
  const [fetched, setFetched] = useState(false);

  const load = async () => {
    if (fetched) return;
    setFetched(true);
    try {
      const res = await fetch(`${API}/freelancers/${freelancerId}/score-breakdown`, auth());
      if (res.ok) setData(await res.json());
    } catch {}
  };

  const pct = data ? data.score : Math.round(rawScore * 20);
  const stars = data ? data.avg_rating : rawScore;

  return (
    <div
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => { setVisible(true); load(); }}
      onMouseLeave={() => setVisible(false)}
    >
      <span style={{ fontSize: 10, color: T.green, cursor: "default", userSelect: "none" }}>
        {data ? `★ ${stars.toFixed(1)} (${pct}/100)` : `★ ${t("clprop.aiScore")}`}
      </span>

      {visible && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: 0,
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
          padding: "12px 14px", width: 200, zIndex: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,.5)",
          pointerEvents: "none",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>{t("flprof.trustScore")}</div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.sub, marginBottom: 3 }}>
              <span>Overall</span><span style={{ color: T.green, fontWeight: 700 }}>{pct}/100</span>
            </div>
            <div style={{ height: 5, background: T.border, borderRadius: 100 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: T.green, borderRadius: 100 }} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.sub }}>
              <span>{t("flprof.avgRating")}</span>
              <span style={{ color: T.text }}>{"★".repeat(Math.round(stars))}{"☆".repeat(5 - Math.round(stars))} {stars.toFixed(1)}/5</span>
            </div>
            {data && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.sub }}>
                  <span>{t("flprof.jobsDone")}</span><span style={{ color: T.text }}>{data.jobs_completed}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.sub }}>
                  <span>{t("flprof.reviews")}</span><span style={{ color: T.text }}>{data.total_reviews}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Score Bar ─────────────────────────────────────────────────────────────────

const ScoreBar: React.FC<{ value: number; label: string; color: string }> = ({ value, label, color }) => (
  <div style={{ marginBottom: 6 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.sub, marginBottom: 3 }}>
      <span>{label}</span><span style={{ color }}>{Math.round(value * 100)}%</span>
    </div>
    <div style={{ height: 4, background: T.border, borderRadius: 100, overflow: "hidden" }}>
      <div style={{ width: `${value * 100}%`, height: "100%", background: color, borderRadius: 100, transition: "width .6s ease" }} />
    </div>
  </div>
);

// ── Confirm Action Modal ──────────────────────────────────────────────────────

const ConfirmModal: React.FC<{
  action: "accept" | "reject";
  proposal: Proposal;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}> = ({ action, proposal, onClose, onConfirm, loading }) => {
  const { t } = useLanguage();
  const isAccept = action === "accept";
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000d0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.cardAlt, border: `1px solid ${isAccept ? T.green + "44" : T.red + "44"}`, borderRadius: 20, padding: 32, maxWidth: 440, width: "100%" }}>
        <div style={{ fontSize: 40, textAlign: "center", marginBottom: 16 }}>{isAccept ? "🎉" : "🚫"}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, textAlign: "center", marginBottom: 8 }}>
          {isAccept ? t("clprop.accept") : t("clprop.reject")}
        </div>
        <div style={{ fontSize: 13, color: T.sub, textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
          {isAccept
            ? `${t("clprop.acceptMsg")} $${proposal.bid_amount.toLocaleString()}.`
            : t("clprop.rejectMsg")}
        </div>
        <div style={{ background: T.surface, borderRadius: 12, padding: "14px 18px", marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: T.sub }}>{t("prop.budget")}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: isAccept ? T.green : T.text }}>${proposal.bid_amount.toLocaleString()}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.sub, cursor: "pointer", fontSize: 13 }}>{t("prop.withdraw.no")}</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 2, padding: 12, background: isAccept ? T.green : T.red, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, opacity: loading ? 0.7 : 1 }}>
            {loading ? t("common.loading") : isAccept ? t("clprop.confirm") : t("clprop.reject")}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Proposal Card ─────────────────────────────────────────────────────────────

const ProposalCard: React.FC<{
  proposal: Proposal;
  onAction: (id: number, action: "accept" | "reject") => void;
  rank: number;
}> = ({ proposal, onAction, rank }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const isPending = proposal.status === "pending";

  const statusStyle = {
    pending:  { color: T.amber, bg: T.amberSoft, label: t("clprop.awaiting") },
    accepted: { color: T.green, bg: T.greenSoft, label: `${t("clprop.accept")} ✓` },
    rejected: { color: T.red,   bg: T.redSoft,   label: t("clprop.reject") },
  }[proposal.status];

  return (
    <div style={{
      background: proposal.status === "accepted" ? `linear-gradient(135deg, #1ddd9808, ${T.surface})` : T.surface,
      border: `1px solid ${proposal.status === "accepted" ? T.green + "44" : T.border}`,
      borderRadius: 14, overflow: "hidden",
      transition: "border-color .2s",
    }}>
      {/* Rank strip */}
      {rank <= 3 && isPending && (
        <div style={{ height: 2, background: rank === 1 ? T.green : rank === 2 ? T.accent : T.amber }} />
      )}

      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          {/* Left: freelancer info */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              background: `linear-gradient(135deg, ${T.accent}, #a855f7)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {proposal.freelancer_id.toString().slice(-2)}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Freelancer #{proposal.freelancer_id}</div>
              <div style={{ fontSize: 11, color: T.sub }}>{timeAgo(proposal.created_at)}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
                <ScoreTooltip freelancerId={proposal.freelancer_id} rawScore={0} />
              </div>
            </div>
          </div>

          {/* Right: bid + status */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.text }}>${proposal.bid_amount.toLocaleString()}</div>
            <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 100, background: statusStyle.bg, color: statusStyle.color }}>
              {statusStyle.label}
            </span>
          </div>
        </div>

        {/* AI Score */}
        {proposal.ai_relevance_score != null && (
          <div style={{ marginBottom: 12 }}>
            <ScoreBar value={proposal.ai_relevance_score} label={t("clprop.aiScore")} color={T.accent} />
          </div>
        )}

        {/* Cover letter preview */}
        {proposal.cover_letter && (
          <div>
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 6 }}>{t("prop.submit.cover")}</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, borderLeft: `3px solid ${T.accent}55`, paddingLeft: 12, color: T.sub }}>
              {expanded || proposal.cover_letter.length <= 180
                ? proposal.cover_letter
                : proposal.cover_letter.slice(0, 180) + "…"}
            </div>
            {proposal.cover_letter.length > 180 && (
              <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 11, marginTop: 4, padding: 0 }}>
                {expanded ? t("common.hide") : t("common.show")}
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        {isPending && (
          <div style={{ display: "flex", gap: 10, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <button onClick={() => onAction(proposal.proposal_id, "reject")} style={{ flex: 1, padding: "9px 14px", background: T.redSoft, border: `1px solid ${T.red}33`, borderRadius: 9, color: T.red, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
              {t("clprop.reject")}
            </button>
            <button onClick={() => onAction(proposal.proposal_id, "accept")} style={{ flex: 2, padding: "9px 14px", background: T.green, border: "none", borderRadius: 9, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              {t("clprop.accept")} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const ClientProposalsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const [projects, setProjects]         = useState<Project[]>([]);
  const [selectedProject, setSelected] = useState<Project | null>(null);
  const [proposals, setProposals]       = useState<Proposal[]>([]);
  const [loading, setLoading]           = useState(false);
  const [projLoading, setProjLoading]   = useState(true);
  const [confirm, setConfirm]           = useState<{ id: number; action: "accept" | "reject" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const load = async () => {
      setProjLoading(true);
      try {
        const r = await fetch(`${API}/projects/my`, auth());
        if (r.ok) {
          const data = await r.json();
          const arr: Project[] = Array.isArray(data) ? data : data.projects || [];
          setProjects(arr.filter(p => p.status !== "completed"));
          if (arr.length > 0) setSelected(arr[0]);
        }
      } finally { setProjLoading(false); }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/proposals/project/${selectedProject.project_id}`, auth());
        if (r.ok) setProposals(await r.json());
      } finally { setLoading(false); }
    };
    load();
  }, [selectedProject]);

  const handleAction = async () => {
    if (!confirm) return;
    setActionLoading(true);
    try {
      const r = await fetch(`${API}/proposals/${confirm.id}/status`, {
        method: "PUT",
        headers: { ...auth().headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: confirm.action }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
      const data = await r.json();
      showToast(data.message, true);
      const r2 = await fetch(`${API}/proposals/project/${selectedProject!.project_id}`, auth());
      if (r2.ok) setProposals(await r2.json());
      if (confirm.action === "accept" && data.contract_id) {
        setTimeout(() => navigate(`/contract/${data.contract_id}`), 1500);
      }
    } catch (e: any) { showToast(e.message, false); }
    finally { setActionLoading(false); setConfirm(null); }
  };

  const pending  = proposals.filter(p => p.status === "pending");
  const decided  = proposals.filter(p => p.status !== "pending");

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Syne', sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap'); *{box-sizing:border-box} button,input{font-family:inherit}`}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 2000,
          background: toast.ok ? T.green : T.red, color: "#fff",
          padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 32px #0008",
        }}>
          {toast.ok ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}

      {/* Left sidebar — project list */}
      <div style={{ width: 260, background: T.surface, borderRight: `1px solid ${T.border}`, padding: "28px 0", flexShrink: 0, overflowY: "auto" }}>
        <div style={{ padding: "0 20px 20px" }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 12, padding: 0, marginBottom: 20 }}>
            {isRTL ? "→" : "←"} {t("common.back").replace("← ", "").replace(" →", "")}
          </button>
          <div style={{ fontSize: 11, color: T.sub, textTransform: "uppercase", letterSpacing: ".1em" }}>{t("clprop.title")}</div>
        </div>

        {projLoading ? (
          <div style={{ padding: "0 20px", color: T.sub, fontSize: 13 }}>{t("clprop.loading")}</div>
        ) : projects.length === 0 ? (
          <div style={{ padding: "0 20px", color: T.sub, fontSize: 13 }}>{t("clprop.noProposals")}</div>
        ) : (
          projects.map(p => {
            const isActive = selectedProject?.project_id === p.project_id;
            return (
              <div key={p.project_id} onClick={() => setSelected(p)} style={{
                padding: "12px 20px", cursor: "pointer",
                borderLeft: `3px solid ${isActive ? T.accent : "transparent"}`,
                background: isActive ? T.accentSoft : "transparent",
                transition: "all .15s",
              }}>
                <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? T.text : T.sub, marginBottom: 3, lineHeight: 1.3 }}>{p.title}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: T.sub }}>${p.budget.toLocaleString()}</span>
                  <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: p.status === "open" ? T.amberSoft : T.greenSoft, color: p.status === "open" ? T.amber : T.green }}>
                    {p.status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "32px 28px", overflowY: "auto" }}>
        {!selectedProject ? (
          <div style={{ textAlign: "center", paddingTop: 80, color: T.sub }}>{t("msg.select")}</div>
        ) : (
          <>
            {/* Project header */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: T.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>{t("clprop.reviewing")}</div>
              <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px", color: T.text }}>{selectedProject.title}</h1>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: T.sub }}>{t("prop.budget")}: <strong style={{ color: T.text }}>${selectedProject.budget.toLocaleString()}</strong></span>
                <span style={{ fontSize: 12, color: T.sub }}>{proposals.length} total · {pending.length} {t("clprop.awaiting")}</span>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: 60, color: T.sub }}>{t("clprop.loading")}</div>
            ) : proposals.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>{t("clprop.noProposals")}</div>
                <div style={{ fontSize: 13, color: T.sub }}>{t("prop.hint")}</div>
              </div>
            ) : (
              <>
                {/* Pending proposals */}
                {pending.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
                      ⏳ {t("clprop.awaiting")} ({pending.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {pending.map((p, i) => (
                        <ProposalCard key={p.proposal_id} proposal={p} rank={i + 1} onAction={(id, action) => setConfirm({ id, action })} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Decided proposals */}
                {decided.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
                      ✓ {t("clprop.decided")} ({decided.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: 0.7 }}>
                      {decided.map((p, i) => (
                        <ProposalCard key={p.proposal_id} proposal={p} rank={i + 1} onAction={() => {}} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Confirm Modal */}
      {confirm && (() => {
        const proposal = proposals.find(p => p.proposal_id === confirm.id)!;
        return (
          <ConfirmModal
            action={confirm.action}
            proposal={proposal}
            onClose={() => setConfirm(null)}
            onConfirm={handleAction}
            loading={actionLoading}
          />
        );
      })()}
    </div>
  );
};

export default ClientProposalsPage;
