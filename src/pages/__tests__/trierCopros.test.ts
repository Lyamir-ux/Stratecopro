import { describe, expect, it } from "vitest";
import { trierCopros } from "../Dashboard";
import type { CoproWithStats } from "@/api/copros";

const copro = (name: string, maitre_oeuvre: string | null) => ({ name, maitre_oeuvre, stats: null }) as unknown as CoproWithStats;

describe("trierCopros - maître d'œuvre", () => {
  const copros = [copro("LAMARTINE", "Ingedair"), copro("PORTE DAUPHINE", null), copro("LE BAYARD", "Atelier G5"), copro("STADTWAY", "  ")];

  it("trie par nom de MOE, dossiers sans MOE en fin de liste", () => {
    expect(trierCopros(copros, { col: "moe", desc: false }).map((c) => c.name)).toEqual([
      "LE BAYARD",
      "LAMARTINE",
      "PORTE DAUPHINE",
      "STADTWAY",
    ]);
  });

  it("garde les dossiers sans MOE en fin de liste en tri décroissant", () => {
    expect(trierCopros(copros, { col: "moe", desc: true }).map((c) => c.name).slice(0, 2)).toEqual(["LAMARTINE", "LE BAYARD"]);
  });
});
