// Branche « Suivi des PPT » de l'espace syndic - /syndic/ppt/:section?
// Tableau de bord (Dirigeant si direction de l'enseigne, Gestionnaire sinon),
// échéancier et liste des copropriétés. Les données sont chargées une fois ici
// (portefeuille + postes + AG + rapports + paramètres du cabinet) et passées aux
// sections. En aperçu AMO, le rail d'enseignes filtre comme dans la branche
// rénovation globale (même clé de session).
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useOrganisations } from "@/api/organisations";
import { useMonOrganisation } from "@/api/syndic";
import {
  useOrganisationPpt,
  usePptAgs,
  usePptCopros,
  usePptMembresEnseigne,
  usePptParametres,
  usePptPostes,
  usePptRapports,
  type PptAg,
  type PptCoproAvecStats,
  type PptPoste,
  type PptRapport,
} from "@/api/ppt";
import { PARAMETRES_ORG_DEFAUT, type ParametresOrg } from "@/lib/ppt/formules";
import { SyndicShell, Loader, OrgRail, lireVue, ecrireVue, type SectionId } from "@/pages/Syndic";
import { DashboardDirigeant, DashboardGestionnaire } from "./Dashboard";
import { EcheancierPpt } from "./Echeancier";
import { CoprosPpt } from "./Copros";

export interface PortefeuillePpt {
  apercuAmo: boolean;
  /** Vue direction : tout le portefeuille, comparatif par gestionnaire. */
  direction: boolean;
  orgId: string | null;
  nomEnseigne: string | undefined;
  copros: PptCoproAvecStats[];
  /** Dossiers que l'utilisateur peut ouvrir. */
  accessibles: PptCoproAvecStats[];
  postes: PptPoste[];
  ags: PptAg[];
  rapports: PptRapport[];
  params: ParametresOrg;
  membres: { user_id: string; nom: string; org_role: string }[];
  chargement: boolean;
}

/** Chargement du portefeuille PPT visible, filtré par enseigne en aperçu AMO. */
export function usePortefeuillePpt(orgFiltre: string | null): PortefeuillePpt {
  const { profile } = useAuth();
  const apercuAmo = profile?.role === "amo";
  const { data: orgPpt } = useOrganisationPpt();
  const { data: monOrg } = useMonOrganisation();
  const { data: organisations } = useOrganisations();
  const { data: copros, isLoading } = usePptCopros();

  const tous = copros ?? [];
  const visibles = !apercuAmo || orgFiltre === null ? tous : tous.filter((c) => c.organisation_id === orgFiltre);
  const ids = visibles.map((c) => c.id);
  const { data: postes } = usePptPostes(ids);
  const { data: ags } = usePptAgs(ids);
  const { data: rapports } = usePptRapports(ids);
  const orgId = apercuAmo ? orgFiltre : (orgPpt?.id ?? null);
  const { data: params } = usePptParametres(orgId);
  const { data: membres } = usePptMembresEnseigne(orgId);

  return {
    apercuAmo,
    direction: apercuAmo || monOrg?.role === "directeur",
    orgId,
    nomEnseigne: apercuAmo ? organisations?.find((o) => o.id === orgFiltre)?.nom : orgPpt?.nom,
    copros: visibles,
    accessibles: visibles.filter((c) => c.acces),
    postes: (postes ?? []).filter((p) => p.actif),
    ags: ags ?? [],
    rapports: rapports ?? [],
    params: params ?? PARAMETRES_ORG_DEFAUT,
    membres: membres ?? [],
    chargement: isLoading,
  };
}

export default function SyndicPpt() {
  const { section: sectionParam } = useParams();
  const section: SectionId = sectionParam === "echeancier" ? "echeancier" : sectionParam === "copros" ? "copros" : "tableau";
  const { profile } = useAuth();
  const apercuAmo = profile?.role === "amo";
  const [orgId, setOrgIdBrut] = useState<string | null>(() => lireVue<string>("syndic-apercu-org"));
  const setOrgId = (v: string | null) => {
    setOrgIdBrut(v);
    ecrireVue("syndic-apercu-org", v);
  };
  const { data: tousCopros } = usePptCopros();
  const pf = usePortefeuillePpt(apercuAmo ? (orgId === "__sans__" ? null : orgId) : null);

  if (pf.chargement) return <Loader />;

  return (
    <SyndicShell
      active={section}
      branche="ppt"
      rail={apercuAmo ? <OrgRail copros={tousCopros ?? []} value={orgId} onChange={setOrgId} /> : undefined}
    >
      {section === "tableau" && (pf.direction ? <DashboardDirigeant pf={pf} /> : <DashboardGestionnaire pf={pf} />)}
      {section === "echeancier" && <EcheancierPpt pf={pf} />}
      {section === "copros" && <CoprosPpt pf={pf} />}
    </SyndicShell>
  );
}
