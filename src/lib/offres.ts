// Décomposition du prix d'une offre déposée sur une consultation : une ligne
// par phase ou prestation chiffrée, dans l'ordre de la mission. Partagée par
// la liste des candidatures de l'équipe (/consultations) et « Mes
// candidatures » de l'espace prestataire (Best Ryan, 01/10/2026 : « la
// décomposition complète du prix »).
import { fmtEuro } from "@/lib/format";
import type { Tables } from "@/lib/database.types";

type OffreChiffree = Pick<
  Tables<"candidatures">,
  | "tarif_diag_avp"
  | "tarif_pro_dce"
  | "tarif_pro_dce_mode"
  | "tarif_chantier"
  | "tarif_chantier_mode"
  | "tarif_options"
  | "tarif_etancheite_avant"
  | "tarif_etancheite_apres"
  | "tarif_conception"
  | "tarif_realisation"
  | "tarif_pppt"
  | "tarif_dpe"
  | "delai_pppt_semaines"
  | "delai_dpe_semaines"
>;

export interface LigneOffre {
  libelle: string;
  valeur: string;
}

const enPourcent = (v: number) => `${v.toLocaleString("fr-FR")} % du montant des travaux`;

/** Lignes chiffrées de l'offre (vide pour une offre au seul montant global).
 *  `optionLabel` traduit les prestations optionnelles d'une MOE. */
export function lignesOffre(cand: OffreChiffree, optionLabel: (id: string) => string): LigneOffre[] {
  const lignes: (LigneOffre | null)[] = [
    cand.tarif_diag_avp != null ? { libelle: "DIAG-AVP", valeur: fmtEuro(cand.tarif_diag_avp) } : null,
    cand.tarif_pro_dce != null
      ? {
          libelle: "PRO-DCE",
          valeur: cand.tarif_pro_dce_mode === "pourcentage" ? enPourcent(cand.tarif_pro_dce) : fmtEuro(cand.tarif_pro_dce),
        }
      : null,
    cand.tarif_chantier != null
      ? {
          libelle: "Suivi de chantier",
          valeur: cand.tarif_chantier_mode === "pourcentage" ? enPourcent(cand.tarif_chantier) : fmtEuro(cand.tarif_chantier),
        }
      : null,
    cand.tarif_etancheite_avant != null
      ? { libelle: "Étanchéité avant travaux", valeur: fmtEuro(cand.tarif_etancheite_avant) }
      : null,
    cand.tarif_etancheite_apres != null
      ? { libelle: "Étanchéité après travaux", valeur: fmtEuro(cand.tarif_etancheite_apres) }
      : null,
    cand.tarif_conception != null ? { libelle: "Phase conception", valeur: fmtEuro(cand.tarif_conception) } : null,
    cand.tarif_realisation != null ? { libelle: "Phase réalisation", valeur: fmtEuro(cand.tarif_realisation) } : null,
    // PPPT + DPE collectif (0110) : prix et délai de chaque prestation
    cand.tarif_pppt != null || cand.delai_pppt_semaines != null
      ? {
          libelle: "PPPT",
          valeur: `${cand.tarif_pppt != null ? fmtEuro(cand.tarif_pppt) : "non chiffré"}${cand.delai_pppt_semaines != null ? ` en ${cand.delai_pppt_semaines} sem.` : ""}`,
        }
      : null,
    cand.tarif_dpe != null || cand.delai_dpe_semaines != null
      ? {
          libelle: "DPE collectif",
          valeur: `${cand.tarif_dpe != null ? fmtEuro(cand.tarif_dpe) : "non chiffré"}${cand.delai_dpe_semaines != null ? ` en ${cand.delai_dpe_semaines} sem.` : ""}`,
        }
      : null,
    ...Object.entries((cand.tarif_options as Record<string, number> | null) ?? {}).map(([k, v]) => ({
      libelle: optionLabel(k),
      valeur: fmtEuro(v),
    })),
  ];
  return lignes.filter((l): l is LigneOffre => l != null);
}

/** Adresse sur une ligne : « 12-14 rue des Cigognes, 67000 Strasbourg ». Le
 *  code postal et la ville ne sont pas répétés quand l'adresse les contient
 *  déjà (Best Ryan, 01/10/2026 : « je n'ai pas l'adresse complète affichée »). */
export function adresseComplete(
  adresse: string | null | undefined,
  codePostal: string | null | undefined,
  ville: string | null | undefined
): string {
  const a = (adresse ?? "").trim();
  const cp = (codePostal ?? "").trim();
  const v = (ville ?? "").trim();
  // adresse qui porte déjà un code postal : complète telle quelle
  if ((cp && a.includes(cp)) || (!cp && /(?:^|\D)\d{5}(?!\d)/.test(a))) return a;
  // adresse réduite à la ville (« Strasbourg ») : pas de doublon
  const tete = v && a.toLowerCase() === v.toLowerCase() ? "" : a;
  return [tete, [cp, v].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
