// Éco-PTZ individuel (02/10/2026) : données du CERFA saisies au dépôt (audit,
// entreprises des lots), envois en signature électronique dans Strat Eco Pro
// (edge function signature-documents) et documents signés du copropriétaire.
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import type { AuditEcoPtz, DossierEcoPtz, PosteEcoPtzSaisi } from "@/lib/ecoPtzDonnees";
import type { LogementEcoPtz, PosteEcoPtz } from "@/lib/finance/ecoPtzIndividuel";
import { GABARIT_CERFA_ECOPTZ, genCerfaEcoPtz, type EmplacementSignature } from "@/lib/pdf/cerfaEcoPtz";
import { genAttestationEcoPtz } from "@/lib/pdf/attestationEcoPtz";
import {
  attestationInputLogement,
  cerfaInputLogement,
  lignesUtiles,
  nomsFichiersLogement,
  signatairesEcoPtz,
  type CoproEcoPtz,
  type SignataireEcoPtz,
} from "@/lib/ecoPtzDocuments";

const FONCTION = "signature-documents";

export * from "@/lib/ecoPtzDonnees";

// ========== Données du dossier ==========

function lireDossier(row: Record<string, unknown> | null, coproId: string): DossierEcoPtz {
  return {
    copro_id: coproId,
    audit: ((row?.audit as AuditEcoPtz | undefined) ?? {}) as AuditEcoPtz,
    audit_statut: ((row?.audit_statut as DossierEcoPtz["audit_statut"]) ?? "a_completer"),
    audit_valide_le: (row?.audit_valide_le as string | null) ?? null,
    postes: ((row?.postes as Record<string, PosteEcoPtzSaisi> | undefined) ?? {}),
    updated_at: (row?.updated_at as string) ?? "",
  };
}

export function useDossierEcoPtz(coproId: string | undefined) {
  return useQuery({
    queryKey: ["ecoptz-dossier", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<DossierEcoPtz> => {
      const { data, error } = await supabase.from("ecoptz_dossiers").select("*").eq("copro_id", coproId!).maybeSingle();
      if (error) throw error;
      return lireDossier(data as Record<string, unknown> | null, coproId!);
    },
  });
}

/** Lots du PF définitif validé et performance énergétique, lisibles par l'AMO, le syndic et le MOE. */
export interface ContextePfEcoPtz {
  lots: { numero: number; titre: string; entreprise: string | null; eligible: boolean }[];
  infos: { cepInitial?: number; cepProjet?: number; etiquetteInitiale?: string; etiquetteProjet?: string };
}

export function useContextePfEcoPtz(coproId: string | undefined) {
  return useQuery({
    queryKey: ["ecoptz-contexte-pf", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<ContextePfEcoPtz> => {
      const { data, error } = await supabase.rpc("ecoptz_contexte_pf", { p_copro_id: coproId! });
      if (error) throw error;
      const v = (data ?? {}) as Partial<ContextePfEcoPtz>;
      return { lots: v.lots ?? [], infos: v.infos ?? {} };
    },
  });
}

function invaliderDossier(qc: QueryClient, coproId: string) {
  void qc.invalidateQueries({ queryKey: ["ecoptz-dossier", coproId] });
  void qc.invalidateQueries({ queryKey: ["prestataires"] });
}

export function useSaisirAuditEcoPtz(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ audit, valider = false }: { audit: AuditEcoPtz; valider?: boolean }) => {
      const { data, error } = await supabase.rpc("ecoptz_saisir_audit", {
        p_copro_id: coproId,
        p_audit: audit as unknown as Json,
        p_valider: valider,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invaliderDossier(qc, coproId),
  });
}

export function useSaisirPostesEcoPtz(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postes, valider = false }: { postes: PosteEcoPtzSaisi[]; valider?: boolean }) => {
      const { data, error } = await supabase.rpc("ecoptz_saisir_postes", {
        p_copro_id: coproId,
        p_postes: postes as unknown as Json,
        p_valider: valider,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invaliderDossier(qc, coproId),
  });
}

// ========== Envois en signature ==========

