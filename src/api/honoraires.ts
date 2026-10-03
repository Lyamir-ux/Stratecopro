// Honoraires AMO par jalon (migration 0111). Les lignes viennent de l'extraction
// Notion « AMO COPRO », chargée en SQL ; depuis 0112 le bloc Honoraires de
// l'onglet Projet revalorise la P2 et calcule les honoraires CEE (fonctions
// SQL, seules à écrire). La facturation directe viendra dans un second temps.
// Depuis 0121 (idée d'Amir du 01/10/2026), les honoraires de la phase études se
// saisissent aussi, à la création du dossier ou depuis le bloc.
// Depuis 0134 (demande d'Amir du 03/10/2026), chaque phase se saisit en
// nouvelle formule (montant réparti) ou en ancienne formule (jalons à la main).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, toutesLesLignes } from "@/lib/supabase";
import {
  jalonsOrdonnes,
  jalonsEnAttente,
  type CodeJalonContrat,
  type DossierHonoraires,
  type FormuleHonoraires,
  type PhaseContrat,
} from "@/lib/facturation";

const nombre = (v: number | string | null) => (v == null ? null : Number(v));
const formule = (v: string | null | undefined): FormuleHonoraires | null => (v === "nouvelle" || v === "ancienne" ? v : null);

/**
 * Lecture par pages (bug Amir 29/09, Armorial) : 8 jalons par dossier passent
 * les 1 000 lignes d'une réponse (1 580 le 29/09). Une revalorisation réécrit
 * les lignes P2 en fin de table : tronquées, elles disparaissaient du bloc
 * Honoraires, et l'annulation, qui les réécrit à nouveau, ne les montrait pas
 * davantage.
 */
export function useHonoraires() {
  return useQuery({
    queryKey: ["honoraires"],
    queryFn: async (): Promise<Map<string, DossierHonoraires>> => {
      const [jalons, { data: dossiers, error: e2 }] = await Promise.all([
        toutesLesLignes((debut, fin) =>
          supabase
            .from("honoraires_jalons")
            .select("copro_id, jalon, montant_ht, etat")
            .order("copro_id")
            .order("jalon") // clé primaire : ordre total d'une page à l'autre
            .range(debut, fin)
        ),
        supabase
          .from("honoraires_dossiers")
          .select(
            "copro_id, derniere_facture, source, p1_montant_ht, p1_saisi_le, p1_saisi_par, p1_formule, p2_montant_ht, p2_saisi_le, p2_saisi_par, p2_formule, cee_kwhc, cee_saisi_le, cee_saisi_par"
          ),
      ]);
      if (e2) throw e2;
      const parCopro = new Map<string, { jalon: string; montant_ht: number | null; etat: string }[]>();
      for (const j of jalons) {
        const l = parCopro.get(j.copro_id) ?? [];
        // numeric(12,2) : forcé en nombre, une chaîne ferait concaténer les sommes
        l.push({ ...j, montant_ht: nombre(j.montant_ht) });
        parCopro.set(j.copro_id, l);
      }
      const infos = new Map((dossiers ?? []).map((d) => [d.copro_id, d]));
      const out = new Map<string, DossierHonoraires>();
      for (const coproId of new Set([...parCopro.keys(), ...infos.keys()])) {
        const info = infos.get(coproId);
        out.set(coproId, {
          coproId,
          jalons: jalonsOrdonnes(parCopro.get(coproId) ?? []),
          derniereFacture: info?.derniere_facture ?? null,
          source: info?.source ?? null,
          saisies: {
            p1MontantHt: nombre(info?.p1_montant_ht ?? null),
            p1SaisiLe: info?.p1_saisi_le ?? null,
            p1SaisiPar: info?.p1_saisi_par ?? null,
            p1Formule: formule(info?.p1_formule),
            p2MontantHt: nombre(info?.p2_montant_ht ?? null),
            p2SaisiLe: info?.p2_saisi_le ?? null,
            p2SaisiPar: info?.p2_saisi_par ?? null,
            p2Formule: formule(info?.p2_formule),
            ceeKwhc: nombre(info?.cee_kwhc ?? null),
            ceeSaisiLe: info?.cee_saisi_le ?? null,
            ceeSaisiPar: info?.cee_saisi_par ?? null,
          },
        });
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });
}

const invaliderHonoraires = (qc: ReturnType<typeof useQueryClient>, coproId: string) => {
  void qc.invalidateQueries({ queryKey: ["honoraires"] });
  void qc.invalidateQueries({ queryKey: ["honoraires-saisies", coproId] });
};

/** « Saisir la P1 » : honoraires HT de la phase études, répartis 50 / 25 / 25 côté serveur (0121). */
export function useSaisirP1() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coproId, montantHt }: { coproId: string; montantHt: number }) => {
      const { error } = await supabase.rpc("honoraires_saisir_p1", { p_copro_id: coproId, p_montant_ht: montantHt });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invaliderHonoraires(qc, v.coproId),
  });
}

