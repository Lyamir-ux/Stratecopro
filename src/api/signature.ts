// Signature électronique avancée des bulletins d'adhésion (spec + CGU v1.6).
// Deux canaux vers l'edge function `signature-flux` :
//  - authentifié (principal / AMO) : supabase.functions.invoke (JWT de session) ;
//  - public (cosignataire sans compte) : fetch avec la clé anon legacy (JWT),
//    seule acceptée par la vérification JWT des edge functions - le lien
//    tokenisé fait office d'authentification applicative.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type Bulletin = Tables<"bulletins">;
export type Signataire = Tables<"signataires">;
export type BulletinAvecSignataires = Bulletin & { signataires: Signataire[] };

export const ERREURS_SIGNATURE: Record<string, string> = {
  lien_invalide: "Ce lien de signature n'est plus valable (expiré, déjà utilisé ou inconnu).",
  cgu_requises: "Vous devez d'abord accepter les Conditions Générales d'Utilisation.",
  piece_requise: "Déposez d'abord votre pièce d'identité.",
  lecture_requise: "Lisez l'intégralité du document avant de signer.",
  deja_signe: "Ce document est déjà signé.",
  attestation_requise: "Cochez la case d'attestation pour continuer.",
  attestation_honneur_requise: "Certifiez sur l'honneur les coordonnées déclarées avant de signer.",
  type_piece_invalide: "Type de pièce d'identité non reconnu.",
  format_invalide: "Format de fichier non accepté : JPG, PNG ou PDF uniquement.",
  fichier_trop_gros: "Fichier trop volumineux (10 Mo maximum).",
  fichier_invalide: "Fichier illisible ou trop volumineux (10 Mo maximum).",
  fichier_absent: "Le fichier n'a pas été reçu - réessayez le dépôt.",
  trop_de_renvois: "Trop de codes demandés : patientez une heure ou contactez contact@strateco.fr.",
  trop_de_tentatives: "3 codes erronés : demandez un nouveau code ou contactez contact@strateco.fr.",
  code_faux: "Code incorrect - vérifiez et réessayez.",
  code_expire: "Ce code a expiré : demandez-en un nouveau.",
  code_invalide: "Saisissez les 6 chiffres du code reçu.",
  iban_invalide: "IBAN invalide - vérifiez la saisie.",
  rib_requis: "Déposez d'abord le RIB du lot.",
  document_absent: "Le document n'est pas encore disponible.",
  bulletin_verrouille: "Ce bulletin n'est plus modifiable.",
  niveau_2_sans_lecture:
    "Votre habilitation (niveau 2 - chef de projet) ne permet pas de consulter le contenu des pièces justificatives.",
};

export function messageErreurSignature(code: string | undefined): string {
  return (code && ERREURS_SIGNATURE[code]) ?? "Une erreur est survenue. Réessayez ou contactez contact@strateco.fr.";
}

type Reponse = Record<string, unknown> & { error?: string };

/** Canal authentifié (principal connecté au portail, ou AMO). */
export async function appelSignature(body: Record<string, unknown>): Promise<Reponse> {
  const { data, error } = await supabase.functions.invoke("signature-flux", { body });
  if (error) {
    // le corps d'erreur de l'edge function porte le code métier
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const parsed = await ctx.json().catch(() => null);
      if (parsed?.error) throw new Error(messageErreurSignature(parsed.error));
    }
    throw new Error(messageErreurSignature(undefined));
  }
  if ((data as Reponse)?.error) throw new Error(messageErreurSignature((data as Reponse).error));
  return data as Reponse;
}

