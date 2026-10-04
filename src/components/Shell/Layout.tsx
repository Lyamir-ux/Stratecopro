import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useUi, type Accent } from "@/stores/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useCopros, useTachesOuvertesParDossier } from "@/api/copros";
import { useQuestionsEnAttenteCount } from "@/api/consultations";
import { usePptRapportsRevue } from "@/api/ppt";
import { usePiecesAVerifierParDossier } from "@/api/portail";
import { usePerimetreTaches } from "@/api/taches";
import { dansPerimetre } from "@/lib/perimetreChef";
import { compteNouvelles, useDemandesAmo } from "@/api/demandesAmo";
import { compteEnAttente, useHonoraires } from "@/api/honoraires";
import { declencherRappelAgrements } from "@/api/prestataires";
import { nonLusFilGeneral, useFilsGeneraux, useLecturesFilGeneral } from "@/api/messages";
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
  // Pastille « Vos tâches » (bug d'Amir du 04/10/2026) : dossiers du chef de
  // projet choisi sur le tableau de bord, à défaut ceux du compte connecté.
  // Les pièces justificatives déposées au portail en attente de vérification
  // s'y ajoutent, la file étant affichée en tête de la page.
  const perimetre = usePerimetreTaches();
  const { data: tachesParDossier } = useTachesOuvertesParDossier();
  const { data: piecesParDossier } = usePiecesAVerifierParDossier();
  const dossiersPerimetre = (copros ?? []).filter((c) => dansPerimetre(perimetre, c.chef_projet));
  const tachesEtPieces = dossiersPerimetre.reduce(
    (n, c) => n + (tachesParDossier?.get(c.id) ?? 0) + (piecesParDossier?.get(c.id) ?? 0),
    0
  );
  // alerte du menu « Consulter un intervenant » : questions de prestataires sans réponse
  const { data: questionsCount } = useQuestionsEnAttenteCount();
  // alerte du menu « Suivi PPT » : rapports déposés ou analysés en attente de revue
  const { data: rapportsPpt } = usePptRapportsRevue();
  const pptCount = (rapportsPpt ?? []).filter((r) => ["depose", "en_analyse", "a_relire"].includes(r.statut) && (r.type === "pppt" || r.type === "ppt_adopte")).length;
  // alerte du menu « Demandes des syndics » : demandes d'AMO encore à traiter
  const { data: demandes } = useDemandesAmo();
  const demandesCount = compteNouvelles(demandes);
  // alerte du menu « Facturation » : dossiers dont une facture attend son paiement
  const { data: honoraires } = useHonoraires();
  const facturationCount = compteEnAttente(honoraires, new Set((copros ?? []).map((c) => c.id)));
  // alerte du menu « Base prestataires » : messages d'entreprises non lus dans
  // leur fil « Équipe Strat Eco » (0124, sans alerte e-mail - choix d'Amir)
  const { data: filsGeneraux } = useFilsGeneraux();
  const { data: lecturesFils } = useLecturesFilGeneral();
  const prestatairesCount = [...nonLusFilGeneral(filsGeneraux, lecturesFils, "amo").values()].reduce((a, b) => a + b, 0);

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
        tasksCount={!copros || (tachesParDossier == null && piecesParDossier == null) ? null : tachesEtPieces}
        questionsCount={questionsCount || null}
        pptCount={pptCount || null}
        demandesCount={demandesCount || null}
        facturationCount={facturationCount || null}
        prestatairesCount={prestatairesCount || null}
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
