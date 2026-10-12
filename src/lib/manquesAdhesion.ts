// Ce qui manque au dossier d'adhésion au prêt collectif avant « Passer à la signature »
// (/portail/pret). Retours de SCI SCHMITT PATRIMOINE du 12/10/2026 : « Passage à la signature
// impossible sans indication du champ qui bloque », puis « que manque-t-il ? » - le bouton restait
// grisé sans rien dire quand une case n'était pas cochée ou qu'un adhérent supplémentaire était
// incomplet. La même liste grise le bouton et s'affiche dessous : les deux ne peuvent plus diverger.
import type { CosignataireDeclare } from "@/api/signature";
import { nomEtPrenomRenseignes } from "./nomFamille";
import { estSci } from "./piecesSituation";
import { sirenValide, type Adherent, type AdherentSupplementaire, type AdhesionForm } from "./pdf/adhesion";
import { anneeIncomplete, composerDateLieu, dateFrVersIso, decouperDateLieu } from "./saisie";

/** Téléphone mobile français vers E.164 (+33612345678) ; un numéro déjà international reste tel quel. */
export function normaliserTelephone(tel: string): string {
  const brut = tel.replace(/[\s.\-()]/g, "");
  if (/^0[67]\d{8}$/.test(brut)) return "+33" + brut.slice(1);
  return brut;
}

export const telValide = (tel: string) => /^\+\d{8,15}$/.test(normaliserTelephone(tel));
export const emailValide = (e: string) => /.+@.+\..+/.test(e);

/** Formats de téléphone acceptés, rappelés sous un numéro refusé. */
export const AIDE_TELEPHONE = "06 ou 07 pour un portable français, sinon au format international, par exemple +49 152 12345678";

export interface EtatDossierAdhesion {
  form: AdhesionForm;
  /** signataire principal (vous) */
  principal: { prenom: string; nom: string };
  /** adhérent 1 marié ou pacsé : l'adhérent 2 ne donne que son adresse e-mail */
  couple: boolean;
  /** adhérent 2 hors couple : fiche de signature complète */
  ficheAdherent2: CosignataireDeclare;
  /** adhérents supplémentaires (indivision, associés d'une SCI…), chacun avec son bulletin */
  cosignataires: AdherentSupplementaire[];
  attestHonneur: boolean;
  infoAvis: boolean;
  /** SCI : cadre « Adhérent personne morale », représentant résolu, siège ; null hors SCI */
  personneMorale?: {
    siren: string;
    raisonSociale: string;
    representant: string;
    adresseSiege?: string;
    cpSiege?: string;
    villeSiege?: string;
  } | null;
}

