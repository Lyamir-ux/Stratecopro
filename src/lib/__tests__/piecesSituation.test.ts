import { describe, expect, it } from "vitest";
import { CATALOGUE } from "../enqueteCatalogue";
import {
  bulletinsSignes,
  piecesAttendues,
  piecesDossierPret,
  piecesEnquete,
  piecesFourniesSignature,
  PIECES_SITUATION,
  type BulletinPieces,
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

describe("pièces de la signature dans le dossier de prêt : validation AMO et remplacement (retours de A CHELGHAM, 09/10/2026)", () => {
  type Sig = BulletinPieces["signataires"][number];
  const signataire = (role: string, ordre: number, prenom: string, email: string, deposee: string | null, patch: Partial<Sig> = {}): Sig => ({
    id: `${prenom}-${ordre}`, role, ordre, prenom, nom: "CHELGHAM", email,
    signe_le: deposee ? "2026-10-09T19:00:00Z" : null,
    piece_identite_path: deposee ? `b/${prenom}/piece.pdf` : null,
    piece_deposee_le: deposee, piece_identite_type: deposee ? "cni" : null,
    piece_statut: deposee ? "a_verifier" : null, piece_motif_refus: null, piece_verifiee_le: null, piece_remplacee_le: null,
    ...patch,
  });
  const bulletin = (id: string, statut: string, signataires: Sig[], patch: Partial<BulletinPieces> = {}): BulletinPieces => ({
    id, statut, purge_effectuee_le: null, rib_path: `${id}/rib.pdf`, iban_dernier4: "0197",
    mandat_signe_le: "2026-10-09T18:59:52Z", rib_statut: "a_verifier", rib_motif_refus: null, rib_verifiee_le: null,
    signataires, ...patch,
  });

  it("une pièce d'identité par signataire, principal en tête, puis le RIB, en attente de validation", () => {
    const l = piecesFourniesSignature([
      bulletin("b1", "complet", [
        signataire("cosignataire", 2, "Hassina", "h@x.fr", "2026-10-09T19:13:23Z"),
        signataire("principal", 1, "Amir", "a@x.fr", "2026-10-09T18:57:14Z"),
      ]),
    ]);
    expect(l.map((p) => p.nom)).toEqual([
      "Pièce d'identité de Amir CHELGHAM (vous)",
      "Pièce d'identité de Hassina CHELGHAM",
      "RIB du compte de prélèvement",
    ]);
    expect(l.map((p) => p.statut)).toEqual(["a_verifier", "a_verifier", "a_verifier"]);
    expect(l[0].detail).toBe("Carte nationale d'identité · déposée le 9 octobre 2026, à la signature · en attente de validation par Strat Eco");
    expect(l[2].detail).toBe("IBAN se terminant par 0197 · mandat SEPA signé le 9 octobre 2026 · en attente de validation par Strat Eco");
    expect(l.every((p) => p.remplacable)).toBe(true);
    expect(l[1].cibles).toEqual([{ bulletinId: "b1", signataireId: "Hassina-2", path: "b/Hassina/piece.pdf" }]);
  });

  it("validée, refusée (avec motif), remplacée", () => {
    const l = piecesFourniesSignature([
      bulletin("b1", "complet", [
        signataire("principal", 1, "Amir", "a@x.fr", "2026-10-09T18:57:14Z", { piece_statut: "valide", piece_verifiee_le: "2026-10-10T08:00:00Z" }),
        signataire("cosignataire", 2, "Hassina", "h@x.fr", "2026-10-09T19:13:23Z", {
          piece_statut: "refuse", piece_motif_refus: "la pièce est illisible", piece_verifiee_le: "2026-10-10T08:00:00Z",
          piece_remplacee_le: "2026-10-09T21:00:00Z",
        }),
      ], { rib_statut: "refuse", rib_motif_refus: "le RIB est illisible", rib_verifiee_le: "2026-10-10T08:00:00Z" }),
    ]);
    expect(l[0].detail).toMatch(/validée par Strat Eco le 10 octobre 2026$/);
    expect(l[1].statut).toBe("refuse");
    expect(l[1].motif).toBe("la pièce est illisible");
    expect(l[1].detail).toMatch(/remplacée le 9 octobre 2026 · refusée le 10 octobre 2026$/);
    expect(l[2].statut).toBe("refuse");
    expect(l[2].motif).toBe("le RIB est illisible");
  });

  it("plusieurs bulletins : chaque personne une seule fois, le statut le moins avancé l'emporte", () => {
    const l = piecesFourniesSignature([
      bulletin("b1", "en_signature", [
        signataire("principal", 1, "Amir", "a@x.fr", "2026-10-09T18:57:14Z", { piece_statut: "valide" }),
        signataire("cosignataire", 2, "Hassina", "H@x.fr", null),
      ]),
      bulletin("b2", "en_signature", [
        signataire("principal", 1, "Amir", "A@x.fr", "2026-10-09T18:58:00Z", { id: "Amir-b2", piece_statut: "refuse" }),
        signataire("cosignataire", 2, "Hassina", "h@x.fr", "2026-10-10T08:00:00Z", { id: "Hassina-b2" }),
      ], { iban_dernier4: "4321", rib_statut: "valide" }),
    ]);
    expect(l.filter((p) => p.quoi === "piece")).toHaveLength(2);
    expect(l[0].statut).toBe("refuse");
    expect(l[0].cibles.map((c) => c.bulletinId)).toEqual(["b1", "b2"]);
    // Hassina n'a signé que le second bulletin : seul celui-là se remplace
    expect(l[1].statut).toBe("a_verifier");
    expect(l[1].cibles.map((c) => c.bulletinId)).toEqual(["b2"]);
    expect(l[2].detail).toMatch(/^IBAN se terminant par 0197, 4321/);
    expect(l[2].statut).toBe("a_verifier");
  });

  it("cosignataire qui n'a pas encore déposé : sans statut, depuis son lien, pas remplaçable", () => {
    const l = piecesFourniesSignature([bulletin("b1", "en_signature", [signataire("principal", 1, "Amir", "a@x.fr", "2026-10-09T18:57:14Z"), signataire("cosignataire", 2, "Hassina", "h@x.fr", null)])]);
    expect(l[1].statut).toBeNull();
    expect(l[1].remplacable).toBe(false);
    expect(l[1].detail).toMatch(/lien personnel de signature/);
  });

  it("pièces purgées après l'instruction : signalées, plus remplaçables", () => {
    const l = piecesFourniesSignature([
      bulletin("b1", "complet", [signataire("principal", 1, "Amir", "a@x.fr", "2026-10-09T18:57:14Z", { piece_identite_path: null })], { purge_effectuee_le: "2026-12-01T00:00:00Z" }),
    ]);
    expect(l[0].purgee).toBe(true);
    expect(l[0].remplacable).toBe(false);
    expect(l[0].detail).toMatch(/^Supprimée après l'instruction/);
  });

  it("bulletins annulés ou en préparation ignorés ; rien sans bulletin", () => {
    expect(piecesFourniesSignature([bulletin("b1", "annule", [signataire("principal", 1, "Amir", "a@x.fr", "2026-10-09T18:57:14Z")])])).toEqual([]);
    expect(piecesFourniesSignature([bulletin("b1", "brouillon", [signataire("principal", 1, "Amir", "a@x.fr", null)])])).toEqual([]);
    expect(piecesFourniesSignature(null)).toEqual([]);
  });
});
