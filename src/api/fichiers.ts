// Fichiers du projet (bucket privé copro-files) + checklists de pièces par dispositif.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { nomFichierSansAccents, typeDepuisNom } from "@/lib/nommage";
import type { Tables } from "@/lib/database.types";
import { delierFichierDesChecklists, propagerDocument, retirerFichierDesMontages } from "@/api/propagation";

export type Fichier = Tables<"fichiers">;

export const DOSSIERS = [
  "Passation",
  "Diagnostic & audit",
  "Devis des études techniques et Frais Annexes",
  "Plans de financement",
  "Marchés de travaux",
  "Assemblée générale",
  "Photos chantier",
] as const;

/** Quels documents vont dans quel dossier - texte de la bulle « ? » de chaque
 *  carte de l'onglet Fichiers. Modifiez librement les descriptions ci-dessous. */
export const DOSSIER_AIDE: Record<(typeof DOSSIERS)[number], string> = {
  "Passation":
    "Documents remis à la prise en main du dossier : règlement de copropriété, derniers PV d'AG, carnet d'entretien, contrats en cours et pièces transmises par le syndic.",
  "Diagnostic & audit":
    "Audit énergétique réglementaire, DPE collectif, PPPT et rapports de diagnostic de la copropriété.",
  "Devis des études techniques et Frais Annexes":
    "Devis des études techniques (étude thermique, test d'étanchéité à l'air, diagnostic amiante-plomb), plans, contrats AMO et MOE et autres frais annexes.",
  "Plans de financement":
    "Plans de financement, accords de subvention, offres de prêt, attestations CEE (sur l'honneur, cadre contribution), RIB, immatriculation au registre et justificatifs des copropriétaires.",
  "Marchés de travaux":
    "Devis, factures, situations de travaux, marchés signés, ordres de service, CCTP / DCE, attestations RGE et décennales, Kbis, PV de réception.",
  "Assemblée générale":
    "Convocations, PV d'assemblée générale et courriers adressés aux copropriétaires.",
  "Photos chantier":
    "Photos de l'immeuble et du chantier - avant, pendant et après les travaux.",
};

/** Dossiers récapitulatifs par dispositif d'aide - virtuels : on n'y dépose
 *  rien, ils regroupent automatiquement les fichiers dont le type (déduit du
 *  nom normalisé, voir typeDepuisNom) concerne le dispositif. Un même fichier
 *  peut apparaître dans plusieurs dispositifs (ex. un devis de « Marchés de
 *  travaux » concerne CEE, MaPrimeRénov', Climaxion et Éco-PTZ).
 *  Modifiez librement les listes de types (ids de TYPES_DOCUMENT). */
