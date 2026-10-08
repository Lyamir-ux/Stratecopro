// Pièces reprises dans le PDF unique d'un adhérent : ordre de la nomenclature de la Caisse
// d'Épargne Grand Est, une seule pièce d'identité par signataire, pièces purgées ou refusées
// laissées de côté, pièces sensibles (niveau 1) repérées.
import { describe, expect, it } from "vitest";
import { assemblerDossiers, type ChoixRow, type PieceJustificative } from "../dossiersCopros";
import { sourcesDossierAdherent } from "../dossierAdherent";
import type { DonneesCopro } from "../donnees";
import type { AdhesionAvecNom } from "../financement";
import type { BulletinAvecSignataires } from "../signature";

const COPRO = "c0000000-0000-0000-0000-000000000001";
const CP = "a0000001-0000-0000-0000-000000000000";

const donnees = (nom: string) =>
  ({
    batiments: [],
    coproprietaires: [{ id: CP, copro_id: COPRO, nom, email: null, telephone: null, adresse: null, type: null, user_id: null, created_at: "" }],
    lots: [],
    cles: [],
  }) as unknown as DonneesCopro;

const choix = {
  id: "ch1", scenario_id: "s1", coproprietaire_id: CP, type: "collectif", duree_annees: 15, lot_ids: [],
  transmitted_at: "2026-09-02T00:00:00Z", saisi_par: "copro", coproprietaires: { nom: "x" },
} as unknown as ChoixRow;

const piece = (type: string, statut: "valide" | "a_verifier" | "refuse" = "valide", ext = "pdf") =>
  ({
    id: `p-${type}`, copro_id: COPRO, coproprietaire_id: CP, type, name: `${type}.${ext}`, storage_path: `u/${type}.${ext}`,
    size: 1, mime: null, statut, uploaded_at: "2026-10-01T00:00:00Z",
  }) as unknown as PieceJustificative;

const signataire = (id: string, nom: string, prenom: string, ordre: number, chemin: string | null) => ({
  id, nom, prenom, ordre, role: ordre === 1 ? "principal" : "cosignataire", piece_identite_path: chemin,
});

const bulletin = (id: string, lot: string, patch: Record<string, unknown>, signataires: unknown[]) =>
  ({
    id, coproprietaire_id: CP, copro_id: COPRO, statut: "complet", lot_reference: lot, created_at: `2026-10-0${id.slice(-1)}T10:00:00Z`,
    document_signe_path: `${id}/bulletin-signe.pdf`, mandat_signe_path: `${id}/mandat-signe.pdf`, mandat_path: `${id}/mandat.pdf`,
    rib_path: `${id}/rib.pdf`, purge_effectuee_le: null, signataires, ...patch,
  }) as unknown as BulletinAvecSignataires;

const dossier = (nom: string, extra: { bulletins?: BulletinAvecSignataires[]; pieces?: PieceJustificative[]; adhesions?: AdhesionAvecNom[] }) =>
  assemblerDossiers({
    donnees: donnees(nom),
    reponses: [],
    scenario: null,
    plansIndiv: [],
    choix: [choix],
    planValide: null,
    adhesions: extra.adhesions ?? [],
    bulletins: extra.bulletins ?? [],
    pieces: extra.pieces ?? [],
    bareme: null,
  }).dossiers[0];

