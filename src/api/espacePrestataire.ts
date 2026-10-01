// Espace prestataire (MOE & autres intervenants) - data layer.
// Tout est filtré par RLS : le prestataire connecté ne voit que les
// consultations EN LIGNE de ses métiers (+ celles où il a candidaté),
// ses propres candidatures, et - uniquement s'il est une MOE RETENUE -
// la fiche et les bâtiments des copropriétés de ses projets.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import type { Tables } from "@/lib/database.types";
import { consultationProposee } from "@/lib/departements";

export type CoproPublic = Pick<
  Tables<"coproprietes">,
  "id" | "name" | "adresse" | "city" | "code_postal" | "phase" | "fragile"
>;

export type ConsultationPresta = Tables<"consultations"> & {
  copro: CoproPublic | null;
  maCandidature: Tables<"candidatures"> | null;
  docs: Tables<"consultation_docs">[];
  questions: Tables<"consultation_questions">[];
};

export type CandidaturePresta = Tables<"candidatures"> & {
  consultation: (Tables<"consultations"> & { copro: CoproPublic | null }) | null;
};

const COPRO_COLS = "id, name, adresse, city, code_postal, phase, fragile";
// Lien candidature -> consultation : depuis 0109, consultations.analyse_candidature_id
// relie aussi les deux tables dans l'autre sens ; sans ce nom de clé, l'API
// refuse l'imbrication (erreur 300, « more than one relationship »).
const LIEN_CANDIDATURE = "candidatures_consultation_id_fkey";

/** Fiche entreprise du prestataire connecté (RLS : la sienne uniquement).
 *  Désactivé pour l'AMO (qui voit toutes les entreprises → choisit un aperçu). */
export function useMonPrestataire(enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["mon-prestataire", session?.user.id],
    enabled: !!session && enabled,
    queryFn: async (): Promise<Tables<"prestataires"> | null> => {
      const { data, error } = await supabase.from("prestataires").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Consultations visibles pour une entreprise : en ligne sur ses prestations
 *  et ses départements, sauf si elle a demandé à ne pas être consultée (0122),
 *  + celles où elle a candidaté. Pour les prestations, le filtre client
 *  reproduit la RLS du prestataire - nécessaire quand un AMO consulte l'espace
 *  en aperçu (sa RLS à lui renvoie tout) ; départements et « Ne pas
 *  consulter » ne sont filtrés qu'ici. Consultation restreinte (0125) : aux
 *  seules entreprises choisies par l'équipe (RLS comprise), départements
 *  ignorés. Filtre posé en `select` : il suit la fiche dès qu'elle change,
 *  sans recharger la liste. */
export function useConsultationsPresta(presta: Tables<"prestataires">) {
  return useQuery({
    queryKey: ["presta-consultations", presta.id],
    select: (liste: ConsultationPresta[]) =>
      liste.filter((c) => c.maCandidature || consultationProposee(presta, c)),
    queryFn: async (): Promise<ConsultationPresta[]> => {
      const { data, error } = await supabase
        .from("consultations")
        .select(`*, coproprietes(${COPRO_COLS}), candidatures!${LIEN_CANDIDATURE}(*), consultation_docs(*), consultation_questions(*)`)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((c) => {
          const { coproprietes, candidatures, consultation_docs, consultation_questions, ...rest } = c as typeof c & {
            coproprietes: CoproPublic | null;
            candidatures: Tables<"candidatures">[];
            consultation_docs: Tables<"consultation_docs">[];
            consultation_questions: Tables<"consultation_questions">[];
          };
          return {
            ...rest,
            copro: coproprietes,
            // une candidature retirée ne bloque pas une nouvelle candidature
            maCandidature:
              (candidatures ?? []).find((k) => k.prestataire_id === presta.id && !k.retrait_at) ?? null,
            docs: consultation_docs ?? [],
            questions: (consultation_questions ?? []).sort((a, b) => (a.asked_at < b.asked_at ? -1 : 1)),
          };
        });
    },
  });
}

/** Historique des candidatures d'une entreprise. */
export function useMesCandidatures(prestaId: string) {
  return useQuery({
    queryKey: ["presta-candidatures", prestaId],
    queryFn: async (): Promise<CandidaturePresta[]> => {
      const { data, error } = await supabase
        .from("candidatures")
        .select(`*, consultations!${LIEN_CANDIDATURE}(*, coproprietes(${COPRO_COLS}))`)
        .eq("prestataire_id", prestaId)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => {
        const { consultations, ...rest } = c as typeof c & {
          consultations:
            | (Tables<"consultations"> & { coproprietes: CoproPublic | null })
            | null;
        };
        return {
          ...rest,
          consultation: consultations
            ? { ...consultations, copro: consultations.coproprietes ?? null }
            : null,
        };
      });
    },
  });
}

/** Trace la récupération du dossier de consultation par le prestataire
 *  (alimente l'onglet « État de la consultation » côté AMO). Meilleur effort :
 *  l'échec est ignoré - l'aperçu AMO d'un espace prestataire, notamment,
 *  n'a pas le droit d'écrire cette trace (et ne doit pas la fausser). */
export async function marquerConsultationRecuperee(consultationId: string, prestataireId: string): Promise<void> {
  try {
    await supabase.from("consultation_acces").upsert(
      { consultation_id: consultationId, prestataire_id: prestataireId, last_at: new Date().toISOString() },
      { onConflict: "consultation_id,prestataire_id" }
    );
  } catch {
    /* trace facultative */
  }
}

/** Question posée à l'AMO sur une consultation avant de candidater.
 *  La réponse (visible de tous les candidats) arrive depuis /consultations. */
export function usePoserQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consultationId, prestataireId, question }: {
      consultationId: string;
      prestataireId: string;
      question: string;
    }) => {
      const { error } = await supabase.from("consultation_questions").insert({
        consultation_id: consultationId,
        prestataire_id: prestataireId,
        question: question.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-consultations"] }),
  });
}

