// Espaces copropriétaires (portail) - feedback d'Amir du 30/09/2026 : aucun
// copropriétaire n'avait de compte. L'AMO ouvre l'espace d'une fiche ou de
// toutes celles d'un dossier ; l'edge function creer-espace-coproprietaire crée
// le compte, relie la fiche et envoie l'e-mail d'activation (migration 0116).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type EtatEspace = "actif" | "invite" | "a_creer" | "sans_email" | "email_pris";

export interface EspaceCoproprietaire {
  etat: EtatEspace;
  inviteLe: string | null;
  /** Rôle du compte qui détient déjà l'adresse (état email_pris). */
  roleCompte: string | null;
}

/** État de l'espace de chaque copropriétaire présent du dossier (les sortants n'y sont pas). */
export function useEspacesCoproprietaires(coproId: string | undefined) {
  return useQuery({
    queryKey: ["espaces", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Map<string, EspaceCoproprietaire>> => {
      const { data, error } = await supabase.rpc("espaces_coproprietaires", { p_copro_id: coproId! });
      if (error) throw error;
      return new Map(
        (data ?? []).map((r) => [
          r.coproprietaire_id,
          { etat: r.etat as EtatEspace, inviteLe: r.invite_le, roleCompte: r.role_compte },
        ])
      );
    },
  });
}

export type StatutEspace =
  | "invite"
  | "relie"
  | "renvoye"
  | "deja_actif"
  | "sans_email"
  | "sortant"
  | "email_pris"
  | "erreur";

export interface ResultatEspace {
  id: string;
  nom: string;
  statut: StatutEspace;
  envoi: "envoye" | "simule" | "echec" | null;
  detail?: string;
}

/** Fiches par appel : l'edge function espace ses envois (débit Resend limité). */
const PAQUET = 10;

async function appelerPaquet(ids: string[]): Promise<ResultatEspace[]> {
  const { data, error } = await supabase.functions.invoke("creer-espace-coproprietaire", {
    body: { coproprietaire_ids: ids },
  });
  if (error) {
    // le corps d'erreur de l'edge function porte le message à afficher
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error ?? "L'ouverture des espaces a échoué. Réessayez.");
  }
  return (data as { resultats: ResultatEspace[] }).resultats;
}

/**
 * Ouvre l'espace des fiches demandées, par paquets ; onProgres reçoit le
 * nombre de fiches traitées. Un paquet en échec n'arrête pas la suite : ses
 * fiches sortent en erreur (nom vide, l'écran le connaît) et restent à refaire.
 */
export function useCreerEspaces(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, onProgres }: { ids: string[]; onProgres?: (n: number) => void }) => {
      const resultats: ResultatEspace[] = [];
      for (let i = 0; i < ids.length; i += PAQUET) {
        const paquet = ids.slice(i, i + PAQUET);
        try {
          resultats.push(...(await appelerPaquet(paquet)));
        } catch (e) {
          const detail = e instanceof Error ? e.message : "Appel impossible";
          resultats.push(...paquet.map((id): ResultatEspace => ({ id, nom: "", statut: "erreur", envoi: null, detail })));
        }
        onProgres?.(resultats.length);
      }
      return resultats;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["espaces", coproId] });
      void qc.invalidateQueries({ queryKey: ["donnees", coproId] });
    },
  });
}

/** Résumé d'une série d'ouvertures, pour l'écran. */
export function resumeResultats(resultats: ResultatEspace[]) {
  const n = (f: (r: ResultatEspace) => boolean) => resultats.filter(f).length;
  return {
    envoyes: n((r) => r.envoi === "envoye"),
    simules: n((r) => r.envoi === "simule"),
    echecs: n((r) => r.envoi === "echec" || r.statut === "erreur"),
    dejaActifs: n((r) => r.statut === "deja_actif"),
    ignores: n((r) => r.statut === "sans_email" || r.statut === "sortant" || r.statut === "email_pris"),
  };
}