/** Deux signataires avec le même e-mail ou le même téléphone (garde-fou anti auto-signature). */
export function coordonneesEnDouble({ form, couple, ficheAdherent2, cosignataires }: EtatDossierAdhesion): boolean {
  const adherent2Couple = !!form.adherent2 && couple;
  const adherent2Fiche = !!form.adherent2 && !couple;
  const emails = [
    form.email,
    adherent2Couple ? (form.adherent2?.email ?? "") : adherent2Fiche ? ficheAdherent2.email : "",
    ...cosignataires.map((c) => c.email),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const tels = [form.portable, adherent2Fiche ? ficheAdherent2.telephone : "", ...cosignataires.map((c) => c.telephone)]
    .map(normaliserTelephone)
    .filter(Boolean);
  return new Set(emails).size !== emails.length || new Set(tels).size !== tels.length;
}

/** Date et lieu de naissance (requis), dates « depuis le » (facultatives, jamais avec une année tapée en partie). */
function manquesIdentite(a: Pick<Adherent, "dateLieuNaissance" | "professionDepuis" | "situationDepuis">): string[] {
  const m: string[] = [];
  const { dateIso, lieu } = decouperDateLieu(a.dateLieuNaissance);
  if (!dateIso) m.push("date de naissance");
  else if (anneeIncomplete(dateIso)) m.push("année de naissance (4 chiffres)");
  if (!lieu.trim()) m.push("lieu de naissance");
  if (anneeIncomplete(dateFrVersIso(a.professionDepuis))) m.push("année de « Profession exercée depuis le » (4 chiffres)");
  if (anneeIncomplete(dateFrVersIso(a.situationDepuis))) m.push("année de la situation matrimoniale « Depuis le » (4 chiffres)");
  return m;
}

/** Adhérent supplémentaire : fiche de signature, puis les champs obligatoires de l'adhérent 1
 *  (naissance, adresse personnelle) puisqu'il remplit son propre bulletin. */
function manquesAdherentSupplementaire(s: AdherentSupplementaire): string[] {
  const m = manquesFiche(s);
  m.push(
    ...manquesIdentite({
      dateLieuNaissance: composerDateLieu(s.date_naissance, s.lieu_naissance),
      professionDepuis: s.professionDepuis,
      situationDepuis: s.situationDepuis,
    }),
  );
  if (!s.adresse_ligne1.trim()) m.push("adresse personnelle");
  if (!s.code_postal.trim()) m.push("code postal");
  if (!s.ville.trim()) m.push("ville");
  return m;
}

/** Fiche d'un signataire déclaré à la main : e-mail, téléphone mobile, prénom, nom. */
function manquesFiche(c: CosignataireDeclare): string[] {
  const m: string[] = [];
  if (!c.email.trim()) m.push("e-mail");
  else if (!emailValide(c.email)) m.push("e-mail non valide");
  if (!c.telephone.trim()) m.push("téléphone mobile");
  else if (!telValide(c.telephone)) m.push(`téléphone mobile non valide (${AIDE_TELEPHONE})`);
  if (!c.prenom.trim()) m.push("prénom");
  if (!c.nom.trim()) m.push("nom");
  return m;
}

/** Ce qui manque encore, dans l'ordre du formulaire ; vide = « Passer à la signature » possible. */
export function manquesAdhesion(e: EtatDossierAdhesion): string[] {
  const { form, couple } = e;
  const manques: string[] = [];
  const ligne = (qui: string, m: string[]) => {
    if (m.length) manques.push(`${qui} : ${m.join(", ")}`);
  };

  const pm = e.personneMorale;
  if (pm) {
    const m: string[] = [];
    if (!pm.siren.trim()) m.push("N° de SIREN");
    else if (!sirenValide(pm.siren)) m.push("N° de SIREN non valide (9 chiffres)");
    if (!pm.raisonSociale.trim()) m.push("raison sociale");
    if (!pm.representant.trim()) m.push("représentée par");
    if (!(pm.adresseSiege ?? "").trim()) m.push("adresse du siège");
    if (!(pm.cpSiege ?? "").trim()) m.push("code postal du siège");
    if (!(pm.villeSiege ?? "").trim()) m.push("ville du siège");
    ligne("SCI (adhérent personne morale)", m);
  }

  // SCI : le cadre « Adhérent » est rempli par le gérant, une personne (NB du bulletin CEGEE)
  const nomA1 = form.adherent1.nomPrenom.trim();
  ligne("Adhérent 1", [
    ...(!nomA1 ? ["nom et prénom"] : pm && estSci(undefined, nomA1) ? ["nom et prénom du gérant (pas le nom de la SCI)"] : []),
    ...manquesIdentite(form.adherent1),
  ]);

  const a2 = form.adherent2;
  if (a2) {
    const m: string[] = [];
    if (!a2.nomPrenom.trim()) m.push("nom et prénom");
    else if (couple && !nomEtPrenomRenseignes(a2.nomPrenom)) m.push("nom et prénom (les deux)");
    m.push(...manquesIdentite(a2));
    if (couple) {
      const email = (a2.email ?? "").trim();
      if (!email) m.push("adresse e-mail");
      else if (!emailValide(email)) m.push("adresse e-mail non valide");
    }
    ligne("Adhérent 2", m);
    if (!couple) ligne("Adhérent 2, informations pour sa signature", manquesFiche(e.ficheAdherent2));
  }

  if (!form.adresse.trim()) manques.push("Adresse personnelle");
  if (!form.cp.trim()) manques.push("Code postal");
  if (!form.ville.trim()) manques.push("Ville");
  if (!form.portable.trim()) manques.push("Téléphone portable");
  else if (!telValide(form.portable)) manques.push(`Téléphone portable : numéro non valide (${AIDE_TELEPHONE})`);
  if (!form.email.trim()) manques.push("E-mail");
  else if (!emailValide(form.email)) manques.push("E-mail : adresse non valide");
  if (form.montantType === "autre" && !form.montantAutre.trim()) manques.push("Montant demandé : indiquez l'autre montant");
  if (!form.lieuSignature.trim()) manques.push("Fait à (lieu de signature)");

  ligne("Signataire principal", [
    ...(e.principal.prenom.trim() ? [] : ["prénom"]),
    ...(e.principal.nom.trim() ? [] : ["nom"]),
  ]);
  e.cosignataires.forEach((c, i) => ligne(`Adhérent supplémentaire ${i + 1}`, manquesAdherentSupplementaire(c)));
  if (coordonneesEnDouble(e)) {
    manques.push("Chaque signataire doit avoir son propre e-mail et son propre téléphone");
  }

  if (!e.attestHonneur) manques.push("Cochez l'attestation sur l'honneur (coordonnées des personnes déclarées)");
  if (!e.infoAvis) manques.push("Cochez la case d'information sur la transmission de votre avis d'imposition");
  return manques;
}
