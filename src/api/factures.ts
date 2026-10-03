// Facturation directe (0115) - demande d'Amir du 28/09/2026.
//
// Factures et avoirs émis depuis le logiciel. Toutes les écritures passent
// par les fonctions SQL (brouillon, adresse, validation, avoir, paiement,
// passage en production) ; l'app génère le PDF (pdf-lib), le classe dans les
// fichiers de la copropriété, puis l'edge function envoyer-facture l'envoie
// au gestionnaire (Hellio pour les CEE), chef de projet et dirigeant en copie.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { nomFichierPiece, type EnvoiStatut, type LigneFacture, type PieceFacture, type TypeReferenceClient } from "@/lib/factureDoc";

const nombre = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));

type LignePiece = Omit<PieceFacture, "lignes" | "total_ht" | "total_tva" | "total_ttc"> & {
  lignes: unknown;
  total_ht: number | string;
  total_tva: number | string;
  total_ttc: number | string;
};

// numeric(12,2) : forcé en nombre, une chaîne ferait concaténer les sommes
const versPiece = (r: LignePiece): PieceFacture => ({
  ...r,
  lignes: ((r.lignes ?? []) as LigneFacture[]).map((l) => ({
    ...l,
    quantite: nombre(l.quantite),
    pu_ht: nombre(l.pu_ht),
    montant_ht: nombre(l.montant_ht),
    taux_tva: nombre(l.taux_tva),
  })),
  total_ht: nombre(r.total_ht),
  total_tva: nombre(r.total_tva),
  total_ttc: nombre(r.total_ttc),
});

export function useFactures() {
  return useQuery({
    queryKey: ["factures"],
    queryFn: async (): Promise<PieceFacture[]> => {
      const { data, error } = await supabase.from("factures").select("*").order("cree_le", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => versPiece(r as unknown as LignePiece));
    },
    staleTime: 60_000,
  });
}

export interface EvenementFacturation {
  id: string;
  ordre: number;
  facture_id: string | null;
  copro_id: string;
  jalon: string | null;
  action: "brouillon" | "brouillon_supprime" | "validation" | "envoi" | "paiement" | "paiement_annule" | "production";
  test: boolean;
  detail: string | null;
  par: string | null;
  le: string;
}

export function useJournalFacturation() {
  return useQuery({
    queryKey: ["facturation-journal"],
    queryFn: async (): Promise<EvenementFacturation[]> => {
      const { data, error } = await supabase
        .from("facturation_journal")
        .select("id, ordre, facture_id, copro_id, jalon, action, test, detail, par, le")
        .order("ordre", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EvenementFacturation[];
    },
  });
}

export interface ParametresFacturation {
  mode: "test" | "production";
  prochain_facture: number;
  prochain_avoir: number;
  en_production_le: string | null;
}

export function useParametresFacturation() {
  return useQuery({
    queryKey: ["facturation-parametres"],
    queryFn: async (): Promise<ParametresFacturation | null> => {
      const { data, error } = await supabase
        .from("facturation_parametres")
        .select("mode, prochain_facture, prochain_avoir, en_production_le")
        .maybeSingle();
      if (error) throw error;
      return (data as ParametresFacturation | null) ?? null;
    },
  });
}

function invalider(qc: ReturnType<typeof useQueryClient>, coproId?: string) {
  void qc.invalidateQueries({ queryKey: ["factures"] });
  void qc.invalidateQueries({ queryKey: ["facturation-journal"] });
  void qc.invalidateQueries({ queryKey: ["facturation-parametres"] });
  void qc.invalidateQueries({ queryKey: ["honoraires"] });
  if (coproId) void qc.invalidateQueries({ queryKey: ["fichiers", coproId] });
  else void qc.invalidateQueries({ queryKey: ["fichiers"] });
}

/** Brouillon de facture d'un jalon ; renvoie le brouillon existant (refait si le montant du jalon a changé). */
export function useCreerBrouillon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coproId, jalon }: { coproId: string; jalon: string }): Promise<string> => {
      const { data, error } = await supabase.rpc("facture_creer_brouillon", { p_copro_id: coproId, p_jalon: jalon });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_d, v) => invalider(qc, v.coproId),
  });
}

export interface SaisieBrouillon {
  id: string;
  /** Adresse du syndic (gardée ensuite pour toute l'enseigne) ; vide = effacée. */
  adresse: string;
  /** Numéro de référence ou d'ordre de service du client (0135) ; vide = aucun. */
  referenceClient: string;
  referenceClientType: TypeReferenceClient;
  /** Texte libre sous les articles (0135) ; vide = aucun. */
  texteLibre: string;
}

/** Saisies d'un brouillon : adresse du syndic, numéro du client, texte libre. */
export function useModifierBrouillon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: SaisieBrouillon) => {
      const { error } = await supabase.rpc("facture_modifier_brouillon", {
        p_id: s.id,
        p_client_adresse: s.adresse,
        p_reference_client: s.referenceClient,
        p_reference_client_type: s.referenceClientType,
        p_texte_libre: s.texteLibre,
      });
      if (error) throw error;
    },
    onSuccess: () => invalider(qc),
  });
}

export function useSupprimerBrouillon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("facture_supprimer_brouillon", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => invalider(qc),
  });
}

/** Brouillon d'avoir total sur une facture émise. */
export function useCreerAvoir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (factureId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("facture_creer_avoir", { p_facture_id: factureId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalider(qc),
  });
}

export type EtapeEmission = "numero" | "pdf" | "envoi";