/** « Revaloriser la P2 » : honoraires HT de la phase travaux, répartis 50 / 30 / 20 côté serveur. */
export function useRevaloriserP2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coproId, montantHt }: { coproId: string; montantHt: number }) => {
      const { error } = await supabase.rpc("honoraires_revaloriser_p2", { p_copro_id: coproId, p_montant_ht: montantHt });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invaliderHonoraires(qc, v.coproId),
  });
}

/**
 * Ancienne formule (0134) : les trois jalons d'une phase saisis à la main ; un
 * jalon absent n'a pas de montant. Tracée et annulable comme une saisie répartie.
 */
export async function saisirJalonsPhase(
  coproId: string,
  phase: PhaseContrat,
  montants: Partial<Record<CodeJalonContrat, number>>
): Promise<void> {
  const { error } = await supabase.rpc("honoraires_saisir_jalons", { p_copro_id: coproId, p_phase: phase, p_montants: montants });
  if (error) throw error;
}

export function useSaisirJalons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ coproId, phase, montants }: { coproId: string; phase: PhaseContrat; montants: Partial<Record<CodeJalonContrat, number>> }) =>
      saisirJalonsPhase(coproId, phase, montants),
    onSuccess: (_d, v) => invaliderHonoraires(qc, v.coproId),
  });
}

/** « Honoraires CEE » : volume en kWh cumac, FCEE 1 = FCEE 2 = kWh cumac / 1 000 000 × 250 € HT. */
export function useSaisirCee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coproId, kwhc }: { coproId: string; kwhc: number }) => {
      const { error } = await supabase.rpc("honoraires_saisir_cee", { p_copro_id: coproId, p_kwhc: kwhc });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invaliderHonoraires(qc, v.coproId),
  });
}

// ---------- journal des saisies et annulation (0113) ----------
// Retour d'Amir 28/09/2026 (16:04) : annuler la dernière revalorisation de la
// P2 ou la dernière saisie CEE. Chaque saisie garde les montants qu'elle a
// remplacés ; l'annulation les rétablit (fonction SQL honoraires_annuler_saisie).

export type TypeSaisie = "p1" | "p2" | "cee";

export interface JalonAvant {
  existe: boolean;
  montant?: number | null;
}

export interface SaisieHonoraires {
  id: string;
  type: TypeSaisie;
  valeur: number;
  /** Montants des jalons avant la saisie, rétablis par l'annulation. */
  avant: Record<string, JalonAvant>;
  /** Montants écrits par la saisie. */
  apres: Record<string, number>;
  saisiLe: string;
  saisiPar: string | null;
}

/** Saisies encore actives (non annulées) du dossier, la plus récente d'abord. */
export function useSaisiesHonoraires(coproId: string) {
  return useQuery({
    queryKey: ["honoraires-saisies", coproId],
    queryFn: async (): Promise<SaisieHonoraires[]> => {
      const { data, error } = await supabase
        .from("honoraires_saisies")
        .select("id, type, valeur, avant, apres, saisi_le, saisi_par")
        .eq("copro_id", coproId)
        .is("annule_le", null)
        .order("ordre", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => {
        const avant = ((s.avant as { jalons?: Record<string, JalonAvant> } | null)?.jalons ?? {}) as Record<string, JalonAvant>;
        return {
          id: s.id,
          type: s.type as TypeSaisie,
          valeur: Number(s.valeur),
          avant: Object.fromEntries(
            Object.entries(avant).map(([k, v]) => [k, { existe: !!v.existe, montant: v.montant == null ? null : Number(v.montant) }])
          ),
          apres: Object.fromEntries(Object.entries((s.apres ?? {}) as Record<string, number | string>).map(([k, v]) => [k, Number(v)])),
          saisiLe: s.saisi_le,
          saisiPar: s.saisi_par,
        };
      });
    },
  });
}

/** Annule la dernière saisie active du type demandé et rétablit les montants d'avant. */
export function useAnnulerSaisie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coproId, type }: { coproId: string; type: TypeSaisie }) => {
      const { error } = await supabase.rpc("honoraires_annuler_saisie", { p_copro_id: coproId, p_type: type });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invaliderHonoraires(qc, v.coproId),
  });
}

/** Pastille du menu « Facturation » : dossiers dont une facture attend son paiement. */
export function compteEnAttente(honoraires: Map<string, DossierHonoraires> | undefined, coproIds: Set<string>): number {
  if (!honoraires) return 0;
  let n = 0;
  for (const d of honoraires.values()) if (coproIds.has(d.coproId) && jalonsEnAttente(d).length > 0) n++;
  return n;
}

// ---------- devis revalorisé (0114) ----------
// Demande d'Amir 28/09/2026 : le contrat AMO en PDF après « Revaloriser la P2 ».
// Le chargé d'affaire est le chef de projet du dossier ; son e-mail de
// connexion n'est lisible que côté serveur (devis_amo_chef_projet).

export interface ChefProjetDevis {
  full_name: string;
  initials: string;
  email: string;
}

/** Compte AMO du chef de projet du dossier, null si son nom ne correspond à aucun compte. */
export async function chargerChefProjetDevis(coproId: string): Promise<ChefProjetDevis | null> {
  const { data, error } = await supabase.rpc("devis_amo_chef_projet", { p_copro_id: coproId });
  if (error) throw error;
  return data?.[0] ?? null;
}