/** Détail tarifaire d'une offre MOE ; `options` suit les cases cochées à la
 *  publication de la consultation. Le PRO/DCE et le suivi de chantier se
 *  chiffrent au forfait (€ HT) ou en pourcentage du montant des travaux -
 *  la valeur est dans l'unité du mode. */
export interface TarifsMoe {
  diag_avp: number | null;
  pro_dce: number | null;
  pro_dce_mode: "forfait" | "pourcentage";
  chantier: number | null;
  chantier_mode: "forfait" | "pourcentage";
  options: Record<string, number>;
}

/** Détail tarifaire des autres missions : test d'étanchéité à l'air
 *  (avant / après travaux), CT / SPS (conception / réalisation) et, depuis
 *  0110, PPPT + DPE collectif (prix de chaque prestation et délai de
 *  réalisation en semaines à compter de la commande), € HT. */
export interface TarifsSimples {
  etancheite_avant?: number | null;
  etancheite_apres?: number | null;
  conception?: number | null;
  realisation?: number | null;
  pppt?: number | null;
  dpe?: number | null;
  delai_pppt_semaines?: number | null;
  delai_dpe_semaines?: number | null;
}

/** Colonnes de l'offre (montant, décomposition, note) - communes au dépôt et
 *  à la modification. */
function champsOffre(
  montant: number | null,
  message: string,
  tarifs: TarifsMoe | null,
  tarifsSimples: TarifsSimples | null
) {
  return {
    montant,
    message: message.trim() || null,
    tarif_diag_avp: tarifs?.diag_avp ?? null,
    tarif_pro_dce: tarifs?.pro_dce ?? null,
    tarif_pro_dce_mode: tarifs?.pro_dce_mode ?? "forfait",
    tarif_chantier: tarifs?.chantier ?? null,
    tarif_chantier_mode: tarifs?.chantier_mode ?? "forfait",
    tarif_options: tarifs && Object.keys(tarifs.options).length > 0 ? tarifs.options : null,
    tarif_etancheite_avant: tarifsSimples?.etancheite_avant ?? null,
    tarif_etancheite_apres: tarifsSimples?.etancheite_apres ?? null,
    tarif_conception: tarifsSimples?.conception ?? null,
    tarif_realisation: tarifsSimples?.realisation ?? null,
    tarif_pppt: tarifsSimples?.pppt ?? null,
    tarif_dpe: tarifsSimples?.dpe ?? null,
    delai_pppt_semaines: tarifsSimples?.delai_pppt_semaines ?? null,
    delai_dpe_semaines: tarifsSimples?.delai_dpe_semaines ?? null,
  };
}

