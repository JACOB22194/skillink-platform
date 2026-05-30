import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL, getAuthHeaders } from "../shared/api";
import { useAuth } from "../shared/useAuth";
import { useLanguage } from "../shared/LanguageContext";

interface ConversationSummary {
  other_user_id: number;
  other_user_email: string;
  display_name: string;
  avatar_url: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

interface ChatMessage {
  message_id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  is_read: boolean;
  sent_at: string;
}

interface UserSearchResult {
  user_id: number;
  email: string;
  role: string;
}

interface C {
  bg: string; surface: string; border: string;
  text: string; subtext: string; primary: string; primarySoft: string;
}

const getColors = (dark: boolean): C =>
  dark
    ? { bg: "#0f0f0f", surface: "#1a1a1a", border: "#333333", text: "#ffffff", subtext: "#b0b0b0", primary: "#7F77DD", primarySoft: "#2a2640" }
    : { bg: "#f9f9f9", surface: "#ffffff", border: "#e5e5e5", text: "#1a1a1a", subtext: "#888888", primary: "#7F77DD", primarySoft: "#EEEDFE" };

const MessagingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("skilllink-darkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const c = getColors(darkMode);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [wsReady, setWsReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const activeUserIdRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { activeUserIdRef.current = activeUserId; }, [activeUserId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (composing) setTimeout(() => searchInputRef.current?.focus(), 50); }, [composing]);

  const fetchInbox = useCallback(async () => {
    try {
      const res = await axios.get<ConversationSummary[]>(`${API_BASE_URL}/messages/inbox`, getAuthHeaders());
      setConversations(res.data);
      if (res.data.length > 0 && activeUserIdRef.current === null) {
        setActiveUserId(res.data[0].other_user_id);
      }
    } catch (err: any) {
      setErrorMsg("Failed to load inbox.");
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  useEffect(() => {
    const uid = searchParams.get("user");
    const email = searchParams.get("email");
    if (!uid) return;
    const id = parseInt(uid, 10);
    if (isNaN(id)) return;
    setConversations(prev => {
      if (prev.some(c => c.other_user_id === id)) return prev;
      const label = email ?? `user #${id}`;
      return [{ other_user_id: id, other_user_email: label, display_name: label, avatar_url: null, last_message: "", last_message_at: new Date().toISOString(), unread_count: 0 }, ...prev];
    });
    setActiveUserId(id);
  }, [searchParams]);

  useEffect(() => {
    if (activeUserId === null) return;
    setLoadingThread(true);
    axios
      .get<ChatMessage[]>(`${API_BASE_URL}/messages/${activeUserId}`, getAuthHeaders())
      .then((res) => { setMessages(res.data); setErrorMsg(null); })
      .catch(() => { setMessages([]); setErrorMsg("Failed to load thread."); })
      .finally(() => setLoadingThread(false));
    setConversations((prev) =>
      prev.map((conv) => conv.other_user_id === activeUserId ? { ...conv, unread_count: 0 } : conv)
    );
  }, [activeUserId]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const ticketRes = await fetch(`${API_BASE_URL}/auth/ws-ticket`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!ticketRes.ok || cancelled) return;
        const { ticket } = await ticketRes.json();
        if (cancelled) return;

        const wsUrl = API_BASE_URL.replace(/^http/, "ws");
        const ws = new WebSocket(`${wsUrl}/ws/chat?ticket=${ticket}`);
        wsRef.current = ws;
        ws.onopen = () => setWsReady(true);
        ws.onclose = () => setWsReady(false);
        ws.onmessage = (event) => {
          try {
            const envelope = JSON.parse(event.data as string);
            if (envelope.type !== "chat_message") return;
            const msg: ChatMessage = envelope.payload;
            const otherId = activeUserIdRef.current;
            if (msg.sender_id === otherId || msg.receiver_id === otherId) {
              setMessages((prev) => {
                if (prev.some((m) => m.message_id === msg.message_id)) return prev;
                return [...prev, msg];
              });
            } else {
              setConversations((prev) =>
                prev.map((conv) =>
                  conv.other_user_id === msg.sender_id
                    ? { ...conv, unread_count: conv.unread_count + 1, last_message: msg.content }
                    : conv
                )
              );
            }
          } catch { /* ignore */ }
        };
      } catch { /* ignore */ }
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!composing) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get<UserSearchResult[]>(
          `${API_BASE_URL}/users/search?q=${encodeURIComponent(searchQuery)}`,
          getAuthHeaders(),
        );
        setSearchResults(res.data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [searchQuery, composing]);

  const startConversation = (result: UserSearchResult) => {
    setComposing(false);
    setSearchQuery("");
    setSearchResults([]);
    const r = result as any;
    const displayName = (r.first_name || r.last_name)
      ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()
      : result.email;
    setConversations((prev) => {
      if (prev.some((c) => c.other_user_id === result.user_id)) return prev;
      return [{ other_user_id: result.user_id, other_user_email: result.email, display_name: displayName, avatar_url: r.avatar_url ?? null, last_message: "", last_message_at: new Date().toISOString(), unread_count: 0 }, ...prev];
    });
    setActiveUserId(result.user_id);
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text || activeUserId === null) return;
    setInput("");
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "chat_message", payload: { receiver_id: activeUserId, content: text } }));
    } else {
      axios
        .post<ChatMessage>(`${API_BASE_URL}/messages`, { receiver_id: activeUserId, content: text }, getAuthHeaders())
        .then((res) => setMessages((prev) => [...prev, res.data]))
        .catch(() => setErrorMsg("Failed to send message."));
    }
    setConversations((prev) =>
      prev.map((conv) => conv.other_user_id === activeUserId ? { ...conv, last_message: text } : conv)
    );
  };

  const sendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeUserId === null) return;
    e.target.value = "";
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_BASE_URL}/files/upload/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      const fileMsg = `📎 [${file.name}](${data.file_url ?? data.file_path ?? "#"})`;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "chat_message", payload: { receiver_id: activeUserId, content: fileMsg } }));
      } else {
        const msgRes = await axios.post<ChatMessage>(`${API_BASE_URL}/messages`, { receiver_id: activeUserId, content: fileMsg }, getAuthHeaders());
        setMessages((prev) => [...prev, msgRes.data]);
      }
      setConversations((prev) =>
        prev.map((conv) => conv.other_user_id === activeUserId ? { ...conv, last_message: `📎 ${file.name}` } : conv)
      );
    } catch (err: any) {
      setErrorMsg(err.message || "File upload failed.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const activeConvo = conversations.find((conv) => conv.other_user_id === activeUserId);
  const role = localStorage.getItem("role") || "freelancer";
  const dashboardPath = role === "client" ? "/dashboard/client" : "/dashboard/freelancer";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{ display: "flex", flexDirection: "column", height: "100vh", background: c.bg, color: c.text, fontFamily: "sans-serif", fontSize: 13 }}>

      {/* Top Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", cursor: "pointer" }} onClick={() => navigate(dashboardPath)}>
            Skill<span style={{ color: c.primary }}>Link</span>
          </div>
          <span style={{ color: c.border }}>|</span>
          <span style={{ color: c.subtext }}>{t("msg.title")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: wsReady ? "#22c55e" : c.subtext }} />
            <span style={{ fontSize: 11, color: c.subtext }}>{wsReady ? t("msg.live") : t("msg.connecting")}</span>
          </div>
          <button
            onClick={() => setDarkMode((d) => { localStorage.setItem("skilllink-darkMode", JSON.stringify(!d)); return !d; })}
            style={{ padding: "5px 9px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button
            onClick={() => navigate(dashboardPath)}
            style={{ padding: "5px 14px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: "transparent", color: c.subtext, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
          >
            {t("msg.back")}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Inbox panel */}
        <div style={{ width: 280, borderRight: `0.5px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "10px 12px", borderBottom: `0.5px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{t("msg.conversations")}</span>
            <button
              onClick={() => { setComposing((v) => !v); setSearchQuery(""); setSearchResults([]); }}
              style={{
                padding: "4px 10px", borderRadius: 7, border: `0.5px solid ${c.border}`,
                background: composing ? c.primary : "transparent",
                color: composing ? "#fff" : c.primary,
                cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 500,
              }}
            >
              {t("msg.new")}
            </button>
          </div>

          {composing && (
            <div style={{ borderBottom: `0.5px solid ${c.border}`, background: c.bg }}>
              <div style={{ padding: "10px 12px 6px" }}>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("msg.search")}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: `0.5px solid ${c.border}`, background: c.surface, color: c.text, fontSize: 12, fontFamily: "inherit", outline: "none" }}
                />
              </div>
              {searching && <div style={{ padding: "4px 14px 10px", fontSize: 11, color: c.subtext }}>{t("msg.searching")}</div>}
              {!searching && searchQuery.trim() && searchResults.length === 0 && (
                <div style={{ padding: "4px 14px 10px", fontSize: 11, color: c.subtext }}>{t("msg.noUsers")}</div>
              )}
              {searchResults.map((result) => (
                <div
                  key={result.user_id}
                  onClick={() => startConversation(result)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", borderTop: `0.5px solid ${c.border}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = c.primarySoft)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: c.primarySoft, color: c.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    {result.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(result as any).first_name ? `${(result as any).first_name} ${(result as any).last_name ?? ""}`.trim() : result.email}
                    </div>
                    <div style={{ fontSize: 10, color: c.subtext, textTransform: "capitalize" }}>{result.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loadingInbox && <div style={{ padding: 24, color: c.subtext, textAlign: "center" }}>{t("common.loading")}</div>}
            {!loadingInbox && conversations.length === 0 && !composing && (
              <div style={{ padding: 24, color: c.subtext, textAlign: "center", fontSize: 12, lineHeight: 1.6 }}>
                {t("msg.noConversations")}<br />
                <span style={{ color: c.primary, cursor: "pointer" }} onClick={() => setComposing(true)}>{t("msg.startOne")}</span>
              </div>
            )}
            {conversations.map((convo) => {
              const active = convo.other_user_id === activeUserId;
              const name = convo.display_name || convo.other_user_email;
              const initials = name.slice(0, 2).toUpperCase();
              const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
              return (
                <div
                  key={convo.other_user_id}
                  onClick={() => { setActiveUserId(convo.other_user_id); setComposing(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: active ? c.primarySoft : "transparent", borderLeft: `2px solid ${active ? c.primary : "transparent"}`, borderBottom: `0.5px solid ${c.border}`, cursor: "pointer" }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, border: `0.5px solid ${c.border}`, overflow: "hidden" }}>
                    {convo.avatar_url ? (
                      <img src={`${API_BASE}${convo.avatar_url}`} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: active ? c.primary : c.bg, color: active ? "#fff" : c.subtext, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>
                        {initials}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{name}</span>
                      {convo.unread_count > 0 && (
                        <span style={{ background: c.primary, color: "#fff", fontSize: 9, padding: "1px 6px", borderRadius: 20, flexShrink: 0 }}>{convo.unread_count}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: c.subtext, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {convo.last_message || <span style={{ fontStyle: "italic" }}>New conversation</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat thread */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {activeUserId === null ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: c.subtext }}>
              <div style={{ fontSize: 32 }}>💬</div>
              <div style={{ fontSize: 13 }}>{t("msg.select")}</div>
              <button
                onClick={() => setComposing(true)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 500 }}
              >
                {t("msg.newMessage")}
              </button>
            </div>
          ) : (
            <>
              <div style={{ padding: "13px 20px", borderBottom: `0.5px solid ${c.border}`, background: c.surface, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                {activeConvo?.avatar_url && (
                  <img src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}${activeConvo.avatar_url}`} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                )}
                <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
                  {activeConvo?.display_name || activeConvo?.other_user_email || `User #${activeUserId}`}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                {errorMsg && (
                  <div style={{ background: "#ffebee", color: "#c62828", padding: "8px 12px", borderRadius: 8, fontSize: 12, textAlign: "center", marginBottom: 8 }}>{errorMsg}</div>
                )}
                {loadingThread && <div style={{ color: c.subtext, textAlign: "center" }}>{t("common.loading")}</div>}
                {!loadingThread && messages.length === 0 && !errorMsg && (
                  <div style={{ color: c.subtext, textAlign: "center", fontSize: 12, marginTop: 40 }}>No messages yet. Say hi!</div>
                )}
                {messages.map((msg) => {
                  const mine = msg.sender_id === user?.user_id;
                  return (
                    <div key={msg.message_id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                      <div style={{ maxWidth: "65%", padding: "8px 12px", fontSize: 13, lineHeight: 1.5, borderRadius: mine ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: mine ? c.primary : c.surface, color: mine ? "#fff" : c.text, border: mine ? "none" : `0.5px solid ${c.border}` }}>
                        {/^📎 \[.+\]\(.+\)$/.test(msg.content) ? (() => {
                          const m = msg.content.match(/^📎 \[(.+)\]\((.+)\)$/);
                          return m ? (
                            <a href={m[2]} target="_blank" rel="noopener noreferrer" style={{ color: mine ? "#fff" : c.primary, textDecoration: "underline", display: "flex", alignItems: "center", gap: 5 }}>
                              📎 {m[1]}
                            </a>
                          ) : msg.content;
                        })() : msg.content}
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.65, textAlign: "right" }}>
                          {new Date(msg.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: "12px 20px", borderTop: `0.5px solid ${c.border}`, background: c.surface, flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-end" }}>
                <label aria-label="Attach a file" title="Attach a file" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, border: `0.5px solid ${c.border}`, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", cursor: activeUserId !== null ? "pointer" : "default", opacity: activeUserId !== null ? 1 : 0.4 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.subtext} strokeWidth="2" aria-hidden="true">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                  </svg>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.zip,.doc,.docx,.txt,.mp4,.csv" style={{ display: "none" }} disabled={activeUserId === null} onChange={sendFile} aria-label="Attach a file" />
                </label>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("msg.placeholder")}
                  rows={1}
                  style={{ flex: 1, resize: "none", border: `0.5px solid ${c.border}`, borderRadius: 10, padding: "9px 12px", background: c.bg, color: c.text, fontSize: 13, fontFamily: "inherit", outline: "none", lineHeight: 1.5 }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: input.trim() ? c.primary : c.border, color: "#fff", cursor: input.trim() ? "pointer" : "default", fontSize: 13, fontFamily: "inherit", fontWeight: 500, flexShrink: 0 }}
                >
                  {t("msg.send")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessagingPage;