export interface ParticipantEnvoi {
  id: string;
  envoi_id: string;
  role: "entreprise" | "auditeur" | "syndic";
  prestataire_id: string | null;
  societe: string;
  siret: string;
  nom: string;
  email: string;
  ordre: number;
  statut: "en_attente" | "signe" | "annule";
  token_expire_le: string | null;
  lien_envoye_le: string | null;
  nb_envois: number;
  fait_a: string | null;
  signe_le: string | null;
}

export interface DocumentEnvoi {
  id: string;
  envoi_id: string;
  type: "cerfa_ecoptz" | "attestation_ecoptz";
  coproprietaire_id: string | null;
  lot_id: string | null;
  libelle: string;
  donnees: Record<string, unknown>;
  statut: "brouillon" | "en_attente" | "signe" | "annule";
  scelle_le: string | null;
  fichier_id: string | null;
  created_at: string;
  signature_document_signataires: { participant_id: string; lu_le: string | null; signe_le: string | null }[];
}

export interface EnvoiSignature {
  id: string;
  copro_id: string;
  statut: "brouillon" | "en_cours" | "complet" | "annule";
  cree_par_nom: string | null;
  envoye_le: string | null;
  complet_le: string | null;
  annule_le: string | null;
  created_at: string;
  signature_participants: ParticipantEnvoi[];
  signature_documents: DocumentEnvoi[];
}

const COLONNES_PARTICIPANT =
  "id, envoi_id, role, prestataire_id, societe, siret, nom, email, ordre, statut, token_expire_le, lien_envoye_le, nb_envois, fait_a, signe_le";

export function useEnvoisEcoPtz(coproId: string | undefined) {
  return useQuery({
    queryKey: ["ecoptz-envois", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<EnvoiSignature[]> => {
      const { data, error } = await supabase
        .from("signature_envois")
        .select(
          `id, copro_id, statut, cree_par_nom, envoye_le, complet_le, annule_le, created_at,
           signature_participants (${COLONNES_PARTICIPANT}),
           signature_documents (id, envoi_id, type, coproprietaire_id, lot_id, libelle, donnees, statut, scelle_le, fichier_id, created_at,
             signature_document_signataires (participant_id, lu_le, signe_le))`
        )
        .eq("copro_id", coproId!)
        .neq("statut", "brouillon")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EnvoiSignature[];
    },
  });
}

type Reponse = Record<string, unknown> & { error?: string };

const ERREURS: Record<string, string> = {
  lien_invalide: "Ce lien n'est plus valable. Demandez un nouveau lien à Strat Eco.",
  deja_signe: "Vous avez déjà signé ces documents.",
  attestation_requise: "Cochez l'attestation avant de demander le code.",
  documents_non_lus: "Ouvrez chaque document avant de signer.",
  fait_a_requis: "Indiquez la ville où vous signez (« Fait à »).",
  trop_de_renvois: "Trop de codes demandés : réessayez dans une heure.",
  code_invalide: "Le code comporte 6 chiffres.",
  code_expire: "Ce code a expiré : demandez-en un nouveau.",
  code_faux: "Code incorrect.",
  trop_de_tentatives: "Trop d'essais : demandez un nouveau code.",
  envoi_echec: "L'e-mail n'a pas pu partir. Réessayez dans un instant.",
  interdit: "Action réservée à l'équipe Strat Eco.",
  envoi_introuvable: "Envoi introuvable.",
  document_manquant: "Un document n'a pas été déposé : relancez la préparation.",
  email_invalide: "Adresse e-mail invalide.",
  envoi_annule: "Cet envoi a été annulé.",
};

export function messageErreurSignatureDocuments(code: string | undefined): string {
  return (code && ERREURS[code]) || "Une erreur est survenue. Réessayez ou contactez Strat Eco.";
}

/** Canal authentifié (AMO, syndic, copropriétaire). */
export async function appelSignatureDocuments(body: Record<string, unknown>): Promise<Reponse> {
  const { data, error } = await supabase.functions.invoke(FONCTION, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const parsed = await ctx.json().catch(() => null);
      if (parsed?.error) throw new Error(messageErreurSignatureDocuments(parsed.error));
    }
    throw new Error(messageErreurSignatureDocuments(undefined));
  }
  if ((data as Reponse)?.error) throw new Error(messageErreurSignatureDocuments((data as Reponse).error));
  return data as Reponse;
}

