// Copropriétés à attribuer à un gestionnaire - feedback de Pierrot LEFOU
// (direction de SYNDIC 3000 GRAND EST) du 25/09/2026 : « un tableau avec les
// nouvelles copropriétés arrivées sur le compte direction pour l'attribuer à
// un gestionnaire, avec une pastille d'alerte ».
// Un dossier arrive « sur le compte de la direction » quand la demande d'AMO
// qui l'a ouvert venait du directeur : le demandeur devient le gestionnaire du
// dossier (DemandesAmo.tsx). La direction l'attribue à un gestionnaire ou le
// garde (attribution_gardee_le, 0103 : les dossiers qu'elle suivait déjà sont
// réputés gardés). Un dossier reste aussi à attribuer sans gestionnaire, ou
// quand le gestionnaire indiqué n'a pas de compte actif au rôle gestionnaire
// dans l'enseigne (e-mail saisi par l'AMO, administratif, compte désactivé).
import type { OrgRole } from "@/api/organisations";

export type MotifAttribution = "direction" | "aucun" | "sans_compte" | "autre_role" | "desactive";

export interface MembreAttribution {
  user_id: string;
  full_name: string;
  email: string;
  org_role: OrgRole;
  active: boolean;
}

export interface CoproAttribution {
  id: string;
  organisation_id: string | null;
  gestionnaire_nom: string | null;
  gestionnaire_email: string | null;
  created_at: string;
  /** La direction a choisi de garder ce dossier (motif « direction » levé). */
  attribution_gardee_le?: string | null;
}

export interface CoproAAttribuer<C extends CoproAttribution> {
  copro: C;
  motif: MotifAttribution;
  /** Compte de l'enseigne derrière l'e-mail du gestionnaire indiqué, s'il existe. */
  membre: MembreAttribution | null;
}

const courriel = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/** Motif pour lequel le dossier attend un gestionnaire (null : il en a un). */
export function motifAttribution(c: CoproAttribution, equipe: MembreAttribution[]): { motif: MotifAttribution; membre: MembreAttribution | null } | null {
  const email = courriel(c.gestionnaire_email);
  if (!email) return { motif: "aucun", membre: null };
  const membre = equipe.find((m) => courriel(m.email) === email) ?? null;
  if (!membre) return { motif: "sans_compte", membre };
  if (membre.org_role === "directeur") return c.attribution_gardee_le ? null : { motif: "direction", membre };
  if (membre.org_role !== "gestionnaire") return { motif: "autre_role", membre };
  if (!membre.active) return { motif: "desactive", membre };
  return null;
}

/** Dossiers de l'enseigne à attribuer, les plus récents d'abord. */
export function coprosAAttribuer<C extends CoproAttribution>(copros: C[], orgId: string, equipe: MembreAttribution[]): CoproAAttribuer<C>[] {
  const out: CoproAAttribuer<C>[] = [];
  for (const copro of copros) {
    if (copro.organisation_id !== orgId) continue;
    const m = motifAttribution(copro, equipe);
    if (m) out.push({ copro, ...m });
  }
  return out.sort((a, b) => b.copro.created_at.localeCompare(a.copro.created_at));
}

/** Comptes auxquels la direction peut attribuer un dossier (rôle gestionnaire, compte actif). */
export function gestionnairesAttribuables<M extends MembreAttribution>(equipe: M[]): M[] {
  return equipe
    .filter((m) => m.org_role === "gestionnaire" && m.active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"));
}

const ROLE_MINUSCULE: Record<OrgRole, string> = {
  directeur: "direction",
  gestionnaire: "gestionnaire",
  administratif: "administratif",
  comptable: "comptable",
};

/** Situation du dossier, en clair pour la direction. */
export function libelleMotif(a: Pick<CoproAAttribuer<CoproAttribution>, "copro" | "motif" | "membre">): string {
  const nomIndique = a.copro.gestionnaire_nom?.trim();
  switch (a.motif) {
    case "direction":
      return `Arrivée sur le compte de la direction (${a.membre?.full_name ?? nomIndique ?? "-"})`;
    case "aucun":
      return nomIndique ? `${nomIndique} indiqué, sans e-mail ni compte` : "Aucun gestionnaire désigné";
    case "sans_compte":
      return `${nomIndique || courriel(a.copro.gestionnaire_email)} indiqué, sans compte dans l'enseigne`;
    case "autre_role":
      return `${a.membre?.full_name ?? nomIndique} indiqué, compte ${ROLE_MINUSCULE[a.membre?.org_role ?? "administratif"]} (pas gestionnaire)`;
    case "desactive":
      return `${a.membre?.full_name ?? nomIndique}, compte désactivé`;
  }
}
