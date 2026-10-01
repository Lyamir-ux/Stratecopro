import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { genererFacturePdf, type ImagesFacture } from "../facture";
import {
  avoirDe,
  dateFr,
  etatPiece,
  euros,
  lignesClient,
  montantEnLettres,
  nombreEnLettres,
  nomFichierPiece,
  piecesDuJalon,
  quantite,
  tauxTva,
  type PieceFacture,
} from "@/lib/factureDoc";

const images: ImagesFacture = {
  fond: readFileSync(resolve(__dirname, "../../../../public/modeles/facture/fond-facture.png")),
  logo: readFileSync(resolve(__dirname, "../../../../public/modeles/facture/logo-facture.png")),
};

// FAC00000765 du 25/09/2026, reprise telle quelle
const mariano: PieceFacture = {
  id: "f1",
  type: "facture",
  statut: "emise",
  test: false,
  copro_id: "c1",
  jalon: "P1b",
  nature: "amo",
  facture_origine_id: null,
  numero: "FAC00000765",
  date_emission: "2026-09-25",
  date_echeance: "2026-10-25",
  client_numero: "CLT00000230",
  client_nom: "SDC 3 RUE MARIANO",
  client_pa: "IMMIUM",
  client_adresse: "14 quai Mullenheim\n67083 Strasbourg",
  destinataire_email: "gestionnaire@example.com",
  destinataire_nom: null,
  reference: "SDC 3 RUE MARIANO P1b",
  sous_reference: "SDC 3 RUE MARIANO, 3 rue Mariano, 67100 Strasbourg p/a IMMIUM",
  lignes: [{ code: "ART00000006", libelle: "Convention d'AMO", detail: null, quantite: 1, pu_ht: 1199.97, montant_ht: 1199.97, taux_tva: 20 }],
  total_ht: 1199.97,
  total_tva: 239.99,
  total_ttc: 1439.96,
  pdf_path: null,
  fichier_id: null,
  envoi_statut: null,
  envoi_le: null,
  envoi_detail: null,
  payee_le: null,
  payee_par: null,
  cree_par: null,
  cree_le: "2026-09-25T10:00:00Z",
  valide_par: null,
  valide_le: "2026-09-25T10:00:00Z",
};

// FAC00000758 du 16/09/2026 (honoraires CEE, client Hellio)
const tuileries: PieceFacture = {
  ...mariano,
  id: "f2",
  jalon: "FCEE1",
  nature: "cee",
  numero: "FAC00000758",
  date_emission: "2026-09-16",
  date_echeance: "2026-10-16",
  client_numero: "CLT00000079",
  client_nom: "HELLIO SOLUTIONS",
  client_pa: null,
  client_adresse: "Hellio Solutions\n50 rue madame de Sanzillon\n92110 CLICHY",
  reference: "Facture d'apporteur d'affaires année 2026 suivant contrat n°0902-01",
  sous_reference: null,
  lignes: [
    { code: "ART00000010", libelle: "CEE", detail: "-250 AIF Copropriété TUILERIES 5,544 Gwhc", quantite: 5.544, pu_ht: 250, montant_ht: 1386, taux_tva: 20 },
  ],
  total_ht: 1386,
  total_tva: 277.2,
  total_ttc: 1663.2,
};

describe("montant en toutes lettres", () => {
  it("reprend les deux modèles", () => {
    expect(montantEnLettres(1439.96)).toBe("mille quatre cent trente-neuf euros et quatre-vingt-seize centimes");
    expect(montantEnLettres(1663.2)).toBe("mille six cent soixante-trois euros et vingt centimes");
  });
  it("suit l'orthographe traditionnelle", () => {
    expect(nombreEnLettres(21)).toBe("vingt et un");
    expect(nombreEnLettres(71)).toBe("soixante et onze");
    expect(nombreEnLettres(80)).toBe("quatre-vingts");
    expect(nombreEnLettres(81)).toBe("quatre-vingt-un");
    expect(nombreEnLettres(91)).toBe("quatre-vingt-onze");
    expect(nombreEnLettres(200)).toBe("deux cents");
    expect(nombreEnLettres(280)).toBe("deux cent quatre-vingts");
    expect(nombreEnLettres(200000)).toBe("deux cent mille");
    expect(nombreEnLettres(80000)).toBe("quatre-vingt mille");
    expect(nombreEnLettres(1000)).toBe("mille");
    expect(nombreEnLettres(2_000_000)).toBe("deux millions");
    expect(nombreEnLettres(12_345)).toBe("douze mille trois cent quarante-cinq");
  });
  it("accorde euro et centime, valeur absolue pour un avoir", () => {
    expect(montantEnLettres(1)).toBe("un euro");
    expect(montantEnLettres(0.01)).toBe("zéro euro et un centime");
    expect(montantEnLettres(2000)).toBe("deux mille euros");
    expect(montantEnLettres(1_000_000)).toBe("un million d'euros");
    expect(montantEnLettres(-1439.96)).toBe("mille quatre cent trente-neuf euros et quatre-vingt-seize centimes");
  });
});

