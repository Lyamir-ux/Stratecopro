// Assemblage des documents éco-PTZ individuel d'un logement (02/10/2026) :
// signataires de l'envoi (entreprises, auditeur, syndic), contenu du CERFA
// Annexe 3.1 et de l'attestation, données manquantes avant l'envoi.
import type { AuditEcoPtz, DossierEcoPtz, PosteEcoPtzSaisi } from "@/lib/ecoPtzDonnees";
import { emailValide, manquantsAudit, manquantsPoste } from "@/lib/ecoPtzDonnees";
import { decouperAdresse, type LogementEcoPtz, type PosteEcoPtz } from "@/lib/finance/ecoPtzIndividuel";
import type { CerfaEcoPtzInput } from "@/lib/pdf/cerfaEcoPtz";
import type { AttestationEcoPtzInput } from "@/lib/pdf/attestationEcoPtz";
import { construireNomFichier, nomFichierSansAccents } from "@/lib/nommage";

/** Ce qu'il faut de la copropriété (sous-ensemble de CoproWithStats). */
export interface CoproEcoPtz {
  name: string;
  adresse: string | null;
  code_postal: string | null;
  city: string | null;
  syndic_name: string | null;
  gestionnaire_nom: string | null;
  gestionnaire_email: string | null;
}

export type RoleSignataire = "entreprise" | "auditeur" | "syndic";

export interface SignataireEcoPtz {
  cle: string;
  role: RoleSignataire;
  prestataire_id: string | null;
  societe: string;
  siret: string;
  nom: string;
  email: string;
}

/** Entreprise retenue pour un poste : saisie du questionnaire, sinon entreprise du PF (sans SIRET ni contact). */
export function entreprisePoste(dossier: DossierEcoPtz | undefined, p: PosteEcoPtz): PosteEcoPtzSaisi {
  const saisi = dossier?.postes[String(p.lotNumero)];
  if (saisi?.raison_sociale?.trim()) return saisi;
  return { lot_numero: p.lotNumero, titre: p.titre, raison_sociale: p.entreprisePf ?? "" };
}

const cleEntreprise = (e: PosteEcoPtzSaisi) =>
  "ent:" + (e.prestataire_id || e.raison_sociale.trim().toLowerCase().replace(/\s+/g, " "));

/** Syndic signataire : gestionnaire du dossier, modifiable à l'envoi. */
export function syndicParDefaut(copro: CoproEcoPtz): SignataireEcoPtz {
  return {
    cle: "syndic",
    role: "syndic",
    prestataire_id: null,
    societe: copro.syndic_name?.trim() ?? "",
    siret: "",
    nom: copro.gestionnaire_nom?.trim() ?? "",
    email: copro.gestionnaire_email?.trim() ?? "",
  };
}

/** Signataires de l'envoi et signataire de chaque poste (une entreprise sur plusieurs lots signe une fois). */
export function signatairesEcoPtz(
  dossier: DossierEcoPtz | undefined,
  postes: PosteEcoPtz[],
  syndic: SignataireEcoPtz
): { signataires: SignataireEcoPtz[]; parPoste: Map<number, string> } {
  const a: AuditEcoPtz = dossier?.audit ?? {};
  const signataires: SignataireEcoPtz[] = [
    syndic,
    {
      cle: "auditeur",
      role: "auditeur",
      prestataire_id: a.prestataire_id ?? null,
      societe: a.raison_sociale?.trim() ?? "",
      siret: a.siret?.trim() ?? "",
      nom: a.contact_nom?.trim() ?? "",
      email: a.contact_email?.trim() ?? "",
    },
  ];
  const parPoste = new Map<number, string>();
  for (const p of postes) {
    const e = entreprisePoste(dossier, p);
    const cle = cleEntreprise(e);
    parPoste.set(p.lotNumero, cle);
    if (!signataires.some((s) => s.cle === cle))
      signataires.push({
        cle,
        role: "entreprise",
        prestataire_id: e.prestataire_id ?? null,
        societe: e.raison_sociale.trim(),
        siret: e.siret?.trim() ?? "",
        nom: e.contact_nom?.trim() ?? "",
        email: e.contact_email?.trim() ?? "",
      });
  }
  return { signataires, parPoste };
}

/** Données manquantes communes à tous les logements (audit, entreprises, syndic, validation). */
export function manquantsDossier(
  dossier: DossierEcoPtz | undefined,
  postes: PosteEcoPtz[],
  syndic: SignataireEcoPtz
): string[] {
  const out: string[] = [];
  if (!postes.length) out.push("Aucun lot de travaux retenu dans le PF définitif validé");
  const ma = manquantsAudit(dossier?.audit);
  if (ma.length) out.push(`Audit : ${ma.join(", ")}`);
  else if (dossier?.audit_statut !== "valide") out.push("Audit : données à valider par Strat Eco");
  for (const p of postes) {
    const e = entreprisePoste(dossier, p);
    const mp = manquantsPoste(e);
    if (mp.length) out.push(`Lot ${p.lotNumero} (${p.titre}) : ${mp.join(", ")}`);
    else if (dossier?.postes[String(p.lotNumero)]?.statut !== "valide")
      out.push(`Lot ${p.lotNumero} (${p.titre}) : entreprise à valider par Strat Eco`);
  }
  if (!syndic.societe) out.push("Syndic : nom de l'enseigne");
  if (!syndic.nom) out.push("Syndic : nom du signataire");
  if (!emailValide(syndic.email)) out.push("Syndic : e-mail du signataire");
  return out;
}