describe("sourcesDossierAdherent", () => {
  const pieces = ["justificatif_domicile", "avis_imposition", "taxe_fonciere"].map((t) => piece(t));

  it("dans l'ordre de la nomenclature : bulletin, identité, domicile, avis, mandat SEPA, RIB, taxe foncière", () => {
    const d = dossier("DUPONT Jean", {
      pieces,
      bulletins: [bulletin("b1", "12", {}, [signataire("s1", "DUPONT", "Jean", 1, "b1/id-s1.pdf")])],
    });
    expect(sourcesDossierAdherent(d).map((s) => s.cle)).toEqual([
      "bulletin", "identite", "domicile", "irpp", "sepa", "rib", "taxe_fonciere",
    ]);
  });

  it("repère les pièces sensibles (niveau 1) : identité, mandat SEPA, RIB", () => {
    const d = dossier("DUPONT Jean", { pieces, bulletins: [bulletin("b1", "12", {}, [signataire("s1", "DUPONT", "Jean", 1, "b1/id.pdf")])] });
    const sensibles = sourcesDossierAdherent(d).filter((s) => s.sensible).map((s) => s.cle);
    expect(sensibles).toEqual(["identite", "sepa", "rib"]);
  });

  it("un signataire n'apparaît qu'une fois même avec un bulletin par lot ; les cosignataires ont leur pièce", () => {
    const d = dossier("DUPONT Jean", {
      bulletins: [
        bulletin("b1", "12", {}, [signataire("s1", "DUPONT", "Jean", 1, "b1/id-s1.pdf"), signataire("s2", "DUPONT", "Marie", 2, "b1/id-s2.pdf")]),
        bulletin("b2", "13", {}, [signataire("s3", "DUPONT", "Jean", 1, "b2/id-s3.pdf")]),
      ],
    });
    const identites = sourcesDossierAdherent(d).filter((s) => s.cle === "identite").map((s) => s.label);
    expect(identites).toEqual(["Pièce d'identité - Jean DUPONT", "Pièce d'identité - Marie DUPONT"]);
    // un mandat et un RIB par bulletin
    expect(sourcesDossierAdherent(d).filter((s) => s.cle === "sepa")).toHaveLength(2);
    expect(sourcesDossierAdherent(d).filter((s) => s.cle === "rib")).toHaveLength(2);
  });

  it("pièces d'identité et RIB purgés : repli sur les pièces du portail, sinon rien", () => {
    const purge = bulletin("b1", "12", { purge_effectuee_le: "2026-10-05T00:00:00Z" }, [signataire("s1", "DUPONT", "Jean", 1, "b1/id.pdf")]);
    const sans = sourcesDossierAdherent(dossier("DUPONT Jean", { bulletins: [purge] }));
    expect(sans.map((s) => s.cle)).toEqual(["bulletin", "sepa"]);
    const avec = sourcesDossierAdherent(dossier("DUPONT Jean", { bulletins: [purge], pieces: [piece("piece_identite"), piece("rib")] }));
    expect(avec.map((s) => s.cle)).toEqual(["bulletin", "identite", "sepa", "rib"]);
    expect(avec.find((s) => s.cle === "identite")!.sensible).toBe(false);
  });

  it("laisse de côté une pièce refusée, signale une pièce pas encore validée", () => {
    const d = dossier("DUPONT Jean", {
      pieces: [piece("justificatif_domicile", "refuse"), piece("taxe_fonciere", "a_verifier"), piece("avis_imposition", "valide")],
    });
    const s = sourcesDossierAdherent(d);
    expect(s.map((x) => x.cle)).toEqual(["irpp", "taxe_fonciere"]);
    expect(s.find((x) => x.cle === "taxe_fonciere")!.nonValidee).toBe(true);
    expect(s.find((x) => x.cle === "irpp")!.nonValidee).toBe(false);
  });

  it("un bulletin pas encore entièrement signé n'est pas repris", () => {
    const d = dossier("DUPONT Jean", { bulletins: [bulletin("b1", "12", { statut: "en_signature", document_signe_path: null }, [])] });
    expect(sourcesDossierAdherent(d).some((s) => s.cle === "bulletin")).toBe(false);
  });

  it("ancien dossier d'adhésion : bulletins signés et mandat pré-rempli", () => {
    const adhesion = {
      id: "a1", coproprietaire_id: CP, copro_id: COPRO, statut: "signee", sepa_path: "u/sepa.pdf",
      bulletins: [{ lotNum: "12", path: "u/bulletin-12.pdf" }, { lotNum: "13", path: "u/bulletin-13.pdf" }],
    } as unknown as AdhesionAvecNom;
    const s = sourcesDossierAdherent(dossier("DUPONT Jean", { adhesions: [adhesion] }));
    expect(s.map((x) => x.label)).toEqual([
      "Bulletin d'adhésion - lot 12", "Bulletin d'adhésion - lot 13", "Mandat SEPA (pré-rempli, ancien dossier)",
    ]);
    expect(s.every((x) => !x.sensible)).toBe(true);
  });

  it("SCI : Kbis, statuts et avis des associés, dans l'ordre de la banque", () => {
    const d = dossier("SCI DU RIED", {
      pieces: ["taxe_fonciere", "avis_associes_sci", "statuts_sci", "kbis_sci", "justificatif_domicile"].map((t) => piece(t)),
    });
    expect(sourcesDossierAdherent(d).map((s) => s.cle)).toEqual(["kbis", "statuts", "domicile", "irpp", "taxe_fonciere"]);
  });

  it("accord du juge : repris dès qu'il est déposé", () => {
    const d = dossier("DUPONT Jean", { pieces: [piece("jugement_protection")] });
    expect(sourcesDossierAdherent(d).map((s) => s.cle)).toEqual(["juge"]);
  });
});
