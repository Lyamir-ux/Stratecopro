import { describe, expect, it } from "vitest";
import { CATALOGUE } from "../enqueteCatalogue";
import {
  bulletinsSignes,
  piecesAttendues,
  piecesDossierPret,
  piecesEnquete,
  PIECES_SITUATION,
  REPONSE_DEUX_AVIS,
  REPONSE_USUFRUITIER,
} from "../piecesSituation";
import { Constants } from "../database.types";

const types = (rep: Parameters<typeof piecesAttendues>[0]) => piecesAttendues(rep).map((p) => p.type);

describe("pièces demandées selon la situation (feedback Marius MAZZANTE 30/09/2026)", () => {
  it("avis d'imposition pour tout ménage, même sans réponse", () => {
    expect(types(null)).toEqual(["avis_imposition"]);
    expect(types({ copro: { "type-coproprietaire": "Personne physique" } })).toEqual(["avis_imposition"]);
    expect(types({ copro: { "type-coproprietaire": "Indivision" } })).toEqual(["avis_imposition"]);
  });

  it("deux déclarants : deux avis", () => {
    expect(types({ copro: { "nb-avis-imposition": REPONSE_DEUX_AVIS } })).toEqual(["avis_imposition", "avis_imposition_2"]);
  });

  it("usufruitier : justificatif d'usufruit", () => {
    expect(types({ lots: { L1: { demembrement: REPONSE_USUFRUITIER } } })).toContain("justificatif_usufruit");
    expect(types({ lots: { L1: { demembrement: "Oui, je suis nu-propriétaire" } } })).not.toContain("justificatif_usufruit");
  });

  it("SCI à l'IR occupée par un associé : prêt à usage, Kbis, statuts, avis des associés - pas d'avis du ménage", () => {
    const sci = { "type-coproprietaire": "SCI soumise à l'impôt sur le revenu" };
    expect(types({ copro: sci, lots: { L1: { "associes-occupants": 1 } } })).toEqual([
      "pret_usage_notarie", "kbis_sci", "statuts_sci", "avis_associes_sci",
    ]);
    expect(types({ copro: sci, lots: { L1: { "associes-occupants": 0 } } })).toEqual([]);
    expect(types({ copro: { "type-coproprietaire": "SCI soumise à l'impôt sur les sociétés" }, lots: { L1: { "associes-occupants": 2 } } })).toEqual([]);
  });

  it("tutelle ou curatelle : jugement ; sauvegarde de justice : rien de plus", () => {
    expect(types({ copro: { "curatelle-tutelle": "Tutelle" } })).toContain("jugement_protection");
    expect(types({ copro: { "curatelle-tutelle": "Curatelle" } })).toContain("jugement_protection");
    expect(types({ copro: { "curatelle-tutelle": "Sauvegarde de justice" } })).not.toContain("jugement_protection");
  });

  it("les réponses déclencheuses existent au catalogue, et chaque pièce existe en base (0118)", () => {
    const opts = (id: string) => CATALOGUE.find((q) => q.id === id)?.options ?? [];
    expect(opts("nb-avis-imposition")).toContain(REPONSE_DEUX_AVIS);
    expect(opts("demembrement")).toContain(REPONSE_USUFRUITIER);
    expect(opts("curatelle-tutelle")).toEqual(expect.arrayContaining(["Tutelle", "Curatelle"]));
    expect(opts("type-coproprietaire")).toContain("SCI soumise à l'impôt sur le revenu");
    for (const t of Object.keys(PIECES_SITUATION)) expect(Constants.public.Enums.type_piece, t).toContain(t);
  });
});

