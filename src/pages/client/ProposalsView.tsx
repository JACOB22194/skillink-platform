import React, { useState } from "react";
import apiClient from "../../api/client";
import { type ThemeColors, Badge, Skeleton, ScoreTooltip, STATUS_COLORS, IconRefresh } from "./clientShared";

interface Project {
  project_id: number;
  title: string;
}

interface Proposal {
  proposal_id: number;
  project_id: number;
  freelancer_id: number;
  freelancer_name?: string | null;
  freelancer_user_id?: number | null;
  bid_amount: number;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

const ProposalsView: React.FC<{
  colors: ThemeColors;
  projects: Project[];
  proposals: Proposal[];
  loading: boolean;
  onRefresh: () => void;
}> = ({ colors: c, projects, proposals, loading, onRefresh }) => {
  const [actionId, setActionId] = useState<number | null>(null);
  const [acting,   setActing]   = useState(false);

  const act = async (proposalId: number, action: "accept" | "reject") => {
    setActing(true); setActionId(proposalId);
    try {
      await apiClient.put(`/proposals/${proposalId}/status`, { action });
      onRefresh();
    } catch (e: any) {
      alert(e.response?.data?.detail || `Failed to ${action} proposal.`);
    } finally { setActing(false); setActionId(null); }
  };

  const pending = proposals.filter(p => p.status === "pending").length;

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Proposals</div>
          <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Review and respond to freelancer proposals</div>
        </div>
        <button onClick={onRefresh} style={{ background: "transparent", border: `0.5px solid ${c.border}`, color: c.subtext, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <IconRefresh /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1,2,3].map(i => <Skeleton key={i} h={80} />)}</div>
      ) : proposals.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: c.subtext }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📨</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>No proposals yet</div>
          <div style={{ fontSize: 12 }}>Freelancers will submit proposals on your open projects.</div>
        </div>
      ) : (
        <>
          {pending > 0 && (
            <div style={{ fontSize: 12, color: "#f59e0b", background: "rgba(245,158,11,.08)", border: "0.5px solid rgba(245,158,11,.2)", borderRadius: 8, padding: "8px 14px", marginBottom: 14 }}>
              {pending} pending proposal{pending !== 1 ? "s" : ""} awaiting review
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {proposals.map(pr => {
              const proj = projects.find(p => p.project_id === pr.project_id);
              const sc = STATUS_COLORS[pr.status] ?? STATUS_COLORS["pending"];
              return (
                <div key={pr.proposal_id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{proj?.title ?? `Project #${pr.project_id}`}</div>
                      <div style={{ fontSize: 11, color: c.subtext, marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>{pr.freelancer_name || `Freelancer #${pr.freelancer_id}`} · {new Date(pr.created_at).toLocaleDateString()}</span>
                        <ScoreTooltip freelancerId={pr.freelancer_id} rawScore={0} colors={c} displayScore={0} label="Score" color="#22c55e" compact={true} />
                      </div>
                    </div>
                    <Badge bg={sc.bg} color={sc.color} border={sc.border} style={{ margin: 0, flexShrink: 0 }}>{pr.status}</Badge>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#22c55e" }}>${pr.bid_amount.toFixed(2)}</div>
                    {pr.status === "pending" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => act(pr.proposal_id, "accept")} disabled={acting && actionId === pr.proposal_id}
                          style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "none", background: "#22c55e", color: "#fff", cursor: "pointer", fontWeight: 500, opacity: acting && actionId === pr.proposal_id ? 0.7 : 1 }}>
                          {acting && actionId === pr.proposal_id ? "…" : "Accept"}
                        </button>
                        <button onClick={() => act(pr.proposal_id, "reject")} disabled={acting}
                          style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: "transparent", color: c.subtext, cursor: "pointer" }}>
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ProposalsView;
