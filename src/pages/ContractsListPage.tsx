/**
 * ContractsListPage.tsx
 * Route: /contracts
 * Lists all contracts for the logged-in user (client or freelancer)
 */
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });

interface Contract {
  contract_id: number;
  project_id: number;
  freelancer_id: number;
  status: "active" | "completed" | "disputed";
  created_at: string;
}

const T = {
  bg: "#09090f",
  surface: "#111119",
  card: "#161622",
  border: "#20202e",
  text: "#ebebf8",
  sub: "#65658a",
  accent: "#7F77DD",
  accentSoft: "#7F77DD18",
  green: "#00e096",
  greenSoft: "#00e09610",
  red: "#ff3d60",
  redSoft: "#ff3d6010",
  amber: "#ffb224",
  amberSoft: "#ffb22410",
};

const statusCfg = {
  active:    { color: T.green, bg: T.greenSoft, label: "Active", icon: "⚡" },
  completed: { color: T.accent, bg: T.accentSoft, label: "Completed", icon: "✓" },
  disputed:  { color: T.red, bg: T.redSoft, label: "Disputed", icon: "⚠" },
};

export const ContractsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<"all" | "active" | "completed" | "disputed">("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/contracts/my`, auth());
        if (r.ok) setContracts(await r.json());
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = filter === "all" ? contracts : contracts.filter(c => c.status === filter);
  const counts = {
    all: contracts.length,
    active: contracts.filter(c => c.status === "active").length,
    completed: contracts.filter(c => c.status === "completed").length,
    disputed: contracts.filter(c => c.status === "disputed").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'); *{box-sizing:border-box} button{font-family:inherit}`}</style>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>

      <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 28 }}>← Back</button>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 6px", color: T.text }}>Contracts</h1>
        <p style={{ color: T.sub, margin: 0, fontSize: 14 }}>{counts.all} total · {counts.active} active</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        {(["all", "active", "completed", "disputed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "7px 16px", borderRadius: 100, border: `1px solid ${filter === f ? T.accent : T.border}`,
            background: filter === f ? T.accentSoft : "transparent",
            color: filter === f ? T.accent : T.sub, fontWeight: 600, fontSize: 12, cursor: "pointer",
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: T.sub }}>Loading contracts…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>No contracts here</div>
          <div style={{ fontSize: 13, color: T.sub }}>
            {filter === "all" ? "You don't have any contracts yet." : `No ${filter} contracts.`}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(c => {
            const cfg = statusCfg[c.status];
            return (
              <div
                key={c.contract_id}
                onClick={() => navigate(`/contract/${c.contract_id}`)}
                style={{
                  background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
                  padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16,
                  transition: "border-color .2s, background .2s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.accent + "55"; (e.currentTarget as HTMLDivElement).style.background = T.surface; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.border; (e.currentTarget as HTMLDivElement).style.background = T.card; }}
              >
                {/* Icon */}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  {cfg.icon}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 3 }}>Contract #{c.contract_id}</div>
                  <div style={{ fontSize: 12, color: T.sub }}>Project #{c.project_id} · Freelancer #{c.freelancer_id}</div>
                  <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>
                    Started {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Status */}
                <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 100, background: cfg.bg, color: cfg.color, fontWeight: 600, flexShrink: 0 }}>
                  {cfg.label}
                </span>

                {/* Arrow */}
                <span style={{ color: T.sub, fontSize: 16 }}>→</span>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
};

export default ContractsListPage;