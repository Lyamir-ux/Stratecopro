// « Mon organisation » - la direction d'une enseigne syndic gère son équipe
// (feedback de Pierrot LEFOU du 24/09/2026, arbitrage d'Amir du 25/09) :
// création des comptes gestionnaire / administratif / comptable de SA seule
// enseigne (edge function creer-collaborateur), rôles, et rattachement des
// copropriétés - accès aux dossiers de rénovation globale (copro_members) et
// gestionnaire des copropriétés PPT (ppt_affectations). Toutes les écritures
// passent par des fonctions contrôlées en base (migration 0102).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { creerCompte, type CollaborateurCree } from "@/api/profiles";
import type { OrgRole } from "@/api/organisations";

export interface MembreEquipe {
  user_id: string;
  full_name: string;
  email: string;
  org_role: OrgRole;
  job_title: string | null;
  active: boolean;
  /** Compte créé avec un mot de passe provisoire pas encore remplacé. */
  mot_de_passe_provisoire: boolean;
  derniere_connexion: string | null;
}

export interface RattachementEquipe {
  /** « reno » : accès à un dossier de rénovation globale ; « ppt » : gestionnaire d'une copropriété PPT. */
  branche: "reno" | "ppt";
  copro_id: string;
  user_id: string;
  /** Rénovation globale : le membre est le gestionnaire désigné du dossier. */
  gestionnaire: boolean;
}

/** Rôles que la direction d'une enseigne peut attribuer (la direction est désignée par Strat Eco). */
export const ROLES_EQUIPE: { id: Exclude<OrgRole, "directeur">; label: string; aide: string }[] = [
  { id: "gestionnaire", label: "Gestionnaire", aide: "gère ses copropriétés : tâches, messages, dossiers bancaires" },
  { id: "administratif", label: "Administratif", aide: "assiste les gestionnaires sur les copropriétés qui lui sont rattachées" },
  { id: "comptable", label: "Comptable", aide: "suit les appels de fonds et paiements des copropriétés rattachées" },
];

export const ROLE_EQUIPE_LABEL: Record<OrgRole, string> = {
  directeur: "Direction",
  gestionnaire: "Gestionnaire",
  administratif: "Administratif",
  comptable: "Comptable",
};

export function useEquipeEnseigne(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["syndic", "equipe", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<MembreEquipe[]> => {
      const { data, error } = await supabase.rpc("org_equipe", { p_org: orgId! });
      if (error) throw error;
      return (data ?? []).map((m) => ({ ...m, email: m.email ?? "", full_name: m.full_name ?? "-" }));
    },
  });
}

export function useRattachementsEnseigne(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["syndic", "rattachements", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<RattachementEquipe[]> => {
      const { data, error } = await supabase.rpc("org_rattachements", { p_org: orgId! });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, branche: r.branche === "ppt" ? "ppt" : "reno" }));
    },
  });
}

/** Tout ce que touche un changement d'équipe ou de rattachement. */
function useRefreshEquipe() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["syndic", "equipe"] });
    void qc.invalidateQueries({ queryKey: ["syndic", "rattachements"] });
    void qc.invalidateQueries({ queryKey: ["syndic", "copros"] });
    void qc.invalidateQueries({ queryKey: ["syndic", "copro"] });
    void qc.invalidateQueries({ queryKey: ["ppt"] });
  };
}

/** Création d'un compte de l'enseigne (mot de passe provisoire renvoyé une seule fois). */
export function useCreerMembreEquipe() {
  const refresh = useRefreshEquipe();
  return useMutation({
    mutationFn: (m: { organisation_id: string; full_name: string; email: string; org_role: OrgRole; job_title?: string }): Promise<CollaborateurCree> =>
      creerCompte({ role: "syndic", ...m }),
    onSuccess: refresh,
  });
}

export function useChangerRoleEquipe() {
  const refresh = useRefreshEquipe();
  return useMutation({
    mutationFn: async ({ orgId, userId, role }: { orgId: string; userId: string; role: OrgRole }) => {
      const { error } = await supabase.rpc("org_changer_role", { p_org: orgId, p_user: userId, p_role: role });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Ouvre ou retire l'accès d'un membre à un dossier de rénovation globale. */
export function useAccesDossierEquipe() {
  const refresh = useRefreshEquipe();
  return useMutation({
    mutationFn: async ({ coproId, userId, acces }: { coproId: string; userId: string; acces: boolean }) => {
      const { error } = await supabase.rpc("org_acces_copro", { p_copro: coproId, p_user: userId, p_acces: acces });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Désigne le gestionnaire d'un dossier de rénovation globale (l'ancien perd l'accès). */
export function useDesignerGestionnaireDossier() {
  const refresh = useRefreshEquipe();
  return useMutation({
    mutationFn: async ({ coproId, userId }: { coproId: string; userId: string | null }) => {
      const { error } = await supabase.rpc("org_designer_gestionnaire", { p_copro: coproId, p_user: userId });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Gestionnaire d'une copropriété PPT (un seul par copropriété, trigger ppt_sync_affectation). */
export function useGestionnairePptEquipe() {
  const refresh = useRefreshEquipe();
  return useMutation({
    mutationFn: async ({ pptCoproId, membre }: { pptCoproId: string; membre: { full_name: string; email: string } | null }) => {
      const { error } = await supabase
        .from("ppt_coproprietes")
        .update({ gestionnaire_nom: membre?.full_name ?? null, gestionnaire_email: membre?.email.trim().toLowerCase() || null })
        .eq("id", pptCoproId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}
