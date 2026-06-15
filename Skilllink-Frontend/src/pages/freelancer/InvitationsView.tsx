import React, { useState, useEffect } from "react";

interface ThemeColors {
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string;
}

const EmptyState: React.FC<{ label: string; hint: string; c: ThemeColors }> = ({ label, hint, c }) => (
  <div style={{ padding: "28px 16px", textAlign: "center" }}>
    <div style={{ fontSize: 13, fontWeight: 500, color: c.subtext, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 12, color: c.subtext, opacity: .6 }}>{hint}</div>
  </div>
);

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

interface Invitation {
  invitation_id: number;
  project_id:    number;
  project_title: string;
  client_email:  string;
  client_name?:  string | null;
  message:       string | null;
  status:        string;
  created_at:    string;
}

const InvitationsView: React.FC<{ c: ThemeColors; onCountChange?: (n: number) => void }> = ({ c, onCountChange }) => {
  const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";
  const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });

  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState<number | null>(null);
  const [expandedInvites, setExpandedInvites] = useState<Set<number>>(new Set());

  const toggleInviteMsg = (id: number) =>
    setExpandedInvites((prev: Set<number>) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/proposals/invitations/my`, auth());
      if (res.ok) {
        const data: Invitation[] = await res.json();
        setInvites(data);
        onCountChange?.(data.filter((i: Invitation) => i.status === "pending").length);
      }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const respond = async (id: number, action: "accept" | "decline") => {
    setActing(id);
    try {
      const res = await fetch(`${API}/proposals/invitations/${id}/respond`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setInvites((prev: Invitation[]) => prev.map((i: Invitation) => i.invitation_id === id ? { ...i, status: action === "accept" ? "accepted" : "declined" } : i));
        onCountChange?.(invites.filter((i: Invitation) => i.invitation_id !== id && i.status === "pending").length);
      }
    } catch {} finally { setActing(null); }
  };

  const statusColor = (s: string) => s === "accepted" ? "#22c55e" : s === "declined" ? "#ef4444" : c.primary;
  const statusLabel = (s: string) => s === "accepted" ? "Accepted" : s === "declined" ? "Declined" : "Pending";

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Invitations</div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Clients who invited you to submit a proposal</div>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: c.subtext, padding: 24, textAlign: "center" }}>Loading…</div>
      ) : invites.length === 0 ? (
        <EmptyState label="No invitations yet" hint="When a client invites you to a project, it will appear here." c={c} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {invites.map((inv: Invitation) => (
            <div key={inv.invitation_id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {inv.project_title}
                  </div>
                  <div style={{ fontSize: 11, color: c.subtext, marginBottom: inv.message ? 8 : 0 }}>
                    From {inv.client_name || inv.client_email} · {timeAgo(inv.created_at)}
                  </div>
                  {inv.message && (() => {
                    const isLong = inv.message!.length > 120;
                    const expanded = expandedInvites.has(inv.invitation_id);
                    return (
                      <div style={{ fontSize: 12, color: c.text, background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "8px 12px", marginTop: 6, lineHeight: 1.5 }}>
                        "{isLong && !expanded ? inv.message!.slice(0, 120) + "…" : inv.message}"
                        {isLong && (
                          <button
                            onClick={() => toggleInviteMsg(inv.invitation_id)}
                            style={{ display: "block", marginTop: 4, background: "none", border: "none", color: c.primary, cursor: "pointer", fontSize: 11, padding: 0, fontWeight: 600, fontFamily: "inherit" }}
                          >
                            {expanded ? "Show less" : "More info"}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: statusColor(inv.status), background: statusColor(inv.status) + "18", border: `0.5px solid ${statusColor(inv.status)}30`, borderRadius: 100, padding: "3px 10px" }}>
                    {statusLabel(inv.status)}
                  </span>
                  {inv.status === "pending" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => respond(inv.invitation_id, "decline")}
                        disabled={acting === inv.invitation_id}
                        aria-label={`Decline invitation to ${inv.project_title}`}
                        style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, background: "transparent", border: `0.5px solid ${c.border}`, color: c.subtext, cursor: "pointer", opacity: acting === inv.invitation_id ? 0.5 : 1 }}
                      >Decline</button>
                      <button
                        onClick={() => respond(inv.invitation_id, "accept")}
                        disabled={acting === inv.invitation_id}
                        aria-label={`Accept invitation to ${inv.project_title}`}
                        style={{ fontSize: 11, padding: "5px 14px", borderRadius: 8, background: c.primary, border: "none", color: "#fff", cursor: "pointer", fontWeight: 500, opacity: acting === inv.invitation_id ? 0.5 : 1 }}
                      >{acting === inv.invitation_id ? "…" : "Accept"}</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InvitationsView;
