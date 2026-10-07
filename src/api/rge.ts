// Vérification RGE des entreprises (07/10/2026, demande d'Amir) - accès réseau.
// La liste des entreprises RGE de l'ADEME s'interroge directement depuis le
// navigateur (API publique, sans clé, ouverte aux autres origines) ; le
// certificat PDF de l'organisme passe par l'edge function `rge-certificat`
// (les sites des organismes refusent les appels du navigateur), puis il est
// déposé comme tout fichier du dossier : « Attestation RGE », dossier
// « Marchés de travaux », cases des checklists cochées par la propagation.
// Chaque vérification faite sur un document du dossier est tracée dans
// `verifications_rge` (0146).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/lib/database.types";
import { invaliderPieces, uploadFichierEtPropager } from "@/api/fichiers";
import { construireNomFichier, nomFichierSansAccents } from "@/lib/nommage";
import { extraireTextePdf, trouverSiret } from "@/lib/pdf/extraitDonnees";
import {
  API_RGE,
  CHAMPS_RGE,
  aujourdhui,
  chiffres,
  etablissements,
  type CertificatRge,
  type EtablissementRge,
  type LigneRge,
  type ResultatRge,
} from "@/lib/rge";

export type VerificationRge = Tables<"verifications_rge">;

async function lignesRge(params: Record<string, string>): Promise<LigneRge[]> {
  const rep = await fetch(`${API_RGE}/lines?${new URLSearchParams(params)}`).catch(() => null);
  if (!rep?.ok)
    throw new Error(
      `La liste RGE de l'ADEME ne répond pas${rep ? ` (${rep.status})` : ""} : réessayez dans un instant.`
    );
  const corps = (await rep.json()) as { results?: LigneRge[] };
  return corps.results ?? [];
}

export interface LectureRge {
  siret: string;
  /** Qualifications de l'établissement (vide : SIRET absent de la liste). */
  lignes: LigneRge[];
  /** Autres établissements RGE de la même entreprise (même SIREN). */
  autresEtablissements: EtablissementRge[];
}

/** Qualifications RGE d'un établissement, et les autres établissements RGE de
 *  la même entreprise (un devis porte souvent le SIRET du siège alors que la
 *  qualification est rattachée à une agence, ou l'inverse). */
export async function lireRge(siret: string, codePostalCopro?: string | null): Promise<LectureRge> {
  const s = chiffres(siret);
  const [lignes, memeSiren] = await Promise.all([
    lignesRge({ qs: `siret:"${s}"`, size: "1000", select: CHAMPS_RGE }),
    lignesRge({ qs: `siret:${s.slice(0, 9)}*`, collapse: "siret", size: "100", select: "siret,nom_entreprise,code_postal,commune" }),
  ]);
  return { siret: s, lignes, autresEtablissements: etablissements(memeSiren, codePostalCopro, s) };
}

export function useLectureRge(siret: string | null, codePostalCopro?: string | null) {
  const s = chiffres(siret);
  return useQuery({
    queryKey: ["rge", s, codePostalCopro ?? null],
    enabled: s.length === 14,
    staleTime: 60 * 60 * 1000, // la liste de l'ADEME change une fois par jour
    retry: 1,
    queryFn: () => lireRge(s, codePostalCopro),
  });
}

/** Recherche par nom d'entreprise (SIRET inconnu) : un établissement par SIRET,
 *  ceux du département de la copropriété d'abord. */
export async function rechercherEntreprisesRge(nom: string, codePostalCopro?: string | null): Promise<EtablissementRge[]> {
  const q = nom.trim();
  if (q.length < 2) return [];
  const lignes = await lignesRge({
    q,
    q_fields: "nom_entreprise",
    collapse: "siret",
    size: "40",
    select: "siret,nom_entreprise,code_postal,commune",
  });
  return etablissements(lignes, codePostalCopro);
}

/** SIRET annoncé dans un PDF déjà déposé (devis vérifié après coup). */
export async function siretDuFichier(storagePath: string): Promise<string | null> {
  if (!/\.pdf$/i.test(storagePath)) return null;
  const { data, error } = await supabase.storage.from("copro-files").download(storagePath);
  if (error || !data) return null;
  return trouverSiret(await extraireTextePdf(data, 6));
}

// ---------- Traçabilité (0146) ----------

export function useVerificationsRge(coproId: string | undefined) {
  return useQuery({
    queryKey: ["verifications-rge", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<VerificationRge[]> => {
      const { data, error } = await supabase
        .from("verifications_rge")
        .select("*")
        .eq("copro_id", coproId!)
        .order("verifie_le", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Dernière vérification de chaque document. */
export function derniereParFichier(verifs: VerificationRge[] | undefined): Map<string, VerificationRge> {
  const m = new Map<string, VerificationRge>();
  for (const v of verifs ?? []) if (v.fichier_id && !m.has(v.fichier_id)) m.set(v.fichier_id, v);
  return m;
}

export function useEnregistrerVerificationRge(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      fichierId: string | null;
      resultat: ResultatRge | null;
      siret: string;
      objet: string | null;
      dateDocument: string | null;
      domainesManquants: string[];
    }) => {
      const { error } = await supabase.from("verifications_rge").insert({
        copro_id: coproId,
        fichier_id: v.fichierId,
        siret: chiffres(v.siret),
        entreprise: v.resultat?.entreprise || null,
        objet: v.objet?.trim() || null,
        date_document: v.dateDocument && /^\d{4}-\d{2}-\d{2}$/.test(v.dateDocument) ? v.dateDocument : null,
        rge: !!v.resultat?.rge,
        domaines_valides: v.resultat?.domainesValides ?? [],
        domaines_manquants: v.domainesManquants,
        certificats: (v.resultat?.certificats ?? []) as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["verifications-rge", coproId] }),
  });
}

// ---------- Archivage du certificat ----------

/** Le certificat PDF de l'organisme, rapatrié par l'edge function. */
export async function telechargerCertificatRge(siret: string, url: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke("rge-certificat", { body: { siret: chiffres(siret), url } });
  if (error) {
    // message précis renvoyé par la fonction (page web, lien retiré, organisme muet…)
    const ctx = (error as { context?: Response }).context;
    const detail = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error((detail as { error?: string } | null)?.error ?? "Le certificat n'a pas pu être récupéré : ouvrez le lien.");
  }
  if (!(data instanceof Blob)) throw new Error("Le certificat n'a pas pu être récupéré : ouvrez le lien.");
  return data;
}

export const DOSSIER_ATTESTATION_RGE = "Marchés de travaux";

/** Archive le certificat dans les fichiers du dossier (type « Attestation RGE »). */
export function useArchiverCertificatRge(coproId: string, prefixe: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ siret, entreprise, certificat }: { siret: string; entreprise: string; certificat: CertificatRge }) => {
      if (!certificat.url) throw new Error("Pas de lien de certificat pour cet organisme.");
      const blob = await telechargerCertificatRge(siret, certificat.url);
      const nom = nomFichierSansAccents(
        construireNomFichier(
          { prefixe, type: "attestation_rge", objet: certificat.organisme, emetteur: entreprise || null, date: aujourdhui(), etat: null },
          "pdf"
        )
      );
      const file = new File([blob], nom, { type: "application/pdf" });
      await uploadFichierEtPropager(coproId, file, DOSSIER_ATTESTATION_RGE, undefined, "attestation_rge");
      return nom;
    },
    onSuccess: () => invaliderPieces(qc, coproId),
  });
}