export const DISPOSITIFS_RECAP: { id: string; label: string; types: string[] }[] = [
  {
    id: "cee",
    label: "CEE",
    types: [
      "devis", "devis_travaux", "facture", "situation_travaux", "attestation_rge", "attestation_rge_facture",
      "etude_thermique", "cadre_cee", "ah_cee", "ah_cee_a", "ah_cee_b", "pv_ag", "pv_ag_travaux", "pv_reception",
      // dossier CEE de la page Documents à produire (13/09/2026)
      "cctp_dce", "audit_energetique", "aif_cee", "aif_cee_signee", "avis_imposition", "rapport_cofrac_1", "rapport_cofrac_2",
    ],
  },
  {
    id: "mpr",
    label: "MaPrimeRénov'",
    types: [
      "devis", "devis_travaux", "devis_honoraires_moe", "facture", "marche_travaux", "pv_ag", "pv_ag_travaux",
      "pv_ag_mandat", "rib", "rib_compte_travaux", "contrat_amo", "contrat_moe", "audit_energetique",
      "autorisation_urbanisme", "fiche_etat_anah", "rapport_enquete_sociale", "plan_financement", "pf_definitif",
      "liste_primes_individuelles", "attestation_registre", "accord_subvention", "immatriculation", "avis_imposition",
    ],
  },
  {
    // Eurométropole de Strasbourg et Climaxion (Région Grand Est) : un seul
    // dossier depuis le 13/09/2026 (feedback Amir) - même checklist.
    id: "climaxion",
    label: "EMS & Climaxion",
    types: [
      "devis", "devis_travaux", "devis_fenetres", "audit_energetique", "etude_thermique", "pv_ag", "pv_ag_travaux",
      "pv_ag_moe", "pv_ag_lancement_amo", "plan_financement", "pf_definitif", "liste_primes_individuelles", "rib",
      "rib_compte_travaux", "accord_subvention",
      "fiche_synthetique", "attestation_registre", "attestation_composition", "reglement_copropriete",
      "attestation_logement_decent", "contrat_amo", "mandat_delegation_depot", "offre_moe",
      "test_etancheite", "memoire_technique", "plan", "photo", "attestation_conformite_offres",
      "rapport_conformite_offres", "cctp_dce", "planning", "avis_imposition", "liste_beneficiaires",
    ],
  },
  {
    id: "autre",
    label: "Autre",
    types: ["devis", "devis_travaux", "pv_ag", "pv_ag_travaux", "plan_financement", "pf_definitif", "dossier_demande_aide", "accord_subvention"],
  },
  {
    id: "eco_ptz",
    label: "Éco-PTZ",
    types: [
      "devis", "devis_travaux", "marche_travaux", "attestation_rge", "pv_ag", "pv_ag_travaux", "pv_ag_mandat",
      "rib_entreprises", "offre_pret", "cerfa_ecoptz_emprunteur", "cerfa_ecoptz_entreprise", "liste_participants_pret",
      // pièces du montage bancaire CEGEE (types ajoutés le 10/09/2026)
      "fiche_renseignements", "attestation_impayes", "fiche_synthetique", "attestation_registre",
      "avis_sirene", "annexes_comptables", "delegation_pouvoirs", "formulaire_ppe", "demande_pret",
      "cerfa_ecoptz", "attestation_non_recours", "attestation_caution", "fiche_etat_anah",
    ],
  },
];

