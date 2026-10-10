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
  trop_de_renvois: "Trop de codes demandés : patientez une heure ou contactez admin@strateco.fr.",
  trop_de_tentatives: "3 codes erronés : demandez un nouveau code ou contactez admin@strateco.fr.",
  code_faux: "Code incorrect - vérifiez et réessayez.",
  code_expire: "Ce code a expiré : demandez-en un nouveau.",
  code_invalide: "Saisissez les 6 chiffres du code reçu.",
  iban_invalide: "IBAN invalide - vérifiez la saisie.",
  rib_requis: "Déposez d'abord le RIB du lot.",
  mandat_requis: "Le mandat SEPA n'est pas encore prêt : déposez à nouveau le RIB pour le générer.",
  lecture_mandat_requise: "Lisez l'intégralité du mandat SEPA avant de signer.",
  document_absent: "Le document n'est pas encore disponible.",
  bulletin_verrouille: "Ce bulletin n'est plus modifiable.",
  niveau_2_sans_lecture:
    "Votre habilitation (niveau 2 - chef de projet) ne permet pas de consulter le contenu des pièces justificatives.",
  // fiche « État de la copropriété » (signature-fiche-etat)
  fiche_absente: "La fiche État n'est pas encore enregistrée.",
  fiche_non_validee: "La fiche doit d'abord être validée par Strat Eco.",
  email_president_invalide: "Renseignez un courriel valide pour le président du conseil syndical.",
  email_compte_absent: "Votre compte n'a pas d'adresse e-mail : impossible d'envoyer le code.",
  interdit: "Action non autorisée sur ce dossier.",
  envoi_echec: "L'e-mail n'a pas pu être envoyé. Réessayez dans quelques minutes ou contactez admin@strateco.fr.",
  // pièces de la signature : validation et remplacement (0155)
  pas_encore_signe: "Cette pièce se remplace une fois le bulletin signé ; avant, elle se dépose dans le parcours de signature.",
  pieces_purgees: "Les pièces de ce dossier ont été supprimées après son instruction : elles ne se remplacent plus.",
  signataire_introuvable: "Signataire introuvable sur ce bulletin.",
  qualification_inconnue: "Qualification inconnue.",
  motif_requis: "Précisez le motif du refus : il est communiqué par e-mail.",
  scellement_echec: "Le nouveau mandat n'a pas pu être scellé. Réessayez ou contactez admin@strateco.fr.",
  maj_echec: "L'enregistrement a échoué. Réessayez.",
  chemin_invalide: "Le dépôt du fichier a échoué - réessayez.",
};

