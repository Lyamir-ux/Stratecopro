// Demandes d'AMO déposées par les syndics (migration 0089).
//
// Feedbacks Amir 22/09/2026 (12:58) : depuis son espace, le gestionnaire
// signale une copropriété sur laquelle il souhaite l'intervention de Strat Eco
// - cinq informations suffisent (nom, adresse, nombre de lots, chauffage, VMC).
// Côté AMO, les demandes arrivent dans la page « Demandes des syndics » : on
// les traite, on les classe, ou on ouvre le dossier d'un clic.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import type { Tables } from "@/lib/database.types";

export type DemandeAmo = Tables<"demandes_amo">;

/** Modes de chauffage proposés au dépôt - texte libre en base pour rester
 *  ouvert aux cas particuliers (réseau de chaleur mixte, chaufferie partagée…). */
export const CHAUFFAGES: string[] = [
  "Collectif gaz",
  "Collectif fioul",
  "Collectif électrique",
  "Collectif bois / granulés",
  "Réseau de chaleur urbain",
  "Pompe à chaleur collective",
  "Individuel gaz",
  "Individuel électrique",
  "Individuel autre",
  "Je ne sais pas",
];

export interface NouvelleDemandeAmo {
  copro_nom: string;
  adresse: string;
  nb_lots: number | null;
  chauffage: string | null;
  vmc: boolean | null;
}

/** Les demandes visibles : toutes pour l'AMO, les siennes pour le syndic (RLS). */
export function useDemandesAmo() {
  return useQuery({
    queryKey: ["demandes-amo"],
    queryFn: async (): Promise<DemandeAmo[]> => {
      const { data, error } = await supabase
        .from("demandes_amo")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Pastille du menu AMO : demandes encore à traiter. */
export function compteNouvelles(demandes: DemandeAmo[] | undefined): number {
  return (demandes ?? []).filter((d) => d.statut === "nouvelle").length;
}

/** Dépôt par le gestionnaire. L'enseigne et le nom du demandeur sont figés au
 *  dépôt : le compte peut changer d'enseigne entre-temps. */
export function useDeposerDemandeAmo() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({
      demande,
      organisationId,
      syndicName,
    }: {
      demande: NouvelleDemandeAmo;
      organisationId: string | null;
      syndicName: string | null;
    }): Promise<DemandeAmo> => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Session expirée - reconnectez-vous pour envoyer votre demande.");
      const { data, error } = await supabase
        .from("demandes_amo")
        .insert({
          copro_nom: demande.copro_nom.trim(),
          adresse: demande.adresse.trim(),
          nb_lots: demande.nb_lots,
          chauffage: demande.chauffage,
          vmc: demande.vmc,
          demandeur_user_id: uid,
          demandeur_nom: profile?.full_name ?? "",
          demandeur_email: session.session?.user.email ?? null,
          organisation_id: organisationId,
          syndic_name: syndicName,
        })
        .select()
        .single();
      if (error) throw error;
      // alerte e-mail sans détail - meilleur effort, la demande est déjà posée
      try {
        await supabase.functions.invoke("notifier-demande-amo", { body: { demande_id: data.id } });
      } catch {
        /* l'alerte e-mail est facultative */
      }
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["demandes-amo"] }),
  });
}

/** Suivi côté AMO : traitée, classée, ou retour à traiter. */
export function useStatutDemandeAmo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      statut,
      commentaire,
      coproId,
    }: {
      id: string;
      statut: DemandeAmo["statut"];
      commentaire?: string | null;
      coproId?: string | null;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      const enCours = statut === "nouvelle";
      const { error } = await supabase
        .from("demandes_amo")
        .update({
          statut,
          commentaire_amo: commentaire === undefined ? undefined : commentaire,
          copro_id: coproId === undefined ? undefined : coproId,
          traite_par: enCours ? null : (session.session?.user.id ?? null),
          traite_le: enCours ? null : new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["demandes-amo"] }),
  });
}