/** Postes où le logement a une quote-part (un lot réparti sur un autre bâtiment en est exclu). */
export const lignesUtiles = (l: LogementEcoPtz) => l.lignes.filter((x) => x.quotePart > 0);

/** « Lot n°12 (bâtiment A) avec cave n°45 » */
export function libelleLogement(l: LogementEcoPtz): string {
  const annexes = l.annexes.map((a) => `n°${a.num}`).join(", ");
  return `Lot n°${l.lotNum}${l.batiment ? ` (bâtiment ${l.batiment})` : ""}${annexes ? ` avec annexe${l.annexes.length > 1 ? "s" : ""} ${annexes}` : ""}`;
}

const nettoyerNombre = (s: string | undefined) => (s ?? "").replace(/%/g, "").trim();
const classe = (s: string | undefined) => (s ?? "").trim().toUpperCase().slice(0, 1);

export function cerfaInputLogement(
  copro: CoproEcoPtz,
  dossier: DossierEcoPtz | undefined,
  logement: LogementEcoPtz,
  postes: PosteEcoPtz[],
  parPoste: Map<number, string>
): CerfaEcoPtzInput {
  const a = dossier?.audit ?? {};
  const adr = decouperAdresse(copro.adresse);
  const lots = [`lot n°${logement.lotNum}`, ...logement.annexes.map((x) => `n°${x.num}`)].join(", ");
  return {
    adresse: { num: adr.num, voie: adr.voie, cp: copro.code_postal ?? "", ville: (copro.city ?? "").toUpperCase() },
    batiment: `${copro.name}${logement.batiment ? ` bât. ${logement.batiment}` : ""} - ${logement.nom} (${lots})`,
    syndic: copro.syndic_name ?? "",
    sci: logement.personneMorale === "sci",
    audit: {
      reference: a.reference ?? "",
      date: a.date ?? "",
      scenario: a.scenario ?? "",
      coutTtc: nettoyerNombre(a.cout_ttc).replace(/\s*€.*$/, ""),
      classeAvant: classe(a.classe_avant),
      consoAvant: nettoyerNombre(a.conso_avant),
      classeApres: classe(a.classe_apres),
      consoApres: nettoyerNombre(a.conso_apres),
      gain: nettoyerNombre(a.gain_pct),
      prestataire: [a.raison_sociale, a.contact_nom].filter((x) => x?.trim()).join(" - "),
      siret: a.siret ?? "",
    },
    // un poste sans quote-part (lot d'un autre bâtiment) ne figure pas sur le CERFA du logement
    postes: lignesUtiles(logement).map((ligne) => {
      const p = postes.find((x) => x.lotNumero === ligne.lotNumero)!;
      const e = entreprisePoste(dossier, p);
      return {
        description: e.designation?.trim() || p.titre,
        entreprise: e.raison_sociale,
        siret: e.siret ?? "",
        montant: ligne.quotePart,
        signataire: parPoste.get(p.lotNumero)!,
      };
    }),
    signataireSyndic: "syndic",
    signataireAuditeur: "auditeur",
  };
}

export function attestationInputLogement(
  copro: CoproEcoPtz,
  dossier: DossierEcoPtz | undefined,
  logement: LogementEcoPtz,
  postes: PosteEcoPtz[]
): AttestationEcoPtzInput {
  const a = dossier?.audit ?? {};
  const fmtT = (n: number) => n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
  return {
    copro: {
      nom: copro.name,
      adresse: [copro.adresse, [copro.code_postal, copro.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    },
    emprunteur: logement.nom,
    logement: libelleLogement(logement),
    syndic: copro.syndic_name ?? "",
    audit: {
      reference: a.reference ?? "",
      scenario: a.scenario ?? "",
      gain: nettoyerNombre(a.gain_pct),
      consoAvant: nettoyerNombre(a.conso_avant),
      consoApres: nettoyerNombre(a.conso_apres),
      classeAvant: classe(a.classe_avant),
      classeApres: classe(a.classe_apres),
    },
    lignes: lignesUtiles(logement).map((l) => {
      const p = postes.find((x) => x.lotNumero === l.lotNumero)!;
      const e = entreprisePoste(dossier, p);
      return {
        travaux: e.designation?.trim() || p.titre,
        entreprise: e.raison_sociale,
        montantCopro: l.montantCopro,
        tantiemes: l.plusieursCles ? "plusieurs clés" : `${fmtT(l.tantiemes)} / ${fmtT(l.totalCle)}`,
        quotePart: l.quotePart,
      };
    }),
    signataireSyndic: "syndic",
  };
}

/** Noms des fichiers signés, au format des Fichiers du dossier. */
export function nomsFichiersLogement(copro: CoproEcoPtz, logement: LogementEcoPtz, date: string) {
  const objet = `${logement.nom} lot ${logement.lotNum}`;
  const nom = (type: string) =>
    nomFichierSansAccents(construireNomFichier({ prefixe: copro.name, type, objet, emetteur: null, date, etat: "signe" }, "pdf"));
  return { cerfa: nom("cerfa_ecoptz_entreprise"), attestation: nom("attestation_ecoptz_individuel") };
}
