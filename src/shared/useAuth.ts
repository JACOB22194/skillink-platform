import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL, getAuthHeaders } from "./api";
import type { User } from "./types";

interface UseAuthResult<P> {
  user: User | null;
  profile: P | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches /users/me plus an optional second endpoint.
 * T is the shape of the profile payload (pass `null` for admin, which uses a
 * different stats endpoint — handle that in the component directly).
 */
export function useAuth<P>(profileEndpoint?: string): UseAuthResult<P> {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<P | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    const config = getAuthHeaders();

    const userRequest = axios.get<User>(`${API_BASE_URL}/users/me`, config);

    if (!profileEndpoint) {
      userRequest
        .then((userRes) => setUser(userRes.data))
        .catch(() => setError("Failed to load dashboard data"))
        .finally(() => setLoading(false));
      return;
    }

    const profileRequest = axios.get<P>(`${API_BASE_URL}${profileEndpoint}`, config);

    Promise.all([userRequest, profileRequest] as const)
      .then(([userRes, profileRes]) => {
        setUser(userRes.data);
        setProfile(profileRes.data);
      })
      .catch(() => setError("Failed to load dashboard data"))
      .finally(() => setLoading(false));
  }, [profileEndpoint]);

  return { user, profile, loading, error };
}
