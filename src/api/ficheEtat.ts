// Fiche « État de la copropriété » (ANAH) : enregistrement dans
// montage_formulaires (type fiche_etat_anah), images des deux encadrés,
// signatures électroniques (edge function signature-fiche-etat) et dépôt du
// PDF dans la pièce « Fiche État » du dossier ANAH. Calculs et définitions des
// champs : src/lib/ficheEtat.ts ; PDF : src/lib/pdf/ficheEtat.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/lib/database.types";
import {
  calculerOccupation,
  instantaneOccupation,
  lireDonneesFiche,
  lotsNonPrincipaux,
  resoudre,
  valeursBase,
  valeursBrutes,
  valeursParDefaut,
  type CoproFiche,
  type DonneesFiche,
  type DonneesFormulaireFiche,
  type InstantaneOccupation,
  type OccupationFiche,
  type ReponseFiche,
} from "@/lib/ficheEtat";
import { genFicheEtat, ficheSignee, nomFichierFicheEtat, type SignatureFichePdf } from "@/lib/pdf/ficheEtat";
import { nomFichierSansAccents } from "@/lib/nommage";
import { messageErreurSignature } from "@/api/signature";
import { docFiles, useUploadMontageDoc, type MontageDoc } from "@/api/montage";
import { retirerFichierDesMontages } from "@/api/propagation";

export const TYPE_FICHE_ETAT = "fiche_etat_anah";
const FONCTION = "signature-fiche-etat";

export type SignatureFiche = Tables<"fiche_etat_signatures">;
/** Colonnes lisibles côté client (GRANT colonne par colonne, 0092) - jamais `*`. */
const COLONNES_SIGNATURE =
  "id, copro_id, role, nom, email, statut, token_expire_le, lien_envoye_le, attestation_le, signe_le, donnees_hash, created_at, updated_at";

export interface FicheEtatEnregistree {
  data: DonneesFormulaireFiche;
  statut: "brouillon" | "transmis" | "valide";
  updated_at: string;
}

// ========== Lecture / enregistrement ==========

export function useFicheEtat(coproId: string | undefined) {
  return useQuery({
    queryKey: ["fiche-etat", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<FicheEtatEnregistree | null> => {
      const { data, error } = await supabase
        .from("montage_formulaires")
        .select("data, statut, updated_at")
        .eq("copro_id", coproId!)
        .eq("type", TYPE_FICHE_ETAT)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { data: lireDonneesFiche(data.data), statut: data.statut as FicheEtatEnregistree["statut"], updated_at: data.updated_at };
    },
  });
}

/**
 * Fusionne un patch dans la fiche (lecture de la version en base juste avant :
 * l'instantané d'occupation écrit depuis l'onglet Enquête ne doit pas écraser
 * les saisies du syndic, et inversement). Le statut est conservé sauf demande.
 */
export async function enregistrerFicheEtat(
  coproId: string,
  patch: Partial<DonneesFormulaireFiche>,
  statut?: FicheEtatEnregistree["statut"]
): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new Error("Session expirée");
  const { data: prev, error: e1 } = await supabase
    .from("montage_formulaires")
    .select("data, statut")
    .eq("copro_id", coproId)
    .eq("type", TYPE_FICHE_ETAT)
    .maybeSingle();
  if (e1) throw e1;
  const data = { ...lireDonneesFiche(prev?.data), ...patch };
  const { error } = await supabase.from("montage_formulaires").upsert(
    {
      copro_id: coproId,
      type: TYPE_FICHE_ETAT,
      data: data as unknown as Json,
      statut: statut ?? prev?.statut ?? "brouillon",
      updated_by: uid,
    },
    { onConflict: "copro_id,type" }
  );
  if (error) throw error;
}

function invalider(qc: ReturnType<typeof useQueryClient>, coproId: string) {
  void qc.invalidateQueries({ queryKey: ["fiche-etat", coproId] });
  void qc.invalidateQueries({ queryKey: ["montage", "formulaires", coproId] });
  void qc.invalidateQueries({ queryKey: ["fiche-etat-signatures", coproId] });
}

export function useEnregistrerFicheEtat(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ patch, statut }: { patch: Partial<DonneesFormulaireFiche>; statut?: FicheEtatEnregistree["statut"] }) =>
      enregistrerFicheEtat(coproId, patch, statut),
    onSuccess: () => invalider(qc, coproId),
  });
}

// ========== Rapport d'enquête sociale → fiche État ==========

/**
 * Feedback Amir du 23/09/2026 : générer le rapport d'enquête sociale écrit
 * ses chiffres d'occupation dans la fiche État (instantané daté), puis
 * recalcule les valeurs imprimées de la fiche. Retourne l'occupation calculée
 * pour l'onglet « Fiche État - occupation » du rapport.
 */
export async function ecrireOccupationFiche(
  copro: CoproFiche & { id: string },
  donnees: DonneesFiche,
  reponses: ReponseFiche[],
  auteur: string | null
): Promise<{ occupation: OccupationFiche; instantane: InstantaneOccupation }> {
  const occupation = calculerOccupation(copro, donnees, reponses);
  const instantane = instantaneOccupation(occupation, lotsNonPrincipaux(donnees, reponses), auteur);
  const { data: forms, error } = await supabase.from("montage_formulaires").select("type, data").eq("copro_id", copro.id);
  if (error) throw error;
  const fiche = lireDonneesFiche(forms?.find((f) => f.type === TYPE_FICHE_ETAT)?.data);
  const autres = (forms ?? []).filter((f) => f.type !== TYPE_FICHE_ETAT);
  const base = valeursBase(copro, donnees, instantane, fiche.etiquettes);
  const resolu = resoudre(valeursBrutes(base, fiche.saisies ?? {}, valeursParDefaut(copro, autres)));
  await enregistrerFicheEtat(copro.id, { occupation: instantane, resolu });
  return { occupation, instantane };
}

