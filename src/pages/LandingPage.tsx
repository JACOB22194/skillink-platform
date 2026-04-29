import React from "react";
import { useNavigate } from "react-router-dom";
import type { UserRole } from "../shared/types";


// ─── Types ────────────────────────────────────────────────────────────────────

interface NavLink {
  label: string;
  href: string;
}

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface RolePill {
  label: string;
  value: UserRole;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const NAV_LINKS: NavLink[] = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];

const ROLE_PILLS: RolePill[] = [
  { label: "Freelancer", value: "freelancer" },
  { label: "Client", value: "client" },
  { label: "Administrator", value: "admin" },
];

const FEATURES: Feature[] = [
  {
    title: "AI job matching",
    description:
      "Get matched with projects that fit your skills and experience automatically.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="6" stroke="#7F77DD" strokeWidth="1.5" />
        <path d="M9 6v3l2 2" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Smart proposals",
    description: "AI-assisted proposal writing helps freelancers win more clients.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="3" y="4" width="12" height="10" rx="2" stroke="#7F77DD" strokeWidth="1.5" />
        <path d="M6 8h6M6 11h4" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Role-based dashboards",
    description: "Tailored views for freelancers, clients, and admins.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M4 9a5 5 0 1 1 10 0A5 5 0 0 1 4 9Z" stroke="#7F77DD" strokeWidth="1.5" />
        <path d="M9 7v2l1.5 1.5" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Analytics & insights",
    description: "Track performance, earnings, and hiring metrics in real time.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M3 14l3-3 3 3 5-7"
          stroke="#7F77DD"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

// ─── Pricing Preview Data ─────────────────────────────────────────────────────

const PREVIEW_PLANS = [
  {
    name: "Starter",
    price: "Free",
    description: "Explore the platform at no cost.",
    features: ["5 proposals/month", "Basic AI matching", "Public profile"],
    highlight: false,
    cta: "Get started",
  },
  {
    name: "Pro",
    price: "$19",
    period: "/mo",
    description: "For active freelancers who want to win more.",
    features: ["Unlimited proposals", "Priority placement", "Smart proposal AI"],
    highlight: true,
    badge: "Popular",
    cta: "Start free trial",
  },
  {
    name: "Elite",
    price: "$49",
    period: "/mo",
    description: "For top earners who need every edge.",
    features: ["Everything in Pro", "Dedicated manager", "Featured badge"],
    highlight: false,
    cta: "Get Elite",
  },
];

// ─── How It Works Data ────────────────────────────────────────────────────────

const HOW_IT_WORKS: Record<UserRole, { step: string; title: string; description: string; icon: React.ReactNode }[]> = {
  freelancer: [
    {
      step: "01",
      title: "Create your profile",
      description: "Sign up, set your hourly rate, add your skills, and connect your GitHub to auto-generate your professional score.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
    },
    {
      step: "02",
      title: "Get AI-matched to projects",
      description: "Our TF-IDF + skill-overlap engine scans open projects and surfaces the best matches for your unique profile automatically.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4" strokeLinecap="round"/></svg>,
    },
    {
      step: "03",
      title: "Submit a smart proposal",
      description: "Apply to matched projects with a tailored proposal. Your AI relevance score is shown to clients so the best fits rise to the top.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6" strokeLinecap="round"/></svg>,
    },
    {
      step: "04",
      title: "Work & get paid",
      description: "Once hired, collaborate in your Workroom, hit milestones, and receive payments directly to your wallet — no waiting.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/><path d="M12 12v4m-2-2h4" strokeLinecap="round"/></svg>,
    },
  ],
  client: [
    {
      step: "01",
      title: "Post your project",
      description: "Describe the work, set a budget, and list required skills. Our AI instantly categorises your project for smarter matching.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 9v6m-3-3h6" strokeLinecap="round"/></svg>,
    },
    {
      step: "02",
      title: "Review AI-ranked talent",
      description: "SkillLink scores every freelancer against your project and ranks proposals by relevance — so you see the best fits first.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>,
    },
    {
      step: "03",
      title: "Hire & set milestones",
      description: "Accept the best proposal, open a Workroom, and break the project into milestones with clear deliverables and due dates.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>,
    },
    {
      step: "04",
      title: "Approve & release payment",
      description: "Review completed milestones and release payment from escrow with one click. Funds go straight to the freelancer's wallet.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/><circle cx="12" cy="14" r="2"/></svg>,
    },
  ],
  admin: [
    {
      step: "01",
      title: "Monitor the platform",
      description: "Get a full-system view of users, projects, contracts, and payments from the admin dashboard in real time.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
    },
    {
      step: "02",
      title: "Verify identities",
      description: "Review submitted identity documents and approve or reject verification requests to maintain platform trust.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>,
    },
    {
      step: "03",
      title: "Resolve disputes",
      description: "Step in when contract disputes are raised, review both sides, and issue a binding resolution with a note.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>,
    },
    {
      step: "04",
      title: "Manage system health",
      description: "Review system logs, moderate users, and keep the platform running smoothly with full audit trail access.",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    },
  ],
};



const getColors = (darkMode: boolean): ThemeColors => {
  if (darkMode) {
    return {
      bg: "#0f0f0f",
      surface: "#1a1a1a",
      border: "#333333",
      text: "#ffffff",
      subtext: "#b0b0b0",
      primary: "#7F77DD",
      primarySoft: "#2a2640",
    };
  } else {
    return {
      bg: "#ffffff",
      surface: "#ffffff",
      border: "#e5e5e5",
      text: "#1a1a1a",
      subtext: "#666666",
      primary: "#7F77DD",
      primarySoft: "#EEEDFE",
    };
  }
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const FeatureCard: React.FC<Feature & { colors: ThemeColors }> = ({ title, description, icon, colors }) => (
  <div style={{ ...styles.featureCard, background: colors.surface, border: `0.5px solid ${colors.border}` }}>
    <div style={{ ...styles.featureIcon, background: colors.primarySoft }}>{icon}</div>
    <h3 style={{ ...styles.featureTitle, color: colors.text }}>{title}</h3>
    <p style={{ ...styles.featureDesc, color: colors.subtext }}>{description}</p>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const LandingPage: React.FC = () => {
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

  const handleLogin = (): void | Promise<void> => navigate("/login");
  const handleSignup = (): void | Promise<void> => navigate("/register");
  const handleThemeToggle = (): void => setDarkMode(!darkMode);

  return (
    <div style={{ ...styles.page, background: colors.bg, color: colors.text }}>
      {/* ── Navbar ── */}
      <nav style={{ ...styles.nav, borderBottomColor: colors.border }}>
        <div style={{ ...styles.logo, color: colors.text }}>
          Skill<span style={{ ...styles.logoAccent, color: colors.primary }}>Link</span>
        </div>
        <div style={styles.navLinks}>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} style={{ ...styles.navLink, color: colors.subtext }}>
              {link.label}
            </a>
          ))}
        </div>
        <div style={styles.navActions}>
          <button
            style={{
              ...styles.themeToggle,
              background: colors.surface,
              border: `0.5px solid ${colors.border}`,
              color: colors.text,
            }}
            onClick={handleThemeToggle}
            title={darkMode ? "Light mode" : "Dark mode"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button
            style={{
              ...styles.btn,
              ...styles.btnOutline,
              borderColor: colors.border,
              color: colors.text,
            }}
            onClick={handleLogin}
          >
            Log in
          </button>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleSignup}>
            Sign up
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={styles.hero}>
        <div style={{ ...styles.badge, background: colors.primarySoft, color: colors.primary }}>AI-powered freelancing platform</div>
        <h1 style={{ ...styles.heroTitle, color: colors.text }}>
          Work smarter,<br />
          hire <em style={{ ...styles.heroAccent, color: colors.primary }}>better</em>
        </h1>
        <p style={{ ...styles.heroSubtitle, color: colors.subtext }}>
          SkillLink connects talented freelancers with clients using AI matching, smart
          proposals, and real-time collaboration — all in one place.
        </p>
        <div style={styles.heroCta}>
          <button
            style={{ ...styles.btn, ...styles.btnPrimary, ...styles.btnLg }}
            onClick={handleSignup}
          >
            Get started free
          </button>
          <button
            style={{
              ...styles.btn,
              ...styles.btnOutline,
              ...styles.btnLg,
              borderColor: colors.border,
              color: colors.text,
            }}
            onClick={handleSignup}
          >
            Find talent
          </button>
        </div>
      </section>

      {/* ── Role Pills ── */}
      <div style={{ ...styles.divider, color: colors.subtext }}>Designed for three roles</div>
      <div style={styles.rolePills}>
        {ROLE_PILLS.map((role) => (
          <button
            key={role.value}
            style={{
              ...styles.rolePill,
              ...(activeRole === role.value
                ? { ...styles.rolePillActive, background: colors.primarySoft, color: colors.primary, borderColor: colors.primary }
                : { background: colors.surface, borderColor: colors.border, color: colors.subtext }),
            }}
            onClick={() => setActiveRole(role.value)}
          >
            {role.label}
          </button>
        ))}
      </div>

      {/* ── Features ── */}
      <section id="features" style={styles.features}>
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} {...feature} colors={colors} />
        ))}
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" style={{ padding: "5rem 2rem", maxWidth: 960, margin: "0 auto" }}>
        {/* Section header */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.primary, marginBottom: 10 }}>
            How it works
          </div>
          <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.5px", color: colors.text, marginBottom: 10 }}>
            Up and running in minutes
          </h2>
          <p style={{ fontSize: 14, color: colors.subtext, lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>
            Whether you're here to find work or hire talent, SkillLink gets you there fast.
          </p>
        </div>

        {/* Role tabs — reuse existing pills */}
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: "3rem", flexWrap: "wrap" }}>
          {ROLE_PILLS.map((role) => (
            <button
              key={role.value}
              style={{
                ...styles.rolePill,
                ...(activeRole === role.value
                  ? { background: colors.primarySoft, color: colors.primary, borderColor: colors.primary }
                  : { background: colors.surface, borderColor: colors.border, color: colors.subtext }),
              }}
              onClick={() => setActiveRole(role.value)}
            >
              {role.label}
            </button>
          ))}
        </div>

        {/* Steps grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, position: "relative" }}>
          {HOW_IT_WORKS[activeRole].map((item, i) => (
            <div
              key={item.step}
              style={{
                background: colors.surface,
                border: `0.5px solid ${colors.border}`,
                borderRadius: 14,
                padding: "1.5rem",
                position: "relative",
                transition: "border-color .2s",
              }}
            >
              {/* Connector line (not on last item) */}
              {i < HOW_IT_WORKS[activeRole].length - 1 && (
                <div style={{
                  display: "none", // hidden on small screens; visible via grid gap
                }} />
              )}

              {/* Step number */}
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: colors.primary,
                opacity: 0.5,
                marginBottom: 14,
              }}>
                STEP {item.step}
              </div>

              {/* Icon */}
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: colors.primarySoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1rem",
              }}>
                {item.icon}
              </div>

              {/* Title */}
              <h3 style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 8, lineHeight: 1.3 }}>
                {item.title}
              </h3>

              {/* Description */}
              <p style={{ fontSize: 13, color: colors.subtext, lineHeight: 1.6, margin: 0 }}>
                {item.description}
              </p>

              {/* Step dot */}
              <div style={{
                position: "absolute",
                top: 16,
                right: 16,
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: colors.primarySoft,
                border: `1px solid ${colors.primary}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: colors.primary,
              }}>
                {i + 1}
              </div>
            </div>
          ))}
        </div>

        {/* CTA under steps */}
        <div style={{ textAlign: "center", marginTop: "3rem" }}>
          <button
            style={{ ...styles.btn, ...styles.btnPrimary, ...styles.btnLg }}
            onClick={handleSignup}
          >
            Get started free →
          </button>
        </div>
      </section>

      {/* ── Pricing Preview ── */}
      <section id="pricing" style={{ padding: "4rem 2rem 5rem", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.primary, marginBottom: 10 }}>
            Pricing
          </div>
          <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.5px", color: colors.text, marginBottom: 10 }}>
            Plans that grow with you
          </h2>
          <p style={{ fontSize: 14, color: colors.subtext, lineHeight: 1.7 }}>
            Start free. Upgrade when you're ready. No surprises.
          </p>
        </div>

        {/* Plan cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: "2rem" }}>
          {PREVIEW_PLANS.map((plan) => (
            <div
              key={plan.name}
              style={{
                background: plan.highlight ? `linear-gradient(135deg, ${colors.primarySoft} 0%, ${colors.surface} 100%)` : colors.surface,
                border: plan.highlight ? `1px solid ${colors.primary}` : `0.5px solid ${colors.border}`,
                borderRadius: 14,
                padding: "22px 18px",
                position: "relative",
                boxShadow: plan.highlight ? `0 0 0 1px ${colors.primary}22, 0 8px 24px ${colors.primary}14` : "none",
              }}
            >
              {plan.badge && (
                <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: colors.primary, color: "#fff", fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 100 }}>
                  {plan.badge}
                </div>
              )}
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.subtext, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                {plan.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 6 }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: colors.text, letterSpacing: "-1px" }}>{plan.price}</span>
                {plan.period && <span style={{ fontSize: 13, color: colors.subtext }}>{plan.period}</span>}
              </div>
              <p style={{ fontSize: 12, color: colors.subtext, marginBottom: 14, lineHeight: 1.5 }}>{plan.description}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: colors.text }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="6" fill="rgba(127,119,221,0.15)" />
                      <path d="M3.5 6l2 2 3-3" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate("/pricing")}
                style={{
                  width: "100%", padding: "9px 0", borderRadius: 9, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit",
                  background: plan.highlight ? colors.primary : "transparent",
                  border: plan.highlight ? "none" : `0.5px solid ${colors.border}`,
                  color: plan.highlight ? "#fff" : colors.text,
                }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center" }}>
          <button
            onClick={() => navigate("/pricing")}
            style={{ background: "transparent", border: "none", color: colors.primary, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
          >
            See full pricing & compare plans →
          </button>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <div style={styles.bottomCta}>
        <p style={{ ...styles.bottomCtaText, color: colors.subtext }}>Ready to get started?</p>
        <div style={styles.heroCta}>
          <button
            style={{ ...styles.btn, ...styles.btnPrimary, ...styles.btnLg }}
            onClick={handleSignup}
          >
            Create an account
          </button>
          <button
            style={{
              ...styles.btn,
              ...styles.btnOutline,
              ...styles.btnLg,
              borderColor: colors.border,
              color: colors.text,
            }}
            onClick={handleLogin}
          >
            Log in
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ ...styles.footer, borderTopColor: colors.border, color: colors.subtext }}>© 2025 SkillLink. All rights reserved.</footer>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "sans-serif",
    minHeight: "100vh",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1.25rem 2rem",
    borderBottom: "0.5px solid",
  },
  logo: { fontSize: 20, fontWeight: 500, letterSpacing: "-0.3px" },
  logoAccent: { color: "#7F77DD" },
  navLinks: { display: "flex", gap: "2rem" },
  navLink: { fontSize: 14, textDecoration: "none" },
  navActions: { display: "flex", gap: 10, alignItems: "center" },

  btn: {
    padding: "8px 18px",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 500,
    transition: "opacity 0.15s",
    fontFamily: "inherit",
  },
  btnOutline: {
    background: "transparent",
    border: "0.5px solid",
  },
  btnPrimary: {
    background: "#7F77DD",
    border: "none",
    color: "#fff",
  },
  btnLg: { padding: "12px 28px", fontSize: 15 },
  themeToggle: {
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 16,
    cursor: "pointer",
    border: "0.5px solid",
    fontFamily: "inherit",
  },

  hero: {
    textAlign: "center",
    padding: "5rem 2rem 4rem",
    maxWidth: 680,
    margin: "0 auto",
  },
  badge: {
    display: "inline-block",
    fontSize: 12,
    padding: "4px 12px",
    borderRadius: 100,
    marginBottom: "1.5rem",
  },
  heroTitle: {
    fontSize: 46,
    fontWeight: 500,
    lineHeight: 1.15,
    letterSpacing: "-1px",
    marginBottom: "1rem",
  },
  heroAccent: { fontStyle: "normal", color: "#7F77DD" },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 1.7,
    marginBottom: "2.5rem",
  },
  heroCta: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },

  divider: {
    textAlign: "center",
    fontSize: 13,
    margin: "3rem 0 1.5rem",
  },
  rolePills: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: "0 2rem 3rem",
  },
  rolePill: {
    padding: "8px 20px",
    borderRadius: 100,
    border: "0.5px solid",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  rolePillActive: {
    borderColor: "#AFA9EC",
  },

  features: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    padding: "0 2rem 4rem",
    maxWidth: 900,
    margin: "0 auto",
  },
  featureCard: {
    borderRadius: 12,
    padding: "1.25rem",
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "0.75rem",
  },
  featureTitle: { fontSize: 14, fontWeight: 500, marginBottom: 4 },
  featureDesc: { fontSize: 13, lineHeight: 1.5 },

  bottomCta: { textAlign: "center", padding: "0 2rem 5rem" },
  bottomCtaText: { fontSize: 14, marginBottom: "1.5rem" },

  footer: {
    textAlign: "center",
    padding: "2rem",
    borderTop: "0.5px solid",
    fontSize: 13,
  },
};

export default LandingPage;