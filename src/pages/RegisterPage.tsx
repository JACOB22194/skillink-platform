/**
 * RegisterPage.tsx
 * ─────────────────
 * POST /auth/register → { email, password, role, company_name? }
 *
 * Backend rules (enforced client-side too):
 *   - Email must be unique (409 if duplicate)
 *   - Password: min 8 chars, ≥1 uppercase, ≥1 digit
 *   - Roles: "freelancer" | "client"  (admin is not self-registered)
 *   - company_name only sent when role === "client"
 *
 * On success → stores tokens and redirects based on role.
 *
 * CHANGE: Company Name field is now a searchable dropdown for clients.
 *   - Searches existing companies via GET /users/companies/search?q=
 *   - User can also type a NEW company name not in the list
 */

import React, { useState, useEffect, useRef } from "react";
import { useLanguage, LangToggle } from "../shared/LanguageContext";
import axios, { AxiosError } from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = "freelancer" | "client";

interface RegisterRequest {
  email: string;
  password: string;
  role: UserRole;
  first_name?: string;
  last_name?: string;
  company_name?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  role: UserRole;
  user_id: number;
}

interface ApiError {
  detail: string;
}

interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primarySoft: string;
  inputBg: string;
  inputBorder: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const REDIRECT_MAP: Record<UserRole, string> = {
  freelancer: "/dashboard/freelancer",
  client:     "/dashboard/client",
};

