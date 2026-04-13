import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import type { UserRole } from "./types";

interface RequireRoleProps {
  role: UserRole | UserRole[];  // ← accept both
  children: React.ReactElement;
}

const redirectMap: Record<UserRole, string> = {
  freelancer: "/dashboard/freelancer",
  client: "/dashboard/client",
  admin: "/dashboard/admin",
};

const RequireRole: React.FC<RequireRoleProps> = ({ role, children }) => {
  const { user, loading, error } = useAuth();

  if (loading) {
    return <div style={{ padding: 24, color: "#333", fontSize: 14, fontFamily: "sans-serif" }}>Authenticating...</div>;
  }

  if (!user || error) {
    return <Navigate to="/login" replace />;
  }

  const allowed = Array.isArray(role) ? role : [role];  // ← normalize to array

  if (!allowed.includes(user.role)) {
    return <Navigate to={redirectMap[user.role]} replace />;
  }

  return children;
};

export default RequireRole;