/** Canal public (page /signature/:token, aucun compte). */
export async function appelSignaturePublique(body: Record<string, unknown>): Promise<Reponse> {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const cle = (import.meta.env.VITE_SUPABASE_FUNCTIONS_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string;
  const r = await fetch(`${url}/functions/v1/signature-flux`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}`, apikey: cle },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Reponse;
  if (!r.ok || data.error) throw new Error(messageErreurSignature(data.error));
  return data;
}

/** Dépose un fichier sur une URL d'upload signée délivrée par l'edge function. */
export async function uploadVersBucket(
  bucket: "signature-pieces" | "signature-docs",
  path: string,
  token: string,
  contenu: Blob,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, contenu, { upsert: true });
  if (error) throw new Error("Le dépôt du fichier a échoué - réessayez.");
}

// ========== Côté portail (signataire principal) ==========
// Le dossier d'adhésion interne a été retiré du portail le 22/09/2026 : plus
// aucun bulletin n'y est créé (les copropriétaires souscrivent chez la banque).
// Ce qui reste ci-dessous sert aux bulletins déjà engagés : la page publique
// `/signature/:token` les fait signer, l'espace AMO les consulte et les relance.

// ========== CGU hors adhésion : dépôt de pièces justificatives ==========
// (enquête sociale : avis d'imposition notamment). L'acceptation est
// personnelle et versionnée - une nouvelle version des CGU redemande
// l'acceptation avant tout nouveau dépôt.

export function useCguDepotPieces(cguVersion: string) {
  return useQuery({
    queryKey: ["signature", "cgu-depot", cguVersion],
    queryFn: async (): Promise<Tables<"cgu_acceptations"> | null> => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("cgu_acceptations")
        .select("*")
        .eq("user_id", uid)
        .eq("cgu_version", cguVersion)
        .eq("contexte", "depot_pieces")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAccepterCguDepot(cguVersion: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { coproprietaireId: string; infoAvisImposition: boolean }) => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Session expirée");
      const { error } = await supabase.from("cgu_acceptations").insert({
        user_id: uid,
        coproprietaire_id: input.coproprietaireId,
        cgu_version: cguVersion,
        contexte: "depot_pieces",
        info_avis_imposition: input.infoAvisImposition,
      });
      // déjà acceptées (double clic, autre onglet) : pas une erreur
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["signature", "cgu-depot", cguVersion] }),
  });
}

// ========== Côté AMO ==========

export function useBulletinsCopro(coproId: string | undefined) {
  return useQuery({
    queryKey: ["signature", "bulletins-copro", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<BulletinAvecSignataires[]> => {
      const { data, error } = await supabase
        .from("bulletins")
        .select("*, signataires(*)")
        .eq("copro_id", coproId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as BulletinAvecSignataires[];
    },
  });
}

export function useRelancerSignataire() {
  return useMutation({
    mutationFn: async (signataireId: string) => appelSignature({ action: "relancer", signataire_id: signataireId }),
  });
}

export function useMarquerInstruction(coproId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bulletinId: string;
      notificationAnahLe?: string | null;
      transmissionBanqueLe?: string | null;
      ecoPtzDemande?: boolean;
    }) =>
      appelSignature({
        action: "amo_marquer",
        bulletin_id: input.bulletinId,
        ...(input.notificationAnahLe !== undefined ? { notification_anah_le: input.notificationAnahLe } : {}),
        ...(input.transmissionBanqueLe !== undefined ? { transmission_banque_le: input.transmissionBanqueLe } : {}),
        ...(input.ecoPtzDemande !== undefined ? { eco_ptz_demande: input.ecoPtzDemande } : {}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["signature", "bulletins-copro", coproId] }),
  });
}

/** Ouvre un document du module dans un nouvel onglet (URL signée 60 s). */
export async function ouvrirDocumentSignature(body: Record<string, unknown>): Promise<void> {
  const r = await appelSignature(body);
  if (typeof r.url === "string") window.open(r.url, "_blank");
}

/** Entretien quotidien (relances, expirations, purge) - meilleur effort, une
 *  fois par jour au chargement de l'app AMO. */
export async function declencherSignatureCron(): Promise<void> {
  const cle = "signature-cron-dernier";
  const jour = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(cle) === jour) return;
    localStorage.setItem(cle, jour);
    await supabase.functions.invoke("signature-cron", { body: {} });
  } catch {
    /* entretien facultatif : repartira au prochain chargement */
  }
}