const ROLES: { label: string; value: UserRole; description: string; icon: string }[] = [
  { label: "Freelancer", value: "freelancer", description: "I want to find work and projects", icon: "💼" },
  { label: "Client",     value: "client",     description: "I want to hire skilled talent",    icon: "🏢" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getColors = (dark: boolean): ThemeColors =>
  dark
    ? {
        bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333",
        text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640",
        inputBg: "#262626", inputBorder: "#404040",
        errorBg: "#2a1a1a", errorBorder: "#5c2e2e", errorText: "#ff6b6b",
      }
    : {
        bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5",
        text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE",
        inputBg: "#ffffff", inputBorder: "#dddddd",
        errorBg: "#fff0f0", errorBorder: "#f5c6c6", errorText: "#c0392b",
      };

/** Returns null if valid, or an error string. */
function validatePassword(password: string): string | null {
  if (password.length < 8)              return "reg.err.pw8";
  if (!/[A-Z]/.test(password))         return "reg.err.pwUpper";
  if (!/[0-9]/.test(password))         return "reg.err.pwNum";
  return null;
}

function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "reg.err.email";
}

// ─── Password Strength Indicator ─────────────────────────────────────────────

const PasswordStrength: React.FC<{ password: string; colors: ThemeColors }> = ({ password, colors }) => {
  const { t } = useLanguage();
  if (!password) return null;

  const checks = [
    { label: t("reg.pw.chars"),  pass: password.length >= 8 },
    { label: t("reg.pw.upper"), pass: /[A-Z]/.test(password) },
    { label: t("reg.pw.num"),   pass: /[0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const barColor = score === 1 ? "#ef4444" : score === 2 ? "#f59e0b" : "#22c55e";

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 20, background: i <= score ? barColor : colors.inputBorder, transition: "background .2s" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {checks.map((ch) => (
          <span key={ch.label} style={{ fontSize: 11, color: ch.pass ? "#22c55e" : colors.subtext, display: "flex", alignItems: "center", gap: 3 }}>
            <span>{ch.pass ? "✓" : "○"}</span> {ch.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── Built-in Company List ────────────────────────────────────────────────────

const BUILTIN_COMPANIES: { name: string; tier: "famous" | "medium" }[] = [
  // ── Tier 1: Famous (global household names) ──
  { name: "Google",           tier: "famous" },
  { name: "Microsoft",        tier: "famous" },
  { name: "Apple",            tier: "famous" },
  { name: "Amazon",           tier: "famous" },
  { name: "Meta",             tier: "famous" },
  { name: "Netflix",          tier: "famous" },
  { name: "Tesla",            tier: "famous" },
  { name: "IBM",              tier: "famous" },
  { name: "Intel",            tier: "famous" },
  { name: "Samsung",          tier: "famous" },
  { name: "Oracle",           tier: "famous" },
  { name: "Salesforce",       tier: "famous" },
  { name: "Adobe",            tier: "famous" },
  { name: "Nvidia",           tier: "famous" },
  { name: "Uber",             tier: "famous" },
  { name: "Airbnb",           tier: "famous" },
  { name: "Spotify",          tier: "famous" },
  { name: "Twitter / X",      tier: "famous" },
  { name: "LinkedIn",         tier: "famous" },
  { name: "PayPal",           tier: "famous" },
  { name: "Shopify",          tier: "famous" },
  { name: "Zoom",             tier: "famous" },
  { name: "Slack",            tier: "famous" },
  { name: "Dropbox",          tier: "famous" },
  { name: "GitHub",           tier: "famous" },
  { name: "OpenAI",           tier: "famous" },
  { name: "Anthropic",        tier: "famous" },
  { name: "Stripe",           tier: "famous" },
  { name: "Square",           tier: "famous" },
  { name: "Atlassian",        tier: "famous" },
  { name: "HubSpot",          tier: "famous" },
  { name: "SAP",              tier: "famous" },
  { name: "Cisco",            tier: "famous" },
  { name: "Dell",             tier: "famous" },
  { name: "HP",               tier: "famous" },
  { name: "Sony",             tier: "famous" },
  { name: "Siemens",          tier: "famous" },
  { name: "Accenture",        tier: "famous" },
  { name: "Deloitte",         tier: "famous" },
  { name: "McKinsey",         tier: "famous" },
  // ── Tier 2: Medium-famous (well-known in tech/startup world) ──
  { name: "Twilio",           tier: "medium" },
  { name: "Cloudflare",       tier: "medium" },
  { name: "Figma",            tier: "medium" },
  { name: "Notion",           tier: "medium" },
  { name: "Airtable",         tier: "medium" },
  { name: "Canva",            tier: "medium" },
  { name: "Vercel",           tier: "medium" },
  { name: "Netlify",          tier: "medium" },
  { name: "DigitalOcean",     tier: "medium" },
  { name: "HashiCorp",        tier: "medium" },
  { name: "MongoDB",          tier: "medium" },
  { name: "Elastic",          tier: "medium" },
  { name: "Datadog",          tier: "medium" },
  { name: "New Relic",        tier: "medium" },
  { name: "PagerDuty",        tier: "medium" },
  { name: "Okta",             tier: "medium" },
  { name: "Auth0",            tier: "medium" },
  { name: "Twitch",           tier: "medium" },
  { name: "Discord",          tier: "medium" },
  { name: "Asana",            tier: "medium" },
  { name: "Trello",           tier: "medium" },
  { name: "Jira",             tier: "medium" },
  { name: "Zendesk",          tier: "medium" },
  { name: "Intercom",         tier: "medium" },
  { name: "Mixpanel",         tier: "medium" },
  { name: "Segment",          tier: "medium" },
  { name: "Amplitude",        tier: "medium" },
  { name: "Loom",             tier: "medium" },
  { name: "Linear",           tier: "medium" },
  { name: "Railway",          tier: "medium" },
  { name: "Supabase",         tier: "medium" },
  { name: "PlanetScale",      tier: "medium" },
  { name: "Render",           tier: "medium" },
  { name: "Fly.io",           tier: "medium" },
  { name: "Retool",           tier: "medium" },
  { name: "Webflow",          tier: "medium" },
  { name: "Bubble",           tier: "medium" },
  { name: "Glide",            tier: "medium" },
  { name: "Appsmith",         tier: "medium" },
  { name: "Postman",          tier: "medium" },
];

const LS_KEY = "skilllink-custom-companies";

function loadCustomCompanies(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveCustomCompanies(list: string[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

// ─── Company Search Dropdown ──────────────────────────────────────────────────

interface CompanyDropdownProps {
  value: string;
  onChange: (value: string) => void;
  colors: ThemeColors;
  hasError: boolean;
}

const TIER_LABEL: Record<string, string> = { famous: "Well-known", medium: "Popular", custom: "Added by users" };
const TIER_ICON:  Record<string, string> = { famous: "⭐", medium: "🏢", custom: "➕" };

const CompanyDropdown: React.FC<CompanyDropdownProps> = ({ value, onChange, colors, hasError }) => {
  const [query, setQuery]             = useState(value);
  const [open, setOpen]               = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [customCompanies, setCustomCompanies] = useState<string[]>(loadCustomCompanies);
  const containerRef                  = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build filtered list from builtins + custom
  const allCompanies: { name: string; tier: string }[] = [
    ...BUILTIN_COMPANIES,
    ...customCompanies.map((n) => ({ name: n, tier: "custom" })),
  ];

  const q = query.trim().toLowerCase();
  const filtered = q
    ? allCompanies.filter((c) => c.name.toLowerCase().includes(q))
    : allCompanies;

  // Group by tier for display
  const grouped: Record<string, { name: string; tier: string }[]> = {};
  for (const item of filtered) {
    if (!grouped[item.tier]) grouped[item.tier] = [];
    grouped[item.tier].push(item);
  }
  const tierOrder = ["famous", "medium", "custom"];
  const flatList = tierOrder.flatMap((t) => grouped[t] ?? []);

  // Whether the typed query is a brand-new company (not in any list)
  const isNewCompany =
    q.length > 0 &&
    !allCompanies.some((c) => c.name.toLowerCase() === q);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setHighlighted(-1);
    setOpen(true);
  };

  const handleSelect = (name: string) => {
    setQuery(name);
    onChange(name);
    setOpen(false);
    setHighlighted(-1);
  };

  const handleAddNew = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const updated = [...customCompanies, trimmed];
    setCustomCompanies(updated);
    saveCustomCompanies(updated);
    handleSelect(trimmed);
  };

  // Build a flat index for keyboard nav (includes "add new" slot at end if applicable)
  const navLength = flatList.length + (isNewCompany ? 1 : 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true); return; }
    if (e.key === "ArrowDown")  { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, navLength - 1)); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < flatList.length) handleSelect(flatList[highlighted].name);
      else if (highlighted === flatList.length && isNewCompany) handleAddNew();
    }
    else if (e.key === "Escape") setOpen(false);
  };

  const isOpen = open && (flatList.length > 0 || isNewCompany);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Input */}
      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder="Search or type your company name…"
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          style={{
            width: "100%",
            padding: "10px 36px 10px 12px",
            fontSize: 14,
            border: `0.5px solid ${hasError ? colors.errorText : colors.inputBorder}`,
            borderRadius: isOpen ? "8px 8px 0 0" : 8,
            background: colors.inputBg,
            color: colors.text,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color .15s",
          }}
        />
        <span style={{
          position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)",
          color: colors.subtext, fontSize: 13, pointerEvents: "none",
        }}>
          {isOpen ? "▲" : "▼"}
        </span>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
          background: colors.inputBg,
          border: `0.5px solid ${colors.inputBorder}`,
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
          maxHeight: 260,
          overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        }}>
          {/* Grouped results */}
          {tierOrder.map((tier) => {
            const items = grouped[tier];
            if (!items || items.length === 0) return null;
            return (
              <div key={tier}>
                {/* Section header */}
                <div style={{
                  padding: "5px 12px 3px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: colors.subtext,
                  background: colors.inputBg,
                  borderBottom: `0.5px solid ${colors.border}`,
                  position: "sticky",
                  top: 0,
                }}>
                  {TIER_ICON[tier]} {TIER_LABEL[tier]}
                </div>
                {items.map((item) => {
                  const idx = flatList.indexOf(item);
                  return (
                    <div
                      key={item.name}
                      onMouseDown={() => handleSelect(item.name)}
                      onMouseEnter={() => setHighlighted(idx)}
                      style={{
                        padding: "9px 14px",
                        fontSize: 14,
                        cursor: "pointer",
                        color: colors.text,
                        background: idx === highlighted ? colors.primarySoft : "transparent",
                        borderBottom: `0.5px solid ${colors.border}`,
                        transition: "background .1s",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>🏢</span>
                      <span>{item.name}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* "Add new company" row */}
          {isNewCompany && (
            <div
              onMouseDown={handleAddNew}
              onMouseEnter={() => setHighlighted(flatList.length)}
              style={{
                padding: "10px 14px",
                fontSize: 13,
                cursor: "pointer",
                color: colors.primary,
                background: highlighted === flatList.length ? colors.primarySoft : "transparent",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 500,
                borderTop: `0.5px solid ${colors.border}`,
              }}
            >
              <span>➕</span>
              <span>Add "<strong>{query.trim()}</strong>" as a new company</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const RegisterPage: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [form, setForm] = useState<RegisterRequest>({ email: "", password: "", role: "freelancer", first_name: "", last_name: "", company_name: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const c = getColors(darkMode);
  const { t, isRTL } = useLanguage();

  const toggleTheme = () => {
    setDarkMode((d) => {
      localStorage.setItem("skilllink-darkMode", JSON.stringify(!d));
      return !d;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    setError(null);
  };

  const handleRoleSelect = (role: UserRole) => {
    setForm((prev) => ({ ...prev, role, company_name: "" }));
  };

  const handleCompanyChange = (value: string) => {
    setForm((prev) => ({ ...prev, company_name: value }));
    setFieldErrors((prev) => ({ ...prev, company_name: "" }));
    setError(null);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    const emailErr = validateEmail(form.email);
    if (emailErr) errs.email = t(emailErr);

    if (form.role === "freelancer") {
      if (!form.first_name?.trim()) errs.first_name = t("reg.err.firstName");
      if (!form.last_name?.trim())  errs.last_name  = t("reg.err.lastName");
    }

    const pwErr = validatePassword(form.password);
    if (pwErr) errs.password = t(pwErr);

    if (form.password !== confirmPassword) errs.confirmPassword = t("reg.err.pwMatch");
    if (form.role === "client" && !form.company_name?.trim()) errs.company_name = t("reg.err.company");

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);

    const payload: RegisterRequest = {
      email:    form.email,
      password: form.password,
      role:     form.role,
    };
    if (form.role === "freelancer") {
      if (form.first_name?.trim()) payload.first_name = form.first_name.trim();
      if (form.last_name?.trim())  payload.last_name  = form.last_name.trim();
    }
    if (form.role === "client" && form.company_name?.trim()) {
      payload.company_name = form.company_name.trim();
    }

    try {
      await axios.post(`${API_BASE_URL}/auth/register`, payload);
      setSuccessMsg(t("reg.success"));
      setForm({ email: "", password: "", role: "freelancer", company_name: "" });
      setConfirmPassword("");
    } catch (err) {
      const e = err as AxiosError<ApiError>;
      if (e.response?.status === 409) {
        setFieldErrors((prev) => ({ ...prev, email: t("reg.err.duplicate") }));
      } else {
        setError(e.response?.data?.detail ?? t("reg.err.failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Shared styles ──
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 6 };
  const inputBase: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: `0.5px solid ${c.inputBorder}`, borderRadius: 8, background: c.inputBg, color: c.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const errStyle: React.CSSProperties = { fontSize: 11, color: c.errorText, marginTop: 4 };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, fontFamily: isRTL ? "'Cairo', sans-serif" : "sans-serif", padding: "2rem", position: "relative" }}>

      {/* Theme + language toggles */}
      <div style={{ position: "absolute", top: "2rem", right: isRTL ? undefined : "2rem", left: isRTL ? "2rem" : undefined, display: "flex", gap: 8 }}>
        <LangToggle style={{ border: `0.5px solid ${c.border}`, background: c.surface, color: c.text }} />
        <button onClick={toggleTheme} style={{ padding: "8px 12px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>
          {darkMode ? "☀️" : "🌙"}
        </button>
      </div>

      <div style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 16, padding: "2.5rem 2rem", width: "100%", maxWidth: 460 }}>

        {/* Logo */}
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.3px", color: c.text, textAlign: "center", marginBottom: "2rem" }}>
          Skill<span style={{ color: c.primary }}>Link</span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.text, textAlign: "center", margin: "0 0 6px" }}>{t("reg.title")}</h1>
        <p style={{ fontSize: 14, color: c.subtext, textAlign: "center", marginBottom: "2rem" }}>{t("reg.subtitle")}</p>

        {/* Global error / success */}
        {error && (
          <div style={{ background: c.errorBg, border: `0.5px solid ${c.errorBorder}`, color: c.errorText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.25rem" }}>
            {error}
          </div>
        )}
        {successMsg && (
          <div style={{ background: "#f0fff4", border: "0.5px solid #c6f5d5", color: "#1a7a3c", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1.25rem" }}>
            {successMsg}
          </div>
        )}

        {/* Role selector */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={labelStyle}>{t("reg.iAm")}</label>
          <div style={{ display: "flex", gap: 10 }}>
            {ROLES.map((r) => {
              const isActive = form.role === r.value;
              return (
                <button
                  key={r.value}
                  onClick={() => handleRoleSelect(r.value)}
                  style={{
                    flex: 1, padding: "12px 10px", borderRadius: 10, cursor: "pointer",
                    textAlign: "left", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 4,
                    border: isActive ? `1.5px solid ${c.primary}` : `0.5px solid ${c.border}`,
                    background: isActive ? c.primarySoft : c.inputBg,
                    transition: "all .15s",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{r.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: isActive ? c.primary : c.text }}>{r.value === "freelancer" ? t("reg.role.freelancer") : t("reg.role.client")}</span>
                  <span style={{ fontSize: 11, color: c.subtext }}>{r.value === "freelancer" ? t("reg.role.freelancerDesc") : t("reg.role.clientDesc")}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* First + Last name (freelancers) */}
        {form.role === "freelancer" && (
          <div style={{ display: "flex", gap: 10, marginBottom: "1.25rem" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{t("common.firstName")}</label>
              <input style={{ ...inputBase, borderColor: fieldErrors.first_name ? c.errorText : c.inputBorder }} type="text" name="first_name" placeholder="John" value={form.first_name || ""} onChange={handleChange} autoComplete="given-name" aria-required="true" />
              {fieldErrors.first_name && <div style={errStyle}>{fieldErrors.first_name}</div>}
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{t("common.lastName")}</label>
              <input style={{ ...inputBase, borderColor: fieldErrors.last_name ? c.errorText : c.inputBorder }} type="text" name="last_name" placeholder="Doe" value={form.last_name || ""} onChange={handleChange} autoComplete="family-name" aria-required="true" />
              {fieldErrors.last_name && <div style={errStyle}>{fieldErrors.last_name}</div>}
            </div>
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={labelStyle}>{t("common.email")}</label>
          <input style={{ ...inputBase, borderColor: fieldErrors.email ? c.errorText : c.inputBorder }} type="email" name="email" placeholder="you@example.com" value={form.email} onChange={handleChange} autoComplete="email" aria-required="true" />
          {fieldErrors.email && <div style={errStyle}>{fieldErrors.email}</div>}
        </div>

        {/* Company name (clients only) — searchable dropdown */}
        {form.role === "client" && (
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={labelStyle}>{t("reg.company")}</label>
            <CompanyDropdown
              value={form.company_name || ""}
              onChange={handleCompanyChange}
              colors={c}
              hasError={!!fieldErrors.company_name}
            />
            {fieldErrors.company_name && <div style={errStyle}>{fieldErrors.company_name}</div>}
            <div style={{ fontSize: 11, color: c.subtext, marginTop: 4 }}>
              {t("reg.companyHint")}
            </div>
          </div>
        )}

        {/* Password */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={labelStyle}>{t("common.password")}</label>
          <div style={{ position: "relative" }}>
            <input
              style={{ ...inputBase, paddingRight: 44, borderColor: fieldErrors.password ? c.errorText : c.inputBorder }}
              type={showPassword ? "text" : "password"} name="password"
              placeholder={t("reg.passwordPlaceholder")}
              value={form.password} onChange={handleChange} autoComplete="new-password"
              aria-required="true" aria-describedby="reg-pw-hint"
            />
            <button onClick={() => setShowPassword((s) => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: c.subtext, fontSize: 14, padding: 0 }} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          {fieldErrors.password && <div style={errStyle}>{fieldErrors.password}</div>}
          <div id="reg-pw-hint">
            <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
              Password must be at least 8 characters, include 1 uppercase letter and 1 number.
            </span>
            <PasswordStrength password={form.password} colors={c} />
          </div>
        </div>

        {/* Confirm password */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>{t("reg.confirmPassword")}</label>
          <input
            style={{ ...inputBase, borderColor: fieldErrors.confirmPassword ? c.errorText : c.inputBorder }}
            type={showPassword ? "text" : "password"} name="confirmPassword"
            placeholder={t("reg.confirmPlaceholder")}
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, confirmPassword: "" })); }}
            autoComplete="new-password"
            aria-required="true"
          />
          {fieldErrors.confirmPassword && <div style={errStyle}>{fieldErrors.confirmPassword}</div>}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit} disabled={loading}
          style={{ width: "100%", padding: 12, background: c.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, transition: "opacity .15s" }}
        >
          {loading ? t("reg.submitting") : t("reg.submit")}
        </button>

        <p style={{ textAlign: "center", fontSize: 13, color: c.subtext, marginTop: "1.5rem" }}>
          {t("reg.hasAccount")}{" "}
          <a href="/login" style={{ color: c.primary, textDecoration: "none", fontWeight: 500 }}>{t("common.logIn")}</a>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;