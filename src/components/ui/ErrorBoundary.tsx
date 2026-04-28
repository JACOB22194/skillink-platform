import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "sans-serif", color: "#b0b0b0" }}>
        <div style={{ fontSize: 14, marginBottom: 8 }}>Something went wrong.</div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>{this.state.message}</div>
        <button
          onClick={() => this.setState({ hasError: false, message: "" })}
          style={{ padding: "8px 18px", background: "#7F77DD", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
        >
          Try again
        </button>
      </div>
    );
  }
}