/** Pièce jointe d'une offre : bucket privé, dossier du compte connecté. */
async function deposerFichierOffre(uid: string, consultationId: string, file: File) {
  const path = `${uid}/${consultationId}-${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from("offres-presta").upload(path, file);
  if (error) throw error;
  return { fichier_path: path, fichier_name: file.name };
}

/** Dépôt d'offre : pièce jointe optionnelle (bucket privé) + candidature. */
export function usePostuler() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({
      consultation,
      prestataire,
      montant,
      message,
      file,
      tarifs,
      tarifsSimples,
    }: {
      consultation: ConsultationPresta;
      prestataire: Tables<"prestataires">;
      montant: number | null;
      message: string;
      file: File | null;
      tarifs: TarifsMoe | null;
      tarifsSimples: TarifsSimples | null;
    }) => {
      if (!session) throw new Error("Session expirée");
      const fichier = file
        ? await deposerFichierOffre(session.user.id, consultation.id, file)
        : { fichier_path: null, fichier_name: null };
      const { error } = await supabase.from("candidatures").insert({
        consultation_id: consultation.id,
        prestataire_id: prestataire.id,
        org_name: prestataire.raison_sociale,
        ...champsOffre(montant, message, tarifs, tarifsSimples),
        ...fichier,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["presta-consultations"] });
      void qc.invalidateQueries({ queryKey: ["presta-candidatures"] });
    },
  });
}

/** Modification d'une offre encore à l'étude (remarque d'Amir du 01/10/2026,
 *  0124) : mêmes conditions que le retrait - offre « reçue », consultation en
 *  ligne -, vérifiées par la base, qui date la modification (modifiee_le).
 *  `file` remplace la pièce jointe, `retirerFichier` la supprime ; l'ancien
 *  fichier n'est effacé qu'une fois l'offre enregistrée. */
export function useModifierCandidature() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({
      cand,
      montant,
      message,
      file,
      retirerFichier,
      tarifs,
      tarifsSimples,
    }: {
      cand: Tables<"candidatures">;
      montant: number | null;
      message: string;
      file: File | null;
      retirerFichier: boolean;
      tarifs: TarifsMoe | null;
      tarifsSimples: TarifsSimples | null;
    }) => {
      if (!session) throw new Error("Session expirée");
      const fichier = file
        ? await deposerFichierOffre(session.user.id, cand.consultation_id, file)
        : retirerFichier
          ? { fichier_path: null, fichier_name: null }
          : {};
      const { error } = await supabase
        .from("candidatures")
        .update({ ...champsOffre(montant, message, tarifs, tarifsSimples), ...fichier })
        .eq("id", cand.id);
      if (error) {
        if (file && "fichier_path" in fichier && fichier.fichier_path) {
          await supabase.storage.from("offres-presta").remove([fichier.fichier_path]).catch(() => undefined);
        }
        throw error;
      }
      if (cand.fichier_path && (file || retirerFichier)) {
        await supabase.storage.from("offres-presta").remove([cand.fichier_path]).catch(() => undefined);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["presta-consultations"] });
      void qc.invalidateQueries({ queryKey: ["presta-candidatures"] });
    },
  });
}

/** Retrait motivé d'une candidature encore à l'étude (consultation en ligne,
 *  offre « reçue ») - retrait tracé (corbeille des deux côtés), l'offre jointe
 *  reste consultable par l'équipe AMO. Re-candidature possible tant que la
 *  consultation est en ligne. */
export function useRetirerCandidature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cand, motif }: { cand: Tables<"candidatures">; motif: string }) => {
      const { error } = await supabase
        .from("candidatures")
        .update({ retrait_at: new Date().toISOString(), retrait_motif: motif.trim() || null })
        .eq("id", cand.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["presta-consultations"] });
      void qc.invalidateQueries({ queryKey: ["presta-candidatures"] });
      // le projet lié disparaît aussi de « Mes projets » (cache aligné)
      void qc.invalidateQueries({ queryKey: ["presta-projets-moe"] });
    },
  });
}

/** Accusé de lecture des décisions - posé à l'ouverture de « Mes candidatures »,
 *  éteint la pastille « sélectionné / refusé » du menu. */
export function useMarquerDecisionsVues(prestaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("candidatures")
        .update({ decision_vue_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-candidatures", prestaId] }),
  });
}

/** Le prestataire retenu confirme son engagement sur l'opération - pour une
 *  MOE, le projet passe alors dans « Mes projets ». */
export function useConfirmerEngagement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidatureId: string) => {
      const { error } = await supabase
        .from("candidatures")
        .update({ engagement_at: new Date().toISOString() })
        .eq("id", candidatureId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["presta-candidatures"] });
      void qc.invalidateQueries({ queryKey: ["presta-projets-moe"] });
    },
  });
}

// ========== Fiche entreprise (section « Mon entreprise ») ==========

/** Champs éditables par le prestataire : coordonnées, et depuis 0122 ses
 *  prestations, ses départements et « Ne pas consulter » - le référencement
 *  et la raison sociale restent pilotés par l'AMO (trigger côté base). */
export function useMajMonPrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<
          Tables<"prestataires">,
          | "email"
          | "emails_secondaires"
          | "telephone"
          | "adresse"
          | "ville"
          | "code_postal"
          | "site_web"
          | "siret"
          | "logo_path"
          | "contact_nom"
          | "types"
          | "departements"
          | "ne_pas_consulter"
        >
      >;
    }) => {
      const { error } = await supabase.from("prestataires").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, { patch }) => {
      void qc.invalidateQueries({ queryKey: ["mon-prestataire"] });
      void qc.invalidateQueries({ queryKey: ["prestataires"] });
      // nouvelle prestation : la RLS ouvre d'autres consultations, la liste se recharge
      if (patch.types) void qc.invalidateQueries({ queryKey: ["presta-consultations"] });
    },
  });
}

export function useContactsPresta(prestaId: string) {
  return useQuery({
    queryKey: ["presta-contacts", prestaId],
    queryFn: async (): Promise<Tables<"prestataire_contacts">[]> => {
      const { data, error } = await supabase
        .from("prestataire_contacts")
        .select("*")
        .eq("prestataire_id", prestaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddContactPresta(prestaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nom: string; role: string; email: string; telephone: string }) => {
      const { error } = await supabase.from("prestataire_contacts").insert({
        prestataire_id: prestaId,
        nom: input.nom.trim(),
        role: input.role.trim() || null,
        email: input.email.trim() || null,
        telephone: input.telephone.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-contacts", prestaId] }),
  });
}

export function useDeleteContactPresta(prestaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prestataire_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-contacts", prestaId] }),
  });
}

export function useDocsPresta(prestaId: string) {
  return useQuery({
    queryKey: ["presta-docs", prestaId],
    queryFn: async (): Promise<Tables<"prestataire_docs">[]> => {
      const { data, error } = await supabase
        .from("prestataire_docs")
        .select("*")
        .eq("prestataire_id", prestaId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Dossier de dépôt dans presta-docs : celui du compte rattaché à l'entreprise
 *  (le prestataire garde ainsi l'accès à ses fichiers même déposés en aperçu AMO). */
const dossierPresta = (presta: Tables<"prestataires">, sessionUid: string) =>
  presta.user_id ?? sessionUid;

/** Dépôt d'un document de certification (RGE, qualification, assurance…),
 *  avec sa date de fin de validité éventuelle (rappel automatique avant échéance). */
export function useUploadDocPresta(presta: Tables<"prestataires">) {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ file, expireLe }: { file: File; expireLe: string | null }) => {
      if (!session) throw new Error("Session expirée");
      const path = `${dossierPresta(presta, session.user.id)}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("presta-docs").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("prestataire_docs").insert({
        prestataire_id: presta.id,
        path,
        name: file.name,
        size: file.size,
        expire_le: expireLe,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-docs", presta.id] }),
  });
}

