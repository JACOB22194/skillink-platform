import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { translate, type Lang } from "./translations";

const STORAGE_KEY = "skilllink-lang";
const CAIRO_HREF  = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LangCtx>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
  isRTL: false,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "ar" ? "ar" : "en";
  });

  const isRTL = lang === "ar";

  // Load Cairo font when Arabic is active
  useEffect(() => {
    if (lang === "ar") {
      if (!document.getElementById("cairo-font")) {
        const link = document.createElement("link");
        link.id   = "cairo-font";
        link.rel  = "stylesheet";
        link.href = CAIRO_HREF;
        document.head.appendChild(link);
      }
    }
    document.documentElement.dir  = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(key, lang, vars),
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

// ── LangToggle button ─────────────────────────────────────────────────────────

interface LangToggleProps {
  /** style for the outer button */
  style?: React.CSSProperties;
}

export const LangToggle: React.FC<LangToggleProps> = ({ style }) => {
  const { lang, setLang } = useLanguage();
  return (
    <button
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      title={lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"}
      style={{
        padding: "6px 11px",
        borderRadius: 8,
        border: "0.5px solid currentColor",
        background: "transparent",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: ".03em",
        opacity: 0.75,
        fontFamily: "inherit",
        ...style,
      }}
    >
      {lang === "en" ? "AR" : "EN"}
    </button>
  );
};
