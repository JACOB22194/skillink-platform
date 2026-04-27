import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../shared/useAuth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

interface ExperienceItem {
  title: string;
  company: string;
  duration: string;
  description: string;
  tech_stack: string[];
  github_url: string;
}

interface GithubParseResponse {
  name: string;
  title: string;
  summary: string;
  skills: string[];
  experience: ExperienceItem[];
  score: number;
  suggestions: string[];
  github_stats: {
    username: string;
    public_repos: number;
    followers: number;
    total_stars: number;
    top_languages: string[];
  };
}

const ProfileSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [githubUrl, setGithubUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parsed data
  const [parsedData, setParsedData] = useState<GithubParseResponse | null>(null);
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState("50");

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
  });

  const handleParse = async () => {
    if (!githubUrl.trim()) {
      setError("Please enter a valid GitHub URL.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<GithubParseResponse>(
        `${API_BASE_URL}/github/parse`,
        { url: githubUrl.trim() },
        getAuthHeaders()
      );
      setParsedData(res.data);
      setBio(res.data.summary || "");
      setSkills(res.data.skills || []);
      setStep(2);
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Failed to parse GitHub profile. Make sure the URL is correct."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Update Bio and Hourly Rate
      // Backend uses PUT with query params (not a JSON body)
      await axios.put(
        `${API_BASE_URL}/users/me/profile`,
        null,
        {
          ...getAuthHeaders(),
          params: {
            bio: bio,
            hourly_rate: parseFloat(hourlyRate) || 0,
          },
        }
      );

      // 2. Add Skills
      if (skills.length > 0) {
        await axios.post(
          `${API_BASE_URL}/users/me/skills`,
          { skill_names: skills },
          getAuthHeaders()
        );
      }

      navigate("/dashboard/freelancer");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save profile.");
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.role !== "freelancer") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        Only freelancers can set up a profile.
      </div>
    );
  }

  const bg = "#f9f9f9";
  const surface = "#fff";
  const text = "#1a1a1a";
  const subtext = "#888";
  const primary = "#7F77DD";
  const border = "#e5e5e5";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        fontFamily: "sans-serif",
        padding: "2rem",
      }}
    >
      <div
        style={{
          background: surface,
          borderRadius: 16,
          padding: "3rem",
          width: "100%",
          maxWidth: 600,
          boxShadow: "0 10px 40px rgba(0,0,0,0.05)",
          border: `0.5px solid ${border}`,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 500,
              color: text,
              margin: "0 0 8px",
            }}
          >
            Set up your Freelancer Profile
          </h1>
          <p style={{ color: subtext, fontSize: 14 }}>
            Let's import your experience so clients can find you.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "#fff0f0",
              border: "0.5px solid #f5c6c6",
              color: "#c0392b",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: "1.5rem",
            }}
          >
            {error}
          </div>
        )}

        {/* STEP 1: GitHub Link */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: text,
                  marginBottom: 8,
                }}
              >
                GitHub Profile URL
              </label>
              <input
                type="text"
                placeholder="https://github.com/username"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleParse()}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: 14,
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={handleParse}
              disabled={loading}
              style={{
                width: "100%",
                padding: 12,
                background: primary,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Analyzing Profile..." : "Import from GitHub"}
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  background: "none",
                  border: "none",
                  color: subtext,
                  fontSize: 13,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Review and Save */}
        {step === 2 && (
          <div>
            {parsedData && (
              <div
                style={{
                  background: "#EEEDFE",
                  padding: "12px 16px",
                  borderRadius: 8,
                  marginBottom: "1.5rem",
                  fontSize: 13,
                  color: primary,
                }}
              >
                <strong>AI Analysis Complete!</strong> We found{" "}
                {parsedData.skills.length} skills and generated a bio based on
                your top repositories. Review and edit them below.
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: text,
                  marginBottom: 8,
                }}
              >
                Professional Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={5}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: 14,
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  outline: "none",
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: text,
                  marginBottom: 8,
                }}
              >
                Skills
              </label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {skills.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#f0f0f0",
                      padding: "4px 10px",
                      borderRadius: 100,
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {s}
                    <button
                      onClick={() =>
                        setSkills(skills.filter((_, idx) => idx !== i))
                      }
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: subtext,
                        fontSize: 14,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <input
                type="text"
                placeholder="Type a skill and press Enter..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val && !skills.includes(val)) {
                      setSkills([...skills, val]);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px",
                  fontSize: 13,
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "2rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: text,
                  marginBottom: 8,
                }}
              >
                Hourly Rate (USD)
              </label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                style={{
                  width: "100px",
                  padding: "10px",
                  fontSize: 14,
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "transparent",
                  color: text,
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{
                  flex: 2,
                  padding: 12,
                  background: primary,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Saving..." : "Save Profile & Continue"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileSetupPage;