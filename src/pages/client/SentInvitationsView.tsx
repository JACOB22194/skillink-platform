import React, { useState, useEffect } from "react";
import { type ThemeColors, API_BASE_CLIENT, authHdr } from "./clientShared";

interface SentInvitation {
  invitation_id:    number;
  project_id:       number;
  project_title:    string;
  freelancer_id:    number;
  freelancer_email: string;
  message:          string | null;
  status:           string;
  created_at:       string;
}

const SentInvitationsView: React.FC<{ colors: ThemeColors }> = ({ colors: c }) => {
  const [invites, setInvites] = useState<SentInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<"all" | "pending" | "accepted" | "declined">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_CLIENT}/proposals/invitations/sent`, authHdr());
        if (res.ok) setInvites(await res.json());
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const statusColor = (s: string) =>
    s === "accepted" ? "#22c55e" : s === "declined" ? "#ef4444" : c.primary;
  const statusLabel = (s: string) =>
    s === "accepted" ? "Accepted" : s === "declined" ? "Declined" : "Pending";
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

  const filtered = filter === "all" ? invites : invites.filter((i: SentInvitation) => i.status === filter);
  const counts = {
    all:      invites.length,
    pending:  invites.filter((i: SentInvitation) => i.status === "pending").length,
    accepted: invites.filter((i: SentInvitation) => i.status === "accepted").length,
    declined: invites.filter((i: SentInvitation) => i.status === "declined").length,
  };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>Sent Invitations</div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>Track freelancers you've invited to your projects</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["all", "pending", "accepted", "declined"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ fontSize: 11, padding: "5px 12px", borderRadius: 100, border: `0.5px solid ${filter === f ? c.primary : c.border}`, background: filter === f ? c.primary + "18" : "transparent", color: filter === f ? c.primary : c.subtext, cursor: "pointer", fontFamily: "inherit" }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} {counts[f] > 0 && `(${counts[f]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: c.subtext, padding: 24, textAlign: "center" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: c.subtext, marginBottom: 4 }}>No invitations yet</div>
          <div style={{ fontSize: 12, color: c.subtext, opacity: .6 }}>Go to Find Talent and click "+ Invite" on a freelancer.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((inv: SentInvitation) => (
            <div key={inv.invitation_id} style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{inv.freelancer_email}</span>
                  <span style={{ fontSize: 10, color: c.subtext }}>→</span>
                  <span style={{ fontSize: 12, color: c.subtext, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{inv.project_title}</span>
                </div>
                <div style={{ fontSize: 11, color: c.subtext }}>Sent {fmtDate(inv.created_at)}</div>
                {inv.message && (
                  <div style={{ fontSize: 11, color: c.subtext, background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 6, padding: "6px 10px", marginTop: 6, fontStyle: "italic" }}>
                    "{inv.message}"
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: statusColor(inv.status), background: statusColor(inv.status) + "18", border: `0.5px solid ${statusColor(inv.status)}30`, borderRadius: 100, padding: "3px 10px", flexShrink: 0, whiteSpace: "nowrap" }}>
                {statusLabel(inv.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SentInvitationsView;
