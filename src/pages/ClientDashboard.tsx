import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import UpgradeNowSection from "../components/UpgradeNowSection";

// ─── API Types (matching backend schema exactly) ──────────────────────────────

interface ClientProfile {
  client_id: number;
  company_name: string | null;
}

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

// ─── Derived / UI Types ───────────────────────────────────────────────────────

interface DashboardStats {
  activeProjects: number;
  inProgressProjects: number;
  completedProjects: number;
  totalProjects: number;
  totalHired: number;        // unique freelancers under contract
  totalSpent: number;        // sum of budgets for completed/in_progress projects
  pendingProposals: number;  // open proposals across all projects
}

interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primarySoft: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE" };

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const fmt = (n: number): string => {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

const projectStatusColor = (status: Project["status"]): { bg: string; color: string; border: string; label: string } => {
  if (status === "in_progress") return { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)", label: "In Progress" };
  if (status === "completed")   return { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)", label: "Completed" };
  return { bg: "rgba(245,158,11,.1)", color: "#f59e0b", border: "rgba(245,158,11,.2)", label: "Open" };
};

const contractStatusColor = (status: Contract["status"]): { bg: string; color: string; border: string } => {
  if (status === "active")    return { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" };
  if (status === "completed") return { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)" };
  return { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "rgba(239,68,68,.2)" };
};

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  "In Progress": { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" },
  "Open":        { bg: "rgba(245,158,11,.1)", color: "#f59e0b", border: "rgba(245,158,11,.2)" },
  "Completed":   { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)" },
  "active":      { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.2)" },
  "completed":   { bg: "rgba(127,119,221,.12)", color: "#7F77DD", border: "rgba(127,119,221,.2)" },
  "disputed":    { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "rgba(239,68,68,.2)" },
  "pending":     { bg: "rgba(245,158,11,.1)", color: "#f59e0b", border: "rgba(245,158,11,.2)" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Badge: React.FC<{
  bg: string; color: string; border: string;
  children: React.ReactNode; style?: React.CSSProperties;
}> = ({ bg, color, border, children, style }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10,
    padding: "3px 8px", borderRadius: 100,
    background: bg, color, border: `0.5px solid ${border}`, ...style,
  }}>
    {children}
  </span>
);

const Skeleton: React.FC<{ w?: number | string; h?: number; r?: number; style?: React.CSSProperties }> =
  ({ w = "100%", h = 16, r = 6, style }) => (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg, rgba(255,255,255,.05) 25%, rgba(255,255,255,.1) 50%, rgba(255,255,255,.05) 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.4s infinite",
      ...style,
    }} />
  );

const NavItem: React.FC<{
  label: string; active?: boolean; badge?: number | string;
  icon: React.ReactNode; colors: ThemeColors; onClick?: () => void;
}> = ({ label, active, badge, icon, colors, onClick }) => (
  <div onClick={onClick} style={{
    display: "flex", alignItems: "center", gap: 9, padding: "8px 16px",
    color: active ? colors.primary : colors.subtext,
    borderLeft: `2px solid ${active ? colors.primary : "transparent"}`,
    background: active ? colors.bg : "transparent",
    cursor: "pointer", fontSize: 12,
  }}>
    {icon}
    {label}
    {badge !== undefined && (
      <span style={{ marginLeft: "auto", background: colors.primary, color: "#fff", fontSize: 9, padding: "1px 5px", borderRadius: 20 }}>
        {badge}
      </span>
    )}
  </div>
);

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconGrid   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const IconUser   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconMsg    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
const IconSearch = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
const IconClip   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>;
const IconInv    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4M15 10h5M15 6h3a2 2 0 012 2v8a2 2 0 01-2 2h-3"/></svg>;
const IconRefresh = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>;

// ─── Company Profile View ─────────────────────────────────────────────────────

