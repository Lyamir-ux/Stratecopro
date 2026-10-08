// Dossier d'un adhérent au prêt collectif selon la nomenclature de la Caisse d'Épargne
// Grand Est (08/10/2026) : pièces dans l'ordre de la banque, dossier complet, un seul PDF
// « NOM prénom - COPRO », pièces demandées au portail.
import { describe, expect, it } from "vitest";
import { assemblerDossiers, type ChoixRow } from "@/api/dossiersCopros";
import type { DonneesCopro } from "@/api/donnees";
import type { Reponse } from "@/api/enquete";
import {
  dossierBanqueComplet,
  lignesDossierBanque,
  nomFichierDossierAdherent,
  nomUniqueDansSerie,
  pireEtat,
} from "@/lib/dossierAdherent";
import { conventionNoms } from "@/lib/nomFamille";
import { estSci, piecesAttendues, RAISON_PRET } from "@/lib/piecesSituation";

describe("lignes du dossier de la banque", () => {
  it("personne physique : les 8 lignes 01 à 08 de la nomenclature, dans l'ordre", () => {
    const l = lignesDossierBanque("physique", {});
    expect(l.map((x) => [x.rang, x.cle])).toEqual([
      [1, "bulletin"], [2, "identite"], [3, "domicile"], [4, "irpp"], [5, "sepa"], [6, "rib"], [7, "taxe_fonciere"], [8, "juge"],
    ]);
  });

  it("SCI : bulletin, gérants, Kbis, statuts, domicile, IRPP, mandat, RIB, taxe foncière (le 2072 est la ligne 07 sans pièce)", () => {
    const l = lignesDossierBanque("sci", {});
    expect(l.map((x) => [x.rang, x.cle])).toEqual([
      [1, "bulletin"], [2, "identite"], [3, "kbis"], [4, "statuts"], [5, "domicile"], [6, "irpp"], [8, "sepa"], [9, "rib"], [10, "taxe_fonciere"],
    ]);
  });

  it("complet quand toutes les lignes utiles sont fournies, les lignes sans objet ne comptent pas", () => {
    const ok = lignesDossierBanque("physique", {
      bulletin: "ok", identite: "ok", domicile: "ok", irpp: "ok", sepa: "ok", rib: "ok", taxe_fonciere: "ok", juge: "na",
    });
    expect(dossierBanqueComplet(ok)).toBe(true);
    expect(dossierBanqueComplet(lignesDossierBanque("physique", { bulletin: "ok", identite: "en_cours" }))).toBe(false);
  });

  it("deux avis : le dossier vaut son avis le plus en retard", () => {
    expect(pireEtat("ok", "manquant")).toBe("manquant");
    expect(pireEtat("ok", "en_cours")).toBe("en_cours");
    expect(pireEtat("ok", "na")).toBe("ok");
    expect(pireEtat("na", "na")).toBe("na");
  });
});

describe("nom du PDF unique d'un adhérent", () => {
  const noms = ["DUPONT Jean", "MARTIN Sophie", "Bernard et Josiane LECLERC"];
  const convention = conventionNoms(noms);

  it("« NOM prénom - COPRO.pdf » : le nom de l'adhérent d'abord, la copropriété après", () => {
    expect(nomFichierDossierAdherent("DUPONT Jean", "Le Forum", convention)).toBe("DUPONT Jean - LE FORUM.pdf");
    expect(nomFichierDossierAdherent("Bernard et Josiane LECLERC", "Le Forum", convention)).toBe("LECLERC Bernard et Josiane - LE FORUM.pdf");
  });

  it("sans accent ni caractère interdit", () => {
    expect(nomFichierDossierAdherent("RENÉ Élodie", "Les Hêtres / Nord", "nom-prenom")).toBe("RENE Elodie - LES HETRES - NORD.pdf");
  });

  it("une SCI garde sa dénomination", () => {
    expect(nomFichierDossierAdherent("SCI DU RIED", "Le Forum", convention)).toBe("SCI DU RIED - LE FORUM.pdf");
  });

  it("les homonymes d'une même archive sont distingués", () => {
    const deja = new Set<string>();
    expect(nomUniqueDansSerie("MARTIN Paul - LE FORUM.pdf", deja)).toBe("MARTIN Paul - LE FORUM.pdf");
    expect(nomUniqueDansSerie("MARTIN Paul - LE FORUM.pdf", deja)).toBe("MARTIN Paul - LE FORUM (2).pdf");
    expect(nomUniqueDansSerie("MARTIN Paul - LE FORUM.pdf", deja)).toBe("MARTIN Paul - LE FORUM (3).pdf");
  });
});

