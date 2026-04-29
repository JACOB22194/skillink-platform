import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type BillingCycle = "monthly" | "yearly";
type PlanTier = "free" | "pro" | "business";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  tier: PlanTier;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: PlanFeature[];
  badge?: string;
  highlight?: boolean;
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

// ─── Plans ────────────────────────────────────────────────────────────────────

const FREELANCER_PLANS: Plan[] = [
  {
    tier: "free",
    name: "Starter",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "Get started and explore the platform.",
    features: [
      { text: "5 proposals per month", included: true },
      { text: "Basic AI job matching", included: true },
      { text: "Public profile", included: true },
      { text: "GitHub profile connect", included: true },
      { text: "Priority proposal placement", included: false },
      { text: "Unlimited proposals", included: false },
      { text: "Advanced AI match scoring", included: false },
      { text: "Dedicated success manager", included: false },
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    monthlyPrice: 19,
    yearlyPrice: 15,
    description: "For active freelancers who want to win more.",
    badge: "Most Popular",
    highlight: true,
    features: [
      { text: "Unlimited proposals", included: true },
      { text: "Priority proposal placement", included: true },
      { text: "Advanced AI match scoring", included: true },
      { text: "Smart proposal generator", included: true },
      { text: "GitHub quality badge", included: true },
      { text: "Analytics & earnings tracker", included: true },
      { text: "Dedicated success manager", included: false },
      { text: "Custom profile domain", included: false },
    ],
  },
  {
    tier: "business",
    name: "Elite",
    monthlyPrice: 49,
    yearlyPrice: 39,
    description: "For top earners who need every edge.",
    features: [
      { text: "Everything in Pro", included: true },
      { text: "Dedicated success manager", included: true },
      { text: "Custom profile domain", included: true },
      { text: "Featured freelancer badge", included: true },
      { text: "Early access to premium projects", included: true },
      { text: "White-glove profile review", included: true },
      { text: "Priority dispute resolution", included: true },
      { text: "API access", included: true },
    ],
  },
];

const CLIENT_PLANS: Plan[] = [
  {
    tier: "free",
    name: "Starter",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "Post projects and find your first hire.",
    features: [
      { text: "2 active projects", included: true },
      { text: "Basic AI talent matching", included: true },
      { text: "Standard escrow", included: true },
      { text: "Community support", included: true },
      { text: "Unlimited projects", included: false },
      { text: "AI-ranked candidates", included: false },
      { text: "Team workrooms", included: false },
      { text: "Dedicated account manager", included: false },
    ],
  },
  {
    tier: "pro",
    name: "Growth",
    monthlyPrice: 49,
    yearlyPrice: 39,
    description: "For growing teams hiring regularly.",
    badge: "Most Popular",
    highlight: true,
    features: [
      { text: "Unlimited active projects", included: true },
      { text: "AI-ranked candidates", included: true },
      { text: "Advanced talent filters", included: true },
      { text: "Team workrooms (up to 5)", included: true },
      { text: "Invoice management", included: true },
      { text: "Priority support", included: true },
      { text: "Dedicated account manager", included: false },
      { text: "Custom contract templates", included: false },
    ],
  },
  {
    tier: "business",
    name: "Enterprise",
    monthlyPrice: 149,
    yearlyPrice: 119,
    description: "For companies that hire at scale.",
    features: [
      { text: "Everything in Growth", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "Custom contract templates", included: true },
      { text: "Unlimited workrooms & seats", included: true },
      { text: "Analytics & spend reporting", included: true },
      { text: "SSO / SAML integration", included: true },
      { text: "SLA guarantee", included: true },
      { text: "Custom AI training on your data", included: true },
    ],
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f4f4f8", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#666666", primary: "#7F77DD", primarySoft: "#EEEDFE" };

// ─── Sub-components ───────────────────────────────────────────────────────────

const CheckIcon = ({ included }: { included: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
    {included ? (
      <>
        <circle cx="7" cy="7" r="7" fill="#7F77DD" fillOpacity="0.15" />
        <path d="M4.5 7l2 2 3-3" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ) : (
      <>
        <circle cx="7" cy="7" r="7" fill="transparent" />
        <path d="M4.5 7h5" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const PlanCard: React.FC<{
  plan: Plan;
  billing: BillingCycle;
  colors: ThemeColors;
  onSelect: (plan: Plan) => void;
  roleType: "freelancer" | "client";
}> = ({ plan, billing, colors: c, onSelect, roleType }) => {
  const price = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
  const saving = plan.monthlyPrice > 0
    ? Math.round(((plan.monthlyPrice - plan.yearlyPrice) / plan.monthlyPrice) * 100)
    : 0;

  return (
    <div
      style={{
        background: plan.highlight ? `linear-gradient(135deg, ${c.primarySoft} 0%, ${c.surface} 100%)` : c.surface,
        border: plan.highlight ? `1px solid ${c.primary}` : `0.5px solid ${c.border}`,
        borderRadius: 16,
        padding: "24px 20px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: plan.highlight ? `0 0 0 1px ${c.primary}22, 0 8px 32px ${c.primary}18` : "none",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      {/* Badge */}
      {plan.badge && (
        <div style={{
          position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
          background: c.primary, color: "#fff", fontSize: 10, fontWeight: 600,
          padding: "3px 12px", borderRadius: 100, letterSpacing: "0.05em", whiteSpace: "nowrap",
        }}>
          {plan.badge}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: c.subtext, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
          {plan.name}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
          <span style={{ fontSize: 36, fontWeight: 600, color: c.text, letterSpacing: "-1px" }}>
            {price === 0 ? "Free" : `$${price}`}
          </span>
          {price > 0 && (
            <span style={{ fontSize: 13, color: c.subtext }}>/mo</span>
          )}
        </div>
        {billing === "yearly" && saving > 0 && (
          <div style={{ fontSize: 11, color: "#22c55e", marginBottom: 4 }}>Save {saving}% with yearly billing</div>
        )}
        <p style={{ fontSize: 12, color: c.subtext, lineHeight: 1.5, margin: 0 }}>{plan.description}</p>
      </div>

      {/* CTA */}
      <button
        onClick={() => onSelect(plan)}
        style={{
          width: "100%",
          padding: "10px 0",
          borderRadius: 10,
          border: plan.highlight ? "none" : `0.5px solid ${c.border}`,
          background: plan.highlight ? c.primary : "transparent",
          color: plan.highlight ? "#fff" : c.text,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          marginBottom: 20,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
      >
        {plan.tier === "free" ? "Get started free" : plan.tier === "business" ? "Contact sales" : "Upgrade now"}
      </button>

      {/* Divider */}
      <div style={{ height: "0.5px", background: c.border, marginBottom: 16 }} />

      {/* Features */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {plan.features.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckIcon included={f.included} />
            <span style={{ fontSize: 12, color: f.included ? c.text : c.subtext, opacity: f.included ? 1 : 0.5 }}>
              {f.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [darkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [roleTab, setRoleTab] = useState<"freelancer" | "client">(() => {
    const params = new URLSearchParams(location.search);
    const role = params.get("role");
    return role === "client" ? "client" : "freelancer";
  });
  const c = getColors(darkMode);

  const plans = roleTab === "freelancer" ? FREELANCER_PLANS : CLIENT_PLANS;

  const handleSelect = (plan: Plan) => {
    if (plan.tier === "free") {
      navigate("/register");
      return;
    }
    if (plan.tier === "business") {
      // Enterprise / Elite → contact sales
      navigate("/register");
      return;
    }
    navigate("/payment", { state: { plan, billing, roleType: roleTab } });
  };

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif" }}>
      {/* ── Navbar ── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 2rem", borderBottom: `0.5px solid ${c.border}` }}>
        <div
          onClick={() => navigate("/")}
          style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, cursor: "pointer" }}
        >
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => navigate("/login")}
            style={{ padding: "8px 18px", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 500, fontFamily: "inherit", background: "transparent", border: `0.5px solid ${c.border}`, color: c.text }}
          >
            Log in
          </button>
          <button
            onClick={() => navigate("/register")}
            style={{ padding: "8px 18px", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 500, fontFamily: "inherit", background: c.primary, border: "none", color: "#fff" }}
          >
            Sign up
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{ textAlign: "center", padding: "4rem 2rem 2rem", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "inline-block", fontSize: 11, padding: "4px 12px", borderRadius: 100, background: c.primarySoft, color: c.primary, marginBottom: "1rem", letterSpacing: "0.05em", fontWeight: 600, textTransform: "uppercase" }}>
          Pricing
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-1px", marginBottom: "0.75rem", color: c.text, lineHeight: 1.15 }}>
          Simple, transparent<br />pricing
        </h1>
        <p style={{ fontSize: 15, color: c.subtext, lineHeight: 1.7, margin: 0 }}>
          Choose the plan that fits your goals. Upgrade or downgrade anytime.
        </p>
      </div>

      {/* ── Role Tab ── */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: "1.5rem" }}>
        {(["freelancer", "client"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRoleTab(r)}
            style={{
              padding: "8px 22px", borderRadius: 100, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
              background: roleTab === r ? c.primary : c.surface,
              border: roleTab === r ? "none" : `0.5px solid ${c.border}`,
              color: roleTab === r ? "#fff" : c.subtext,
            }}
          >
            {r === "freelancer" ? "🧑‍💻 For Freelancers" : "🏢 For Clients"}
          </button>
        ))}
      </div>

      {/* ── Billing Toggle ── */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: "1.5rem", marginBottom: "2.5rem" }}>
        <span style={{ fontSize: 13, color: billing === "monthly" ? c.text : c.subtext }}>Monthly</span>
        <div
          onClick={() => setBilling(billing === "monthly" ? "yearly" : "monthly")}
          style={{
            width: 44, height: 24, borderRadius: 100, cursor: "pointer",
            background: billing === "yearly" ? c.primary : c.border,
            position: "relative", transition: "background 0.2s",
          }}
        >
          <div style={{
            position: "absolute", top: 3, left: billing === "yearly" ? 23 : 3,
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            transition: "left 0.2s",
          }} />
        </div>
        <span style={{ fontSize: 13, color: billing === "yearly" ? c.text : c.subtext }}>
          Yearly <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>Save up to 22%</span>
        </span>
      </div>

      {/* ── Plan Cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 16,
        maxWidth: 960,
        margin: "0 auto 4rem",
        padding: "0 2rem",
      }}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            billing={billing}
            colors={c}
            onSelect={handleSelect}
            roleType={roleTab}
          />
        ))}
      </div>

      {/* ── FAQ / Trust ── */}
      <div style={{ maxWidth: 700, margin: "0 auto 5rem", padding: "0 2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: c.text, letterSpacing: "-0.5px" }}>Questions & answers</h2>
        </div>
        {[
          { q: "Can I switch plans later?", a: "Yes — you can upgrade or downgrade at any time. Changes take effect immediately and we prorate billing." },
          { q: "Is there a free trial?", a: "All paid plans include a 7-day free trial. No credit card required to start." },
          { q: "How does yearly billing work?", a: "Yearly plans are billed as a single upfront payment and offer up to 22% savings compared to monthly." },
          { q: "What payment methods are accepted?", a: "We accept all major credit and debit cards via Stripe. No hidden fees." },
        ].map(({ q, a }) => (
          <div key={q} style={{ borderBottom: `0.5px solid ${c.border}`, padding: "16px 0" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>{q}</div>
            <div style={{ fontSize: 13, color: c.subtext, lineHeight: 1.6 }}>{a}</div>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <footer style={{ textAlign: "center", padding: "2rem", borderTop: `0.5px solid ${c.border}`, fontSize: 13, color: c.subtext }}>
        © 2025 SkillLink. All rights reserved.
      </footer>
    </div>
  );
};

export default PricingPage;