/** Canal public (page /signature-documents/:token, signataires sans compte). */
export async function appelSignatureDocumentsPublique(body: Record<string, unknown>): Promise<Reponse> {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const cle = (import.meta.env.VITE_SUPABASE_FUNCTIONS_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string;
  const r = await fetch(`${url}/functions/v1/${FONCTION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}`, apikey: cle },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Reponse;
  if (!r.ok || data.error) throw new Error(messageErreurSignatureDocuments(data.error));
  return data;
}

export function useActionEnvoiEcoPtz(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => appelSignatureDocuments({ copro_id: coproId, ...body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ecoptz-envois", coproId] }),
  });
}

/** URL courte (60 s) d'un document : original ou version signée. */
export async function urlDocumentSignature(documentId: string, version: "original" | "signe"): Promise<string> {
  const r = await appelSignatureDocuments({ action: "document_url", document_id: documentId, version });
  return String(r.url ?? "");
}

/**
 * Aperçu sans téléchargement (feedback d'Amir du 05/10/2026) : le lien court
 * est servi en pièce jointe, on récupère donc le PDF en mémoire et on l'affiche
 * par un lien « blob: » (libéré à la fermeture de l'aperçu).
 */
export async function urlApercuDocumentSignature(documentId: string): Promise<string> {
  const r = await fetch(await urlDocumentSignature(documentId, "signe"));
  if (!r.ok) throw new Error("Document indisponible");
  return URL.createObjectURL(new Blob([await r.blob()], { type: "application/pdf" }));
}

export async function ouvrirDocumentSignature(documentId: string, version: "original" | "signe") {
  // fenêtre ouverte avant l'appel : sinon le bloqueur de fenêtres la refuse
  const w = window.open("", "_blank");
  try {
    const url = await urlDocumentSignature(documentId, version);
    if (w) w.location.href = url;
    else window.open(url, "_blank");
  } catch (e) {
    w?.close();
    throw e;
  }
}

// ========== Portail : documents du copropriétaire ==========

export interface DocumentCoproprietaire {
  id: string;
  type: DocumentEnvoi["type"];
  libelle: string;
  statut: DocumentEnvoi["statut"];
  scelle_le: string | null;
  lot_id: string | null;
  created_at: string;
}

export function useMesDocumentsEcoPtz(coproprietaireId: string | undefined) {
  return useQuery({
    queryKey: ["ecoptz-mes-documents", coproprietaireId],
    enabled: !!coproprietaireId,
    queryFn: async (): Promise<DocumentCoproprietaire[]> => {
      const { data, error } = await supabase
        .from("signature_documents")
        .select("id, type, libelle, statut, scelle_le, lot_id, created_at")
        .eq("coproprietaire_id", coproprietaireId!)
        .in("statut", ["en_attente", "signe"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentCoproprietaire[];
    },
  });
}

// ========== Préparation et envoi (AMO) ==========

export interface ResultatEnvoiEcoPtz {
  envoiId: string;
  participants: { participant_id: string; role: string; email: string; statut: string; lien?: string }[];
}

/**
 * Génère le CERFA et l'attestation de chaque logement, les dépose dans le
 * stockage des signatures, puis envoie un lien à chaque signataire.
 */
export async function envoyerEcoPtzEnSignature(input: {
  coproId: string;
  copro: CoproEcoPtz;
  dossier: DossierEcoPtz;
  postes: PosteEcoPtz[];
  logements: LogementEcoPtz[];
  syndic: SignataireEcoPtz;
  onProgres?: (etape: string) => void;
}): Promise<ResultatEnvoiEcoPtz> {
  const { coproId, copro, dossier, postes, logements, syndic, onProgres } = input;
  const { signataires, parPoste } = signatairesEcoPtz(dossier, postes, syndic);
  const res = await fetch(GABARIT_CERFA_ECOPTZ);
  if (!res.ok) throw new Error("Gabarit du CERFA éco-PTZ introuvable");
  const gabarit = new Uint8Array(await res.arrayBuffer());
  const aujourdhui = new Date().toISOString().slice(0, 10);

  type DocPrepare = {
    cle: string;
    type: "cerfa_ecoptz" | "attestation_ecoptz";
    coproprietaire_id: string;
    lot_id: string;
    libelle: string;
    donnees: Record<string, unknown>;
    signataires: { participant: string; emplacements: unknown[] }[];
  };
  const documents: DocPrepare[] = [];
  const octets = new Map<string, Uint8Array>();
  const grouper = (emplacements: EmplacementSignature[]) => {
    const parSignataire = new Map<string, unknown[]>();
    for (const e of emplacements) {
      const { signataire, ...reste } = e;
      parSignataire.set(signataire, [...(parSignataire.get(signataire) ?? []), reste]);
    }
    return [...parSignataire.entries()].map(([participant, emplacements]) => ({ participant, emplacements }));
  };

  for (const [i, l] of logements.entries()) {
    onProgres?.(`Génération des documents (${i + 1}/${logements.length})`);
    const noms = nomsFichiersLogement(copro, l, aujourdhui);
    const instantane = {
      nom: l.nom,
      lot: l.lotNum,
      annexes: l.annexes.map((a) => a.num),
      tantiemes: l.tantiemes,
      total: l.total,
      lignes: lignesUtiles(l).map((x) => ({ lot: x.lotNumero, titre: x.titre, montant_copro: x.montantCopro, quote_part: x.quotePart, cle: x.cle })),
    };
    const cerfa = await genCerfaEcoPtz({ ...cerfaInputLogement(copro, dossier, l, postes, parPoste), gabarit });
    const cleC = `cerfa:${l.lotId}`;
    octets.set(cleC, cerfa.bytes);
    documents.push({
      cle: cleC,
      type: "cerfa_ecoptz",
      coproprietaire_id: l.coproprietaireId,
      lot_id: l.lotId,
      libelle: `CERFA éco-PTZ - ${l.nom} - lot n°${l.lotNum}`,
      donnees: { ...instantane, nom_fichier: noms.cerfa },
      signataires: grouper(cerfa.emplacements),
    });
    const att = await genAttestationEcoPtz(attestationInputLogement(copro, dossier, l, postes));
    const cleA = `attestation:${l.lotId}`;
    octets.set(cleA, att.bytes);
    documents.push({
      cle: cleA,
      type: "attestation_ecoptz",
      coproprietaire_id: l.coproprietaireId,
      lot_id: l.lotId,
      libelle: `Attestation éco-PTZ - ${l.nom} - lot n°${l.lotNum}`,
      donnees: { ...instantane, nom_fichier: noms.attestation },
      signataires: grouper(att.emplacements),
    });
  }

  onProgres?.("Préparation de l'envoi");
  const prep = await appelSignatureDocuments({ action: "amo_preparer", copro_id: coproId, participants: signataires, documents });
  const uploads = (prep.uploads ?? []) as { cle: string; path: string; token: string }[];
  for (const [i, u] of uploads.entries()) {
    onProgres?.(`Dépôt des documents (${i + 1}/${uploads.length})`);
    const bytes = octets.get(u.cle);
    if (!bytes) throw new Error("Document introuvable pour le dépôt");
    const { error } = await supabase.storage
      .from("signature-docs")
      .uploadToSignedUrl(u.path, u.token, new Blob([bytes as BlobPart], { type: "application/pdf" }), {
        contentType: "application/pdf",
      });
    if (error) throw error;
  }
  onProgres?.("Envoi des liens de signature");
  const env = await appelSignatureDocuments({ action: "amo_envoyer", envoi_id: prep.envoi_id });
  return { envoiId: String(prep.envoi_id), participants: (env.participants ?? []) as ResultatEnvoiEcoPtz["participants"] };
}