describe("formats du modèle", () => {
  it("écrit montants, taux, quantités et dates comme l'ancien outil", () => {
    expect(euros(1199.97)).toBe("1 199,97 €");
    expect(euros(239.99)).toBe("239,99 €");
    expect(euros(-1439.96)).toBe("-1 439,96 €");
    expect(euros(1234567.8)).toBe("1 234 567,80 €");
    expect(tauxTva(20)).toBe("20,00%");
    expect(quantite(1)).toBe("1,00");
    expect(quantite(5.544)).toBe("5,544");
    expect(quantite(5.5)).toBe("5,50");
    expect(dateFr("2026-10-25")).toBe("25/10/2026");
  });
  it("compose le cartouche client", () => {
    expect(lignesClient(mariano)).toEqual({ lignes: ["P/A IMMIUM", "14 quai Mullenheim", "67083 Strasbourg", "FRANCE"], adresseManquante: false });
    expect(lignesClient({ client_pa: "IMMIUM", client_adresse: null }).adresseManquante).toBe(true);
    expect(lignesClient(tuileries).lignes).toEqual(["Hellio Solutions", "50 rue madame de Sanzillon", "92110 CLICHY", "FRANCE"]);
  });
  it("nomme le PDF sans accent", () => {
    expect(nomFichierPiece(mariano, "3 rue Mariano")).toBe("Facture FAC00000765 - 3 rue Mariano - P1b.pdf");
    expect(nomFichierPiece({ ...tuileries, numero: "FAC00000766", jalon: "FCEE2" }, "Résidence Les Érables")).toBe(
      "Facture FAC00000766 - Residence Les Erables - FCEE 2.pdf"
    );
  });
});

describe("état des pièces d'un jalon", () => {
  const brouillon: PieceFacture = { ...mariano, id: "b1", statut: "brouillon", numero: null, jalon: "P1c" };
  const avoir: PieceFacture = { ...mariano, id: "a1", type: "avoir", numero: "AVR00000073", facture_origine_id: "f1" };
  it("reconnaît brouillon, facture active et facture annulée", () => {
    const pieces = [mariano, brouillon];
    expect(piecesDuJalon(pieces, "c1", "P1b").facture?.id).toBe("f1");
    expect(piecesDuJalon(pieces, "c1", "P1c").brouillon?.id).toBe("b1");
    expect(etatPiece(mariano, pieces)).toBe("a_envoyer");
    expect(etatPiece({ ...mariano, pdf_path: "x", envoi_statut: "envoye" }, pieces)).toBe("envoyee");
    expect(etatPiece({ ...mariano, payee_le: "2026-09-30" }, pieces)).toBe("payee");
    const avecAvoir = [mariano, avoir];
    expect(avoirDe(mariano, avecAvoir)?.id).toBe("a1");
    expect(etatPiece(mariano, avecAvoir)).toBe("annulee");
    expect(piecesDuJalon(avecAvoir, "c1", "P1b").facture).toBeNull();
  });
});

describe("PDF de la facture", () => {
  it("produit une page A4 pour les deux modèles, un brouillon, un avoir et une pièce de test", async () => {
    const cas: [string, PieceFacture, Parameters<typeof genererFacturePdf>[1]][] = [
      ["facture-765", mariano, {}],
      ["facture-758", tuileries, {}],
      ["brouillon-sans-adresse", { ...mariano, statut: "brouillon", numero: null, date_emission: null, date_echeance: null, client_adresse: null, client_numero: null }, {}],
      [
        "avoir",
        {
          ...mariano,
          type: "avoir",
          numero: "AVR00000073",
          date_echeance: null,
          facture_origine_id: "f1",
          reference: "Avoir sur la facture n° FAC00000765 du 25/09/2026",
          sous_reference: "SDC 3 RUE MARIANO P1b",
          lignes: [{ ...mariano.lignes[0], pu_ht: -1199.97, montant_ht: -1199.97 }],
          total_ht: -1199.97,
          total_tva: -239.99,
          total_ttc: -1439.96,
        },
        { origine: { numero: "FAC00000765", date_emission: "2026-09-25" } },
      ],
      ["test", { ...mariano, test: true, numero: "TEST-FAC-0001" }, {}],
    ];
    for (const [nom, piece, opts] of cas) {
      const bytes = await genererFacturePdf(piece, { ...opts, images });
      const lu = await PDFDocument.load(bytes);
      expect(lu.getPageCount()).toBe(1);
      expect(lu.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.88 });
      if (process.env.FACTURE_PDF_DIR) writeFileSync(resolve(process.env.FACTURE_PDF_DIR, `${nom}.pdf`), bytes);
    }
  });
});
