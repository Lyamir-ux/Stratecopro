import { describe, expect, it } from "vitest";
import {
  fichesARelancer,
  messageOuvertureParDefaut,
  messageRelanceParDefaut,
  sujetOuvertureParDefaut,
  sujetRelanceParDefaut,
} from "../emailAdhesion";

describe("e-mail d'ouverture des adhésions (retours d'Amir du 11/10/2026)", () => {
  it("annonce que le copropriétaire peut choisir son mode de financement", () => {
    expect(sujetOuvertureParDefaut("Les Lilas")).toBe("Choisissez votre mode de financement - Les Lilas");
    const m = messageOuvertureParDefaut("Les Lilas", "2026-11-15", null);
    expect(m).toContain("Les Lilas");
    expect(m).toContain("choisir votre mode de financement");
    expect(m).toContain("prêt collectif, éco-PTZ individuel ou fonds propres");
  });

  it("donne la date limite d'adhésion au prêt collectif, sans en imposer une à l'éco-PTZ individuel ni aux fonds propres", () => {
    const m = messageOuvertureParDefaut("Les Lilas", "2026-11-15", null);
    expect(m).toContain("La date limite pour déposer votre adhésion au prêt collectif est le 15 novembre 2026.");
    expect(m).toContain("ne sont pas soumis à cette date limite.");
  });

  it("rappelle la date de modification du choix quand elle existe", () => {
    expect(messageOuvertureParDefaut("Les Lilas", "2026-11-15", "2026-12-01")).toContain(
      "votre choix reste modifiable jusqu'au 1er décembre 2026."
    );
  });

  it("rappelle que l'enquête doit être transmise d'abord, et n'emploie jamais de tiret long", () => {
    const m = messageOuvertureParDefaut("Les Lilas", null, null);
    expect(m).toContain("une fois l'enquête sociale et technique transmise");
    expect(m).not.toContain("La date limite pour déposer");
    expect(m).not.toContain("\u2014");
    expect(sujetOuvertureParDefaut("X")).not.toContain("\u2014");
  });
});

describe("dernière relance avec une deuxième date limite", () => {
  it("annonce la nouvelle date limite et exclut l'éco-PTZ individuel et les fonds propres", () => {
    expect(sujetRelanceParDefaut("Les Lilas")).toBe("Dernier rappel : adhésion au prêt collectif - Les Lilas");
    const m = messageRelanceParDefaut("Les Lilas", "2026-12-01");
    expect(m).toContain("repoussée une dernière fois au 1er décembre 2026");
    expect(m).toContain("éco-PTZ individuel ou les fonds propres");
    expect(m).not.toContain("\u2014");
  });

  it("laisse un repère tant que la date n'est pas saisie", () => {
    expect(messageRelanceParDefaut("Les Lilas", null)).toContain("[nouvelle date limite]");
  });
});

describe("fichesARelancer", () => {
  const f = (id: string, sortant = false) => ({ id, sortant_le: sortant ? "2026-01-01" : null });
  const fiches = [f("a"), f("b"), f("c"), f("d"), f("e"), f("s", true)];
  const choix = new Map([
    ["a", "collectif"],
    ["b", "individuel"],
    ["c", "fonds"],
    ["d", "collectif"],
  ]);

  it("garde ceux qui ont choisi le prêt collectif sans déposer leur dossier, et ceux qui n'ont rien choisi", () => {
    const retenues = fichesARelancer(fiches, choix, new Set(["d"])).map((x) => x.id);
    expect(retenues).toEqual(["a", "e"]);
  });

  it("écarte les fiches sortantes et celles dont le dossier est déposé", () => {
    expect(fichesARelancer(fiches, new Map(), new Set(["a", "b"])).map((x) => x.id)).toEqual(["c", "d", "e"]);
  });
});
