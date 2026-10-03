import { describe, expect, it } from "vitest";
import type { DossierEcoPtz } from "@/lib/ecoPtzDonnees";
import { manquantsAudit, manquantsPoste, questionnaireEcoPtzPour } from "@/lib/ecoPtzDonnees";
import type { LogementEcoPtz, PosteEcoPtz } from "@/lib/finance/ecoPtzIndividuel";
import {
  attestationInputLogement,
  cerfaInputLogement,
  libelleLogement,
  manquantsDossier,
  signatairesEcoPtz,
  syndicParDefaut,
  type CoproEcoPtz,
} from "../ecoPtzDocuments";

const copro: CoproEcoPtz = {
  name: "LE CATALPA",
  adresse: "4 route d'Oberhausbergen",
  code_postal: "67200",
  city: "Strasbourg",
  syndic_name: "CITYA RUHL SEGESCA",
  gestionnaire_nom: "Julie MARTIN",
  gestionnaire_email: "j.martin@citya.com",
};

const postes: PosteEcoPtz[] = [
  { lotNumero: 2, titre: "ITE", entreprisePf: "DECOPEINT", montantTtc: 1000, parCle: { GEN: 1000 }, nbLignes: 1, lignesSansCle: 0 },
  { lotNumero: 3, titre: "Peinture des façades", entreprisePf: "DECOPEINT", montantTtc: 500, parCle: { GEN: 500 }, nbLignes: 1, lignesSansCle: 0 },
  { lotNumero: 5, titre: "VMC", entreprisePf: "SCHUCH", montantTtc: 300, parCle: { BATB: 300 }, nbLignes: 1, lignesSansCle: 0 },
];

const auditComplet = {
  reference: "A25670370399R",
  date: "02/12/2025",
  scenario: "Scénario 1",
  classe_avant: "e",
  conso_avant: "243",
  classe_apres: "C",
  conso_apres: "96",
  gain_pct: "60 %",
  raison_sociale: "INGEDAIR",
  siret: "791 603 384 00045",
  contact_nom: "Camille STADELMANN",
  contact_email: "c.stadelmann@ingedair.fr",
  prestataire_id: "p-audit",
};

const dossier: DossierEcoPtz = {
  copro_id: "c",
  audit: auditComplet,
  audit_statut: "valide",
  audit_valide_le: "2026-10-02",
  postes: {
    "2": { lot_numero: 2, raison_sociale: "DECOPEINT", siret: "70850112700052", contact_nom: "Paul", contact_email: "p@decopeint.fr", prestataire_id: "p-deco", statut: "valide" },
    "3": { lot_numero: 3, raison_sociale: "DECOPEINT", siret: "70850112700052", contact_nom: "Paul", contact_email: "p@decopeint.fr", prestataire_id: "p-deco", statut: "valide", designation: "Peinture" },
  },
  updated_at: "",
};

const logement: LogementEcoPtz = {
  lotId: "h1",
  lotNum: "12",
  batiment: "A",
  coproprietaireId: "a",
  nom: "BINDER Etienne",
  annexes: [{ id: "c1", num: "45", usage: "caves" }],
  tantiemes: { GEN: 210 },
  lignes: [
    { lotNumero: 2, titre: "ITE", montantCopro: 1000, cle: "GEN", tantiemes: 210, totalCle: 1000, plusieursCles: false, quotePart: 210 },
    { lotNumero: 3, titre: "Peinture des façades", montantCopro: 500, cle: "GEN", tantiemes: 210, totalCle: 1000, plusieursCles: false, quotePart: 105 },
    { lotNumero: 5, titre: "VMC", montantCopro: 300, cle: "BATB", tantiemes: 0, totalCle: 400, plusieursCles: false, quotePart: 0 },
  ],
  total: 315,
  personneMorale: null,
};

describe("signataires et données manquantes", () => {
  it("une entreprise sur deux lots ne signe qu'une fois ; le syndic et l'auditeur en tête", () => {
    const { signataires, parPoste } = signatairesEcoPtz(dossier, postes, syndicParDefaut(copro));
    expect(signataires.map((s) => s.cle)).toEqual(["syndic", "auditeur", "ent:p-deco", "ent:schuch"]);
    expect(parPoste.get(2)).toBe(parPoste.get(3));
  });

  it("signale l'entreprise du PF sans SIRET ni contact, et ce qui reste à valider", () => {
    const m = manquantsDossier(dossier, postes, syndicParDefaut(copro));
    expect(m).toEqual(["Lot 5 (VMC) : SIRET, interlocuteur, e-mail du contact"]);
    const m2 = manquantsDossier({ ...dossier, audit_statut: "a_verifier" }, postes.slice(0, 2), { ...syndicParDefaut(copro), email: "" });
    expect(m2).toEqual(["Audit : données à valider par Strat Eco", "Syndic : e-mail du signataire"]);
  });

  it("contrôle les champs de l'audit et des entreprises", () => {
    expect(manquantsAudit({})).toHaveLength(12);
    expect(manquantsAudit({ ...auditComplet, siret: "123", contact_email: "x" })).toEqual([
      "SIRET de l'auditeur (14 chiffres)",
      "E-mail de l'interlocuteur (format)",
    ]);
    expect(manquantsPoste({ lot_numero: 2, raison_sociale: "" })).toEqual(["entreprise"]);
    expect(questionnaireEcoPtzPour("audit_energetique")).toBe("audit");
    expect(questionnaireEcoPtzPour("cctp_dce")).toBe("travaux");
    expect(questionnaireEcoPtzPour("pv_ag")).toBeNull();
  });
});

describe("contenu des documents", () => {
  const { parPoste } = signatairesEcoPtz(dossier, postes, syndicParDefaut(copro));

  it("CERFA : adresse découpée, classes en majuscule, postes sans quote-part retirés", () => {
    const c = cerfaInputLogement(copro, dossier, logement, postes, parPoste);
    expect(c.adresse).toEqual({ num: "4", voie: "route d'Oberhausbergen", cp: "67200", ville: "STRASBOURG" });
    expect(c.batiment).toBe("LE CATALPA bât. A - BINDER Etienne (lot n°12, n°45)");
    expect(c.audit).toMatchObject({ classeAvant: "E", gain: "60", prestataire: "INGEDAIR - Camille STADELMANN" });
    expect(c.postes.map((p) => [p.description, p.montant])).toEqual([
      ["ITE", 210],
      ["Peinture", 105],
    ]);
  });

  it("attestation : libellé du logement et tantièmes de la clé", () => {
    const a = attestationInputLogement(copro, dossier, logement, postes);
    expect(libelleLogement(logement)).toBe("Lot n°12 (bâtiment A) avec annexe n°45");
    expect(a.lignes.map((l) => l.tantiemes)).toEqual(["210 / 1 000", "210 / 1 000"]);
    expect(a.copro.adresse).toBe("4 route d'Oberhausbergen, 67200 Strasbourg");
  });
});
