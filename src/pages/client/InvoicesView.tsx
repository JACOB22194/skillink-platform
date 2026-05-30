import React, { useState, useEffect } from "react";
import apiClient from "../../api/client";
import { type ThemeColors } from "./clientShared";

interface Invoice {
  payment_id:      number;
  contract_id:     number;
  project_id:      number;
  milestone_id:    number | null;
  milestone_title: string;
  amount:          number;
  status:          string;
  payment_date:    string | null;
  escrow_status:   string;
}

const statusBadge = (status: string, c: ThemeColors) => {
  const map: Record<string, { bg: string; color: string }> = {
    paid:     { bg: "rgba(34,197,94,.15)",  color: "#22c55e" },
    approved: { bg: "rgba(99,102,241,.15)", color: "#818cf8" },
    pending:  { bg: "rgba(234,179,8,.15)",  color: "#eab308" },
  };
  const s = map[status] ?? { bg: "rgba(148,163,184,.15)", color: c.subtext };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: s.bg, color: s.color, textTransform: "capitalize" }}>
      {status}
    </span>
  );
};

const InvoicesView: React.FC<{ colors: ThemeColors }> = ({ colors: c }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiClient.get<Invoice[]>("/invoices/my");
        setInvoices(r.data);
      } catch {
        setError("Failed to load invoices.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${c.border}`, borderTopColor: c.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#f87171", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 32 }}>⚠️</span>
      <span>{error}</span>
    </div>
  );

  return (
    <div style={{ padding: "24px 28px", animation: "fadeIn 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: c.text, margin: 0 }}>Invoices</h2>
          <p style={{ fontSize: 13, color: c.subtext, margin: "4px 0 0" }}>All milestone payments made on your contracts</p>
        </div>
        <div style={{ background: "rgba(99,102,241,.12)", border: `1px solid rgba(99,102,241,.25)`, borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: c.subtext, marginBottom: 2 }}>Total Paid</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: c.primary }}>${totalPaid.toFixed(2)}</div>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", color: c.subtext, gap: 12 }}>
          <span style={{ fontSize: 40 }}>🧾</span>
          <span style={{ fontSize: 15, color: c.text, fontWeight: 500 }}>No invoices yet</span>
          <span style={{ fontSize: 13 }}>Payments will appear here once milestones are released.</span>
        </div>
      ) : (
        <div style={{ background: c.surface, borderRadius: 12, border: `1px solid ${c.border}`, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 120px 100px 130px", padding: "10px 20px", borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 600, color: c.subtext, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {["#", "Milestone", "Contract", "Amount", "Date"].map(h => <span key={h}>{h}</span>)}
          </div>
          {invoices.map((inv, idx) => (
            <div
              key={inv.payment_id}
              style={{ display: "grid", gridTemplateColumns: "60px 1fr 120px 100px 130px", padding: "14px 20px", borderBottom: idx < invoices.length - 1 ? `1px solid ${c.border}` : "none", fontSize: 13, color: c.text, alignItems: "center", transition: "background .15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: c.subtext, fontSize: 12 }}>#{inv.payment_id}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{inv.milestone_title}</div>
                <div style={{ fontSize: 11, color: c.subtext, marginTop: 2 }}>{statusBadge(inv.status, c)}</div>
              </div>
              <span style={{ fontSize: 12, color: c.subtext }}>Contract #{inv.contract_id}</span>
              <span style={{ fontWeight: 600, color: "#22c55e" }}>${inv.amount.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: c.subtext }}>
                {inv.payment_date ? new Date(inv.payment_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoicesView;
