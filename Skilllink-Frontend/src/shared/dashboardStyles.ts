import type React from "react";

// ─── Design Tokens (mirrors LandingPage) ─────────────────────────────────────

export const tokens = {
  brand: "#7F77DD",
  brandLight: "#EEEDFE",
  brandDark: "#534AB7",
  brandBorder: "#AFA9EC",
  text: "#1a1a1a",
  muted: "#666",
  subtle: "#aaa",
  border: "#e5e5e5",
  surface: "#fff",
  radius: {
    sm: 8,
    md: 12,
    pill: 100,
  },
  font: {
    sm: 13,
    base: 14,
    md: 15,
    lg: 16,
    xl: 20,
  },
};

// ─── Shared Dashboard Styles ──────────────────────────────────────────────────

export const dashboardStyles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "sans-serif",
    color: tokens.text,
    background: tokens.surface,
    minHeight: "100vh",
  },

  // ── Nav (reuses LandingPage nav pattern) ──
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1.25rem 2rem",
    borderBottom: `0.5px solid ${tokens.border}`,
    position: "sticky",
    top: 0,
    background: tokens.surface,
    zIndex: 10,
  },
  logo: { fontSize: tokens.font.xl, fontWeight: 500, letterSpacing: "-0.3px" },
  logoAccent: { color: tokens.brand },
  navRight: { display: "flex", alignItems: "center", gap: 12 },
  navEmail: { fontSize: tokens.font.base, color: tokens.muted },

  // ── Buttons ──
  btn: {
    padding: "8px 18px",
    borderRadius: tokens.radius.sm,
    fontSize: tokens.font.base,
    cursor: "pointer",
    fontWeight: 500,
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  },
  btnOutline: {
    background: "transparent",
    border: `0.5px solid #ccc`,
    color: tokens.text,
  },
  btnPrimary: {
    background: tokens.brand,
    border: "none",
    color: "#fff",
  },
  btnDanger: {
    background: "transparent",
    border: `0.5px solid #f5a5a5`,
    color: "#c0392b",
  },

  // ── Page body ──
  body: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "2.5rem 2rem 4rem",
  },

  // ── Section header ──
  pageTitle: {
    fontSize: 28,
    fontWeight: 500,
    letterSpacing: "-0.5px",
    marginBottom: "0.25rem",
  },
  pageSubtitle: {
    fontSize: tokens.font.base,
    color: tokens.muted,
    marginBottom: "2.5rem",
  },

  // ── Cards ──
  card: {
    background: tokens.surface,
    border: `0.5px solid ${tokens.border}`,
    borderRadius: tokens.radius.md,
    padding: "1.5rem",
    marginBottom: "1.25rem",
  },
  cardTitle: {
    fontSize: tokens.font.base,
    fontWeight: 500,
    color: tokens.muted,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "1.25rem",
  },

  // ── Stat grid (admin) ──
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
  },
  statCell: {
    background: tokens.brandLight,
    borderRadius: tokens.radius.sm,
    padding: "1rem",
    textAlign: "center",
  },
  statValue: {
    fontSize: 26,
    fontWeight: 500,
    color: tokens.brandDark,
    letterSpacing: "-0.5px",
  },
  statLabel: {
    fontSize: 12,
    color: tokens.muted,
    marginTop: 4,
  },

  // ── Profile row ──
  profileRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.65rem 0",
    borderBottom: `0.5px solid ${tokens.border}`,
    fontSize: tokens.font.base,
  },
  profileLabel: { color: tokens.muted },
  profileValue: { fontWeight: 500 },

  // ── Badge ──
  badge: {
    display: "inline-block",
    background: tokens.brandLight,
    color: tokens.brandDark,
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: tokens.radius.pill,
    fontWeight: 500,
  },
  badgeGreen: {
    display: "inline-block",
    background: "#e8f9f0",
    color: "#1d7a45",
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: tokens.radius.pill,
    fontWeight: 500,
  },

  // ── Loading / error ──
  centered: {
    textAlign: "center",
    padding: "6rem 2rem",
    color: tokens.muted,
    fontSize: tokens.font.base,
  },
  errorText: {
    textAlign: "center",
    color: "#c0392b",
    fontSize: tokens.font.base,
    padding: "6rem 2rem 1rem",
  },
};
