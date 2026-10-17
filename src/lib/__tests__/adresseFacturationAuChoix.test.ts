// Adresse de facturation choisie à chaque facture (0168) - demande d'Amir du 17/10/2026, à la
// fusion des agences Foncia en « Foncia ABFC » : comparaison des adresses (même règle que
// facturation_adresse_cle côté base) et adresse de la dernière facture du dossier.
import { describe, expect, it } from "vitest";
import { adresseDeLaListe, cleAdresse, derniereAdresseFacturee, type PieceFacture } from "../factureDoc";

const piece = (p: Partial<PieceFacture>) =>
  ({ copro_id: "c1", type: "facture", nature: "amo", statut: "emise", client_adresse: null, valide_le: null, ...p }) as PieceFacture;

const LISTE = ["16 rue Jacques Preiss\n68000 Colmar", "6 rue du Sauvage\n68100 Mulhouse", "27 avenue du Rhin\n67100 Strasbourg"];

describe("adresse de facturation au choix", () => {
  it("compare deux adresses sans tenir compte de la casse, des espaces ni des retours à la ligne", () => {
    expect(cleAdresse("16 rue Jacques Preiss\n68000 Colmar")).toBe("16 rue jacques preiss 68000 colmar");
    expect(cleAdresse("  16 RUE Jacques  Preiss\r\n 68000 Colmar ")).toBe(cleAdresse("16 rue Jacques Preiss\n68000 Colmar"));
    expect(cleAdresse(null)).toBe("");
  });

  it("retrouve l'adresse de la liste choisie, ou rien pour une adresse nouvelle ou vide", () => {
    expect(adresseDeLaListe(LISTE, "6 RUE DU SAUVAGE 68100 MULHOUSE")).toBe(LISTE[1]);
    expect(adresseDeLaListe(LISTE, "2 place de la Gare\n57400 Sarrebourg")).toBeNull();
    expect(adresseDeLaListe(LISTE, "   ")).toBeNull();
    expect(adresseDeLaListe([], LISTE[0])).toBeNull();
  });

  it("signale l'adresse de la dernière facture AMO émise du dossier", () => {
    const pieces = [
      piece({ id: "a", client_adresse: LISTE[0], valide_le: "2026-10-01T10:00:00Z" }),
      piece({ id: "b", client_adresse: LISTE[2], valide_le: "2026-10-10T10:00:00Z" }),
      piece({ id: "c", statut: "brouillon", client_adresse: LISTE[1] }),
      piece({ id: "d", nature: "cee", client_adresse: "Hellio", valide_le: "2026-10-12T10:00:00Z" }),
      piece({ id: "e", type: "avoir", client_adresse: LISTE[1], valide_le: "2026-10-13T10:00:00Z" }),
      piece({ id: "f", copro_id: "c2", client_adresse: LISTE[1], valide_le: "2026-10-14T10:00:00Z" }),
    ];
    expect(derniereAdresseFacturee(pieces, "c1")).toBe(LISTE[2]);
    expect(derniereAdresseFacturee(pieces, "c3")).toBeNull();
  });
});
