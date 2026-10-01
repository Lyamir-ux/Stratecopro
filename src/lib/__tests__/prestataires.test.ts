import { describe, expect, it } from "vitest";
import { filtrerEntreprises, motifNonAlertable } from "../prestataires";

const e = (raison_sociale: string, metiers: string, ville: string | null = null, contact_nom: string | null = null) => ({
  raison_sociale,
  metiers,
  ville,
  contact_nom,
});
const LISTE = [
  e("Ingedair", "Maîtrise d'œuvre · Bureau d'études"),
  e("Christophe Guepin + Ingédiag", "Maîtrise d'œuvre", "Mulhouse"),
  e("Frög architecture", "Maîtrise d'œuvre", null, "Anne Frög"),
  e("TEST Pierre", "Contrôleur technique · Coordonnateur SPS", "Strasbourg"),
];
const noms = (r: typeof LISTE) => r.map((p) => p.raison_sociale);
const chercher = (q: string) => noms(filtrerEntreprises(LISTE, q, (p) => p.metiers));

describe("filtrerEntreprises", () => {
  it("recherche vide ou blanche : toutes les entreprises, dans l'ordre", () => {
    expect(chercher("")).toEqual(noms(LISTE));
    expect(chercher("   ")).toEqual(noms(LISTE));
  });

  it("ignore accents et majuscules, des deux côtés", () => {
    expect(chercher("INGEDIAG")).toEqual(["Christophe Guepin + Ingédiag"]);
    expect(chercher("frog")).toEqual(["Frög architecture"]);
    expect(chercher("ingé")).toEqual(["Ingedair", "Christophe Guepin + Ingédiag"]);
  });

  it("cherche aussi dans les métiers, la ville et le contact", () => {
    expect(chercher("bureau d'etudes")).toEqual(["Ingedair"]);
    expect(chercher("sps")).toEqual(["TEST Pierre"]);
    expect(chercher("strasbourg")).toEqual(["TEST Pierre"]);
    expect(chercher("anne")).toEqual(["Frög architecture"]);
  });

  it("aucun résultat : liste vide", () => {
    expect(chercher("socotec")).toEqual([]);
  });
});

describe("motifNonAlertable", () => {
  const fiche = { actif: true, email: "contact@moe.fr", ne_pas_consulter: false };
  it("fiche active avec e-mail : alertable", () => {
    expect(motifNonAlertable(fiche)).toBeNull();
  });
  it("donne la raison, dans l'ordre suspendue, e-mail, refus", () => {
    expect(motifNonAlertable({ ...fiche, actif: false, email: null })).toBe("Fiche suspendue");
    expect(motifNonAlertable({ ...fiche, email: null })).toBe("Sans e-mail");
    expect(motifNonAlertable({ ...fiche, email: "  " })).toBe("Sans e-mail");
    expect(motifNonAlertable({ ...fiche, ne_pas_consulter: true })).toBe("Ne souhaite pas être consultée");
  });
});
