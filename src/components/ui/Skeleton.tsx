import React from "react";

const CSS = `@keyframes sk-pulse{0%,100%{opacity:1}50%{opacity:.35}}.sk-pulse{animation:sk-pulse 1.6s ease-in-out infinite}`;

let _injected = false;
function injectStyle() {
  if (_injected) return;
  const el = document.createElement("style");
  el.textContent = CSS;
  document.head.appendChild(el);
  _injected = true;
}

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  dark?: boolean;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = 14,
  radius = 6,
  dark = true,
  style: extra,
}) => {
  injectStyle();
  return (
    <div
      className="sk-pulse"
      style={{ width, height, borderRadius: radius, background: dark ? "#2a2a2a" : "#e0e0e0", ...extra }}
    />
  );
};

export const SkeletonCard: React.FC<{ dark?: boolean; children?: React.ReactNode; style?: React.CSSProperties }> = ({
  dark = true,
  children,
  style: extra,
}) => (
  <div style={{ background: dark ? "#1a1a1a" : "#fff", border: `0.5px solid ${dark ? "#333" : "#e5e5e5"}`, borderRadius: 12, padding: 16, ...extra }}>
    {children}
  </div>
);

export const SkeletonMetric: React.FC<{ dark?: boolean }> = ({ dark = true }) => (
  <SkeletonCard dark={dark}>
    <Skeleton width={80} height={10} dark={dark} style={{ marginBottom: 10 }} />
    <Skeleton width={60} height={24} dark={dark} style={{ marginBottom: 8 }} />
    <Skeleton width={100} height={10} dark={dark} />
  </SkeletonCard>
);