describe("pièces demandées au portail pour l'adhésion au prêt collectif", () => {
  const types = (...a: Parameters<typeof piecesAttendues>) => piecesAttendues(...a).map((p) => p.type);

  it("sans prêt collectif : rien de plus que les pièces de l'enquête", () => {
    expect(types(null)).toEqual(["avis_imposition"]);
  });

  it("prêt collectif : justificatif de domicile et taxe foncière après l'avis d'imposition", () => {
    expect(types(null, { pretCollectif: true })).toEqual(["avis_imposition", "justificatif_domicile", "taxe_fonciere"]);
    const demandees = piecesAttendues(null, { pretCollectif: true });
    expect(demandees.filter((p) => p.raison === RAISON_PRET).map((p) => p.type)).toEqual(["justificatif_domicile", "taxe_fonciere"]);
  });

  it("SCI en prêt collectif : Kbis, statuts et avis des associés, pas d'avis du ménage", () => {
    const sci = { copro: { "type-coproprietaire": "SCI soumise à l'impôt sur le revenu" } };
    expect(types(sci, { pretCollectif: true })).toEqual(["justificatif_domicile", "kbis_sci", "statuts_sci", "avis_associes_sci", "taxe_fonciere"]);
    // type pas encore répondu : la SCI se reconnaît à son nom
    expect(types(null, { pretCollectif: true, sci: true })).toEqual(["justificatif_domicile", "kbis_sci", "statuts_sci", "avis_associes_sci", "taxe_fonciere"]);
  });

  it("une pièce demandée par deux règles n'est listée qu'une fois (SCI à l'IR occupée par un associé)", () => {
    const rep = { copro: { "type-coproprietaire": "SCI soumise à l'impôt sur le revenu" }, lots: { L1: { "associes-occupants": 1 } } };
    const t = types(rep, { pretCollectif: true });
    expect(t.filter((x) => x === "kbis_sci")).toHaveLength(1);
    expect(t).toContain("pret_usage_notarie");
  });

  it("reconnaît une SCI d'après le type répondu, à défaut d'après le nom", () => {
    expect(estSci("SCI soumise à l'impôt sur le revenu", "DUPONT Jean")).toBe(true);
    expect(estSci("Personne physique", "SCI DU RIED")).toBe(false);
    expect(estSci(undefined, "SCI DU RIED")).toBe(true);
    expect(estSci(undefined, "S.C.I. Les Lilas")).toBe(true);
    expect(estSci(undefined, "SCHNEIDER Delphine")).toBe(false);
  });
});

// ---------- assemblage des dossiers ----------

const COPRO = "c0000000-0000-0000-0000-000000000001";
const CP = (i: number) => `a000000${i}-0000-0000-0000-000000000000`;

const donnees = (noms: string[]): DonneesCopro =>
  ({
    batiments: [],
    coproprietaires: noms.map((nom, k) => ({
      id: CP(k + 1), copro_id: COPRO, nom, email: null, telephone: null, adresse: null, type: null, user_id: null, created_at: "",
    })),
    lots: [],
    cles: [],
  }) as unknown as DonneesCopro;