export function messageErreurSignature(code: string | undefined): string {
  return (code && ERREURS_SIGNATURE[code]) ?? "Une erreur est survenue. Réessayez ou contactez admin@strateco.fr.";
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
// Dossier d'adhésion du portail (retiré le 22/09/2026, rétabli le 08/10/2026
// pour les copropriétés sans lien de souscription de la banque) : bulletin
// pré-rempli et mandat SEPA, signés avec le même code par le principal.

export function useMesBulletins(coproprietaireId: string | undefined) {
  return useQuery({
    queryKey: ["signature", "mes-bulletins", coproprietaireId],
    enabled: !!coproprietaireId,
    queryFn: async (): Promise<BulletinAvecSignataires[]> => {
      const { data, error } = await supabase
        .from("bulletins")
        .select("*, signataires(*)")
        .eq("coproprietaire_id", coproprietaireId!)
        .neq("statut", "annule")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as BulletinAvecSignataires[];
    },
  });
}

export interface CosignataireDeclare {
  civilite: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  adresse_ligne1: string;
  code_postal: string;
  ville: string;
  date_naissance: string;
  lieu_naissance: string;
}

/** Crée un bulletin + ses signataires (principal en ordre 1) - RLS brouillon. */
export async function creerBulletin(input: {
  coproId: string;
  coproprietaireId: string;
  adhesionId: string | null;
  lotId: string | null;
  lotReference: string;
  tantiemes: number | null;
  cguVersion: string;
  principal: { nom: string; prenom: string; email: string; telephone: string };
  cosignataires: CosignataireDeclare[];
}): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new Error("Session expirée");
  const { data: bul, error } = await supabase
    .from("bulletins")
    .insert({
      copro_id: input.coproId,
      coproprietaire_id: input.coproprietaireId,
      adhesion_id: input.adhesionId,
      lot_id: input.lotId,
      lot_reference: input.lotReference,
      tantiemes: input.tantiemes,
      cgu_version: input.cguVersion,
      cree_par: uid,
    })
    .select("id")
    .single();
  if (error) throw error;
  const rows = [
    {
      bulletin_id: bul.id,
      role: "principal" as const,
      ordre: 1,
      nom: input.principal.nom,
      prenom: input.principal.prenom,
      email: input.principal.email,
      telephone: input.principal.telephone,
    },
    ...input.cosignataires.map((c, i) => ({
      bulletin_id: bul.id,
      role: "cosignataire" as const,
      ordre: i + 2,
      civilite: c.civilite || null,
      nom: c.nom,
      prenom: c.prenom,
      email: c.email,
      telephone: c.telephone,
      adresse_ligne1: c.adresse_ligne1 || null,
      code_postal: c.code_postal || null,
      ville: c.ville || null,
      date_naissance: c.date_naissance || null,
      lieu_naissance: c.lieu_naissance || null,
    })),
  ];
  const { error: eSig } = await supabase.from("signataires").insert(rows);
  if (eSig) {
    await supabase.from("bulletins").delete().eq("id", bul.id);
    if (eSig.code === "23505") {
      throw new Error(
        "Deux signataires d'un même bulletin ne peuvent pas partager le même e-mail ou le même téléphone.",
      );
    }
    throw eSig;
  }
  await appelSignature({ action: "principal_initialiser", bulletin_id: bul.id });
  return bul.id;
}

/** Supprime les brouillons de bulletins (reprise du parcours à zéro). */
export async function supprimerBrouillons(coproprietaireId: string): Promise<void> {
  const { error } = await supabase
    .from("bulletins")
    .delete()
    .eq("coproprietaire_id", coproprietaireId)
    .eq("statut", "brouillon");
  if (error) throw error;
}

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

// ========== Pièces de la signature : consultation, remplacement, validation (0155) ==========
// Retour de A CHELGHAM du 09/10/2026 : la pièce d'identité de chaque signataire et le
// RIB se consultent et se remplacent depuis le portail, et sont validés par l'AMO.

const TYPES_APERCU: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Clé d'aperçu d'une pièce de la signature, passée à ApercuDocument comme « path ». */
export const clePieceSignature = (bulletinId: string, quoi: "piece" | "rib", signataireId?: string | null) =>
  [bulletinId, quoi, signataireId ?? ""].join("|");

async function blobPieceSignature(cle: string, amo: boolean): Promise<{ blob: Blob; ext: string }> {
  const [bulletinId, quoi, signataireId] = cle.split("|");
  const r = amo
    ? await appelSignature({ action: "amo_piece_url", bulletin_id: bulletinId, signataire_id: signataireId || undefined, quoi })
    : await appelSignature({ action: "principal_piece_url", bulletin_id: bulletinId, signataire_id: signataireId || undefined, quoi });
  const url = r.url as string;
  const ext = ((r.ext as string | undefined) ?? new URL(url).pathname.split(".").pop() ?? "").toLowerCase();
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error("Document indisponible");
  return { blob: await reponse.blob(), ext };
}

/**
 * Aperçu d'une pièce de la signature sans téléchargement : récupérée en mémoire et
 * affichée par un lien « blob: » typé (PDF ou image seulement, jamais SVG ni HTML :
 * la pièce vient d'un signataire). Variante AMO : consultation journalisée, niveau 1.
 */
