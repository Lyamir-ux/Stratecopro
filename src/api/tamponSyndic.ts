// Tampon du syndic (une image par organisation, 0163) : importé par l'AMO depuis l'onglet
// Financement, imprimé sur chaque bulletin d'adhésion généré au portail.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { preparerTampon } from "@/lib/tamponSyndic";

export interface TamponOrganisation {
  /** Nom de l'organisation (enseigne) qui porte le tampon. */
  nom: string;
  /** Data URL de l'image ; null tant qu'aucun tampon n'a été importé. */
  image: string | null;
}

/** Organisation d'un dossier et son tampon, côté AMO. */
export function useTamponOrganisation(organisationId: string | null | undefined) {
  return useQuery({
    queryKey: ["tampon-syndic", organisationId],
    enabled: !!organisationId,
    queryFn: async (): Promise<TamponOrganisation | null> => {
      const { data, error } = await supabase
        .from("organisations")
        .select("nom, organisation_tampons(image)")
        .eq("id", organisationId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { nom: data.nom, image: data.organisation_tampons?.image ?? null };
    },
  });
}

/** Importe (ou remplace) le tampon de l'organisation : l'image est réduite dans le navigateur d'abord. */
export function useImporterTamponSyndic(organisationId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fichier: File) => {
      if (!organisationId) throw new Error("Ce dossier n'est rattaché à aucune organisation : rattachez-le d'abord (onglet Données).");
      const image = await preparerTampon(fichier);
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase
        .from("organisation_tampons")
        .upsert(
          { organisation_id: organisationId, image, updated_by: session.session?.user.id ?? null },
          { onConflict: "organisation_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tampon-syndic", organisationId] }),
  });
}

/**
 * Tampon de l'organisation d'un dossier, pour fabriquer le bulletin d'un copropriétaire (la fonction
 * ne le rend qu'à l'AMO et aux copropriétaires du dossier). null : aucun tampon importé. Une erreur
 * est levée, jamais avalée : un bulletin signé ne se refait pas, il ne doit pas partir sans tampon
 * sur un simple raté de connexion.
 */
export async function tamponSyndicPourCopro(coproId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("tampon_syndic_copro", { p_copro_id: coproId });
  if (error) throw error;
  return data ?? null;
}
