import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../../api/client";
import Tooltip from "../../shared/Tooltip";
import { type ThemeColors, Badge, Skeleton, IconRefresh, fmt, projectStatusColor, contractStatusColor } from "./clientShared";

interface Project {
  project_id: number;
  client_id: number;
  title: string;
  description: string | null;
  budget: number;
  sub_category: string | null;
  category: string | null;
  status: "open" | "in_progress" | "completed";
  required_skills: string[];
}

interface Contract {
  contract_id: number;
  project_id: number;
  freelancer_id: number;
  status: "active" | "completed" | "disputed";
  created_at: string;
}

interface Proposal {
  proposal_id: number;
  project_id: number;
  freelancer_id: number;
  bid_amount: number;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

const MyProjectsView: React.FC<{
  colors: ThemeColors;
  projects: Project[];
  contracts: Contract[];
  proposals: Proposal[];
  loading: boolean;
  onRefresh: () => void;
}> = ({ colors, projects, contracts, proposals, loading, onRefresh }) => {
  const navigate = useNavigate();
  const contractByProject = Object.fromEntries(contracts.map(c => [c.project_id, c]));
  const proposalsByProject = proposals.reduce<Record<number, number>>((acc, p) => {
    if (p.status === "pending") acc[p.project_id] = (acc[p.project_id] || 0) + 1;
    return acc;
  }, {});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId]   = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "completed">("all");
  const filtered = filter === "all" ? projects : projects.filter(p => p.status === filter);

  const handleDelete = async (projectId: number) => {
    setDeletingId(projectId);
    try {
      await apiClient.delete(`/projects/${projectId}`);
      onRefresh();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to delete project.");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const thStyle: React.CSSProperties = { fontSize: 10, color: colors.subtext, textAlign: "left", padding: "0 8px 8px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500, borderBottom: `0.5px solid ${colors.border}` };
  const tdStyle: React.CSSProperties = { padding: "10px 8px", fontSize: 12, color: colors.text, borderBottom: `0.5px solid ${colors.border}` };

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: colors.text }}>Active Projects</div>
          <div style={{ fontSize: 12, color: colors.subtext, marginTop: 3 }}>All projects you have posted</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onRefresh} style={{ background: "transparent", border: `0.5px solid ${colors.border}`, color: colors.subtext, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <IconRefresh /> Refresh
          </button>
          <button onClick={() => navigate("/post-project")} style={{ background: colors.primary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            + Post Project
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["all", "open", "in_progress", "completed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 11, padding: "5px 14px", borderRadius: 20, border: `0.5px solid ${filter === f ? colors.primary : colors.border}`, background: filter === f ? colors.primarySoft : "transparent", color: filter === f ? colors.primary : colors.subtext, cursor: "pointer", fontFamily: "inherit", fontWeight: filter === f ? 600 : 400 }}>
            {f === "all" ? `All (${projects.length})` : f === "open" ? `Open (${projects.filter(p => p.status === "open").length})` : f === "in_progress" ? `In Progress (${projects.filter(p => p.status === "in_progress").length})` : `Completed (${projects.filter(p => p.status === "completed").length})`}
          </button>
        ))}
      </div>

      <div style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8 }}>
            {[1,2,3].map(i => <Skeleton key={i} h={40} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: colors.subtext }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: colors.text, marginBottom: 6 }}>{filter === "all" ? "No projects yet" : `No ${filter.replace("_", " ")} projects`}</div>
            <div style={{ fontSize: 12 }}>Post your first project to start hiring</div>
            <button onClick={() => navigate("/post-project")} style={{ marginTop: 16, background: colors.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              + Post Project
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Title", "Budget", "Category", "Status", "Proposals", "Contract", ""].map(h =>
                  <th key={h} style={thStyle}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const s = projectStatusColor(p.status);
                const contract = contractByProject[p.project_id];
                const cs = contract ? contractStatusColor(contract.status) : null;
                return (
                  <tr key={p.project_id}>
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 200 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                      {p.required_skills.length > 0 && (
                        <div style={{ fontSize: 10, color: colors.subtext, marginTop: 3 }}>{p.required_skills.slice(0, 3).join(", ")}</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{fmt(p.budget)}</td>
                    <td style={{ ...tdStyle, color: colors.subtext }}>{p.category || p.sub_category || "—"}</td>
                    <td style={tdStyle}>
                      <Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{s.label}</Badge>
                    </td>
                    <td style={tdStyle}>
                      {(() => {
                        const cnt = proposalsByProject[p.project_id] || 0;
                        return cnt > 0
                          ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 100, background: "rgba(245,158,11,.1)", color: "#f59e0b", fontWeight: 500 }}>{cnt} pending</span>
                          : <span style={{ color: colors.subtext, fontSize: 11 }}>—</span>;
                      })()}
                    </td>
                    <td style={tdStyle}>
                      {cs ? (
                        <Badge bg={cs.bg} color={cs.color} border={cs.border} style={{ margin: 0 }}>#{contract!.contract_id} · {contract!.status}</Badge>
                      ) : (
                        <span style={{ color: colors.subtext, fontSize: 11 }}>No contract</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                      {confirmId === p.project_id ? (
                        <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            onClick={() => handleDelete(p.project_id)}
                            disabled={deletingId === p.project_id}
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                            {deletingId === p.project_id ? "…" : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border}`, background: "transparent", color: colors.subtext, cursor: "pointer" }}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <Tooltip text={contractByProject[p.project_id] ? "Cannot delete a project with an active contract" : "Delete project"}>
                          <button
                            onClick={() => setConfirmId(p.project_id)}
                            disabled={!!contractByProject[p.project_id]}
                            aria-disabled={!!contractByProject[p.project_id]}
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid rgba(239,68,68,.3)`, background: "rgba(239,68,68,.08)", color: "#ef4444", cursor: contractByProject[p.project_id] ? "not-allowed" : "pointer", opacity: contractByProject[p.project_id] ? 0.4 : 1 }}>
                            🗑 Delete
                          </button>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default MyProjectsView;