export function useFichiers(coproId: string | undefined) {
  return useQuery({
    queryKey: ["fichiers", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Fichier[]> => {
      const { data, error } = await supabase
        .from("fichiers")
        .select("*")
        .eq("copro_id", coproId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Dépôt d'un fichier hors hook - sert aussi à l'import des documents de
 *  passation à la création du dossier (NewCoproDialog). */
export async function uploadFichierDirect(
  coproId: string,
  file: File,
  dossier: string,
  nameOriginal?: string
): Promise<{ id: string; path: string }> {
  // nom enregistré sans accent ni caractère spécial (feedback Amir 09/09)
  const nom = nomFichierSansAccents(file.name);
  const safe = nom.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${coproId}/${dossier.replace(/[^a-zA-Z0-9-]/g, "_")}/${Date.now()}-${safe}`;
  const { error: eUp } = await supabase.storage.from("copro-files").upload(path, file);
  if (eUp) throw eUp;
  const { data: session } = await supabase.auth.getSession();
  const { data: row, error: eDb } = await supabase
    .from("fichiers")
    .insert({
      copro_id: coproId,
      dossier,
      name: nom,
      name_original: nameOriginal && nameOriginal !== nom ? nameOriginal : null,
      storage_path: path,
      size: file.size,
      mime: file.type || null,
      uploaded_by: session.session?.user.id ?? null,
    })
    .select("id")
    .single();
  if (eDb) throw eDb;
  return { id: row.id, path };
}

/** Dépôt + propagation : la pièce est cochée dans toutes les checklists qui
 *  l'attendent et ajoutée aux dossiers de montage de même type (feedback Amir
 *  13/09/2026). Le type vient du dialogue de nommage, sinon du nom normalisé. */
export async function uploadFichierEtPropager(
  coproId: string,
  file: File,
  dossier: string,
  nameOriginal?: string,
  type?: string | null
): Promise<{ id: string; path: string }> {
  const res = await uploadFichierDirect(coproId, file, dossier, nameOriginal);
  const { data: session } = await supabase.auth.getSession();
  await propagerDocument(
    coproId,
    type ?? typeDepuisNom(file.name),
    {
      name: nomFichierSansAccents(file.name),
      name_original: nameOriginal && nameOriginal !== file.name ? nameOriginal : null,
      path: res.path,
      size: file.size,
      mime: file.type || null,
      uploaded_at: new Date().toISOString(),
      uploaded_by: session.session?.user.id ?? null,
    },
    { fichierId: res.id }
  );
  return res;
}

/** Après un dépôt ou un retrait : tout ce qui affiche des pièces se rafraîchit. */
export function invaliderPieces(qc: ReturnType<typeof useQueryClient>, coproId: string) {
  void qc.invalidateQueries({ queryKey: ["fichiers", coproId] });
  void qc.invalidateQueries({ queryKey: ["checklists", coproId] });
  void qc.invalidateQueries({ queryKey: ["montage", "docs", coproId] });
  void qc.invalidateQueries({ queryKey: ["syndic", "documents", coproId] });
}

export function useUploadFichier(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    // nameOriginal : nom du fichier avant renommage assisté (traçabilité) ;
    // type : type de document choisi dans le dialogue (propagation aux checklists)
    mutationFn: async ({
      file,
      dossier,
      nameOriginal,
      type,
    }: {
      file: File;
      dossier: string;
      nameOriginal?: string;
      type?: string | null;
    }) => {
      await uploadFichierEtPropager(coproId, file, dossier, nameOriginal, type);
    },
    onSuccess: () => invaliderPieces(qc, coproId),
  });
}

/** Rend un fichier visible (ou non) sur le portail copropriétaire. */
export function useTogglePartageFichier(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, partage }: { id: string; partage: boolean }) => {
      const { error } = await supabase.from("fichiers").update({ partage_copro: partage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fichiers", coproId] }),
  });
}

export function useDeleteFichier(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: Fichier) => {
      // Le fichier a pu cocher des pièces de checklist et être référencé par des
      // dossiers de montage : on défait tout avant de le supprimer.
      await delierFichierDesChecklists(f.id);
      await retirerFichierDesMontages(coproId, f.storage_path);
      await supabase.storage.from("copro-files").remove([f.storage_path]);
      const { error } = await supabase.from("fichiers").delete().eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => invaliderPieces(qc, coproId),
  });
}

/** Télécharge un fichier sous le nom affiché sur la plateforme (pas le nom de l'objet stocké). */
export async function downloadFichier(f: Fichier) {
  const a = document.createElement("a");
  a.href = await urlSigneeFichier(f.storage_path, f.name);
  a.download = f.name;
  a.target = "_blank";
  a.click();
}

/**
 * URL signée (5 min) d'un objet du bucket privé copro-files. Avec `download`,
 * Storage répond en Content-Disposition attachment sous ce nom : l'attribut
 * download d'un lien est ignoré par les navigateurs sur une URL cross-origin,
 * le fichier arrivait sous son nom de stockage (feedback d'Amir du 09/09/2026).
 */
export async function urlSigneeFichier(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("copro-files")
    .createSignedUrl(path, 300, download ? { download: nomFichierSansAccents(download) } : undefined);
  if (error || !data) throw error ?? new Error("URL de document indisponible");
  return data.signedUrl;
}

/** Formats que le navigateur affiche tel quel dans un cadre (aperçu sans téléchargement). */
const VISUALISABLES = /\.(pdf|png|jpe?g|gif|webp|svg|txt)$/i;

export const estVisualisable = (nom: string) => VISUALISABLES.test(nom);

// ========== Checklists de pièces ==========

/** Une pièce attendue : son libellé et son type de document (id TYPES_DOCUMENT).
 *  Le type relie la pièce à toutes les checklists et à tous les dossiers de la
 *  page « Documents à produire » qui attendent le même document : un dépôt
 *  coche la pièce partout (feedback Amir 13/09/2026). */
export interface PieceChecklist {
  label: string;
  type: string;
}

const piece = (label: string, type: string): PieceChecklist => ({ label, type });

export const CHECKLIST_TEMPLATES: { dispositif: string; label: string; items: PieceChecklist[] }[] = [
  {
    // fusion des anciennes listes « CEE - Avant travaux » et « CEE - Après
    // travaux » (feedback du 31/08/2026) - la clé `dispositif` reste
    // inchangée : c'est l'identifiant stocké en base
    dispositif: "cee_avant",
    label: "CEE",
    items: [
      piece("Devis signé avant engagement des travaux", "devis_travaux"),
      piece("Attestation RGE de l'entreprise", "attestation_rge"),
      piece("Note de dimensionnement / étude thermique", "etude_thermique"),
      piece("Cadre contribution CEE signé", "cadre_cee"),
      piece("PV d'AG votant les travaux", "pv_ag_travaux"),
      piece("Attestation sur l'honneur (partie A)", "ah_cee_a"),
      piece("Factures détaillées des travaux", "facture"),
      piece("Attestation sur l'honneur (partie B) signée", "ah_cee_b"),
      piece("PV de réception des travaux", "pv_reception"),
      piece("Preuves de qualification RGE à date de facture", "attestation_rge_facture"),
    ],
  },
  {
    // pièces obligatoires du dossier MaPrimeRénov' Copropriété (liste des
    // chefs de projet, feedback du 19/08/2026) - la clé `dispositif` reste
    // inchangée : c'est l'identifiant stocké en base. Mêmes pièces que le
    // dossier syndic ANAH_ETAPES (src/api/montage.ts).
    dispositif: "mpr_copro_2024",
    label: "MaPrimeRénov'",
    items: [
      piece("PV d'AG ayant décidé de réaliser les travaux", "pv_ag_travaux"),
      piece("PV d'AG nommant le représentant légal", "pv_ag_mandat"),
      piece("RIB du compte travaux", "rib_compte_travaux"),
      piece("Pièces marchés : devis détaillés / DPGF des travaux", "devis_travaux"),
      piece("Devis détaillés des honoraires de MOE et des autres études", "devis_honoraires_moe"),
      piece("Contrat du maître d'œuvre", "contrat_moe"),
      piece("Convention AMO signée", "contrat_amo"),
      piece("Audit énergétique réglementaire", "audit_energetique"),
      piece("Déclarations d'urbanisme", "autorisation_urbanisme"),
      piece("Fiche « État de la copropriété »", "fiche_etat_anah"),
      piece("Rapport d'enquête sociale", "rapport_enquete_sociale"),
      piece("Avis d'imposition des personnes éligibles aux aides individuelles (espace copropriétaires)", "avis_imposition"),
      piece("Liste des primes individuelles", "liste_primes_individuelles"),
      piece("Attestation de mise à jour du registre de copropriété", "attestation_registre"),
      piece("Plan de financement définitif de la copropriété (Excel)", "pf_definitif"),
    ],
  },
  {
    // Checklist commune Eurométropole de Strasbourg (EMS) et Climaxion (Région
    // Grand Est), fournie par Amir le 13/09/2026 - remplace les anciennes
    // listes « Climaxion » et « Eurométropole » (fusionnées, migration 0067).
    // La clé `dispositif` reste « climaxion » : c'est l'identifiant stocké en
    // base. Les mêmes 25 pièces forment le dossier syndic (CLIMAXION_ETAPES).
    dispositif: "climaxion",
    label: "EMS & Climaxion",
    items: [
      piece("Fiche synthétique de la copropriété", "fiche_synthetique"),
      piece("Attestation de mise à jour du registre de copropriété", "attestation_registre"),
      piece("Attestation de composition de la copropriété signée par le syndic", "attestation_composition"),
      piece("Règlement de copropriété", "reglement_copropriete"),
      piece("Attestation logement décent (modèle)", "attestation_logement_decent"),
      piece("PV d'AGE validant le lancement de l'AMO", "pv_ag_lancement_amo"),
      piece("RIB du compte travaux", "rib_compte_travaux"),
      piece("Convention AMO", "contrat_amo"),
      piece("Mandat de délégation de dépôt à l'AMO (modèle)", "mandat_delegation_depot"),
      piece("PV d'AG validant la maîtrise d'œuvre", "pv_ag_moe"),
      piece("Audit énergétique réglementaire et fichiers sources", "audit_energetique"),
      piece("Offre de la maîtrise d'œuvre", "offre_moe"),
      piece("Plan de financement définitif de l'opération", "pf_definitif"),
      piece("Rapport des tests initiaux d'étanchéité à l'air", "test_etancheite"),
      piece("Mémoire technique", "memoire_technique"),
      piece("Plans, coupes et photos des bâtiments", "plan"),
      piece("PV d'AGE validant les travaux", "pv_ag_travaux"),
      piece("Attestation de conformité des offres (modèle)", "attestation_conformite_offres"),
      piece("Rapport de conformité des offres (modèle)", "rapport_conformite_offres"),
      piece("CCTP et DPGF des lots énergétiques", "cctp_dce"),
      piece("Devis de remplacement des fenêtres", "devis_fenetres"),
      piece("Planning prévisionnel de l'opération", "planning"),
      piece("Avis d'imposition des personnes éligibles aux aides (espace copropriétaires)", "avis_imposition"),
      piece("Tableau récapitulatif des primes individuelles", "liste_primes_individuelles"),
      piece("Liste des bénéficiaires", "liste_beneficiaires"),
    ],
  },
  {
    // millésime 2026 (feedback du 19/08/2026) - la clé `dispositif` reste
    // inchangée : c'est l'identifiant stocké en base
    dispositif: "eco_ptz_2024",
    label: "Éco-PTZ",
    items: [
      piece("Formulaire emprunteur « copropriétés »", "cerfa_ecoptz_emprunteur"),
      piece("Formulaire entreprise par action de travaux", "cerfa_ecoptz_entreprise"),
      piece("Devis descriptifs des travaux", "devis_travaux"),
      piece("Attestations RGE", "attestation_rge"),
      piece("PV d'AG autorisant l'emprunt collectif", "pv_ag_travaux"),
      piece("Liste des copropriétaires participants", "liste_participants_pret"),
    ],
  },
];

/** Libellés des pièces (toutes checklists) attendues pour un type de document. */
export function labelsChecklistPourType(type: string): string[] {
  return CHECKLIST_TEMPLATES.flatMap((t) => t.items.filter((i) => i.type === type).map((i) => i.label));
}

export interface ChecklistWithItems extends Tables<"checklists"> {
  items: Tables<"checklist_items">[];
}

/** Checklists du dossier - créées depuis les gabarits au premier accès. */
export function useChecklists(coproId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["checklists", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<ChecklistWithItems[]> => {
      const { data: existing, error } = await supabase
        .from("checklists")
        .select("*, checklist_items(*)")
        .eq("copro_id", coproId!);
      if (error) throw error;
      let lists = existing ?? [];
      // Les libellés suivent toujours le gabarit (ex. millésime 2024 → 2026) :
      // on resynchronise ceux qui ont changé, sans toucher aux items cochés.
      const renames = lists.flatMap((l) => {
        const t = CHECKLIST_TEMPLATES.find((x) => x.dispositif === l.dispositif);
        return t && t.label !== l.label ? [{ id: l.id, label: t.label }] : [];
      });
      if (renames.length) {
        const results = await Promise.all(
          renames.map((r) => supabase.from("checklists").update({ label: r.label }).eq("id", r.id))
        );
        for (const r of results) if (r.error) throw r.error;
        const byId = new Map(renames.map((r) => [r.id, r.label]));
        lists = lists.map((l) => (byId.has(l.id) ? { ...l, label: byId.get(l.id)! } : l));
      }
      // Les pièces aussi suivent le gabarit tant que rien n'a été coché ni lié
      // (ex. fusion Climaxion + Eurométropole du 13/09/2026, ou checklist
      // recréée à l'ancien gabarit par un bundle déployé en retard). Dès qu'une
      // case est cochée ou un fichier lié, la liste n'est plus touchée.
      let itemsResync = false;
      for (const l of lists) {
        const t = CHECKLIST_TEMPLATES.find((x) => x.dispositif === l.dispositif);
        const items = ((l as { checklist_items?: Tables<"checklist_items">[] }).checklist_items ?? [])
          .slice()
          .sort((a, b) => a.position - b.position);
        if (!t || items.some((i) => i.done || i.fichier_id)) continue;
        const identiques = items.length === t.items.length && items.every((i, k) => i.label === t.items[k].label);
        if (identiques) continue;
        const { error: eDel } = await supabase.from("checklist_items").delete().eq("checklist_id", l.id);
        if (eDel) throw eDel;
        const { error: eIns } = await supabase
          .from("checklist_items")
          .insert(t.items.map(({ label }, i) => ({ checklist_id: l.id, label, position: i })));
        if (eIns) throw eIns;
        itemsResync = true;
      }
      if (itemsResync) {
        const { data: reloaded, error: e3 } = await supabase
          .from("checklists")
          .select("*, checklist_items(*)")
          .eq("copro_id", coproId!);
        if (e3) throw e3;
        lists = reloaded ?? [];
      }
      const missing = CHECKLIST_TEMPLATES.filter((t) => !lists.some((l) => l.dispositif === t.dispositif));
      if (missing.length) {
        for (const t of missing) {
          const { data: cl, error: e1 } = await supabase
            .from("checklists")
            .insert({ copro_id: coproId!, dispositif: t.dispositif, label: t.label })
            .select()
            .single();
          if (e1) throw e1;
          const { error: e2 } = await supabase
            .from("checklist_items")
            .insert(t.items.map(({ label }, i) => ({ checklist_id: cl.id, label, position: i })));
          if (e2) throw e2;
        }
        const { data: reloaded, error: e3 } = await supabase
          .from("checklists")
          .select("*, checklist_items(*)")
          .eq("copro_id", coproId!);
        if (e3) throw e3;
        lists = reloaded ?? [];
        void qc.invalidateQueries({ queryKey: ["checklists", coproId] });
      }
      return lists
        // Les checklists retirées des gabarits (ex. « CEE - Après travaux »,
        // fusionnée dans « CEE » ; « Autre », retirée le 13/09/2026 sur feedback
        // d'Amir) restent en base si un ancien bundle les recrée : on ne les
        // affiche plus.
        .filter((l) => CHECKLIST_TEMPLATES.some((t) => t.dispositif === l.dispositif))
        .map((l) => {
          const { checklist_items, ...rest } = l as typeof l & { checklist_items: Tables<"checklist_items">[] };
          return { ...rest, items: (checklist_items ?? []).sort((a, b) => a.position - b.position) };
        })
        .sort(
          (a, b) =>
            CHECKLIST_TEMPLATES.findIndex((t) => t.dispositif === a.dispositif) -
            CHECKLIST_TEMPLATES.findIndex((t) => t.dispositif === b.dispositif)
        );
    },
  });
}

export function useToggleChecklistItem(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("checklist_items").update({ done }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["checklists", coproId] }),
  });
}
