import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE_URL, getAuthHeaders } from "../shared/api";
import { useLanguage } from "../shared/LanguageContext";

type BillingCycle = "monthly" | "yearly";
type PlanTier = "free" | "pro" | "business";

interface Plan {
  tier: PlanTier;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: { text: string; included: boolean }[];
  badge?: string;
  highlight?: boolean;
}

interface LocationState {
  plan: Plan;
  billing: BillingCycle;
  roleType: "freelancer" | "client";
}

interface ThemeColors {
  bg: string; surface: string; border: string; text: string; subtext: string;
  primary: string; primarySoft: string;
}

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f4f4f8", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#666666", primary: "#7F77DD", primarySoft: "#EEEDFE" };

const MONTHLY_PRICE_REF = (plan: Plan) => plan.monthlyPrice;

const PaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const { t, isRTL } = useLanguage();

  const [darkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const c = getColors(darkMode);

  if (!state?.plan) {
    return (
      <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center", color: c.text }}>
          <p style={{ fontSize: 16, marginBottom: 16 }}>No plan selected.</p>
          <button onClick={() => navigate("/pricing")} style={{ background: c.primary, color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
            View pricing →
          </button>
        </div>
      </div>
    );
  }

  const { plan, billing, roleType } = state;
  const price = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
  const annualTotal = billing === "yearly" ? price * 12 : null;

  const formatCard = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleSubmit = async () => {
    if (!cardNumber || !expiry || !cvc || !name) {
      setError("Please fill in all card details.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders().headers },
        body: JSON.stringify({ plan_tier: plan.tier, billing_cycle: billing, role_type: roleType }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Payment failed. Please try again.");
      }
    } catch {
      setError("Could not reach payment service. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 20, padding: "40px 48px", textAlign: "center", maxWidth: 420 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M6 14l6 6 10-10" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: c.text, marginBottom: 8, letterSpacing: "-0.5px" }}>
            You're on {plan.name}!
          </h2>
          <p style={{ fontSize: 14, color: c.subtext, lineHeight: 1.6, marginBottom: 24 }}>
            Your subscription is now active. Enjoy all the benefits of your new plan.
          </p>
          <button
            onClick={() => navigate(roleType === "freelancer" ? "/dashboard/freelancer" : "/dashboard/client")}
            style={{ background: c.primary, color: "#fff", border: "none", padding: "12px 28px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}
          >
            {t("common.dashboard")} →
          </button>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: `0.5px solid ${c.border}`,
    background: c.bg, color: c.text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: c.subtext, display: "block", marginBottom: 6 };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: c.bg, fontFamily: "sans-serif", color: c.text }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 2rem", borderBottom: `0.5px solid ${c.border}` }}>
        <div onClick={() => navigate("/")} style={{ fontSize: 20, fontWeight: 500, color: c.text, cursor: "pointer" }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>
        <button
          onClick={() => navigate("/pricing")}
          style={{ background: "transparent", border: `0.5px solid ${c.border}`, color: c.subtext, padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
        >
          {isRTL ? "→" : "←"} {t("land.nav.pricing")}
        </button>
      </nav>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "3rem 2rem", display: "grid", gridTemplateColumns: "1fr 360px", gap: 32, alignItems: "start" }}>

        {/* Payment form */}
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.5px", marginBottom: 4 }}>{t("pay.title")}</h1>
          <p style={{ fontSize: 13, color: c.subtext, marginBottom: 28 }}>{t("pay.subtitle")}</p>

          <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 20 }}>{t("pay.details")}</div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{t("pay.cardHolder")}</label>
              <input style={inputStyle} placeholder="Full name on card" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{t("pay.cardNumber")}</label>
              <input style={inputStyle} placeholder="1234 5678 9012 3456" value={cardNumber} onChange={e => setCardNumber(formatCard(e.target.value))} maxLength={19} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>{t("pay.expiry")}</label>
                <input style={inputStyle} placeholder="MM/YY" value={expiry} onChange={e => setExpiry(formatExpiry(e.target.value))} maxLength={5} />
              </div>
              <div>
                <label style={labelStyle}>{t("pay.cvc")}</label>
                <input style={inputStyle} placeholder="123" value={cvc} onChange={e => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} maxLength={4} type="password" />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            {[t("pay.ssl"), t("pay.stripe"), t("pay.cancel")].map(badge => (
              <span key={badge} style={{ fontSize: 11, color: c.subtext }}>{badge}</span>
            ))}
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,.1)", border: "0.5px solid rgba(239,68,68,.3)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#ef4444", marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: loading ? "#555" : c.primary, color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >
            {loading ? t("pay.processing") : `${t("pay.submit")} $${billing === "yearly" ? price * 12 : price}${billing === "yearly" ? ` / ${t("pricing.billing.year")}` : ` / ${t("pricing.billing.month")}`}`}
          </button>
        </div>

        {/* Order summary */}
        <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 16, padding: 24, position: "sticky", top: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 20 }}>{t("pay.summary")}</div>

          <div style={{ background: c.primarySoft, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: c.primary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              {roleType === "freelancer" ? t("pricing.role.fl") : t("pricing.role.cl")} · {plan.name}
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, color: c.text, letterSpacing: "-0.5px" }}>
              ${price}<span style={{ fontSize: 13, color: c.subtext, fontWeight: 400 }}>{t("pay.subtotal").replace("Subtotal", "/mo")}</span>
            </div>
            {annualTotal && (
              <div style={{ fontSize: 12, color: c.subtext, marginTop: 4 }}>
                Billed as ${annualTotal}/{t("pricing.billing.year")}
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, fontWeight: 500, color: c.subtext, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("pay.includes")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {plan.features.filter(f => f.included).map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: c.text }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="6" fill="rgba(127,119,221,0.15)" />
                  <path d="M3.5 6l2 2 3-3" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {f.text}
              </div>
            ))}
          </div>

          <div style={{ borderTop: `0.5px solid ${c.border}`, paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: c.subtext }}>{t("pay.subtotal")}</span>
              <span style={{ color: c.text }}>${price}/mo</span>
            </div>
            {billing === "yearly" && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: "#22c55e" }}>{t("pay.discount")}</span>
                <span style={{ color: "#22c55e" }}>-{Math.round(((MONTHLY_PRICE_REF(plan) - price) / MONTHLY_PRICE_REF(plan)) * 100)}%</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 600, marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${c.border}` }}>
              <span style={{ color: c.text }}>{t("pay.total")}</span>
              <span style={{ color: c.primary }}>${billing === "yearly" ? price * 12 : price}{billing === "yearly" ? "/yr" : "/mo"}</span>
            </div>
          </div>

          <p style={{ fontSize: 11, color: c.subtext, lineHeight: 1.6, marginTop: 16 }}>
            By completing your purchase you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
