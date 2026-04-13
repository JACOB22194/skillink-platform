import React from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "./api";
import { dashboardStyles as s } from "./dashboardStyles";

interface Props {
  email?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Shared nav + page layout that mirrors the LandingPage design system.
 * Every dashboard renders through this shell — nav and logout are not
 * duplicated per-component anymore.
 */
const DashboardShell: React.FC<Props> = ({ email, title, subtitle, children }) => {
  const navigate = useNavigate();

  return (
    <div style={s.page}>
      {/* ── Navbar ── */}
      <nav style={s.nav}>
        <div style={s.logo} onClick={() => navigate("/")} role="button" tabIndex={0}>
          Skill<span style={s.logoAccent}>Link</span>
        </div>
        <div style={s.navRight}>
          {email && <span style={s.navEmail}>{email}</span>}
          <button
            style={{ ...s.btn, ...s.btnOutline }}
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </nav>

      {/* ── Body ── */}
      <div style={s.body}>
        <h1 style={s.pageTitle}>{title}</h1>
        {subtitle && <p style={s.pageSubtitle}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
};

export default DashboardShell;