const collectif = (cp: number) =>
  ({
    id: `ch${cp}`, scenario_id: "s1", coproprietaire_id: CP(cp), type: "collectif", duree_annees: 15, lot_ids: [],
    transmitted_at: "2026-09-02T00:00:00Z", saisi_par: "copro", coproprietaires: { nom: `cp${cp}` },
  }) as unknown as ChoixRow;

const piece = (cp: number, type: string, statut: "valide" | "a_verifier" | "refuse" = "valide") =>
  ({
    id: `p-${cp}-${type}`, copro_id: COPRO, coproprietaire_id: CP(cp), type, name: `${type}.pdf`, storage_path: `u/${type}.pdf`,
    size: 1, mime: "application/pdf", statut, uploaded_at: "2026-10-01T00:00:00Z",
  }) as unknown as import("@/api/dossiersCopros").PieceJustificative;

const reponse = (cp: number, copro: Record<string, unknown> = {}): Reponse =>
  ({
    id: `r${cp}`, enquete_id: "e1", coproprietaire_id: CP(cp), nb_personnes: 2, statut_occupation: "occupant", rfr: 20000, rfr_n2: null,
    reponses: { copro, lots: {}, complet: true }, profil_mpr: "Jaune", profil_statut: "declaratif", profil_verifie_le: null,
    profil_verifie_par: null, updated_at: "2026-09-02T10:00:00Z", coproprietaire: { nom: `cp${cp}` },
  }) as unknown as Reponse;

const adhesionSignee = (cp: number) =>
  ({ id: `a${cp}`, coproprietaire_id: CP(cp), copro_id: COPRO, statut: "signee", sepa_path: `u/sepa-${cp}.pdf`, bulletins: [{ lotNum: "1", path: `u/b-${cp}.pdf` }] }) as unknown as import("@/api/financement").AdhesionAvecNom;

const base = (noms: string[]) => ({
  donnees: donnees(noms),
  reponses: [] as Reponse[],
  scenario: null,
  plansIndiv: [],
  choix: [] as ChoixRow[],
  planValide: null,
  adhesions: [] as import("@/api/financement").AdhesionAvecNom[],
  bulletins: [],
  pieces: [] as import("@/api/dossiersCopros").PieceJustificative[],
  bareme: null,
});

