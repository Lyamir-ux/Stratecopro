import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Crumb {
  label: string;
  to?: string;
}

interface UiState {
  collapsed: boolean;
  sidebarTheme: "clair" | "sombre";
  dashLayout: "kanban" | "galerie" | "tableau";
  showProgress: boolean;
  crumbs: Crumb[];
  toggleCollapsed: () => void;
  setSidebarTheme: (t: "clair" | "sombre") => void;
  setDashLayout: (v: "kanban" | "galerie" | "tableau") => void;
  setShowProgress: (v: boolean) => void;
  setCrumbs: (c: Crumb[]) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      collapsed: false,
      sidebarTheme: "clair",
      dashLayout: "kanban",
      showProgress: true,
      crumbs: [],
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setSidebarTheme: (sidebarTheme) => set({ sidebarTheme }),
      setDashLayout: (dashLayout) => set({ dashLayout }),
      setShowProgress: (showProgress) => set({ showProgress }),
      setCrumbs: (crumbs) => set({ crumbs }),
    }),
    {
      name: "se_amo_ui_v1",
      partialize: (s) => ({
        collapsed: s.collapsed,
        sidebarTheme: s.sidebarTheme,
        dashLayout: s.dashLayout,
        showProgress: s.showProgress,
      }),
    }
  )
);