export async function urlApercuPieceSignature(cle: string): Promise<string> {
  const { blob, ext } = await blobPieceSignature(cle, false);
  const type = TYPES_APERCU[ext];
  if (!type) throw new Error("Format non affichable");
  return URL.createObjectURL(new Blob([blob], { type }));
}
export async function urlApercuPieceSignatureAmo(cle: string): Promise<string> {
  const { blob, ext } = await blobPieceSignature(cle, true);
  const type = TYPES_APERCU[ext];
  if (!type) throw new Error("Format non affichable");
  return URL.createObjectURL(new Blob([blob], { type }));
}

/** Télécharge une pièce de la signature sous un nom lisible. */
export async function telechargerPieceSignature(cle: string, nom: string, amo = false): Promise<void> {
  const { blob, ext } = await blobPieceSignature(cle, amo);
  const lien = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = lien;
  a.download = /\.[a-z0-9]+$/i.test(nom) ? nom : `${nom}.${ext || "pdf"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(lien), 10_000);
}

/** Remplace la pièce d'identité d'un signataire sur chacun de ses bulletins signés. */
export async function remplacerPieceIdentite(input: {
  cibles: { bulletinId: string; signataireId: string | null }[];
  typePiece: string;
  piece: { blob: Blob; ext: string };
}): Promise<void> {
  for (const c of input.cibles) {
    const up = await appelSignature({
      action: "principal_piece_remplacer_upload", bulletin_id: c.bulletinId, signataire_id: c.signataireId, ext: input.piece.ext,
    });
    await uploadVersBucket("signature-pieces", up.path as string, up.token as string, input.piece.blob);
    await appelSignature({
      action: "principal_piece_remplacer",
      bulletin_id: c.bulletinId,
      signataire_id: c.signataireId,
      path: up.path,
      type_piece: input.typePiece,
      attestation: true,
    });
  }
}

/**
 * Remplace le RIB de chaque bulletin signé. Même compte : c'est fait. Autre compte :
 * renvoie les bulletins qui attendent un nouveau mandat SEPA à signer.
 */
export async function remplacerRib(input: {
  bulletinIds: string[];
  fichier: Blob;
  ext: string;
  iban: string;
}): Promise<string[]> {
  const aSigner: string[] = [];
  for (const id of input.bulletinIds) {
    const up = await appelSignature({ action: "principal_rib_upload", bulletin_id: id, ext: input.ext });
    await uploadVersBucket("signature-pieces", up.path as string, up.token as string, input.fichier);
    const r = await appelSignature({ action: "principal_rib_remplacer", bulletin_id: id, path: up.path, iban: input.iban });
    if (r.nouveau_mandat) aSigner.push(id);
  }
  return aSigner;
}

/** Dépose le nouveau mandat SEPA pré-rempli d'un changement de compte. */
export async function deposerNouveauMandat(bulletinId: string, mandat: Blob): Promise<void> {
  const up = await appelSignature({ action: "principal_mandat_nouveau_upload", bulletin_id: bulletinId });
  await uploadVersBucket("signature-docs", up.path as string, up.token as string, mandat);
  await appelSignature({ action: "principal_mandat_nouveau_confirmer", bulletin_id: bulletinId });
}

/** Formulaire d'adhésion d'un bulletin (nom et adresse du nouveau mandat SEPA). */
export function useFormulaireAdhesion(adhesionId: string | null | undefined) {
  return useQuery({
    queryKey: ["signature", "formulaire-adhesion", adhesionId],
    enabled: !!adhesionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("adhesions_pret").select("form").eq("id", adhesionId!).maybeSingle();
      if (error) throw error;
      return (data?.form ?? null) as Record<string, unknown> | null;
    },
  });
}

/** Pièce de la signature en attente de validation, pour la file « Vos tâches » (niveau 1). */
export interface PieceSignatureAVerifier {
  quoi: "piece" | "rib";
  bulletinId: string;
  signataireId: string | null;
  coproId: string;
  coproNom: string;
  coproprietaireId: string;
  lot: string;
  libelle: string;
  path: string | null;
  remplaceeLe: string | null;
}

export function usePiecesSignatureAVerifier(actif: boolean) {
  return useQuery({
    queryKey: ["signature", "pieces-a-verifier"],
    enabled: actif,
    queryFn: async (): Promise<PieceSignatureAVerifier[]> => {
      type B = { id: string; copro_id: string; coproprietaire_id: string; lot_reference: string; statut: string; purge_effectuee_le: string | null; coproprietes: { name: string } | null };
      const [sigs, ribs] = await Promise.all([
        supabase
          .from("signataires")
          .select("id, prenom, nom, role, piece_identite_path, piece_remplacee_le, bulletins!inner(id, copro_id, coproprietaire_id, lot_reference, statut, purge_effectuee_le, coproprietes(name))")
          .eq("piece_statut", "a_verifier"),
        supabase
          .from("bulletins")
          .select("id, copro_id, coproprietaire_id, lot_reference, statut, purge_effectuee_le, rib_path, rib_remplace_le, coproprietes(name)")
          .eq("rib_statut", "a_verifier"),
      ]);
      if (sigs.error) throw sigs.error;
      if (ribs.error) throw ribs.error;
      const vivant = (b: B) => b.statut !== "annule" && b.statut !== "brouillon" && !b.purge_effectuee_le;
      const out: PieceSignatureAVerifier[] = [];
      for (const s of (sigs.data ?? []) as unknown as {
        id: string; prenom: string; nom: string; role: string; piece_identite_path: string | null; piece_remplacee_le: string | null; bulletins: B;
      }[]) {
        if (!vivant(s.bulletins) || !s.piece_identite_path) continue;
        out.push({
          quoi: "piece", bulletinId: s.bulletins.id, signataireId: s.id, coproId: s.bulletins.copro_id,
          coproNom: s.bulletins.coproprietes?.name ?? "Dossier", coproprietaireId: s.bulletins.coproprietaire_id,
          lot: s.bulletins.lot_reference,
          libelle: `Pièce d'identité de ${s.prenom} ${s.nom} (${s.role === "principal" ? "signataire principal" : "cosignataire"})`,
          path: s.piece_identite_path, remplaceeLe: s.piece_remplacee_le,
        });
      }
      for (const b of (ribs.data ?? []) as unknown as (B & { rib_path: string | null; rib_remplace_le: string | null })[]) {
        if (!vivant(b) || !b.rib_path) continue;
        out.push({
          quoi: "rib", bulletinId: b.id, signataireId: null, coproId: b.copro_id,
          coproNom: b.coproprietes?.name ?? "Dossier", coproprietaireId: b.coproprietaire_id,
          lot: b.lot_reference, libelle: "RIB du compte de prélèvement", path: b.rib_path, remplaceeLe: b.rib_remplace_le,
        });
      }
      return out.sort((a, b) => a.coproNom.localeCompare(b.coproNom, "fr") || a.lot.localeCompare(b.lot, "fr"));
    },
  });
}

/** Validation par l'AMO (niveau 1) de la pièce d'identité d'un signataire ou du RIB. */
export function useVerifierPieceSignature(coproId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      quoi: "piece" | "rib";
      bulletinId?: string;
      signataireId?: string;
      qualification: string | null;
      motif?: string | null;
    }) =>
      appelSignature({
        action: "amo_verifier",
        quoi: input.quoi,
        bulletin_id: input.bulletinId,
        signataire_id: input.signataireId,
        qualification: input.qualification,
        motif: input.motif ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["signature", "bulletins-copro", coproId] });
      void qc.invalidateQueries({ queryKey: ["signature", "pieces-a-verifier"] });
    },
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
