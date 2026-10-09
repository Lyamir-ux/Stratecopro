import { describe, expect, it } from "vitest";
import {
  classerTelephone,
  composerDateLieu,
  dateFrVersIso,
  dateIsoVersFr,
  dateLieuComplet,
  decouperDateLieu,
  diagnosticBic,
  diagnosticIban,
  formaterBic,
  formaterIban,
  positionCurseur,
} from "../saisie";
import { erreurFormatPiece, typeMimePiece } from "../formatPiece";
import { casesIban, isValidIban } from "../pdf/adhesion";

const IBAN = "FR7630001007941234567890185";

describe("formaterIban", () => {
  it("regroupe par blocs de 4, le dernier de 3 pour un IBAN français", () => {
    expect(formaterIban(IBAN)).toBe("FR76 3000 1007 9412 3456 7890 185");
  });
  it("met en majuscules et ignore les séparateurs saisis ou collés", () => {
    expect(formaterIban("fr76-3000.1007 9412 3456 7890 185")).toBe("FR76 3000 1007 9412 3456 7890 185");
  });
  it("n'ajoute pas d'espace en fin de saisie", () => {
    expect(formaterIban("FR76")).toBe("FR76");
    expect(formaterIban("FR763")).toBe("FR76 3");
  });
  it("plafonne à 34 caractères", () => {
    expect(formaterIban("A".repeat(50)).replace(/ /g, "")).toHaveLength(34);
  });
});

describe("positionCurseur", () => {
  it("garde le curseur sur le même caractère malgré les espaces insérés", () => {
    // « FR763| » devient « FR76 3| » : 5 caractères utiles avant le curseur
    expect(positionCurseur("FR76 3", 5)).toBe(6);
    expect(positionCurseur("FR76 3000", 4)).toBe(4);
    expect(positionCurseur("FR76 3000", 0)).toBe(0);
    expect(positionCurseur("FR76 3000", 99)).toBe(9);
  });
});

describe("IBAN français : 27 caractères", () => {
  it("accepte l'IBAN valide, espacé ou non", () => {
    expect(isValidIban(IBAN)).toBe(true);
    expect(isValidIban(formaterIban(IBAN))).toBe(true);
  });
  it("refuse un IBAN français trop court ou trop long", () => {
    expect(isValidIban(IBAN.slice(0, 26))).toBe(false);
    expect(isValidIban(IBAN + "0")).toBe(false);
  });
});

describe("diagnosticIban", () => {
  it("rien à dire d'un champ vide ou d'un IBAN valide", () => {
    expect(diagnosticIban("")).toBeNull();
    expect(diagnosticIban(formaterIban(IBAN))).toBeNull();
  });
  it("indique la progression d'un IBAN français incomplet, sans le traiter en erreur", () => {
    const d = diagnosticIban("FR76 3000 1007");
    expect(d?.niveau).toBe("incomplet");
    expect(d?.message).toContain("12 caractères saisis sur 27");
  });
  it("signale une clé de contrôle fausse sur 27 caractères", () => {
    const d = diagnosticIban("FR7630001007941234567890186");
    expect(d?.niveau).toBe("erreur");
    expect(d?.message).toContain("clé de contrôle");
  });
  it("signale un IBAN français trop long", () => {
    expect(diagnosticIban(IBAN + "00")?.niveau).toBe("erreur");
  });
  it("signale un début qui n'est pas pays + clé", () => {
    expect(diagnosticIban("1234567890123456")?.niveau).toBe("erreur");
  });
});

describe("BIC", () => {
  it("formate en majuscules, sans espace, 11 caractères au plus", () => {
    expect(formaterBic("cepa frpp 513")).toBe("CEPAFRPP513");
    expect(formaterBic("CEPAFRPP513XYZ")).toBe("CEPAFRPP513");
  });
  it("accepte 8 ou 11 caractères valides", () => {
    expect(diagnosticBic("CEPAFRPP")).toBeNull();
    expect(diagnosticBic("CEPAFRPP513")).toBeNull();
    expect(diagnosticBic("")).toBeNull();
  });
  it("progression en cours de saisie, erreur sur un format faux", () => {
    expect(diagnosticBic("CEPA")?.niveau).toBe("incomplet");
    expect(diagnosticBic("CEPAFRPP51")?.niveau).toBe("incomplet");
    expect(diagnosticBic("1234FRPP")?.niveau).toBe("erreur");
  });
});

describe("dates du dossier", () => {
  it("convertit entre le format imprimé et celui du champ date", () => {
    expect(dateFrVersIso("01/09/2015")).toBe("2015-09-01");
    expect(dateFrVersIso("1/9/2015")).toBe("2015-09-01");
    expect(dateIsoVersFr("2015-09-01")).toBe("01/09/2015");
  });
  it("refuse ce qui n'est pas une vraie date", () => {
    expect(dateFrVersIso("31/02/2015")).toBe("");
    expect(dateFrVersIso("depuis 2015")).toBe("");
    expect(dateFrVersIso("")).toBe("");
    expect(dateIsoVersFr("")).toBe("");
  });
});

