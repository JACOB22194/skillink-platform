import { useState, useEffect, useCallback } from "react";
import apiClient from "./client";
import type {
  FreelancerProfile,
  GitHubParseResult,
  GitHubStoredProfile,
  ProfileUpdatePayload,
  ChangePasswordPayload,
  PortfolioItem,
} from "./types";

// ─── Generic Primitives ───────────────────────────────────────────────────────

export interface QueryResult<T> {
  data: T | null;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  refetch: () => void;
}

export interface MutationResult<D, R = unknown> {
  mutate: (input: D) => Promise<R>;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  data: R | null;
  error: string | null;
  reset: () => void;
}

function useQuery<T>(endpoint: string): QueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    setError(null);
    try {
      const res = await apiClient.get<T>(endpoint);
      setData(res.data);
    } catch (e: any) {
      setIsError(true);
      setError(e.response?.data?.detail ?? "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { run(); }, [run]);

  return { data, isLoading, isError, error, refetch: run };
}

function useMutation<D, R = unknown>(
  fn: (data: D) => Promise<R>
): MutationResult<D, R> {
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [data, setData] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsError(false);
    setIsSuccess(false);
    setData(null);
    setError(null);
  }, []);

  const mutate = useCallback(
    async (input: D): Promise<R> => {
      setIsLoading(true);
      setIsError(false);
      setIsSuccess(false);
      setError(null);
      try {
        const result = await fn(input);
        setData(result);
        setIsSuccess(true);
        return result;
      } catch (e: any) {
        setIsError(true);
        setError(e.response?.data?.detail ?? "Something went wrong");
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [fn]
  );

  return { mutate, isLoading, isError, isSuccess, data, error, reset };
}

// ─── Domain Hooks ─────────────────────────────────────────────────────────────

export function useProfile(): QueryResult<FreelancerProfile> {
  return useQuery<FreelancerProfile>("/users/me/profile");
}

export function useGitHubProfile(): QueryResult<GitHubStoredProfile> {
  return useQuery<GitHubStoredProfile>("/github/profile");
}

export function useGitHubParse(): MutationResult<{ url: string }, GitHubParseResult> {
  return useMutation<{ url: string }, GitHubParseResult>(async ({ url }) => {
    const res = await apiClient.post<GitHubParseResult>("/github/parse", { url });
    return res.data;
  });
}

export function useProfileMutation(): MutationResult<
  { profile: ProfileUpdatePayload; skills?: string[] },
  void
> {
  return useMutation<{ profile: ProfileUpdatePayload; skills?: string[] }, void>(
    async ({ profile, skills }) => {
      await apiClient.put("/users/me/profile", null, { params: profile });
      if (skills && skills.length > 0) {
        await apiClient.post("/users/me/skills", { skill_names: skills });
      }
    }
  );
}

export function useChangePassword(): MutationResult<ChangePasswordPayload, { message: string }> {
  return useMutation<ChangePasswordPayload, { message: string }>(async (payload) => {
    const res = await apiClient.post<{ message: string }>("/auth/change-password", payload);
    return res.data;
  });
}

export function useOptimizeBio(): MutationResult<{ bio: string; skills: string[] }, { optimized_bio: string }> {
  return useMutation<{ bio: string; skills: string[] }, { optimized_bio: string }>(async (payload) => {
    const res = await apiClient.post<{ optimized_bio: string }>("/ai/optimize-bio", payload);
    return res.data;
  });
}

export function usePortfolio(): QueryResult<PortfolioItem[]> {
  return useQuery<PortfolioItem[]>("/users/me/portfolio");
}

export function usePortfolioAddLink(): MutationResult<{ title: string; url: string; description?: string }, PortfolioItem> {
  return useMutation<{ title: string; url: string; description?: string }, PortfolioItem>(async (payload) => {
    const res = await apiClient.post<PortfolioItem>("/users/me/portfolio", { ...payload, type: "link" });
    return res.data;
  });
}

export function usePortfolioUpload(): MutationResult<{ file: File; title: string }, PortfolioItem> {
  return useMutation<{ file: File; title: string }, PortfolioItem>(async ({ file, title }) => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    const res = await apiClient.post<PortfolioItem>("/users/me/portfolio/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  });
}

export function usePortfolioDelete(): MutationResult<number, void> {
  return useMutation<number, void>(async (itemId) => {
    await apiClient.delete(`/users/me/portfolio/${itemId}`);
  });
}
