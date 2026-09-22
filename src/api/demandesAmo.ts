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
import { nomFichierSansAccents } from "@/lib/nommage";
import type { Tables } from "@/lib/database.types";

export type DemandeAmo = Tables<"demandes_amo">;

// ---------- Pièces jointes (migration 0091) ----------
// Feedback Amir 22/09/2026 : le gestionnaire joint ce qu'il a déjà (DPE
// collectif, audit, PPT, carnet d'entretien, PV d'AG…). Les fichiers vivent
// dans le bucket privé demandes-amo, sous <user_id>/<demande_id>/, et sont
// décrits dans la colonne jsonb `fichiers` de la demande.

export interface PieceDemande {
  path: string;
  name: string;
  size: number | null;
  mime: string | null;
  uploaded_at: string;
}

/** Taille maximale par pièce (le bucket n'est pas fait pour des plans lourds). */
export const TAILLE_MAX_PIECE = 20 * 1024 * 1024;

export const EXTENSIONS_PIECES = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg";

export function piecesDemande(d: DemandeAmo): PieceDemande[] {
  return Array.isArray(d.fichiers) ? (d.fichiers as unknown as PieceDemande[]) : [];
}

/** URL signée (5 min) d'une pièce - le bucket est privé. */
export async function urlSigneePieceDemande(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("demandes-amo")
    .createSignedUrl(path, 300, download ? { download: nomFichierSansAccents(download) } : undefined);
  if (error || !data) throw error ?? new Error("Document indisponible");
  return data.signedUrl;
}

export async function telechargerPieceDemande(piece: PieceDemande) {
  const a = document.createElement("a");
  a.href = await urlSigneePieceDemande(piece.path, piece.name);
  a.download = piece.name;
  a.target = "_blank";
  a.click();
}

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
  /** Pièces jointes choisies dans le formulaire (facultatives). */
  fichiers?: File[];
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

      // Les pièces partent avant la demande : leur chemin contient son
      // identifiant, généré ici, et la ligne insérée les décrit d'un coup
      // (le gestionnaire n'a pas le droit de modifier sa demande ensuite).
      const demandeId = crypto.randomUUID();
      const pieces: PieceDemande[] = [];
      const rates: string[] = [];
      for (const f of demande.fichiers ?? []) {
        if (f.size > TAILLE_MAX_PIECE) {
          rates.push(f.name);
          continue;
        }
        const safe = nomFichierSansAccents(f.name).replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${uid}/${demandeId}/${Date.now()}-${safe}`;
        const { error: eUp } = await supabase.storage.from("demandes-amo").upload(path, f);
        if (eUp) {
          rates.push(f.name);
          continue;
        }
        pieces.push({
          path,
          name: f.name,
          size: f.size,
          mime: f.type || null,
          uploaded_at: new Date().toISOString(),
        });
      }
      if (rates.length > 0 && pieces.length === 0 && (demande.fichiers ?? []).length > 0) {
        throw new Error(
          `Document non déposé : ${rates.join(", ")}. Vérifiez le format et la taille (20 Mo maximum), puis réessayez.`
        );
      }

      const { data, error } = await supabase
        .from("demandes_amo")
        .insert({
          id: demandeId,
          fichiers: pieces as unknown as Tables<"demandes_amo">["fichiers"],
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
      // La demande est partie : les dépôts ratés sont signalés sans la rejouer.
      if (rates.length > 0) {
        return {
          ...data,
          _piecesRatees: rates,
        } as DemandeAmo & { _piecesRatees?: string[] };
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
