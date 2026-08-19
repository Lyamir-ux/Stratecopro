import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Crumb {
  label: string;
  to?: string;
}

export const ACCENTS = ["#7AB52C", "#2E6FA8", "#4A7A1F"] as const;
export type Accent = (typeof ACCENTS)[number];

interface UiState {
  collapsed: boolean;
  sidebarTheme: "clair" | "sombre";
  dashLayout: "kanban" | "galerie" | "tableau";
  showProgress: boolean;
  accent: Accent;
  crumbs: Crumb[];
  /** Filtre « chef de projet » du tableau de bord — persisté : une fois choisi
   *  par la cheffe de projet, il redevient son filtre par défaut. */
  chefProjetFilter: string;
  toggleCollapsed: () => void;
  setSidebarTheme: (t: "clair" | "sombre") => void;
  setDashLayout: (v: "kanban" | "galerie" | "tableau") => void;
  setShowProgress: (v: boolean) => void;
  setAccent: (a: Accent) => void;
  setCrumbs: (c: Crumb[]) => void;
  setChefProjetFilter: (v: string) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      collapsed: false,
      sidebarTheme: "clair",
      dashLayout: "kanban",
      showProgress: true,
      accent: "#7AB52C",
      crumbs: [],
      chefProjetFilter: "",
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setSidebarTheme: (sidebarTheme) => set({ sidebarTheme }),
      setDashLayout: (dashLayout) => set({ dashLayout }),
      setShowProgress: (showProgress) => set({ showProgress }),
      setAccent: (accent) => set({ accent }),
      setCrumbs: (crumbs) => set({ crumbs }),
      setChefProjetFilter: (chefProjetFilter) => set({ chefProjetFilter }),
    }),
    {
      name: "se_amo_ui_v1",
      partialize: (s) => ({
        collapsed: s.collapsed,
        sidebarTheme: s.sidebarTheme,
        dashLayout: s.dashLayout,
        showProgress: s.showProgress,
        accent: s.accent,
        chefProjetFilter: s.chefProjetFilter,
      }),
    }
  )
);
