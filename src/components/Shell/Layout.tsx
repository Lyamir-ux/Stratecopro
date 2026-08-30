import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useUi, type Accent } from "@/stores/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useCopros, useTasksCount } from "@/api/copros";
import { useQuestionsEnAttenteCount } from "@/api/consultations";
import { declencherRappelAgrements } from "@/api/prestataires";
import { declencherRapportSyndic } from "@/api/rapportSyndic";
import { declencherSignatureCron } from "@/api/signature";

// Accent dynamique - repris de la maquette (app.jsx ACCENT_MAP)
const ACCENT_MAP: Record<Accent, { hover: string; soft: string; deep: string }> = {
  "#7AB52C": { hover: "#4A7A1F", soft: "#E8F1D7", deep: "#4A7A1F" },
  "#2E6FA8": { hover: "#1E4F7C", soft: "#EAF2FA", deep: "#1E4F7C" },
  "#4A7A1F": { hover: "#355717", soft: "#E8F1D7", deep: "#355717" },
};

export function Layout() {
  const collapsed = useUi((s) => s.collapsed);
  const accent = useUi((s) => s.accent);

  useEffect(() => {
    const a = ACCENT_MAP[accent] ?? ACCENT_MAP["#7AB52C"];
    const root = document.documentElement.style;
    root.setProperty("--accent", accent);
    root.setProperty("--accent-hover", a.hover);
    root.setProperty("--accent-soft", a.soft);
    root.setProperty("--color-primary-500", accent);
    root.setProperty("--color-primary-700", a.deep);
    root.setProperty("--color-primary-100", a.soft);
  }, [accent]);
  const { profile, signOut } = useAuth();
  // rappel e-mail des agréments prestataires en fin de validité (1×/jour)
  // + rapport mensuel de portefeuille aux cabinets de syndic (1×/mois)
  // + entretien des signatures électroniques : relances, expirations, purge (1×/jour)
  useEffect(() => {
    void declencherRappelAgrements();
    void declencherRapportSyndic();
    void declencherSignatureCron();
  }, []);
  const { data: copros } = useCopros();
  const { data: tasksCount } = useTasksCount();
  // alerte du menu « Consulter un intervenant » : questions de prestataires sans réponse
  const { data: questionsCount } = useQuestionsEnAttenteCount();

  const user = {
    initials: profile?.initials ?? "–",
    name: profile?.full_name ?? "Utilisateur",
    org: profile?.job_title ? `Strat Eco · ${profile.job_title}` : "Strat Eco · AMO",
  };
  const recents = (copros ?? []).slice(0, 4).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <Sidebar
        recents={recents}
        tasksCount={tasksCount ?? null}
        questionsCount={questionsCount || null}
        user={user}
        onLogout={() => void signOut()}
      />
      <div className="main">
        <Topbar />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