describe("dossier de la banque d'un adhérent", () => {
  it("prêt collectif monté par Strat Eco : justificatif de domicile et taxe foncière deviennent exigibles", () => {
    const { dossiers } = assemblerDossiers({ ...base(["DUPONT Jean", "MARTIN Sophie"]), choix: [collectif(1)] });
    const d1 = dossiers.find((d) => d.id === CP(1))!;
    const d2 = dossiers.find((d) => d.id === CP(2))!;
    expect(d1.banque.applicable).toBe(true);
    expect(d1.banque.complet).toBe(false);
    expect(d1.banque.lignes.map((l) => l.cle)).toEqual(["bulletin", "identite", "domicile", "irpp", "sepa", "rib", "taxe_fonciere", "juge"]);
    expect(d1.etat.manquants).toContain("justificatif de domicile de moins de 3 mois");
    expect(d1.etat.manquants).toContain("taxe foncière ou attestation notariée de propriété du lot");
    expect(d1.piecesRequises).toEqual(expect.arrayContaining(["justificatif_domicile", "taxe_fonciere", "avis_imposition", "piece_identite", "rib"]));
    // qui n'a pas choisi le prêt collectif n'a rien de plus à fournir
    expect(d2.banque.applicable).toBe(false);
    expect(d2.etat.manquants).not.toContain("justificatif de domicile de moins de 3 mois");
    expect(d2.piecesRequises).not.toContain("taxe_fonciere");
  });

  it("souscription en ligne chez la banque : le dossier ne passe pas par nous", () => {
    const { dossiers } = assemblerDossiers({ ...base(["DUPONT Jean"]), choix: [collectif(1)], souscriptionEnLigne: true });
    expect(dossiers[0].banque.applicable).toBe(false);
    expect(dossiers[0].etat.manquants).not.toContain("taxe foncière ou attestation notariée de propriété du lot");
  });

  it("dossier complet quand toutes les pièces de la banque sont fournies et validées", () => {
    const pieces = ["piece_identite", "rib", "avis_imposition", "justificatif_domicile", "taxe_fonciere"].map((t) => piece(1, t));
    const { dossiers } = assemblerDossiers({
      ...base(["DUPONT Jean"]),
      choix: [collectif(1)],
      reponses: [reponse(1)],
      adhesions: [adhesionSignee(1)],
      pieces,
    });
    const d = dossiers[0];
    expect(d.banque.lignes.map((l) => [l.cle, l.etat])).toEqual([
      ["bulletin", "ok"], ["identite", "ok"], ["domicile", "ok"], ["irpp", "ok"], ["sepa", "ok"], ["rib", "ok"], ["taxe_fonciere", "ok"], ["juge", "na"],
    ]);
    expect(d.banque.complet).toBe(true);
    expect(d.etat.statut).toBe("complet");
  });

  it("pièce refusée : manquante ; déposée mais pas encore validée : en cours", () => {
    const { dossiers } = assemblerDossiers({
      ...base(["DUPONT Jean"]),
      choix: [collectif(1)],
      adhesions: [adhesionSignee(1)],
      pieces: [piece(1, "justificatif_domicile", "refuse"), piece(1, "taxe_fonciere", "a_verifier")],
    });
    const etat = (cle: string) => dossiers[0].banque.lignes.find((l) => l.cle === cle)!.etat;
    expect(etat("domicile")).toBe("manquant");
    expect(etat("taxe_fonciere")).toBe("en_cours");
    expect(dossiers[0].banque.complet).toBe(false);
  });

  it("tutelle : l'accord du juge devient une ligne exigible", () => {
    const { dossiers } = assemblerDossiers({
      ...base(["DUPONT Jean"]),
      choix: [collectif(1)],
      reponses: [reponse(1, { "curatelle-tutelle": "Tutelle" })],
    });
    expect(dossiers[0].banque.lignes.find((l) => l.cle === "juge")!.etat).toBe("manquant");
    const curatelle = assemblerDossiers({
      ...base(["DUPONT Jean"]),
      choix: [collectif(1)],
      reponses: [reponse(1, { "curatelle-tutelle": "Curatelle" })],
    }).dossiers[0];
    expect(curatelle.banque.lignes.find((l) => l.cle === "juge")!.etat).toBe("na");
  });

  it("SCI : liste de la banque pour une société, sans avis d'imposition du ménage", () => {
    const { dossiers } = assemblerDossiers({ ...base(["SCI DU RIED"]), choix: [collectif(1)] });
    const d = dossiers[0];
    expect(d.nature).toBe("sci");
    expect(d.banque.lignes.map((l) => l.cle)).toEqual(["bulletin", "identite", "kbis", "statuts", "domicile", "irpp", "sepa", "rib", "taxe_fonciere"]);
    expect(d.piecesRequises).not.toContain("avis_imposition");
    expect(d.piecesRequises).toEqual(expect.arrayContaining(["kbis_sci", "statuts_sci", "avis_associes_sci"]));
    expect(d.etat.manquants).toContain("avis d'imposition des associés");
    expect(d.etat.manquants).toContain("extrait Kbis de la SCI");
    expect(d.etat.manquants).not.toContain("avis d'imposition");
    // pas de prêt collectif : une SCI n'a pas d'avis du ménage à fournir
    const sansPret = assemblerDossiers({ ...base(["SCI DU RIED"]) }).dossiers[0];
    expect(sansPret.etat.avis).toBe("na");
    expect(sansPret.etat.manquants).not.toContain("avis d'imposition");
  });
});
