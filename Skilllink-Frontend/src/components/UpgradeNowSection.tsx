import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../shared/LanguageContext";

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

interface PlanDef {
  tier: PlanTier;
  nameKey: string;
  monthlyPrice: number;
  yearlyPrice: number;
  descKey: string;
  features: { textKey: string; included: boolean }[];
  badgeKey?: string;
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

// ─── Plan Definitions (translation keys) ─────────────────────────────────────

const FREELANCER_PLAN_DEFS: PlanDef[] = [
  {
    tier: "free",
    nameKey: "upgrade.fl.s.name",
    monthlyPrice: 0,
    yearlyPrice: 0,
    descKey: "upgrade.fl.s.desc",
    features: [
      { textKey: "upgrade.fl.s.f1", included: true },
      { textKey: "upgrade.fl.s.f2", included: true },
      { textKey: "upgrade.fl.s.f3", included: true },
      { textKey: "upgrade.fl.s.f4", included: true },
      { textKey: "upgrade.fl.s.f5", included: false },
      { textKey: "upgrade.fl.s.f6", included: false },
      { textKey: "upgrade.fl.s.f7", included: false },
      { textKey: "upgrade.fl.s.f8", included: false },
    ],
  },
  {
    tier: "pro",
    nameKey: "upgrade.fl.p.name",
    monthlyPrice: 19,
    yearlyPrice: 15,
    descKey: "upgrade.fl.p.desc",
    badgeKey: "upgrade.badge.popular",
    highlight: true,
    features: [
      { textKey: "upgrade.fl.p.f1", included: true },
      { textKey: "upgrade.fl.p.f2", included: true },
      { textKey: "upgrade.fl.p.f3", included: true },
      { textKey: "upgrade.fl.p.f4", included: true },
      { textKey: "upgrade.fl.p.f5", included: true },
      { textKey: "upgrade.fl.p.f6", included: true },
      { textKey: "upgrade.fl.p.f7", included: false },
      { textKey: "upgrade.fl.p.f8", included: false },
    ],
  },
  {
    tier: "business",
    nameKey: "upgrade.fl.e.name",
    monthlyPrice: 49,
    yearlyPrice: 39,
    descKey: "upgrade.fl.e.desc",
    features: [
      { textKey: "upgrade.fl.e.f1", included: true },
      { textKey: "upgrade.fl.e.f2", included: true },
      { textKey: "upgrade.fl.e.f3", included: true },
      { textKey: "upgrade.fl.e.f4", included: true },
      { textKey: "upgrade.fl.e.f5", included: true },
      { textKey: "upgrade.fl.e.f6", included: true },
      { textKey: "upgrade.fl.e.f7", included: true },
      { textKey: "upgrade.fl.e.f8", included: true },
    ],
  },
];

const CLIENT_PLAN_DEFS: PlanDef[] = [
  {
    tier: "free",
    nameKey: "upgrade.cl.s.name",
    monthlyPrice: 0,
    yearlyPrice: 0,
    descKey: "upgrade.cl.s.desc",
    features: [
      { textKey: "upgrade.cl.s.f1", included: true },
      { textKey: "upgrade.cl.s.f2", included: true },
      { textKey: "upgrade.cl.s.f3", included: true },
      { textKey: "upgrade.cl.s.f4", included: true },
      { textKey: "upgrade.cl.s.f5", included: false },
      { textKey: "upgrade.cl.s.f6", included: false },
      { textKey: "upgrade.cl.s.f7", included: false },
      { textKey: "upgrade.cl.s.f8", included: false },
    ],
  },
  {
    tier: "pro",
    nameKey: "upgrade.cl.g.name",
    monthlyPrice: 49,
    yearlyPrice: 39,
    descKey: "upgrade.cl.g.desc",
    badgeKey: "upgrade.badge.popular",
    highlight: true,
    features: [
      { textKey: "upgrade.cl.g.f1", included: true },
      { textKey: "upgrade.cl.g.f2", included: true },
      { textKey: "upgrade.cl.g.f3", included: true },
      { textKey: "upgrade.cl.g.f4", included: true },
      { textKey: "upgrade.cl.g.f5", included: true },
      { textKey: "upgrade.cl.g.f6", included: true },
      { textKey: "upgrade.cl.g.f7", included: false },
      { textKey: "upgrade.cl.g.f8", included: false },
    ],
  },
  {
    tier: "business",
    nameKey: "upgrade.cl.e.name",
    monthlyPrice: 149,
    yearlyPrice: 119,
    descKey: "upgrade.cl.e.desc",
    features: [
      { textKey: "upgrade.cl.e.f1", included: true },
      { textKey: "upgrade.cl.e.f2", included: true },
      { textKey: "upgrade.cl.e.f3", included: true },
      { textKey: "upgrade.cl.e.f4", included: true },
      { textKey: "upgrade.cl.e.f5", included: true },
      { textKey: "upgrade.cl.e.f6", included: true },
      { textKey: "upgrade.cl.e.f7", included: true },
      { textKey: "upgrade.cl.e.f8", included: true },
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
  const { t } = useLanguage();
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
            {price === 0 ? t("upgrade.plan.free.label") : `$${price}`}
          </span>
          {price > 0 && (
            <span style={{ fontSize: 13, color: c.subtext }}>{t("upgrade.plan.perMo")}</span>
          )}
        </div>
        {billing === "yearly" && saving > 0 && (
          <div style={{ fontSize: 11, color: "#22c55e", marginBottom: 4 }}>
            {t("upgrade.plan.saveYearly", { saving: String(saving) })}
          </div>
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
        {plan.tier === "free" ? t("upgrade.plan.onThis") : t("upgrade.plan.upgNow")}
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
  const { t } = useLanguage();
  const [billing, setBilling] = useState<BillingCycle>("monthly");

  const defs = roleType === "freelancer" ? FREELANCER_PLAN_DEFS : CLIENT_PLAN_DEFS;
  const plans: Plan[] = defs.map(def => ({
    tier: def.tier,
    name: t(def.nameKey),
    monthlyPrice: def.monthlyPrice,
    yearlyPrice: def.yearlyPrice,
    description: t(def.descKey),
    features: def.features.map(f => ({ text: t(f.textKey), included: f.included })),
    badge: def.badgeKey ? t(def.badgeKey) : undefined,
    highlight: def.highlight,
  }));

  const handleSelect = (plan: Plan) => {
    if (plan.tier === "free") return;
    if (plan.tier === "business") {
      alert(t("upgrade.enterprise.msg"));
      return;
    }
    navigate("/payment", { state: { plan, billing, roleType } });
  };

  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", color: c.text }}>
          {t("upgrade.section.title")}
        </div>
        <div style={{ fontSize: 12, color: c.subtext, marginTop: 3 }}>
          {roleType === "freelancer"
            ? t("upgrade.section.fl.desc")
            : t("upgrade.section.cl.desc")}
        </div>
      </div>

      {/* Billing Toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "2.5rem" }}>
        <span style={{ fontSize: 13, color: billing === "monthly" ? c.text : c.subtext }}>
          {t("upgrade.billing.monthly")}
        </span>
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
          {t("upgrade.billing.yearly")}{" "}
          <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>
            {t("upgrade.billing.save22")}
          </span>
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
