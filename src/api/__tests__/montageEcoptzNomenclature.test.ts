// Documents à produire de l'éco-PTZ collectif (CEGEE) et nomenclature de numérisation de la
// Caisse d'Épargne Grand Est (colonne D, reçue le 08/10/2026) : chaque pièce que la banque
// nomme doit ouvrir son nom par le terme de la banque ; la copropriété vient après.
import { describe, expect, it } from "vitest";
import { DISPOSITIFS_RECAP } from "../fichiers";
import { ECOPTZ_ETAPES, docsOfEtape } from "../montage";
import { construireNomFichier, termeNomenclature, typesDepuisNom } from "@/lib/nommage";
import { estFicheEtatGeneree, nomFichierFicheEtat } from "@/lib/pdf/ficheEtat";

const docs = ECOPTZ_ETAPES.flatMap(docsOfEtape);

// Pièces du dossier éco-PTZ que la nomenclature de la banque ne nomme pas
// (règlement de copropriété, classeur « Demande de prêt » reste nommé DEMANDE DE PRET).
const HORS_NOMENCLATURE = new Set(["reglement_copropriete"]);

describe("documents à produire de l'éco-PTZ collectif et nomenclature de la banque", () => {
  it("donne un terme de la banque à chaque pièce que la banque nomme", () => {
    for (const d of docs) {
      if (HORS_NOMENCLATURE.has(d.type!)) continue;
      expect(termeNomenclature(d.type!), `${d.key} (${d.type})`).not.toBeNull();
    }
  });

  it("nomme chaque pièce par le terme de la colonne D de la banque", () => {
    const attendu: Record<string, string> = {
      attestation_impayes: "TAUX DE DEFAILLANCE",
      attestation_impayes_compte: "TAUX DE DEFAILLANCE",
      attestation_impayes_offre: "TAUX DE DEFAILLANCE",
      fiche_synthetique: "FICHE ANAH",
      attestation_registre: "MISE A JOUR ANNUELLE",
      avis_sirene: "SIRENE",
      rib_copro: "RIB COMPTE TRAVAUX",
      pv_ag_mandat: "PV AG SYNDIC",
      pv_ag_travaux: "PV AG TRAVAUX",
      annexes_comptables: "ANNEXES COMPTABLES",
      assurance_mri: "MRI",
      contrat_syndic: "CONTRAT SYNDIC",
      delegation_pouvoir: "DELEGATION POUVOIRS",
      cni_signataire: "CNI SIGNATAIRE",
      formulaire_ppe: "PPE SIGNATAIRE",
      excel_demande_pret: "DEMANDE DE PRET",
      audit_energetique: "AUDIT",
      devis_travaux: "DEVIS ENTREPRISE",
      rib_entreprises: "RIB",
      cerfa_emprunteur: "FORMULAIRE EMPRUNTEUR",
      cerfa_entreprises: "FORMULAIRE ENTREPRISES",
      preuve_convocation_ag: "PREUVE ENVOI CONVOC",
      annexe_2bis_cegc: "ATTESTATION CAUTIONNEMENT",
      attestation_non_recours: "ATT. NON RECOURS",
      fiche_etat_anah: "FICHE ETAT",
      notifications_subventions: "NOTIF ACCORD SUB",
      mail_beneficiaire_compte: "ACCORD SUB RIB",
    };
    for (const [key, terme] of Object.entries(attendu)) {
      const d = docs.find((x) => x.key === key);
      expect(d, key).toBeDefined();
      const nom = construireNomFichier(
        { prefixe: "Le Forum", type: d!.type!, objet: null, emetteur: null, date: null, etat: null },
        "pdf"
      );
      expect(nom.startsWith(`${terme} - LE FORUM`) || nom.startsWith(`${terme} LE FORUM`), `${key} : ${nom}`).toBe(true);
    }
  });

  it("garde la liste des pièces de l'éco-PTZ visible dans le dossier récapitulatif Éco-PTZ de l'onglet Fichiers", () => {
    const recap = DISPOSITIFS_RECAP.find((d) => d.id === "eco_ptz")!.types;
    for (const d of docs) expect(recap, `${d.key} (${d.type})`).toContain(d.type);
  });

  it("une pièce déposée sous son nouveau nom est reconnue par le dossier récapitulatif", () => {
    const recap = DISPOSITIFS_RECAP.find((d) => d.id === "eco_ptz")!.types;
    for (const d of docs) {
      const nom = construireNomFichier(
        { prefixe: "Le Forum", type: d.type!, objet: null, emetteur: null, date: "2026-10-01", etat: null },
        "pdf"
      );
      expect(typesDepuisNom(nom).some((t) => recap.includes(t)), `${d.key} : ${nom}`).toBe(true);
    }
  });
});

describe("fiche État générée par le logiciel", () => {
  it("ouvre par « FICHE ETAT » et se reconnaît, sous son ancien nom comme sous le nouveau", () => {
    expect(nomFichierFicheEtat("Le Forum", true)).toBe("FICHE ETAT - Le Forum - signee.pdf");
    expect(estFicheEtatGeneree("FICHE ETAT - Le Forum - signee.pdf")).toBe(true);
    expect(estFicheEtatGeneree("FICHE ETAT - Le Forum - projet.pdf")).toBe(true);
    expect(estFicheEtatGeneree("Fiche Etat ANAH - Le Forum - signee.pdf")).toBe(true);
  });

  it("ne confond pas avec une fiche déposée à la main sous le même terme", () => {
    expect(estFicheEtatGeneree("FICHE ETAT - LE FORUM - 2026-10-01.pdf")).toBe(false);
    expect(estFicheEtatGeneree("FICHE ETAT - LE FORUM - 2026-10-01 - signe.pdf")).toBe(false);
  });
});
