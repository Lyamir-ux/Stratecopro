import { describe, expect, it } from "vitest";
import { proposerAudit, proposerDevis, trouverEmails, trouverSiret } from "../extraitDonnees";

describe("pré-remplissage éco-PTZ depuis le texte d'un PDF", () => {
  it("lit le numéro ADEME, la date, le gain, le SIRET et l'e-mail d'un audit", () => {
    const texte =
      "AUDIT ENERGETIQUE REGLEMENTAIRE  Numéro d'enregistrement A25670370399R  Date de réalisation : 2/12/2025 " +
      "Gain énergétique du scénario 1 : 60,4 %  INGEDAIR  SIRET : 791 603 384 00045  contact c.stadelmann@ingedair.fr " +
      "suivi par amir@strateco.fr";
    expect(proposerAudit(texte)).toEqual({
      reference: "A25670370399R",
      date: "02/12/2025",
      gain_pct: "60,4",
      siret: "791 603 384 00045",
      contact_email: "c.stadelmann@ingedair.fr",
    });
  });

  it("ne propose rien sur un texte vide", () => {
    expect(proposerAudit("")).toEqual({});
    expect(trouverSiret("SIRET : 123")).toBeNull();
  });

  it("repère les lots du PF dont l'entreprise figure dans un devis", () => {
    const texte = "DECOPEINT SAS - Devis n° 2026-118 - Siret 70850112700052 - devis@decopeint.fr";
    expect(
      proposerDevis(texte, [
        { numero: 2, entreprise: "Decopeint" },
        { numero: 3, entreprise: "SCHUCH" },
        { numero: 4, entreprise: null },
      ])
    ).toEqual({ siret: "708 501 127 00052", contact_email: "devis@decopeint.fr", lots: [2] });
  });

  it("écarte les adresses Strat Eco", () => {
    expect(trouverEmails("a@strateco.fr b@exemple.fr.")).toEqual(["b@exemple.fr"]);
  });
});