describe("date et lieu de naissance", () => {
  it("découpe la chaîne du bulletin en deux champs", () => {
    expect(decouperDateLieu("12/05/1980 à Colmar")).toEqual({ dateIso: "1980-05-12", lieu: "Colmar" });
    expect(decouperDateLieu("12/05/1980, Saint-Louis")).toEqual({ dateIso: "1980-05-12", lieu: "Saint-Louis" });
    expect(decouperDateLieu("12/05/1980")).toEqual({ dateIso: "1980-05-12", lieu: "" });
  });
  it("lieu seul, ancien texte libre", () => {
    expect(decouperDateLieu("à Colmar")).toEqual({ dateIso: "", lieu: "Colmar" });
    expect(decouperDateLieu("Colmar")).toEqual({ dateIso: "", lieu: "Colmar" });
    expect(decouperDateLieu("")).toEqual({ dateIso: "", lieu: "" });
  });
  it("recompose au format du bulletin", () => {
    expect(composerDateLieu("1980-05-12", "Colmar")).toBe("12/05/1980 à Colmar");
    expect(composerDateLieu("1980-05-12", "")).toBe("12/05/1980");
    expect(composerDateLieu("", "Colmar")).toBe("à Colmar");
    expect(composerDateLieu("", "")).toBe("");
  });
  it("garde l'espace tapé entre deux mots du lieu", () => {
    const etape = composerDateLieu("1980-05-12", "Saint ");
    expect(decouperDateLieu(etape).lieu).toBe("Saint ");
    expect(composerDateLieu("1980-05-12", decouperDateLieu(etape).lieu + "Louis")).toBe("12/05/1980 à Saint Louis");
  });
  it("ne se perd pas en allers-retours", () => {
    const v = "12/05/1980 à Colmar";
    const { dateIso, lieu } = decouperDateLieu(v);
    expect(composerDateLieu(dateIso, lieu)).toBe(v);
  });
  it("exige la date et le lieu", () => {
    expect(dateLieuComplet("12/05/1980 à Colmar")).toBe(true);
    expect(dateLieuComplet("12/05/1980")).toBe(false);
    expect(dateLieuComplet("à Colmar")).toBe(false);
    expect(dateLieuComplet("")).toBe(false);
  });
});

describe("classerTelephone", () => {
  it("mobile français ou numéro étranger : champ portable", () => {
    expect(classerTelephone("06 12 34 56 78")).toBe("portable");
    expect(classerTelephone("07.12.34.56.78")).toBe("portable");
    expect(classerTelephone("+33 6 12 34 56 78")).toBe("portable");
    expect(classerTelephone("+49 170 1234567")).toBe("portable");
  });
  it("fixe français : champ domicile", () => {
    expect(classerTelephone("03 89 12 34 56")).toBe("fixe");
    expect(classerTelephone("+33 3 89 12 34 56")).toBe("fixe");
    expect(classerTelephone("09 51 23 45 67")).toBe("fixe");
  });
});

describe("formats de fichier d'une pièce", () => {
  const f = (name: string, type: string) => ({ name, type });
  it("accepte PDF, JPG et PNG", () => {
    expect(erreurFormatPiece(f("rib.pdf", "application/pdf"))).toBeNull();
    expect(erreurFormatPiece(f("rib.jpg", "image/jpeg"))).toBeNull();
    expect(erreurFormatPiece(f("rib.png", "image/png"))).toBeNull();
  });
  it("refuse un Word, un Excel ou une image d'un autre format", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(erreurFormatPiece(f("rib.docx", docx))).toContain("PDF, JPG ou PNG");
    expect(erreurFormatPiece(f("rib.doc", "application/msword"))).not.toBeNull();
    expect(erreurFormatPiece(f("rib.gif", "image/gif"))).not.toBeNull();
    expect(erreurFormatPiece(f("rib.svg", "image/svg+xml"))).not.toBeNull();
  });
  it("sans type renseigné par le navigateur, l'extension décide", () => {
    expect(typeMimePiece(f("RIB.PDF", ""))).toBe("application/pdf");
    expect(typeMimePiece(f("photo.JPEG", ""))).toBe("image/jpeg");
    expect(erreurFormatPiece(f("rib.docx", ""))).not.toBeNull();
    expect(erreurFormatPiece(f("rib", ""))).not.toBeNull();
  });
});

describe("casesIban : placement dans la grille du mandat SEPA", () => {
  it("un IBAN français occupe 33 cases : 4 caractères, une case vide, 4, une case vide… 3", () => {
    const cases = casesIban(27, 33);
    expect(cases).toHaveLength(27);
    expect(cases.slice(0, 9)).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 10]);
    // les cases 4, 9, 14, 19, 24 et 29 restent vides (non cadrées dans le gabarit)
    expect(cases.filter((c) => c % 5 === 4)).toEqual([]);
    expect(cases[26]).toBe(32);
  });
  it("un IBAN trop long pour les espaces est écrit à la suite", () => {
    expect(casesIban(28, 33)).toEqual(Array.from({ length: 28 }, (_, i) => i));
  });
  it("un IBAN plus court garde le même découpage par 4", () => {
    expect(casesIban(14, 33)).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16]);
  });
});
