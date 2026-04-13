// ─── API ──────────────────────────────────────────────────────────────────────

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// ─── Auth Utilities ───────────────────────────────────────────────────────────

export const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
});

export const logout = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("role");
  window.location.href = "/";
};
