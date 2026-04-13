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

// ─── Helper Functions ─────────────────────────────────────────────────────────

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

  // Create theme-aware feature items
 

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
