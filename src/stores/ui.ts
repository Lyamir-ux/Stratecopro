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
  accent: Accent;
  crumbs: Crumb[];
  /** Filtre « chef de projet » du tableau de bord - persisté : une fois choisi
   *  par la cheffe de projet, il redevient son filtre par défaut. */
  chefProjetFilter: string;
  toggleCollapsed: () => void;
  setSidebarTheme: (t: "clair" | "sombre") => void;
  setAccent: (a: Accent) => void;
  setCrumbs: (c: Crumb[]) => void;
  setChefProjetFilter: (v: string) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      collapsed: false,
      sidebarTheme: "clair",
      accent: "#7AB52C",
      crumbs: [],
      chefProjetFilter: "",
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setSidebarTheme: (sidebarTheme) => set({ sidebarTheme }),
      setAccent: (accent) => set({ accent }),
      setCrumbs: (crumbs) => set({ crumbs }),
      setChefProjetFilter: (chefProjetFilter) => set({ chefProjetFilter }),
    }),
    {
      name: "se_amo_ui_v1",
      // v2 : la vue « galerie » a été retirée (feedback Amir 22/09).
      // v3 : le Kanban aussi (feedback Amir 28/09) - le tableau de bord n'a plus
      // qu'une vue liste, les réglages de vue déjà enregistrés sont oubliés.
      version: 3,
      migrate: (persisted) => {
        const s = { ...((persisted ?? {}) as Record<string, unknown>) };
        delete s.dashLayout;
        delete s.showProgress;
        return s as unknown as UiState;
      },
      partialize: (s) => ({
        collapsed: s.collapsed,
        sidebarTheme: s.sidebarTheme,
        accent: s.accent,
        chefProjetFilter: s.chefProjetFilter,
      }),
    }
  )
);