/** Mise à jour de la fin de validité d'un document - réarme le rappel e-mail. */
export function useMajDocPresta(prestaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expireLe }: { id: string; expireLe: string | null }) => {
      const { error } = await supabase
        .from("prestataire_docs")
        .update({ expire_le: expireLe, rappel_envoye_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-docs", prestaId] }),
  });
}

export function useDeleteDocPresta(prestaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Tables<"prestataire_docs">) => {
      await supabase.storage.from("presta-docs").remove([doc.path]).catch(() => undefined);
      const { error } = await supabase.from("prestataire_docs").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-docs", prestaId] }),
  });
}

/** Ouvre un document du bucket privé presta-docs (URL signée 60 s). */
export async function ouvrirDocPresta(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from("presta-docs").createSignedUrl(path, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank");
}

/** Dépôt du logo de l'entreprise (remplace l'ancien) + mise à jour de la fiche. */
export function useUploadLogoPresta(presta: Tables<"prestataires">) {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!session) throw new Error("Session expirée");
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${dossierPresta(presta, session.user.id)}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("presta-docs").upload(path, file);
      if (upErr) throw upErr;
      if (presta.logo_path) {
        await supabase.storage.from("presta-docs").remove([presta.logo_path]).catch(() => undefined);
      }
      const { error } = await supabase.from("prestataires").update({ logo_path: path }).eq("id", presta.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["mon-prestataire"] });
      void qc.invalidateQueries({ queryKey: ["prestataires"] });
      void qc.invalidateQueries({ queryKey: ["presta-logo"] });
    },
  });
}

