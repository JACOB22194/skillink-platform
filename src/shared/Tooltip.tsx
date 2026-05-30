import React, { useId } from "react";

interface TooltipProps {
  text: string;
  children: React.ReactElement;
}

/**
 * Wraps a single child element and attaches an accessible tooltip.
 * The tooltip text is linked via aria-describedby so screen readers announce it.
 */
const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
  const id = useId();

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      {React.cloneElement(children, { "aria-describedby": id })}
      <span
        id={id}
        role="tooltip"
        style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#1f2937",
          color: "#f9fafb",
          fontSize: 12,
          padding: "4px 8px",
          borderRadius: 6,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          opacity: 0,
          transition: "opacity 0.15s",
          zIndex: 9999,
        }}
        className="tooltip-bubble"
      >
        {text}
      </span>
      <style>{`
        span:has(> .tooltip-bubble):hover .tooltip-bubble,
        span:has(> .tooltip-bubble):focus-within .tooltip-bubble {
          opacity: 1 !important;
        }
      `}</style>
    </span>
  );
};

export default Tooltip;
