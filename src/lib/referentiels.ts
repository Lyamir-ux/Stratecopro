// Référentiels d'affichage (couleurs DPE, phases, rôles d'espace).
// L'équipe AMO vient de la table `profiles` (M2) — TEAM_FALLBACK sert
// uniquement d'affichage avant chargement / pour les initiales inconnues.

export type DpeClass = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export const DPE: Record<DpeClass, string> = {
  A: "#319834", B: "#52b153", C: "#a8c63a",
  D: "#f4d000", E: "#f2a30d", F: "#eb6909", G: "#e30613",
};

export type PhaseId = "diagnostic" | "etudes" | "travaux";

export const PHASES: { id: PhaseId; label: string; short: string }[] = [
  { id: "diagnostic", label: "Diagnostic", short: "Diag." },
  { id: "etudes", label: "Études", short: "Études" },
  { id: "travaux", label: "Travaux", short: "Travaux" },
];

export interface TeamMember { initials: string; name: string; role: string }

export const TEAM_FALLBACK: Record<string, TeamMember> = {
  CB: { initials: "CB", name: "Claire Becker", role: "Cheffe de projet AMO" },
  TM: { initials: "TM", name: "Thomas Muller", role: "Ingénieur financier" },
  LR: { initials: "LR", name: "Léa Roth", role: "Chargée d'enquête sociale" },
  YK: { initials: "YK", name: "Yanis Kessler", role: "Suivi de chantier" },
};

export type RoleId = "amo" | "syndic" | "moe" | "copro" | "presta";

// Le rôle `presta` couvre la MOE ET les autres intervenants (diagnostiqueur,
// contrôleur technique, SPS…) : les métiers réellement couverts vivent sur la
// fiche `prestataires.types`. L'ancien rôle `moe` reste dans l'enum mais
// n'est plus proposé à la connexion.
export const ROLES: { id: RoleId; label: string; sub: string; icon: string; active: boolean }[] = [
  { id: "amo", label: "AMO", sub: "Pilotage complet des dossiers", icon: "gauge", active: true },
  { id: "syndic", label: "Syndic", sub: "Vos copropriétés gérées", icon: "building", active: true },
  { id: "presta", label: "MOE & intervenants", sub: "Consultations et candidatures", icon: "hammer", active: true },
  { id: "copro", label: "Copropriétaire", sub: "Votre projet de rénovation", icon: "user", active: true },
];

/** Profils MaPrimeRénov' — infos d'affichage (portail + enquête).
 *  `menage` = libellé grand public (les couleurs restent un code interne AMO). */
export const PROFILS_MPR: Record<string, { color: string; label: string; desc: string; taux: string; menage: string }> = {
  Bleu: { color: "#2E6FA8", label: "Bleu", desc: "Revenus très modestes", taux: "jusqu'à 50 %", menage: "Ménage aux revenus très modestes" },
  Jaune: { color: "#f2a30d", label: "Jaune", desc: "Revenus modestes", taux: "jusqu'à 35 %", menage: "Ménage aux revenus modestes" },
  Violet: { color: "#7A5AE0", label: "Violet", desc: "Revenus intermédiaires", taux: "jusqu'à 25 %", menage: "Ménage aux revenus intermédiaires" },
  Rose: { color: "#DC6FA8", label: "Rose", desc: "Revenus supérieurs", taux: "jusqu'à 15 %", menage: "Ménage aux revenus supérieurs" },
};
