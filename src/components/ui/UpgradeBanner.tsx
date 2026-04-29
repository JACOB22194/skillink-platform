import React from "react";
import { useNavigate } from "react-router-dom";

interface UpgradeBannerProps {
  colors: {
    bg: string;
    surface: string;
    border: string;
    text: string;
    subtext: string;
    primary: string;
    primarySoft: string;
  };
  roleType: "freelancer" | "client";
  /** compact = inline banner for sidebar; full = wide card for main content */
  variant?: "compact" | "full";
}

const UpgradeBanner: React.FC<UpgradeBannerProps> = ({ colors: c, roleType, variant = "full" }) => {
  const navigate = useNavigate();

  const freelancerPerks = ["Unlimited proposals", "Priority placement", "Advanced AI matching"];
  const clientPerks = ["Unlimited projects", "AI-ranked candidates", "Team workrooms"];
  const perks = roleType === "freelancer" ? freelancerPerks : clientPerks;

  const planName = roleType === "freelancer" ? "Pro" : "Growth";
  const price = roleType === "freelancer" ? "$19" : "$49";

  const handleUpgrade = () => {
    navigate("/pricing");
  };

  if (variant === "compact") {
    return (
      <div
        style={{
          background: `linear-gradient(135deg, ${c.primarySoft} 0%, ${c.surface} 100%)`,
          border: `0.5px solid ${c.primary}44`,
          borderRadius: 12,
          padding: "14px 14px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1l1.8 3.6L13 5.5l-3 2.9.7 4.1L7 10.5l-3.7 2 .7-4.1-3-2.9 4.2-.9L7 1z" fill="#7F77DD" fillOpacity="0.9" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 600, color: c.primary }}>Upgrade to {planName}</span>
        </div>
        <p style={{ fontSize: 11, color: c.subtext, lineHeight: 1.5, margin: "0 0 10px" }}>
          Unlock unlimited access starting at {price}/mo.
        </p>
        <button
          onClick={handleUpgrade}
          style={{
            width: "100%",
            padding: "7px 0",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Upgrade now ✦
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${c.primarySoft} 0%, ${c.surface} 60%)`,
        border: `1px solid ${c.primary}55`,
        borderRadius: 14,
        padding: "18px 20px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        boxShadow: `0 0 0 1px ${c.primary}11, 0 4px 16px ${c.primary}10`,
      }}
    >
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
        {/* Icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: c.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 1.5l2.3 4.6 5.2.75-3.75 3.65.88 5.15L9 13.05l-4.66 2.6.88-5.15L1.47 6.85l5.2-.75L9 1.5z" fill="#fff" />
          </svg>
        </div>
        {/* Text */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 3 }}>
            You're on the free plan · Upgrade to {planName}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {perks.map((perk) => (
              <span key={perk} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: c.subtext }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="5" r="5" fill="rgba(127,119,221,0.2)" />
                  <path d="M3 5l1.5 1.5 2.5-2.5" stroke="#7F77DD" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {perk}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right: price + CTA */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: c.primary, letterSpacing: "-0.5px" }}>{price}</div>
          <div style={{ fontSize: 10, color: c.subtext }}>per month</div>
        </div>
        <button
          onClick={handleUpgrade}
          style={{
            padding: "9px 18px",
            borderRadius: 10,
            border: "none",
            background: c.primary,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          Upgrade now ✦
        </button>
      </div>
    </div>
  );
};

export default UpgradeBanner;