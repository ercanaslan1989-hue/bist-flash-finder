import { useEffect, useState } from "react";

// Global "developer mode" toggle, persisted in localStorage and synced across
// components/tabs. In dev mode the UI shows the legacy AI score next to the new
// parallel scoring engine (technical / volume / risk / confidence + reasons).

const KEY = "bist:dev-mode";
const EVENT = "bist:dev-mode-change";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function useDevMode(): [boolean, (v?: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const sync = () => setEnabled(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = (v?: boolean) => {
    const next = v === undefined ? !read() : v;
    window.localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
    setEnabled(next);
  };

  return [enabled, toggle];
}
