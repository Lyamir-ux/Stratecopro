import { describe, expect, it } from "vitest";
import { libelleLotsPortail } from "../lotsPortail";

const lot = (num: string, usage = "habitation", batiment: string | null = null) => ({ num, usage, batiment });

describe("libelleLotsPortail", () => {
  it("un logement avec son annexe rattachée", () => {
    expect(libelleLotsPortail([lot("53", "garage"), lot("11", "habitation", "01")])).toBe(
      "Lot n°11 (Bât. 01) + garage n°53",
    );
  });

  it("distingue deux fiches d'une même copropriété (cas des deux « Pierre MAXTAFF »)", () => {
    const a = libelleLotsPortail([lot("21"), lot("32", "caves")]);
    const b = libelleLotsPortail([lot("11"), lot("53", "garage")]);
    expect(a).toBe("Lot n°21 + cave n°32");
    expect(b).toBe("Lot n°11 + garage n°53");
    expect(a).not.toBe(b);
  });

  it("trie par numéro, logements avant annexes, et parle d'entrée quand la copropriété est un seul bâtiment", () => {
    expect(libelleLotsPortail([lot("10", "habitation", "B"), lot("9", "habitation", "A"), lot("2", "caves")], "entree")).toBe(
      "Lot n°9 (Entrée A), Lot n°10 (Entrée B) + cave n°2",
    );
  });

  it("résume la fin au-delà du maximum", () => {
    const lots = [lot("1"), lot("2"), lot("3", "garage"), lot("4", "caves"), lot("5", "autres"), lot("6", "bureaux")];
    expect(libelleLotsPortail(lots, null, 3)).toBe("Lot n°1, Lot n°2 + garage n°3 + 3 autres lots");
    expect(libelleLotsPortail(lots, null, 5)).toBe("Lot n°1, Lot n°2 + garage n°3, cave n°4, lot annexe n°5 + 1 autre lot");
  });

  it("une annexe n'indique son bâtiment que s'il diffère de celui du logement", () => {
    expect(libelleLotsPortail([lot("11", "habitation", "01"), lot("53", "garage", "01")])).toBe("Lot n°11 (Bât. 01) + garage n°53");
    expect(libelleLotsPortail([lot("11", "habitation", "01"), lot("53", "garage", "02")])).toBe(
      "Lot n°11 (Bât. 01) + garage n°53 (Bât. 02)",
    );
  });

  it("aucun lot : rien", () => {
    expect(libelleLotsPortail([])).toBe("");
  });
});
