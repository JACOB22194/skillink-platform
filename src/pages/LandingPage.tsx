import React from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage, LangToggle } from "../shared/LanguageContext";
import type { UserRole } from "../shared/types";

interface ThemeColors {
  bg: string; surface: string; border: string; text: string;
  subtext: string; primary: string; primarySoft: string;
}

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#ffffff", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#666666", primary: "#7F77DD", primarySoft: "#EEEDFE" };

interface FeatureCardProps { title: string; description: string; icon: React.ReactNode; colors: ThemeColors; }
const FeatureCard = ({ title, description, icon, colors }: FeatureCardProps) => (
  <div style={{ borderRadius: 12, padding: "1.25rem", background: colors.surface, border: `0.5px solid ${colors.border}` }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.primarySoft, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.75rem" }}>{icon}</div>
    <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, color: colors.text }}>{title}</h3>
    <p style={{ fontSize: 13, lineHeight: 1.5, color: colors.subtext }}>{description}</p>
  </div>
);

const LandingPage: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const [activeRole, setActiveRole] = React.useState<UserRole>("freelancer");
  const [darkMode, setDarkMode] = React.useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const navigate = useNavigate();
  const colors = getColors(darkMode);

  React.useEffect(() => {
    localStorage.setItem("skilllink-darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

  const NAV_LINKS = [
    { label: t("land.nav.howItWorks"), href: "#how-it-works" },
    { label: t("land.nav.features"),   href: "#features" },
    { label: t("land.nav.pricing"),    href: "#pricing" },
  ];

  const ROLE_PILLS: { label: string; value: UserRole }[] = [
    { label: t("reg.role.freelancer"), value: "freelancer" },
    { label: t("reg.role.client"),     value: "client" },
    { label: t("land.role.admin"),     value: "admin" },
  ];

  type FeatureItem = { title: string; description: string; icon: React.ReactNode };
  const FEATURES: FeatureItem[] = [
    { title: t("land.feat.ai.title"),        description: t("land.feat.ai.desc"),        icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke="#7F77DD" strokeWidth="1.5"/><path d="M9 6v3l2 2" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { title: t("land.feat.prop.title"),       description: t("land.feat.prop.desc"),       icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="4" width="12" height="10" rx="2" stroke="#7F77DD" strokeWidth="1.5"/><path d="M6 8h6M6 11h4" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { title: t("land.feat.dash.title"),       description: t("land.feat.dash.desc"),       icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 9a5 5 0 1 1 10 0A5 5 0 0 1 4 9Z" stroke="#7F77DD" strokeWidth="1.5"/><path d="M9 7v2l1.5 1.5" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { title: t("land.feat.analytics.title"),  description: t("land.feat.analytics.desc"),  icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 14l3-3 3 3 5-7" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  ];

  const PREVIEW_PLANS = [
    { nameKey: "land.plan.starter.name", price: t("land.plan.starter.price"), descKey: "land.plan.starter.desc", features: [t("land.plan.starter.f1"), t("land.plan.starter.f2"), t("land.plan.starter.f3")], highlight: false, ctaKey: "land.plan.starter.cta" },
    { nameKey: "land.plan.pro.name",     price: "$19", period: "/mo",           descKey: "land.plan.pro.desc",     features: [t("land.plan.pro.f1"),     t("land.plan.pro.f2"),     t("land.plan.pro.f3")],     highlight: true,  ctaKey: "land.plan.pro.cta",     badge: t("land.plan.popular") },
    { nameKey: "land.plan.elite.name",   price: "$49", period: "/mo",           descKey: "land.plan.elite.desc",   features: [t("land.plan.elite.f1"),   t("land.plan.elite.f2"),   t("land.plan.elite.f3")],   highlight: false, ctaKey: "land.plan.elite.cta" },
  ];

  type HiwStep = { step: string; titleKey: string; descKey: string; icon: React.ReactNode };
  const HOW_IT_WORKS: Record<UserRole, HiwStep[]> = {
    freelancer: [
      { step: "01", titleKey: "land.hiw.fl.1.title", descKey: "land.hiw.fl.1.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
      { step: "02", titleKey: "land.hiw.fl.2.title", descKey: "land.hiw.fl.2.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4" strokeLinecap="round"/></svg> },
      { step: "03", titleKey: "land.hiw.fl.3.title", descKey: "land.hiw.fl.3.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6" strokeLinecap="round"/></svg> },
      { step: "04", titleKey: "land.hiw.fl.4.title", descKey: "land.hiw.fl.4.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/><path d="M12 12v4m-2-2h4" strokeLinecap="round"/></svg> },
    ],
    client: [
      { step: "01", titleKey: "land.hiw.cl.1.title", descKey: "land.hiw.cl.1.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 9v6m-3-3h6" strokeLinecap="round"/></svg> },
      { step: "02", titleKey: "land.hiw.cl.2.title", descKey: "land.hiw.cl.2.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg> },
      { step: "03", titleKey: "land.hiw.cl.3.title", descKey: "land.hiw.cl.3.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg> },
      { step: "04", titleKey: "land.hiw.cl.4.title", descKey: "land.hiw.cl.4.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/><circle cx="12" cy="14" r="2"/></svg> },
    ],
    admin: [
      { step: "01", titleKey: "land.hiw.ad.1.title", descKey: "land.hiw.ad.1.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
      { step: "02", titleKey: "land.hiw.ad.2.title", descKey: "land.hiw.ad.2.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> },
      { step: "03", titleKey: "land.hiw.ad.3.title", descKey: "land.hiw.ad.3.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> },
      { step: "04", titleKey: "land.hiw.ad.4.title", descKey: "land.hiw.ad.4.desc", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
    ],
  };

  const dir = isRTL ? "rtl" : "ltr";
  const fontFamily = isRTL ? "'Cairo', sans-serif" : "sans-serif";

  return (
    <div style={{ fontFamily, minHeight: "100vh", background: colors.bg, color: colors.text }} dir={dir}>

      {/* ── Navbar ── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 2rem", borderBottom: `0.5px solid ${colors.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.3px", color: colors.text }}>
          Skill<span style={{ color: colors.primary }}>Link</span>
        </div>
        <div style={{ display: "flex", gap: "2rem" }}>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} style={{ fontSize: 14, textDecoration: "none", color: colors.subtext }}>{link.label}</a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <LangToggle style={{ color: colors.text }} />
          <button style={{ padding: "8px 12px", borderRadius: 8, fontSize: 16, cursor: "pointer", border: `0.5px solid ${colors.border}`, background: colors.surface, color: colors.text, fontFamily }} onClick={() => setDarkMode(!darkMode)} aria-label={darkMode ? t("land.theme.light") : t("land.theme.dark")}>
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button style={{ padding: "8px 18px", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 500, background: "transparent", border: `0.5px solid ${colors.border}`, color: colors.text, fontFamily }} onClick={() => navigate("/login")}>
            {t("common.logIn")}
          </button>
          <button style={{ padding: "8px 18px", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 500, background: "#7F77DD", border: "none", color: "#fff", fontFamily }} onClick={() => navigate("/register")}>
            {t("common.signUp")}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ textAlign: "center", padding: "5rem 2rem 4rem", maxWidth: 680, margin: "0 auto" }}>
        <div style={{ display: "inline-block", fontSize: 12, padding: "4px 12px", borderRadius: 100, marginBottom: "1.5rem", background: colors.primarySoft, color: colors.primary }}>
          {t("land.badge")}
        </div>
        <h1 style={{ fontSize: 46, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-1px", marginBottom: "1rem", color: colors.text }}>
          {t("land.hero.title1")}<br />
          {t("land.hero.title2")} <em style={{ fontStyle: "normal", color: colors.primary }}>{t("land.hero.title3")}</em>
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.7, marginBottom: "2.5rem", color: colors.subtext }}>{t("land.hero.subtitle")}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{ padding: "12px 28px", borderRadius: 8, fontSize: 15, cursor: "pointer", fontWeight: 500, background: "#7F77DD", border: "none", color: "#fff", fontFamily }} onClick={() => navigate("/register")}>{t("land.hero.getStarted")}</button>
          <button style={{ padding: "12px 28px", borderRadius: 8, fontSize: 15, cursor: "pointer", fontWeight: 500, background: "transparent", border: `0.5px solid ${colors.border}`, color: colors.text, fontFamily }} onClick={() => navigate("/register")}>{t("land.hero.findTalent")}</button>
        </div>
      </section>

      {/* ── Role Pills ── */}
      <div style={{ textAlign: "center", fontSize: 13, margin: "3rem 0 1.5rem", color: colors.subtext }}>{t("land.roles.label")}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", padding: "0 2rem 3rem" }}>
        {ROLE_PILLS.map((role) => (
          <button key={role.value} style={{ padding: "8px 20px", borderRadius: 100, border: `0.5px solid ${activeRole === role.value ? colors.primary : colors.border}`, fontSize: 13, cursor: "pointer", fontFamily, background: activeRole === role.value ? colors.primarySoft : colors.surface, color: activeRole === role.value ? colors.primary : colors.subtext }} onClick={() => setActiveRole(role.value)}>
            {role.label}
          </button>
        ))}
      </div>

      {/* ── Features ── */}
      <section id="features" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, padding: "0 2rem 4rem", maxWidth: 900, margin: "0 auto" }}>
        {FEATURES.map((f) => (
          <React.Fragment key={f.title}>
            <FeatureCard title={f.title} description={f.description} icon={f.icon} colors={colors} />
          </React.Fragment>
        ))}
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" style={{ padding: "5rem 2rem", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.primary, marginBottom: 10 }}>{t("land.hiw.label")}</div>
          <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.5px", color: colors.text, marginBottom: 10 }}>{t("land.hiw.title")}</h2>
          <p style={{ fontSize: 14, color: colors.subtext, lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>{t("land.hiw.subtitle")}</p>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: "3rem", flexWrap: "wrap" }}>
          {ROLE_PILLS.map((role) => (
            <button key={role.value} style={{ padding: "8px 20px", borderRadius: 100, border: `0.5px solid ${activeRole === role.value ? colors.primary : colors.border}`, fontSize: 13, cursor: "pointer", fontFamily, background: activeRole === role.value ? colors.primarySoft : colors.surface, color: activeRole === role.value ? colors.primary : colors.subtext }} onClick={() => setActiveRole(role.value)}>
              {role.label}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {HOW_IT_WORKS[activeRole].map((item, i) => (
            <div key={item.step} style={{ background: colors.surface, border: `0.5px solid ${colors.border}`, borderRadius: 14, padding: "1.5rem", position: "relative" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: colors.primary, opacity: 0.5, marginBottom: 14 }}>{t("land.hiw.step")} {item.step}</div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.primarySoft, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>{item.icon}</div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 8, lineHeight: 1.3 }}>{t(item.titleKey)}</h3>
              <p style={{ fontSize: 13, color: colors.subtext, lineHeight: 1.6, margin: 0 }}>{t(item.descKey)}</p>
              <div style={{ position: "absolute", top: 16, right: isRTL ? "auto" : 16, left: isRTL ? 16 : "auto", width: 24, height: 24, borderRadius: "50%", background: colors.primarySoft, border: `1px solid ${colors.primary}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: colors.primary }}>{i + 1}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: "3rem" }}>
          <button style={{ padding: "12px 28px", borderRadius: 8, fontSize: 15, cursor: "pointer", fontWeight: 500, background: "#7F77DD", border: "none", color: "#fff", fontFamily }} onClick={() => navigate("/register")}>{t("land.hiw.cta")}</button>
        </div>
      </section>

      {/* ── Pricing Preview ── */}
      <section id="pricing" style={{ padding: "4rem 2rem 5rem", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.primary, marginBottom: 10 }}>{t("land.pricing.label")}</div>
          <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.5px", color: colors.text, marginBottom: 10 }}>{t("land.pricing.title")}</h2>
          <p style={{ fontSize: 14, color: colors.subtext, lineHeight: 1.7 }}>{t("land.pricing.subtitle")}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: "2rem" }}>
          {PREVIEW_PLANS.map((plan) => (
            <div key={plan.nameKey} style={{ background: plan.highlight ? `linear-gradient(135deg, ${colors.primarySoft} 0%, ${colors.surface} 100%)` : colors.surface, border: plan.highlight ? `1px solid ${colors.primary}` : `0.5px solid ${colors.border}`, borderRadius: 14, padding: "22px 18px", position: "relative", boxShadow: plan.highlight ? `0 0 0 1px ${colors.primary}22, 0 8px 24px ${colors.primary}14` : "none" }}>
              {plan.badge && <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: colors.primary, color: "#fff", fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 100 }}>{plan.badge}</div>}
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.subtext, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{t(plan.nameKey)}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 6 }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: colors.text, letterSpacing: "-1px" }}>{plan.price}</span>
                {plan.period && <span style={{ fontSize: 13, color: colors.subtext }}>{plan.period}</span>}
              </div>
              <p style={{ fontSize: 12, color: colors.subtext, marginBottom: 14, lineHeight: 1.5 }}>{t(plan.descKey)}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: colors.text }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="6" fill="rgba(127,119,221,0.15)"/><path d="M3.5 6l2 2 3-3" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {f}
                  </div>
                ))}
              </div>
              <button onClick={() => navigate("/pricing")} style={{ width: "100%", padding: "9px 0", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily, background: plan.highlight ? colors.primary : "transparent", border: plan.highlight ? "none" : `0.5px solid ${colors.border}`, color: plan.highlight ? "#fff" : colors.text }}>
                {t(plan.ctaKey)}
              </button>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center" }}>
          <button onClick={() => navigate("/pricing")} style={{ background: "transparent", border: "none", color: colors.primary, fontSize: 13, cursor: "pointer", fontFamily, fontWeight: 500 }}>
            {t("land.pricing.seeAll")}
          </button>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <div style={{ textAlign: "center", padding: "0 2rem 5rem" }}>
        <p style={{ fontSize: 14, marginBottom: "1.5rem", color: colors.subtext }}>{t("land.bottom.ready")}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{ padding: "12px 28px", borderRadius: 8, fontSize: 15, cursor: "pointer", fontWeight: 500, background: "#7F77DD", border: "none", color: "#fff", fontFamily }} onClick={() => navigate("/register")}>{t("land.bottom.create")}</button>
          <button style={{ padding: "12px 28px", borderRadius: 8, fontSize: 15, cursor: "pointer", fontWeight: 500, background: "transparent", border: `0.5px solid ${colors.border}`, color: colors.text, fontFamily }} onClick={() => navigate("/login")}>{t("common.logIn")}</button>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ textAlign: "center", padding: "2rem", borderTop: `0.5px solid ${colors.border}`, fontSize: 13, color: colors.subtext }}>{t("land.footer")}</footer>
    </div>
  );
};

export default LandingPage;
