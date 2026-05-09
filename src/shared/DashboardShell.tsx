import React from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "./api";
import { dashboardStyles as s } from "./dashboardStyles";
import { useInactivityLogout } from "./useInactivityLogout";

interface Props {
  email?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const DashboardShell: React.FC<Props> = ({ email, title, subtitle, children }) => {
  const navigate = useNavigate();
  const { showWarning, secondsLeft, resetTimer } = useInactivityLogout();

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const countdown = `${mins}:${String(secs).padStart(2, "0")}`;

  return (
    <div style={s.page}>
      {/* ── Inactivity Warning Overlay ── */}
      {showWarning && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.55)", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#1a1a1a", border: "0.5px solid #333", borderRadius: 16,
            padding: "2rem", maxWidth: 380, width: "90%", textAlign: "center",
            fontFamily: "sans-serif", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏰</div>
            <h2 style={{ color: "#ffffff", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
              Session expiring soon
            </h2>
            <p style={{ color: "#b0b0b0", fontSize: 13, margin: "0 0 6px" }}>
              You've been inactive for a while.
            </p>
            <p style={{ color: "#b0b0b0", fontSize: 13, margin: "0 0 20px" }}>
              You will be logged out in{" "}
              <span style={{ color: "#7F77DD", fontWeight: 600 }}>{countdown}</span>
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={resetTimer}
                style={{
                  padding: "10px 24px", background: "#7F77DD", color: "#fff",
                  border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Stay logged in
              </button>
              <button
                onClick={logout}
                style={{
                  padding: "10px 24px", background: "transparent",
                  border: "0.5px solid #444", color: "#b0b0b0",
                  borderRadius: 8, fontSize: 14, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Log out now
              </button>
            </div>
          </div>
        </div>
      )}

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
