import { useEffect, useRef, useState, useCallback } from "react";
import { logout } from "./api";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARN_BEFORE_MS = 2 * 60 * 1000;          // warn 2 minutes before logout

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "keydown",
  "mousedown",
  "scroll",
  "touchstart",
];

interface InactivityState {
  showWarning: boolean;
  secondsLeft: number;
  resetTimer: () => void;
}

export function useInactivityLogout(): InactivityState {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARN_BEFORE_MS / 1000);

  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllTimers = useCallback(() => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const startTimers = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    setSecondsLeft(WARN_BEFORE_MS / 1000);

    warnTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(WARN_BEFORE_MS / 1000);

      countdownRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      logoutTimerRef.current = setTimeout(() => {
        logout();
      }, WARN_BEFORE_MS);
    }, INACTIVITY_TIMEOUT_MS - WARN_BEFORE_MS);
  }, [clearAllTimers]);

  const resetTimer = useCallback(() => {
    startTimers();
  }, [startTimers]);

  useEffect(() => {
    startTimers();

    const handleActivity = () => {
      if (!showWarning) startTimers();
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, handleActivity, { passive: true })
    );

    return () => {
      clearAllTimers();
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, handleActivity)
      );
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { showWarning, secondsLeft, resetTimer };
}
