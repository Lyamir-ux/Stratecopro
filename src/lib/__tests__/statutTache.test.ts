import { describe, expect, it } from "vitest";
import { appliquerStatutOuvertes, STATUT_TACHE_SUIVANT } from "../statutTache";

describe("statut d'une tâche (retour d'Amir du 11/10/2026 : pastille de « Vos tâches »)", () => {
  it("la pastille fait passer de à faire à en cours, puis à fait, puis revient à à faire", () => {
    expect(STATUT_TACHE_SUIVANT.todo).toBe("doing");
    expect(STATUT_TACHE_SUIVANT.doing).toBe("done");
    expect(STATUT_TACHE_SUIVANT.done).toBe("todo");
  });

  const taches = [
    { id: "a", status: "todo" as const, titre: "A" },
    { id: "b", status: "doing" as const, titre: "B" },
    { id: "c", status: "todo" as const, titre: "C" },
  ];

  it("la tâche prend son nouveau statut et garde sa place dans la liste", () => {
    const apres = appliquerStatutOuvertes(taches, "a", "doing");
    expect(apres.map((t) => [t.id, t.status])).toEqual([["a", "doing"], ["b", "doing"], ["c", "todo"]]);
    expect(apres[0].titre).toBe("A");
  });

  it("une tâche faite sort de la liste, les autres ne bougent pas", () => {
    const apres = appliquerStatutOuvertes(taches, "b", "done");
    expect(apres.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("ne modifie pas la liste d'origine et ignore un identifiant inconnu", () => {
    const copie = JSON.parse(JSON.stringify(taches));
    appliquerStatutOuvertes(taches, "a", "done");
    expect(taches).toEqual(copie);
    expect(appliquerStatutOuvertes(taches, "zzz", "done")).toEqual(taches);
  });
});