describe("questions ajoutées le 30/09/2026 (feedback Marius MAZZANTE)", () => {
  const q = (id: string) => CATALOGUE.find((x) => x.id === id)!;

  it("RFR N-2 facultatif", () => {
    expect(q("rfr-n2").facultatif).toBe(true);
    expect(q("rfr-foyer").facultatif).toBeUndefined();
  });

  it("volet social posé en dur", () => {
    for (const id of ["csp-reference", "situations-foyer", "impayes-charges", "difficultes-logement", "mode-location", "nb-avis-imposition"]) {
      expect(q(id).locked, id).toBe(true);
    }
    expect(q("situations-foyer").options).toEqual(
      expect.arrayContaining(["Handicap ou perte d'autonomie", "Personne isolée", "Famille monoparentale"])
    );
    expect(q("difficultes-logement").options).toEqual(
      expect.arrayContaining(["Logement trop petit", "Sur-occupation", "Insalubre ou très dégradé", "Difficile à chauffer"])
    );
  });

  it("logement loué : mode de location pour le bailleur, résidence principale / secondaire pour l'occupant", () => {
    expect(q("mode-location").cond).toContainEqual({ qid: "type-occupation", vals: ["Propriétaire bailleur (logement loué)"] });
    expect(q("mode-location").options).toEqual([
      "Loué à l'année (résidence principale du locataire)",
      "Location saisonnière ou meublé de tourisme",
      "Vacant (entre deux locations)",
    ]);
    expect(q("type-residence").cond).toContainEqual({ qid: "type-occupation", vals: ["Propriétaire occupant"], defaut: true });
  });
});

describe("pièces du prêt après la signature des bulletins (retour de A CHELGHAM, 09/10/2026)", () => {
  const t = (l: { type: string }[]) => l.map((p) => p.type);
  const sciIr = { "type-coproprietaire": "SCI soumise à l'impôt sur le revenu" };

  it("l'enquête ne demande jamais les pièces de la banque", () => {
    expect(t(piecesEnquete(null, { pretCollectif: true }))).toEqual(["avis_imposition"]);
    expect(t(piecesEnquete(null, { pretCollectif: true, sci: true }))).toEqual([]);
  });

  it("« Mon financement » reçoit les pièces de la banque, sans l'avis du ménage", () => {
    expect(t(piecesDossierPret(null, { pretCollectif: true }))).toEqual(["justificatif_domicile", "taxe_fonciere"]);
    expect(t(piecesDossierPret(null, { pretCollectif: true, sci: true }))).toEqual([
      "justificatif_domicile", "kbis_sci", "statuts_sci", "avis_associes_sci", "taxe_fonciere",
    ]);
    expect(piecesDossierPret(null, {})).toEqual([]);
  });

  it("SCI à l'IR occupée par un associé : Kbis, statuts et avis restent dans l'enquête, une seule fois", () => {
    const rep = { copro: sciIr, lots: { L1: { "associes-occupants": 1 } } };
    expect(t(piecesEnquete(rep, { pretCollectif: true }))).toEqual([
      "pret_usage_notarie", "kbis_sci", "statuts_sci", "avis_associes_sci",
    ]);
    expect(t(piecesDossierPret(rep, { pretCollectif: true }))).toEqual(["justificatif_domicile", "taxe_fonciere"]);
  });

  it("les deux listes réunies = la liste complète de l'espace AMO", () => {
    const rep = { copro: { "curatelle-tutelle": "Tutelle", "nb-avis-imposition": REPONSE_DEUX_AVIS } };
    const ctx = { pretCollectif: true };
    expect(new Set([...t(piecesEnquete(rep, ctx)), ...t(piecesDossierPret(rep, ctx))])).toEqual(new Set(t(piecesAttendues(rep, ctx))));
  });

  it("bulletins signés : aucun en préparation, ou ancien dossier signé", () => {
    expect(bulletinsSignes([])).toBe(false);
    expect(bulletinsSignes(null)).toBe(false);
    expect(bulletinsSignes([{ statut: "brouillon" }])).toBe(false);
    expect(bulletinsSignes([{ statut: "en_signature" }, { statut: "brouillon" }])).toBe(false);
    expect(bulletinsSignes([{ statut: "en_signature" }, { statut: "complet" }])).toBe(true);
    expect(bulletinsSignes([{ statut: "annule" }, { statut: "expire" }])).toBe(true);
    expect(bulletinsSignes([{ statut: "annule" }])).toBe(false);
    expect(bulletinsSignes([], true)).toBe(true);
  });
});