export interface ResultatEmission {
  piece: PieceFacture;
  envoi: EnvoiStatut | null;
  /** Étape qui a échoué après la validation (la pièce reste émise, l'envoi est à terminer). */
  echec: { etape: EtapeEmission; message: string } | null;
}

async function pieceParId(id: string): Promise<PieceFacture> {
  const { data, error } = await supabase.from("factures").select("*").eq("id", id).single();
  if (error) throw error;
  return versPiece(data as unknown as LignePiece);
}

async function origineDe(p: PieceFacture) {
  if (p.type !== "avoir" || !p.facture_origine_id) return null;
  const { data } = await supabase.from("factures").select("numero, date_emission").eq("id", p.facture_origine_id).maybeSingle();
  return data ?? null;
}

/** PDF classé dans les fichiers de la copropriété (dossier « Facturation »), puis e-mail. */
async function classerEtEnvoyer(p: PieceFacture, nomCopro: string): Promise<ResultatEmission> {
  let piece = p;
  if (!piece.pdf_path) {
    try {
      const { genererFacturePdf } = await import("@/lib/pdf/facture");
      const bytes = await genererFacturePdf(piece, { origine: await origineDe(piece) });
      const chemin = `${piece.copro_id}/Facturation/${piece.numero}.pdf`;
      const { error: eUp } = await supabase.storage
        .from("copro-files")
        .upload(chemin, new Blob([bytes as BlobPart], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
      if (eUp) throw eUp;
      const { error: eRpc } = await supabase.rpc("facture_enregistrer_pdf", {
        p_id: piece.id,
        p_storage_path: chemin,
        p_nom: nomFichierPiece(piece, nomCopro),
        p_taille: bytes.byteLength,
      });
      if (eRpc) throw eRpc;
      piece = await pieceParId(piece.id);
    } catch (e) {
      return { piece, envoi: null, echec: { etape: "pdf", message: messageDe(e) } };
    }
  }
  try {
    const { data, error } = await supabase.functions.invoke("envoyer-facture", { body: { facture_id: piece.id } });
    if (error) throw error;
    const statut = (data as { statut?: EnvoiStatut } | null)?.statut ?? null;
    piece = await pieceParId(piece.id);
    const ok = statut === "envoye" || statut === "simule";
    return {
      piece,
      envoi: statut,
      echec: ok ? null : { etape: "envoi", message: statut === "sans_email" ? "Aucun e-mail de destinataire valide." : "L'e-mail n'a pas pu partir." },
    };
  } catch (e) {
    return { piece, envoi: null, echec: { etape: "envoi", message: messageDe(e) } };
  }
}

const messageDe = (e: unknown) =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
    ? (e as { message: string }).message
    : String(e);

/**
 * « Valider et envoyer » : numéro, date et jalon côté serveur (le seul point
 * de non-retour), puis PDF classé et e-mail. Une erreur après la validation
 * n'annule rien : la pièce est émise et « Terminer l'envoi » reprend là.
 */
export function useValiderEtEnvoyer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nomCopro }: { id: string; nomCopro: string }): Promise<ResultatEmission> => {
      const { data, error } = await supabase.rpc("facture_valider", { p_id: id });
      if (error) throw error;
      const piece = versPiece(data as unknown as LignePiece);
      return classerEtEnvoyer(piece, nomCopro);
    },
    onSettled: () => invalider(qc),
  });
}

/** Reprend une émission interrompue (PDF non classé ou e-mail en erreur). */
export function useTerminerEnvoi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ piece, nomCopro }: { piece: PieceFacture; nomCopro: string }) => classerEtEnvoyer(piece, nomCopro),
    onSettled: (_d, _e, v) => invalider(qc, v.piece.copro_id),
  });
}

/** Paiement reçu (dirigeant seul) : le jalon passe « encaissé ». */
export function useMarquerPaye() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coproId, jalon, date }: { coproId: string; jalon: string; date: string }) => {
      const { error } = await supabase.rpc("honoraires_marquer_paye", { p_copro_id: coproId, p_jalon: jalon, p_date: date });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalider(qc, v.coproId),
  });
}

export function useAnnulerPaiement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coproId, jalon }: { coproId: string; jalon: string }) => {
      const { error } = await supabase.rpc("honoraires_annuler_paiement", { p_copro_id: coproId, p_jalon: jalon });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalider(qc, v.coproId),
  });
}

export interface BilanProduction {
  factures: number;
  avoirs: number;
  jalons: number;
  fichiersRestants: number;
}

/** Passage en production (dirigeant) : efface les essais puis leurs PDF du stockage. */
export function usePasserEnProduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<BilanProduction> => {
      const { data, error } = await supabase.rpc("facturation_passer_en_production");
      if (error) throw error;
      const r = data as { chemins: string[]; factures: number; avoirs: number; jalons: number };
      let fichiersRestants = 0;
      if (r.chemins.length) {
        const { error: eSt } = await supabase.storage.from("copro-files").remove(r.chemins);
        if (eSt) fichiersRestants = r.chemins.length;
      }
      return { factures: r.factures, avoirs: r.avoirs, jalons: r.jalons, fichiersRestants };
    },
    onSettled: () => invalider(qc),
  });
}

/** URL signée du PDF classé (lecture seule, 10 minutes). */
export async function urlPdfPiece(p: PieceFacture): Promise<string | null> {
  if (!p.pdf_path) return null;
  const { data } = await supabase.storage.from("copro-files").createSignedUrl(p.pdf_path, 600);
  return data?.signedUrl ?? null;
}
