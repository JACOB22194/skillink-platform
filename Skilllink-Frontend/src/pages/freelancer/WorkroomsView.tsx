import React, { useState, useEffect } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../shared/api";

interface ThemeColors {
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string;
}

interface WorkMilestone {
  milestone_id: number;
  title:        string | null;
  amount:       number;
  status:       string;
  due_date:     string | null;
}

interface WorkContract {
  contract_id:   number;
  status:        string;
  created_at:    string;
  project?: {
    project_id:  number;
    title:       string;
    description: string;
    budget:      number;
    status:      string;
  };
  milestones?: WorkMilestone[];
}

const contractStatusColor: Record<string, { color: string; bg: string }> = {
  active:    { color: "#22c55e",  bg: "rgba(34,197,94,.1)" },
  completed: { color: "#7F77DD", bg: "rgba(127,119,221,.12)" },
  disputed:  { color: "#ef4444", bg: "rgba(239,68,68,.1)" },
};

const milestoneStatusColor: Record<string, { color: string; bg: string }> = {
  pending:  { color: "#f59e0b",  bg: "rgba(245,158,11,.1)" },
  approved: { color: "#22c55e",  bg: "rgba(34,197,94,.1)" },
  paid:     { color: "#7F77DD", bg: "rgba(127,119,221,.12)" },
};

const WorkroomsView: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const [contracts, setContracts] = useState<WorkContract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [filter, setFilter]       = useState<"all" | "active" | "completed">("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/contracts/my`, getAuthHeaders());
        if (res.ok) {
          const data: WorkContract[] = await res.json();
          setContracts(data);
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.detail || "Failed to load workrooms.");
        }
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id: number) => setExpanded(prev => prev === id ? null : id);

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Workrooms</div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Your active and completed contracts with clients.</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["all", "active", "completed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 11, padding: "5px 14px", borderRadius: 20, border: `0.5px solid ${filter === f ? c.primary : c.border}`, background: filter === f ? c.primarySoft : "transparent", color: filter === f ? c.primary : c.subtext, cursor: "pointer", fontFamily: "inherit", fontWeight: filter === f ? 600 : 400 }}
          >{f.charAt(0).toUpperCase() + f.slice(1)}{f !== "all" && ` (${contracts.filter(ct => ct.status === f).length})`}</button>
        ))}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 72, background: c.surface, borderRadius: 12, border: `0.5px solid ${c.border}`, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "#ef4444", fontSize: 13 }}>{error}</div>
      )}

      {!loading && !error && contracts.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", color: c.subtext }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>🏗️</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>No workrooms yet</div>
          <div style={{ fontSize: 12, color: c.subtext, maxWidth: 280, textAlign: "center", lineHeight: 1.6 }}>
            Workrooms appear here once a client accepts your proposal and a contract is created.
          </div>
        </div>
      )}

      {!loading && !error && contracts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contracts.filter(ct => filter === "all" || ct.status === filter).map(ct => {
            const cs   = contractStatusColor[ct.status] ?? { color: c.subtext, bg: "transparent" };
            const isEx = expanded === ct.contract_id;
            const msList = ct.milestones ?? [];
            const paid = msList.filter((m: { status: string }) => m.status === "paid").length;
            const total = msList.length;
            const pct  = total > 0 ? Math.round((paid / total) * 100) : 0;

            return (
              <div key={ct.contract_id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div onClick={() => toggle(ct.contract_id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ct.project?.title ?? `Contract #${ct.contract_id}`}
                    </div>
                    <div style={{ fontSize: 11, color: c.subtext }}>
                      Started {new Date(ct.created_at).toLocaleDateString()} · ${ct.project?.budget?.toLocaleString() ?? "—"} budget
                    </div>
                  </div>

                  {total > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 80 }}>
                      <div style={{ fontSize: 10, color: c.subtext }}>{paid}/{total} milestones paid</div>
                      <div style={{ width: 80, height: 4, background: c.border, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#22c55e" : c.primary, borderRadius: 4, transition: "width .4s" }} />
                      </div>
                    </div>
                  )}

                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 100, background: cs.bg, color: cs.color, border: `0.5px solid ${cs.color}33`, flexShrink: 0 }}>
                    {ct.status.charAt(0).toUpperCase() + ct.status.slice(1)}
                  </span>
                  <span style={{ color: c.subtext, fontSize: 11, flexShrink: 0, transition: "transform .2s", transform: isEx ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                </div>

                {isEx && (
                  <div style={{ borderTop: `0.5px solid ${c.border}`, padding: "12px 16px" }}>
                    {ct.project?.description && (
                      <p style={{ fontSize: 12, color: c.subtext, margin: "0 0 12px", lineHeight: 1.6 }}>{ct.project.description}</p>
                    )}
                    {msList.length === 0 ? (
                      <div style={{ fontSize: 12, color: c.subtext, opacity: .7 }}>No milestones added yet.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 11, color: c.subtext, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Milestones</div>
                        {msList.map((m, i) => {
                          const ms = milestoneStatusColor[m.status] ?? { color: c.subtext, bg: "transparent" };
                          return (
                            <div key={m.milestone_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: c.bg, borderRadius: 8, border: `0.5px solid ${c.border}` }}>
                              <span style={{ fontSize: 11, color: c.subtext, minWidth: 18 }}>#{i + 1}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>{m.title || `Milestone #${i + 1}`}</div>
                                {m.due_date && <div style={{ fontSize: 10, color: c.subtext, marginTop: 2 }}>Due {new Date(m.due_date).toLocaleDateString()}</div>}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 500, color: c.text }}>${m.amount?.toLocaleString()}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 100, background: ms.bg, color: ms.color }}>
                                {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                              </span>
                            </div>
                          );
                        })}
                        <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                          <span style={{ fontSize: 12, color: c.subtext }}>
                            Total: <strong style={{ color: c.text }}>${msList.reduce((s, m) => s + (m.amount || 0), 0).toLocaleString()}</strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const EarningsChart: React.FC<{ c: ThemeColors }> = ({ c }) => {
  const [bars, setBars] = useState<{ label: string; amount: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/contracts/my`, getAuthHeaders());
        if (res.ok) {
          const contracts: WorkContract[] = await res.json();
          const byMonth: Record<string, number> = {};
          contracts.forEach(ct =>
            (ct.milestones ?? []).filter((m: WorkMilestone) => m.status === "paid").forEach((m: WorkMilestone) => {
              const key = new Date(m.due_date ?? ct.created_at).toLocaleDateString("en", { month: "short", year: "2-digit" });
              byMonth[key] = (byMonth[key] || 0) + (m.amount || 0);
            })
          );
          const sorted = Object.entries(byMonth).slice(-6).map(([label, amount]) => ({ label, amount }));
          setBars(sorted);
          setTotal(sorted.reduce((s, d) => s + d.amount, 0));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const max = Math.max(...bars.map(b => b.amount), 1);

  return (
    <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Earnings</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#22c55e" }}>${total.toLocaleString()}</span>
      </div>
      {loading ? (
        <div style={{ height: 80, background: c.border, borderRadius: 6, animation: "pulse 1.5s infinite" }} />
      ) : bars.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: c.subtext, opacity: .7 }}>
          Earnings will appear here once milestones are paid.
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
          {bars.map(({ label, amount }) => (
            <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div title={`$${amount}`} style={{ width: "100%", minHeight: 4, height: Math.max(4, (amount / max) * 64), background: c.primary, borderRadius: "3px 3px 0 0", opacity: 0.85 }} />
              <div style={{ fontSize: 9, color: c.subtext }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkroomsView;
