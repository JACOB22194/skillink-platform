import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const ActivatePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No activation token provided.");
      return;
    }

    axios.get(`${API_BASE_URL}/auth/activate/${token}`)
      .then((res) => {
        setStatus("success");
        setMessage(res.data.message || "Account successfully activated!");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.response?.data?.detail || "Invalid or expired activation link.");
      });
  }, [token]);

  const bg = "#f9f9f9";
  const surface = "#fff";
  const text = "#1a1a1a";
  const primary = "#7F77DD";

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: bg, fontFamily: "sans-serif", padding: "2rem" }}>
      <div style={{ background: surface, borderRadius: 16, padding: "3rem", width: "100%", maxWidth: 460, textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
        
        {status === "loading" && (
          <div>
            <div style={{ fontSize: 24, marginBottom: 16 }}>⏳</div>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: text }}>Activating Account...</h1>
            <p style={{ color: "#888", marginTop: 8 }}>Please wait while we verify your email.</p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✅</div>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: text }}>Account Activated!</h1>
            <p style={{ color: "#888", marginTop: 8, marginBottom: 24 }}>{message}</p>
            <button
              onClick={() => navigate("/login")}
              style={{ padding: "12px 24px", background: primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer" }}
            >
              Continue to Login
            </button>
          </div>
        )}

        {status === "error" && (
          <div>
            <div style={{ fontSize: 32, marginBottom: 16 }}>❌</div>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: text }}>Activation Failed</h1>
            <p style={{ color: "#ef4444", marginTop: 8, marginBottom: 24 }}>{message}</p>
            <button
              onClick={() => navigate("/register")}
              style={{ padding: "12px 24px", background: "transparent", color: text, border: "1px solid #ddd", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer" }}
            >
              Back to Registration
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default ActivatePage;
