// ─── Shared Domain Types ──────────────────────────────────────────────────────

export type UserRole = "freelancer" | "client" | "admin";

export interface User {
  user_id: number;
  email: string;
  role: UserRole;
  status: string;
  mfa_enabled: boolean;
}

export interface FreelancerProfile {
  freelancer_id: number;
  bio: string | null;
  hourly_rate: number | null;
  success_score: number;
  wallet_balance: number;
  portfolio_file: string | null;
  skills: string[];
}

export interface ClientProfile {
  client_id: number;
  company_name: string;
}

export interface AdminStats {
  total_users: number;
  total_freelancers: number;
  total_clients: number;
  total_projects: number;
  total_proposals: number;
  total_contracts: number;
}
