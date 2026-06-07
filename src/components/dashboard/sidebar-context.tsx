"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export const SIDEBAR_STORAGE_KEY = "fti-sidebar-collapsed";

/** Matches expanded sidebar: w-[clamp(11rem,16vw,16rem)] — use max for layout calc. */
export const SIDEBAR_WIDTH_EXPANDED = "16rem";
export const SIDEBAR_WIDTH_COLLAPSED = "4rem";

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  ready: boolean;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function getDefaultCollapsed() {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (stored !== null) return stored === "true";
  return window.matchMedia("(max-width: 768px)").matches;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCollapsed(getDefaultCollapsed());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed, ready]);

  useEffect(() => {
    if (!ready) return;

    const media = window.matchMedia("(max-width: 768px)");
    function onResize() {
      if (localStorage.getItem(SIDEBAR_STORAGE_KEY) !== null) return;
      setCollapsed(media.matches);
    }

    media.addEventListener("change", onResize);
    return () => media.removeEventListener("change", onResize);
  }, [ready]);

  const sidebarWidth = collapsed
    ? SIDEBAR_WIDTH_COLLAPSED
    : SIDEBAR_WIDTH_EXPANDED;

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        setCollapsed,
        toggleCollapsed: () => setCollapsed((value) => !value),
        ready,
      }}
    >
      <div
        className="flex min-h-screen bg-stone-100"
        style={
          {
            "--dashboard-sidebar-width": sidebarWidth,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}
