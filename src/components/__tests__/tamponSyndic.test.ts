import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

type Etat = { data?: { nom: string; image: string | null }; isLoading: boolean; error: unknown };
const etat: { q: Etat } = { q: { isLoading: false, error: null } };
vi.mock("@/api/tamponSyndic", () => ({
  useTamponOrganisation: () => etat.q,
  useImporterTamponSyndic: () => ({ mutate: () => {}, isPending: false }),
}));

import { TamponSyndic } from "../TamponSyndic";

const html = (p: { organisationId: string | null; alerte?: boolean }) =>
  renderToStaticMarkup(
    createElement(TamponSyndic, {
      organisationId: p.organisationId,
      nomSyndic: "IMMIUM",
      libelleImport: "Importer un tampon",
      sansTampon: "Aucun tampon pour IMMIUM.",
      alerte: p.alerte,
    }),
  );
const texte = (h: string) => h.replace(/&#x27;/g, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("TamponSyndic (partagé entre Financement et Paramètres > Organisations)", () => {
  it("sans tampon : l'explication de l'écran et le bouton à son libellé", () => {
    etat.q = { data: { nom: "IMMIUM", image: null }, isLoading: false, error: null };
    const t = texte(html({ organisationId: "o1" }));
    expect(t).toContain("Aucun tampon pour IMMIUM.");
    expect(t).toContain("Importer un tampon");
    expect(t).not.toContain("Remplacer le tampon");
  });

  it("l'explication passe en rouge quand l'écran le demande", () => {
    etat.q = { data: { nom: "IMMIUM", image: null }, isLoading: false, error: null };
    expect(html({ organisationId: "o1" })).toContain("var(--fg-muted)");
    expect(html({ organisationId: "o1", alerte: true })).toContain("var(--color-error-700)");
  });

  it("avec tampon : aperçu, « Remplacer le tampon », plus de bouton d'import", () => {
    etat.q = { data: { nom: "IMMIUM", image: "data:image/png;base64,AAAA" }, isLoading: false, error: null };
    const h = html({ organisationId: "o1" });
    expect(h).toContain('src="data:image/png;base64,AAAA"');
    expect(texte(h)).toContain("Remplacer le tampon");
    expect(texte(h)).not.toContain("Importer un tampon");
  });

  it("accepte uniquement des images PNG ou JPG dans le sélecteur de fichiers", () => {
    etat.q = { data: { nom: "IMMIUM", image: null }, isLoading: false, error: null };
    expect(html({ organisationId: "o1" })).toMatch(/accept="\.png,\.jpg,\.jpeg,image\/png,image\/jpeg"/);
  });

  it("dossier sans organisation : message, ni bouton ni lecture", () => {
    etat.q = { isLoading: false, error: null };
    const t = texte(html({ organisationId: null }));
    expect(t).toContain("aucune organisation");
    expect(t).not.toContain("Importer un tampon");
  });

  it("chargement et erreur de lecture : ni bouton d'import ni faux « aucun tampon »", () => {
    etat.q = { isLoading: true, error: null };
    expect(texte(html({ organisationId: "o1" }))).not.toContain("Importer un tampon");
    etat.q = { isLoading: false, error: { message: "permission denied" } };
    const t = texte(html({ organisationId: "o1" }));
    expect(t).toContain("permission denied");
    expect(t).not.toContain("Importer un tampon");
  });
});
