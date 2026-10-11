// Signataire de l'adhérent 2 (conjoint, co-emprunteur) du dossier d'adhésion au prêt collectif.
// Retour de A CHELGHAM du 11/10/2026 : une fois l'adhérent 2 renseigné dans le formulaire, il ne
// reste qu'à demander son adresse e-mail pour lui envoyer le lien de signature - son nom, sa date
// et son lieu de naissance sont déjà dans le formulaire, l'adresse est celle du bulletin. Le code
// de signature arrive par e-mail (jamais par SMS) : plus de téléphone à demander.
import type { CosignataireDeclare } from "@/api/signature";
import { decouperDateLieu } from "./saisie";
import { separerNomPrenom } from "./nomFamille";
import type { Adherent } from "./pdf/adhesion";

export function signataireDepuisAdherent2(
  a: Pick<Adherent, "nomPrenom" | "dateLieuNaissance" | "email">,
  adresse: { adresse: string; cp: string; ville: string }
): CosignataireDeclare {
  const { nom, prenom } = separerNomPrenom(a.nomPrenom);
  const { dateIso, lieu } = decouperDateLieu(a.dateLieuNaissance);
  return {
    civilite: "",
    nom,
    prenom,
    email: (a.email ?? "").trim(),
    telephone: "",
    adresse_ligne1: adresse.adresse.trim(),
    code_postal: adresse.cp.trim(),
    ville: adresse.ville.trim(),
    date_naissance: dateIso,
    lieu_naissance: lieu.trim(),
  };
}
