import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

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
}> = ({ plan, billing, colors: c, onSelect }) => {
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
        {plan.tier === "free" ? "You're on this plan" : "Upgrade now"}
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

interface UpgradeNowSectionProps {
  roleType: "freelancer" | "client";
  colors: ThemeColors;
}

const UpgradeNowSection: React.FC<UpgradeNowSectionProps> = ({ roleType, colors: c }) => {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingCycle>("monthly");

  const plans = roleType === "freelancer" ? FREELANCER_PLANS : CLIENT_PLANS;

  const handleSelect = (plan: Plan) => {
    if (plan.tier === "free") {
      return; // Already on free plan
    }
    if (plan.tier === "business") {
      // Enterprise / Elite → contact sales
      alert("Contact sales for enterprise plans. This feature is coming soon.");
      return;
    }
    navigate("/payment", { state: { plan, billing, roleType } });
  };

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>
          Upgrade Now
        </div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>
          {roleType === "freelancer"
            ? "Unlock advanced features to win more projects and grow your freelance business."
            : "Unlock advanced features to hire the best talent and scale your team."}
        </div>
      </div>

      {/* Billing Toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "2.5rem" }}>
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

      {/* Plan Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 16,
      }}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            billing={billing}
            colors={c}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
};

export default UpgradeNowSection;
