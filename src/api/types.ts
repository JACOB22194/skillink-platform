// ─── Auth ──────────────────────────────────────────────────────────────────────

export type UserRole = "freelancer" | "client" | "admin";

export interface User {
  user_id: number;
  email: string;
  role: UserRole;
  status: string;
  mfa_enabled: boolean;
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export type AvailabilityStatus = "available" | "busy" | "unavailable";

export interface FreelancerProfile {
  freelancer_id: number;
  bio: string | null;
  hourly_rate: number | null;
  availability_status: AvailabilityStatus | null;
  success_score: number;
  wallet_balance: number;
  portfolio_file: string | null;
  skills: string[];
}

export interface PortfolioItem {
  item_id: number;
  title: string;
  description: string | null;
  url: string | null;
  file_path: string | null;
  type: "link" | "file";
  created_at: string;
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

// ─── GitHub ───────────────────────────────────────────────────────────────────

export interface GitHubStats {
  username: string;
  public_repos: number;
  followers: number;
  total_stars: number;
  top_languages: string[];
  account_created?: string;
  profile_url?: string;
  avatar_url?: string;
  name?: string;
  location?: string;
  website?: string;
}

export interface GitHubStoredProfile {
  professional_title: string | null;
  bio: string | null;
  github_score: number;
  github_url: string | null;
  skills: string[];
  top_languages: string[];
  sub_category_tags: string[];
  github_stats: GitHubStats;
  avatar_url: string;
  name: string;
  location: string;
  website: string;
  experience: GitHubExperience[];
  suggestions: string[];
}

export interface GitHubExperience {
  title: string;
  company: string;
  duration: string;
  description: string;
  tech_stack: string[];
  github_url: string;
}

export interface GitHubParseResult {
  name: string;
  title: string;
  summary: string;
  location: string;
  website: string;
  skills: string[];
  experience: GitHubExperience[];
  education: string[];
  languages: string[];
  certifications: string[];
  score: number;
  suggestions: string[];
  github_stats: GitHubStats;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface ProfileUpdatePayload {
  bio?: string;
  hourly_rate?: number;
  availability_status?: AvailabilityStatus;
  first_name?: string;
  last_name?: string;
}

export interface SkillsUpdatePayload {
  skill_names: string[];
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}
