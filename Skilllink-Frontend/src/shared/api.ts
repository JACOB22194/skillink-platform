// ─── API ──────────────────────────────────────────────────────────────────────

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const AI_SERVICE_URL =
  import.meta.env.VITE_AI_SERVICE_URL || "http://localhost:8001";

// ─── Auth Utilities ───────────────────────────────────────────────────────────

export const getAuthHeaders = () => {
  const token = localStorage.getItem("access_token");
  if (!token) return { headers: {} as Record<string, string> };
  return { headers: { Authorization: `Bearer ${token}` } };
};

export const logout = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("role");
  window.location.href = "/";
};