export function useEcrireOccupationFiche(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { copro: CoproFiche & { id: string }; donnees: DonneesFiche; reponses: ReponseFiche[]; auteur: string | null }) =>
      ecrireOccupationFiche(input.copro, input.donnees, input.reponses, input.auteur),
    onSuccess: () => invalider(qc, coproId),
  });
}

// ========== Images des deux encadrés ==========

export type ImageFiche = "aerienne" | "situation";

export async function deposerImageFiche(coproId: string, quoi: ImageFiche, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!["png", "jpg", "jpeg"].includes(ext)) throw new Error("Image PNG ou JPEG uniquement.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image trop volumineuse (8 Mo maximum).");
  const path = `montage/${coproId}/anah/fiche_etat_images/${quoi}-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
  const { error } = await supabase.storage.from("copro-files").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function urlImageFiche(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("copro-files").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

async function octetsStorage(path: string | null | undefined): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("copro-files").download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function octetsUrl(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  const r = await fetch(url);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}

// ========== Signatures ==========

export function useSignaturesFicheEtat(coproId: string | undefined) {
  return useQuery({
    queryKey: ["fiche-etat-signatures", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<SignatureFiche[]> => {
      const { data, error } = await supabase.from("fiche_etat_signatures").select(COLONNES_SIGNATURE).eq("copro_id", coproId!);
      if (error) throw error;
      return (data ?? []) as SignatureFiche[];
    },
  });
}

/** Signatures au format du PDF (seules les signatures abouties). */
export function signaturesPdf(rows: Pick<SignatureFiche, "role" | "nom" | "signe_le" | "donnees_hash">[] | undefined): SignatureFichePdf[] {
  return (rows ?? [])
    .filter((s) => !!s.signe_le && (s.role === "president_cs" || s.role === "syndic"))
    .map((s) => ({ role: s.role as SignatureFichePdf["role"], nom: s.nom, signeLe: s.signe_le!, empreinte: s.donnees_hash }));
}

type Reponse = Record<string, unknown> & { error?: string };

/** Canal authentifié (AMO, syndic). */
export async function appelFicheEtat(body: Record<string, unknown>): Promise<Reponse> {
  const { data, error } = await supabase.functions.invoke(FONCTION, { body });
  if (error) {
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

/** Canal public (page /signature-fiche/:token du président du conseil syndical, sans compte). */
export async function appelFicheEtatPublique(body: Record<string, unknown>): Promise<Reponse> {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const cle = (import.meta.env.VITE_SUPABASE_FUNCTIONS_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string;
  const r = await fetch(`${url}/functions/v1/${FONCTION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}`, apikey: cle },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Reponse;
  if (!r.ok || data.error) throw new Error(messageErreurSignature(data.error));
  return data;
}

export function useActionSignatureFiche(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => appelFicheEtat({ copro_id: coproId, ...body }),
    onSuccess: () => invalider(qc, coproId),
  });
}

// ========== PDF : aperçu et dépôt dans le dossier ANAH ==========

export async function pdfFicheEtat(
  coproId: string,
  data: DonneesFormulaireFiche,
  signatures: SignatureFiche[] | undefined
): Promise<{ bytes: Uint8Array; signee: boolean }> {
  void coproId;
  const [aerienne, situation] = await Promise.all([octetsStorage(data.images?.aerienne), octetsStorage(data.images?.situation)]);
  const sigs = signaturesPdf(signatures);
  const bytes = await genFicheEtat({ resolu: data.resolu ?? {}, images: { aerienne, situation }, signatures: sigs });
  return { bytes, signee: ficheSignee(sigs) };
}

export function telechargerPdf(bytes: Uint8Array, nom: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const PREFIXE_GENERE = "Fiche Etat ANAH";

/**
 * Génère le PDF signé et le dépose dans la pièce `fiche_etat` du dossier ANAH
 * (propagé aux autres dossiers qui attendent la fiche État). Les versions
 * générées précédemment sont retirées : la pièce ne garde que la dernière.
 */
export function useDeposerFicheEtatSignee(coproId: string, coproNom: string) {
  const upload = useUploadMontageDoc(coproId, "anah");
  return useMutation({
    mutationFn: async ({ data, signatures }: { data: DonneesFormulaireFiche; signatures: SignatureFiche[] | undefined }) => {
      const { bytes, signee } = await pdfFicheEtat(coproId, data, signatures);
      if (!signee) throw new Error("Les deux signatures ne sont pas encore réunies.");
      const { data: row } = await supabase
        .from("montage_docs")
        .select("*")
        .eq("copro_id", coproId)
        .eq("montage", "anah")
        .eq("doc_key", "fiche_etat")
        .maybeSingle();
      const anciens = docFiles((row ?? undefined) as MontageDoc | undefined).filter((f) => f.name.startsWith(PREFIXE_GENERE));
      const nom = nomFichierSansAccents(nomFichierFicheEtat(coproNom, true));
      await upload.mutateAsync({ docKey: "fiche_etat", file: new File([bytes as BlobPart], nom, { type: "application/pdf" }) });
      for (const f of anciens) {
        await retirerFichierDesMontages(coproId, f.path);
        await supabase.storage.from("copro-files").remove([f.path]);
      }
      return bytes;
    },
  });
}