/** URL signée (5 min) du logo de l'entreprise. */
export function useLogoPresta(logoPath: string | null) {
  return useQuery({
    queryKey: ["presta-logo", logoPath],
    enabled: !!logoPath,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage.from("presta-docs").createSignedUrl(logoPath!, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export type ProjetMoe = {
  // null : aucune consultation MOE retenue dans le logiciel sur ce dossier
  candidature: Tables<"candidatures"> | null;
  consultation: Tables<"consultations"> | null;
  // l'entreprise est le maître d'œuvre saisi sur le dossier (coproprietes.maitre_oeuvre)
  designe: boolean;
  copro: CoproPublic;
  batiments: Tables<"batiments">[];
};

/** Projets montrés dans « Mes projets » (et comptés dans la bulle du menu) :
 *  dossiers où l'entreprise est le maître d'œuvre saisi, et candidatures
 *  retenues dont l'engagement est confirmé. */
export const projetsEnCours = (projets: ProjetMoe[]): ProjetMoe[] =>
  projets.filter((p) => p.designe || p.candidature?.engagement_at);

/** Projets d'une MOE : consultations MOE retenues et dossiers où elle est le
 *  maître d'œuvre saisi (0119) - copros accessibles en lecture (fiche + bâtiments). */
export function useMesProjetsMoe(enabled: boolean, prestaId: string) {
  return useQuery({
    queryKey: ["presta-projets-moe", prestaId],
    enabled,
    queryFn: async (): Promise<ProjetMoe[]> => {
      const [cands, designes] = await Promise.all([
        supabase
          .from("candidatures")
          .select(`*, consultations!${LIEN_CANDIDATURE}(*, coproprietes(${COPRO_COLS}))`)
          .eq("prestataire_id", prestaId)
          .eq("statut", "retenue"),
        supabase.rpc("copros_moe_designe", { p_prestataire_id: prestaId }),
      ]);
      if (cands.error) throw cands.error;
      if (designes.error) throw designes.error;
      const idsDesignes = new Set(designes.data ?? []);

      const rows: Omit<ProjetMoe, "batiments">[] = [];
      for (const c of cands.data ?? []) {
        const { consultations, ...cand } = c as typeof c & {
          consultations:
            | (Tables<"consultations"> & { coproprietes: CoproPublic | null })
            | null;
        };
        if (consultations?.type === "moe" && consultations.coproprietes) {
          const { coproprietes, ...cs } = consultations;
          rows.push({
            candidature: cand as Tables<"candidatures">,
            consultation: cs as Tables<"consultations">,
            designe: idsDesignes.has(coproprietes.id),
            copro: coproprietes,
          });
        }
      }

      // dossiers désignés sans consultation retenue : fiche seule
      const aCharger = [...idsDesignes].filter((id) => !rows.some((r) => r.copro.id === id));
      if (aCharger.length > 0) {
        const { data: copros, error: cErr } = await supabase
          .from("coproprietes")
          .select(COPRO_COLS)
          .in("id", aCharger);
        if (cErr) throw cErr;
        for (const copro of copros ?? []) {
          rows.push({ candidature: null, consultation: null, designe: true, copro });
        }
      }

      if (rows.length === 0) return [];
      rows.sort((a, b) => a.copro.name.localeCompare(b.copro.name, "fr", { numeric: true }));
      const { data: bats, error: bErr } = await supabase
        .from("batiments")
        .select("*")
        .in("copro_id", rows.map((r) => r.copro.id))
        .order("position");
      if (bErr) throw bErr;
      return rows.map((r) => ({
        ...r,
        batiments: (bats ?? []).filter((b) => b.copro_id === r.copro.id),
      }));
    },
  });
}

// ========== Documents de projet (« Mes projets ») ==========
// Fichiers déposés par l'entreprise retenue sur une opération (devis,
// plannings, PV…) - visibles de l'équipe AMO dans l'onglet Prestataires
// du dossier. Bucket presta-docs (même dossier que les certifications).

export function useProjetDocs(prestaId: string) {
  return useQuery({
    queryKey: ["projet-docs", prestaId],
    queryFn: async (): Promise<Tables<"projet_docs">[]> => {
      const { data, error } = await supabase
        .from("projet_docs")
        .select("*")
        .eq("prestataire_id", prestaId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUploadProjetDoc(presta: Tables<"prestataires">) {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ coproId, file }: { coproId: string; file: File }) => {
      if (!session) throw new Error("Session expirée");
      const path = `${dossierPresta(presta, session.user.id)}/projet-${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("presta-docs").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("projet_docs").insert({
        copro_id: coproId,
        prestataire_id: presta.id,
        path,
        name: file.name,
        size: file.size,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projet-docs"] });
      void qc.invalidateQueries({ queryKey: ["projet-docs-copro"] });
    },
  });
}

export function useDeleteProjetDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Tables<"projet_docs">) => {
      await supabase.storage.from("presta-docs").remove([doc.path]).catch(() => undefined);
      const { error } = await supabase.from("projet_docs").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projet-docs"] });
      void qc.invalidateQueries({ queryKey: ["projet-docs-copro"] });
    },
  });
}

export type ProjetDocCopro = Tables<"projet_docs"> & {
  prestataire: { raison_sociale: string } | null;
};

/** Côté AMO : documents déposés par les prestataires d'une copro. */
export function useProjetDocsCopro(coproId: string) {
  return useQuery({
    queryKey: ["projet-docs-copro", coproId],
    queryFn: async (): Promise<ProjetDocCopro[]> => {
      const { data, error } = await supabase
        .from("projet_docs")
        .select("*, prestataires(raison_sociale)")
        .eq("copro_id", coproId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((d) => {
        const { prestataires, ...rest } = d as typeof d & {
          prestataires: { raison_sociale: string } | null;
        };
        return { ...rest, prestataire: prestataires };
      });
    },
  });
}