const CompanyProfileView: React.FC<{ colors: ThemeColors; onSave: (name: string) => void }> = ({ colors, onSave }) => {
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [feedback, setFeedback]       = useState("");

  useEffect(() => {
    apiClient.get<ClientProfile>("/users/me/profile")
      .then(r => setCompanyName(r.data.company_name || ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setFeedback("");
    try {
      await apiClient.put("/users/me/profile", { company_name: companyName });
      onSave(companyName);
      setFeedback("Profile updated!");
      setTimeout(() => setFeedback(""), 3000);
    } catch {
      setFeedback("Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 20, color: colors.subtext }}>Loading…</div>;

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: colors.text }}>Company Profile</div>
        <div style={{ fontSize: 12, color: colors.subtext, marginTop: 3 }}>Manage your corporate identity.</div>
      </div>
      <div style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 24, maxWidth: 600 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: colors.subtext, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>
          Company Name
        </label>
        <input
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", fontSize: 14, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 8, marginBottom: 16, outline: "none", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={save} disabled={saving} style={{ background: colors.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {feedback && <span style={{ fontSize: 12, color: colors.primary }}>{feedback}</span>}
        </div>
      </div>
    </div>
  );
};

// ─── My Projects View ─────────────────────────────────────────────────────────

const MyProjectsView: React.FC<{ colors: ThemeColors; projects: Project[]; contracts: Contract[]; loading: boolean; onRefresh: () => void }> =
  ({ colors, projects, contracts, loading, onRefresh }) => {
  const navigate = useNavigate();
  const contractByProject = Object.fromEntries(contracts.map(c => [c.project_id, c]));

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

      <div style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8 }}>
            {[1,2,3].map(i => <Skeleton key={i} h={40} />)}
          </div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: colors.subtext }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: colors.text, marginBottom: 6 }}>No projects yet</div>
            <div style={{ fontSize: 12 }}>Post your first project to start hiring</div>
            <button onClick={() => navigate("/post-project")} style={{ marginTop: 16, background: colors.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              + Post Project
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Title", "Budget", "Category", "Status", "Contract"].map(h =>
                  <th key={h} style={thStyle}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {projects.map(p => {
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
                      {cs ? (
                        <Badge bg={cs.bg} color={cs.color} border={cs.border} style={{ margin: 0 }}>#{contract!.contract_id} · {contract!.status}</Badge>
                      ) : (
                        <span style={{ color: colors.subtext, fontSize: 11 }}>No contract</span>
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

// ─── Find Talent View (unchanged from original — already uses real API) ────────

interface MatchedFreelancer {
  freelancer_id: number; name: string; professional_title: string;
  github_url: string; hourly_rate: number; github_score: number;
  match_score: number; matched_skills: string[]; explanation: string;
  text_score: number; skill_score: number; quality_score: number;
  activity_score: number; classifier_weight: number; matched_on: string;
}

const MATCH_PALETTE = [
  { bg: "#2a2640", color: "#7F77DD" },
  { bg: "rgba(34,197,94,.12)", color: "#22c55e" },
  { bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
  { bg: "rgba(245,158,11,.1)", color: "#f59e0b" },
  { bg: "rgba(239,68,68,.1)", color: "#ef4444" },
];

const FindTalentView: React.FC<{ colors: ThemeColors; projects: Project[]; projLoading: boolean }> = ({ colors, projects, projLoading }) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [matches, setMatches]       = useState<MatchedFreelancer[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [latency, setLatency]       = useState(0);

  useEffect(() => {
    if (projects.length > 0 && !selectedId) setSelectedId(projects[0].project_id);
  }, [projects, selectedId]);

  const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";

  const runMatch = async () => {
    if (!selectedId) return;
    setLoading(true); setError(""); setMatches([]);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE}/ai/match/${selectedId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Match failed");
      const data = await res.json();
      setMatches(data.matches || []);
      setLatency(Math.round(performance.now() - t0));
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: colors.text }}>Find Talent</div>
        <div style={{ fontSize: 12, color: colors.subtext, marginTop: 3 }}>AI-powered freelancer matching for your projects</div>
      </div>

      <div style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {projLoading ? (
            <Skeleton w={240} h={36} />
          ) : (
            <select
              value={selectedId ?? ""}
              onChange={e => setSelectedId(Number(e.target.value))}
              style={{ flex: 1, minWidth: 200, padding: "8px 12px", fontSize: 13, background: colors.bg, color: colors.text, border: `0.5px solid ${colors.border}`, borderRadius: 8, outline: "none" }}
            >
              {projects.length === 0
                ? <option value="">No projects available</option>
                : projects.filter(p => p.status === "open").map(p => (
                    <option key={p.project_id} value={p.project_id}>{p.title}</option>
                  ))
              }
            </select>
          )}
          <button
            onClick={runMatch}
            disabled={loading || !selectedId || projects.filter(p => p.status === "open").length === 0}
            style={{ background: colors.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Matching…" : "Run AI Match"}
          </button>
          {latency > 0 && !loading && (
            <span style={{ fontSize: 11, color: colors.subtext }}>{latency}ms</span>
          )}
        </div>

        {projects.filter(p => p.status === "open").length === 0 && !projLoading && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#f59e0b" }}>
            ⚠ No open projects found. Only open projects can be matched.
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,.1)", border: "0.5px solid rgba(239,68,68,.2)", borderRadius: 10, padding: "12px 16px", color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Skeleton w={40} h={40} r={20} />
                <div style={{ flex: 1 }}>
                  <Skeleton w="60%" h={14} style={{ marginBottom: 8 }} />
                  <Skeleton w="40%" h={11} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && matches.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: colors.subtext, marginBottom: 4 }}>
            {matches.length} freelancer{matches.length !== 1 ? "s" : ""} matched
          </div>
          {matches.map((m, i) => {
            const pal = MATCH_PALETTE[i % MATCH_PALETTE.length];
            const initials = getInitials(m.name || m.professional_title || "FL");
            return (
              <div key={m.freelancer_id} style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: pal.bg, color: pal.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{m.name || `Freelancer #${m.freelancer_id}`}</div>
                        <div style={{ fontSize: 11, color: colors.subtext, marginTop: 2 }}>{m.professional_title}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: pal.color }}>{Math.round(m.match_score * 100)}%</div>
                        <div style={{ fontSize: 10, color: colors.subtext }}>match</div>
                      </div>
                    </div>
                    {m.explanation && (
                      <div style={{ fontSize: 11, color: colors.subtext, marginTop: 8, lineHeight: 1.5, background: colors.bg, borderRadius: 8, padding: "8px 10px" }}>{m.explanation}</div>
                    )}
                    {m.matched_skills?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                        {m.matched_skills.map(s => (
                          <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: colors.primarySoft, color: colors.primary, border: `0.5px solid ${colors.primary}30` }}>{s}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: colors.subtext }}>
                      {m.hourly_rate > 0 && <span>${m.hourly_rate}/hr</span>}
                      {m.github_score > 0 && <span>⭐ GitHub {m.github_score.toFixed(0)}</span>}
                      {m.github_url && (
                        <a href={m.github_url} target="_blank" rel="noreferrer" style={{ color: colors.primary, textDecoration: "none" }}>GitHub →</a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && matches.length === 0 && latency > 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: colors.subtext }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.text, marginBottom: 6 }}>No matches found</div>
          <div style={{ fontSize: 12 }}>No freelancers matched this project's requirements, or no profiles have been set up yet.</div>
        </div>
      )}
    </div>
  );
};

// ─── Stub View ────────────────────────────────────────────────────────────────

const StubView: React.FC<{ colors: ThemeColors; title: string }> = ({ colors, title }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: colors.subtext, animation: "fadeIn 0.5s ease" }}>
    <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
    <div style={{ fontSize: 20, fontWeight: 500, color: colors.text, marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 13, textAlign: "center", maxWidth: 300, lineHeight: 1.5 }}>
      This feature is under development. Endpoints and schemas are being finalised.
    </div>
  </div>
);

// ─── Main Dashboard Component ─────────────────────────────────────────────────

const ClientDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const s = localStorage.getItem("skilllink-darkMode");
    return s !== null ? JSON.parse(s) : true;
  });

  const [activeView, setActiveView]     = useState("Dashboard");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const c = getColors(darkMode);

  // ── Real data state ──
  const [profile, setProfile]           = useState<ClientProfile | null>(null);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [contracts, setContracts]       = useState<Contract[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingContracts, setLoadingContracts] = useState(true);

  const companyName = profile?.company_name || "Your Company";
  const initials    = getInitials(companyName);

  // ── Fetch helpers ──
  const fetchProfile = useCallback(async () => {
    try {
      const r = await apiClient.get<ClientProfile>("/users/me/profile");
      setProfile(r.data);
    } catch { /* ignore */ }
    finally { setLoadingProfile(false); }
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const r = await apiClient.get<Project[]>("/projects/my");
      setProjects(r.data);
    } catch { setProjects([]); }
    finally { setLoadingProjects(false); }
  }, []);

  const fetchContracts = useCallback(async () => {
    setLoadingContracts(true);
    try {
      const r = await apiClient.get<Contract[]>("/contracts/my");
      setContracts(r.data);
    } catch { setContracts([]); }
    finally { setLoadingContracts(false); }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchProjects();
    fetchContracts();
  }, [fetchProfile, fetchProjects, fetchContracts]);

  // ── Derived stats ──
  const stats: DashboardStats = {
    activeProjects:     projects.filter(p => p.status === "in_progress").length,
    inProgressProjects: projects.filter(p => p.status === "in_progress").length,
    completedProjects:  projects.filter(p => p.status === "completed").length,
    totalProjects:      projects.length,
    totalHired:         new Set(contracts.map(c => c.freelancer_id)).size,
    totalSpent:         projects
      .filter(p => p.status === "in_progress" || p.status === "completed")
      .reduce((sum, p) => sum + p.budget, 0),
    pendingProposals: 0, // could be fetched per-project if needed
  };

  const activeContracts  = contracts.filter(c => c.status === "active").length;
  const recentContracts  = [...contracts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  // ── Spend by category (derived from projects with contracts) ──
  const contractedProjectIds = new Set(contracts.map(c => c.project_id));
  const categorySpend: Record<string, number> = {};
  for (const p of projects) {
    if (contractedProjectIds.has(p.project_id)) {
      const cat = p.category || p.sub_category || "Uncategorized";
      categorySpend[cat] = (categorySpend[cat] || 0) + p.budget;
    }
  }
  const spendEntries = Object.entries(categorySpend).sort((a, b) => b[1] - a[1]).slice(0, 4);

  // ── Recent projects for dashboard ──
  const recentProjects = [...projects].sort((a, b) => b.project_id - a.project_id).slice(0, 4);

  const toggleTheme = () => {
    setDarkMode(d => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, ...style }}>
      {children}
    </div>
  );

  const sectionHeader = (title: string, action?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{title}</span>
      {action}
    </div>
  );

  const thBorder: React.CSSProperties = { fontSize: 10, color: c.subtext, textAlign: "left", padding: "0 8px 8px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500, borderBottom: `0.5px solid ${c.border}` };
  const tdBorder: React.CSSProperties = { padding: "9px 8px", fontSize: 12, color: c.text, borderBottom: `0.5px solid ${c.border}` };

  const isLoading = loadingProjects || loadingContracts;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif", fontSize: 13 }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>

      {/* ── Top Bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => navigate("/post-project")}
            style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginRight: 8 }}
          >
            + Post Project
          </button>
          <button onClick={toggleTheme} style={{ padding: "6px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
            {darkMode ? "☀️" : "🌙"}
          </button>
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setDropdownOpen(v => !v)}
              style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(127,119,221,.2)", color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, border: `0.5px solid ${c.border}`, cursor: "pointer" }}
            >
              {loadingProfile ? "…" : initials}
            </div>
            {dropdownOpen && (
              <div style={{ position: "absolute", right: 0, top: 36, background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "6px 0", minWidth: 180, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,.15)" }}>
                <div style={{ padding: "6px 14px 8px", borderBottom: `0.5px solid ${c.border}`, marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{companyName}</div>
                  <div style={{ fontSize: 11, color: c.subtext }}>Client</div>
                </div>
                <a href="/settings/mfa" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: c.text, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  🔐 Two-factor auth
                </a>
                <div
                  onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", fontSize: 12, color: "#ef4444", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  → Sign out
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 200, borderRight: `0.5px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", padding: "16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Main</div>
          <NavItem label="Dashboard"       active={activeView === "Dashboard"}       onClick={() => setActiveView("Dashboard")}       icon={<IconGrid />}   colors={c} />
          <NavItem label="Company Profile" active={activeView === "Company Profile"} onClick={() => setActiveView("Company Profile")} icon={<IconUser />}   colors={c} />
          <NavItem label="Messages"        active={activeView === "Messages"}        onClick={() => setActiveView("Messages")}        icon={<IconMsg />}    colors={c} />
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: c.subtext, padding: "12px 16px 4px", opacity: .6, textTransform: "uppercase" }}>Hiring</div>
          <NavItem label="Find Talent"    badge="New" active={activeView === "Find Talent"}    onClick={() => setActiveView("Find Talent")}    icon={<IconSearch />} colors={c} />
          <NavItem label="Active Projects"            active={activeView === "Active Projects"} onClick={() => setActiveView("Active Projects")} icon={<IconClip />}   colors={c} />
          <NavItem label="Invoices"                   active={activeView === "Invoices"}        onClick={() => setActiveView("Invoices")}        icon={<IconInv />}    colors={c} />

          {/* Upgrade banner */}
          <div style={{ margin: "10px 12px 0" }}>
            <div
              onClick={() => setActiveView("Upgrade")}
              style={{ background: "linear-gradient(135deg,#1a2640,#1e3560)", border: "0.5px solid rgba(59,130,246,0.35)", borderRadius: 10, padding: 12, cursor: "pointer" }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
            >
              <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#7eb3f8", marginBottom: 4 }}>⭐ Premium</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Upgrade Now</div>
              <div style={{ fontSize: 10, color: "#7eb3f8", lineHeight: 1.4 }}>Post unlimited jobs, AI talent matching & more.</div>
              <div style={{ marginTop: 8, fontSize: 10, fontWeight: 600, color: "#3b82f6", background: "rgba(59,130,246,.15)", borderRadius: 6, padding: "4px 8px", display: "inline-block" }}>
                View Plans →
              </div>
            </div>
          </div>

          <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `0.5px solid ${c.border}` }}>
            <div onClick={toggleTheme} style={{ fontSize: 11, color: c.subtext, padding: "5px 0", cursor: "pointer" }}>Switch theme</div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: 20, background: c.bg }}>
          {activeView === "Upgrade" && <UpgradeNowSection roleType="client" colors={c} />}

          {activeView === "Dashboard" && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>

              {/* Page header */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Dashboard</div>
                <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>
                  {loadingProfile
                    ? <Skeleton w={180} h={12} />
                    : `${companyName} · AI-assisted hiring overview`}
                </div>
              </div>

              {/* ── Metric cards ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
                {isLoading ? (
                  [1,2,3,4].map(i => (
                    <div key={i} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                      <Skeleton w="50%" h={10} style={{ marginBottom: 10 }} />
                      <Skeleton w="60%" h={24} style={{ marginBottom: 8 }} />
                      <Skeleton w="70%" h={10} style={{ marginBottom: 8 }} />
                      <Skeleton w="40%" h={18} r={100} />
                    </div>
                  ))
                ) : [
                  {
                    label: "Total Projects",
                    val: String(stats.totalProjects),
                    sub: `${stats.inProgressProjects} in progress`,
                    badge: <Badge bg="rgba(34,197,94,.12)" color="#22c55e" border="rgba(34,197,94,.2)">{stats.completedProjects} completed</Badge>,
                  },
                  {
                    label: "Talent Hired",
                    val: String(stats.totalHired),
                    sub: `${activeContracts} active contract${activeContracts !== 1 ? "s" : ""}`,
                    badge: <Badge bg="#2a2640" color="#7F77DD" border="rgba(127,119,221,.2)">AI-matched</Badge>,
                  },
                  {
                    label: "Open Projects",
                    val: String(projects.filter(p => p.status === "open").length),
                    sub: "accepting proposals",
                    badge: <Badge bg="rgba(245,158,11,.1)" color="#f59e0b" border="rgba(245,158,11,.2)">awaiting bids</Badge>,
                  },
                  {
                    label: "Total Budget",
                    val: fmt(stats.totalSpent),
                    sub: "across hired projects",
                    badge: <Badge bg="rgba(127,119,221,.12)" color="#7F77DD" border="rgba(127,119,221,.2)">{contracts.length} contract{contracts.length !== 1 ? "s" : ""}</Badge>,
                  },
                ].map(m => (
                  <div key={m.label} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 10, color: c.subtext, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{m.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 500, color: c.text, lineHeight: 1 }}>{m.val}</div>
                    <div style={{ fontSize: 11, color: c.subtext, margin: "5px 0 8px" }}>{m.sub}</div>
                    {m.badge}
                  </div>
                ))}
              </div>

              {/* ── Middle row ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>

                {/* Recent Projects */}
                {card(
                  <>
                    {sectionHeader("Recent Projects",
                      <button onClick={() => navigate("/post-project")} style={{ background: c.primary, color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                        + Post Project
                      </button>
                    )}
                    {isLoading ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {[1,2,3].map(i => <Skeleton key={i} h={40} />)}
                      </div>
                    ) : recentProjects.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "24px 0", color: c.subtext }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                        <div style={{ fontSize: 12 }}>No projects yet. Post your first one!</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {recentProjects.map(p => {
                          const s = projectStatusColor(p.status);
                          const hasContract = contractedProjectIds.has(p.project_id);
                          const pct = p.status === "completed" ? 100 : p.status === "in_progress" ? 60 : 10;
                          return (
                            <div key={p.project_id}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{p.title}</span>
                                <Badge bg={s.bg} color={s.color} border={s.border} style={{ margin: 0 }}>{s.label}</Badge>
                              </div>
                              <div style={{ height: 4, background: c.bg, borderRadius: 20, overflow: "hidden", margin: "5px 0" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: s.color, borderRadius: 20 }} />
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.subtext, marginTop: 2 }}>
                                <span>{p.category || p.sub_category || "Uncategorized"} · {fmt(p.budget)}</span>
                                <span>{hasContract ? "✓ Hired" : "No hire"}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* AI Recommended Talent */}
                {card(
                  <>
                    {sectionHeader("AI Recommended Talent",
                      <span onClick={() => setActiveView("Find Talent")} style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>Run matching →</span>
                    )}
                    <div style={{ textAlign: "center", padding: "1.5rem 0", color: c.subtext }}>
                      <div style={{ fontSize: 13, marginBottom: 8 }}>
                        Select a project from{" "}
                        <strong style={{ color: c.text, cursor: "pointer" }} onClick={() => setActiveView("Find Talent")}>Find Talent</strong>
                        {" "}to see AI-matched freelancers.
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>Powered by TF-IDF + skill overlap + GitHub quality scoring</div>
                      {projects.filter(p => p.status === "open").length > 0 && (
                        <button
                          onClick={() => setActiveView("Find Talent")}
                          style={{ marginTop: 14, background: c.primarySoft, color: c.primary, border: `0.5px solid ${c.primary}40`, borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                        >
                          Match for "{projects.find(p => p.status === "open")?.title?.slice(0, 20)}…"
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* ── Recent Contracts table ── */}
              {card(
                <>
                  {sectionHeader("Recent Contracts",
                    <span onClick={() => setActiveView("Active Projects")} style={{ fontSize: 11, color: c.subtext, cursor: "pointer" }}>View all →</span>
                  )}
                  {isLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[1,2,3].map(i => <Skeleton key={i} h={36} />)}
                    </div>
                  ) : recentContracts.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: c.subtext, fontSize: 12 }}>
                      No contracts yet. Accept a proposal to create one.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["Contract ID", "Project", "Budget", "Status", "Created"].map(h =>
                            <th key={h} style={thBorder}>{h}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {recentContracts.map(ct => {
                          const proj = projects.find(p => p.project_id === ct.project_id);
                          const cs = STATUS_COLORS[ct.status];
                          return (
                            <tr key={ct.contract_id}>
                              <td style={{ ...tdBorder, color: c.subtext }}>#{ct.contract_id}</td>
                              <td style={{ ...tdBorder, fontWeight: 500 }}>{proj?.title ?? `Project #${ct.project_id}`}</td>
                              <td style={{ ...tdBorder }}>{proj ? fmt(proj.budget) : "—"}</td>
                              <td style={tdBorder}><Badge bg={cs.bg} color={cs.color} border={cs.border} style={{ margin: 0 }}>{ct.status}</Badge></td>
                              <td style={{ ...tdBorder, color: c.subtext }}>{new Date(ct.created_at).toLocaleDateString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )}

          {activeView === "Company Profile" && (
            <CompanyProfileView colors={c} onSave={name => setProfile(p => p ? { ...p, company_name: name } : null)} />
          )}

          {activeView === "Find Talent" && (
            <FindTalentView colors={c} projects={projects} projLoading={loadingProjects} />
          )}

          {activeView === "Active Projects" && (
            <MyProjectsView colors={c} projects={projects} contracts={contracts} loading={loadingProjects} onRefresh={() => { fetchProjects(); fetchContracts(); }} />
          )}

          {["Messages", "Invoices"].includes(activeView) && (
            <StubView colors={c} title={activeView} />
          )}
        </main>

        {/* ── Right Panel ── */}
        <aside style={{ width: 220, borderLeft: `0.5px solid ${c.border}`, background: c.surface, padding: 16, overflowY: "auto", flexShrink: 0 }}>
          {/* Company card */}
          <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: `0.5px solid ${c.border}`, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(127,119,221,.2)", color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, margin: "0 auto 8px" }}>
              {loadingProfile ? "…" : initials}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>
              {loadingProfile ? <Skeleton w={100} h={14} style={{ margin: "0 auto" }} /> : companyName}
            </div>
            <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>Client</div>
            <Badge bg="rgba(127,119,221,.1)" color={c.primary} border={`${c.primary}30`} style={{ marginTop: 8 }}>✓ Active Account</Badge>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 12 }}>
              {[
                { val: isLoading ? "…" : String(stats.totalProjects), label: "PROJECTS", color: c.text },
                { val: isLoading ? "…" : String(stats.totalHired), label: "HIRED", color: "#22c55e" },
              ].map(s => (
                <div key={s.label} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 9, color: c.subtext }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginBottom: 8 }}>Quick Actions</div>
          {[
            { label: "Post New Project", action: () => navigate("/post-project"), color: c.primary },
            { label: "Find Talent", action: () => setActiveView("Find Talent"), color: "#22c55e" },
            { label: "View Contracts", action: () => setActiveView("Active Projects"), color: "#3b82f6" },
          ].map(a => (
            <div
              key={a.label}
              onClick={a.action}
              style={{ padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, fontSize: 12, color: a.color, cursor: "pointer", marginBottom: 6, background: c.bg }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = a.color)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = c.border)}
            >
              {a.label}
            </div>
          ))}

          {/* Spend breakdown (real data) */}
          <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginTop: 16, marginBottom: 8 }}>Spend by Category</div>
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map(i => <Skeleton key={i} h={20} />)}
            </div>
          ) : spendEntries.length === 0 ? (
            <div style={{ fontSize: 11, color: c.subtext }}>No spend data yet</div>
          ) : (
            spendEntries.map(([label, amount]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `0.5px solid ${c.border}`, fontSize: 12 }}>
                <span style={{ color: c.subtext, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{label}</span>
                <span style={{ fontWeight: 500, color: c.text, flexShrink: 0 }}>{fmt(amount)}</span>
              </div>
            ))
          )}

          {/* Project status summary */}
          {!isLoading && projects.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 500, color: c.text, marginTop: 16, marginBottom: 8 }}>Project Status</div>
              {([
                ["Open", projects.filter(p => p.status === "open").length, "#f59e0b"],
                ["In Progress", projects.filter(p => p.status === "in_progress").length, "#22c55e"],
                ["Completed", projects.filter(p => p.status === "completed").length, c.primary],
              ] as [string, number, string][]).map(([label, count, color]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `0.5px solid ${c.border}`, fontSize: 12 }}>
                  <span style={{ color: c.subtext }}>{label}</span>
                  <span style={{ fontWeight: 600, color }}>{count}</span>
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

export default ClientDashboard;