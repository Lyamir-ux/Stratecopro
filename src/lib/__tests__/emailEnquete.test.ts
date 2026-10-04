// E-mail du questionnaire d'enquête, vérifié et modifié avant l'envoi (idée
// d'Amir du 04/10/2026) : texte proposé ou enregistré, date limite en lettres,
// paragraphes, destinataires, paquets d'envoi par adresse.
import { describe, expect, it, vi } from "vitest";
import {
  aEnregistrer,
  classerDestinataires,
  dateEnLettres,
  messageEnqueteParDefaut,
  paragraphes,
  sujetEnqueteParDefaut,
  texteEmailEnquete,
} from "../emailEnquete";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
const { paquetsParAdresse } = await import("@/api/espaces");

describe("texte de l'e-mail", () => {
  it("propose un objet et un message au nom de la copropriété", () => {
    const t = texteEmailEnquete({ email_sujet: null, email_message: null }, "LE PARC DES CIGOGNES");
    expect(t.sujet).toBe("Enquête sociale et technique - LE PARC DES CIGOGNES");
    expect(t.message).toContain("votre copropriété LE PARC DES CIGOGNES");
    expect(t.message).toContain("préparer le dépôt du dossier de financement");
    expect(t.message).toContain("Vos réponses sont obligatoires et seront traitées de manière confidentielle");
    expect(t.modifie).toBe(false);
    expect(t.message).not.toContain("—");
  });

  it("reprend le texte enregistré par l'AMO, un texte vide valant texte proposé", () => {
    const t = texteEmailEnquete({ email_sujet: "Merci de répondre", email_message: "  " }, "MEINAU");
    expect(t.sujet).toBe("Merci de répondre");
    expect(t.message).toBe(messageEnqueteParDefaut("MEINAU"));
    expect(t.modifie).toBe(true);
  });

  it("n'enregistre que ce qui diffère du texte proposé", () => {
    const defaut = sujetEnqueteParDefaut("MEINAU");
    expect(aEnregistrer(defaut, defaut)).toBeNull();
    expect(aEnregistrer(`  ${defaut} `, defaut)).toBeNull();
    expect(aEnregistrer("", defaut)).toBeNull();
    expect(aEnregistrer(" Relance ", defaut)).toBe("Relance");
  });
});

describe("mise en forme", () => {
  it("écrit la date limite en lettres", () => {
    expect(dateEnLettres("2026-10-15")).toBe("15 octobre 2026");
    expect(dateEnLettres("2026-12-01")).toBe("1er décembre 2026");
    expect(dateEnLettres("2026-08-09")).toBe("9 août 2026");
    expect(dateEnLettres(null)).toBeNull();
    expect(dateEnLettres("")).toBeNull();
    expect(dateEnLettres("2026-13-01")).toBeNull();
  });

  it("découpe le message en paragraphes et garde les retours à la ligne", () => {
    expect(paragraphes("Premier\r\n\r\nDeuxième ligne 1\nligne 2\n\n\n  \nTroisième  ")).toEqual([
      ["Premier"],
      ["Deuxième ligne 1", "ligne 2"],
      ["Troisième"],
    ]);
    expect(paragraphes("   ")).toEqual([]);
  });
});

describe("destinataires", () => {
  const fiches = [
    { id: "a", nom: "ACTIF Anne", email: "anne@x.fr", sortant_le: null },
    { id: "b", nom: "INVITE Bruno", email: "bruno@x.fr", sortant_le: null },
    { id: "c", nom: "ACREER Chloé", email: "chloe@x.fr", sortant_le: null },
    { id: "d", nom: "SANSMAIL Denis", email: null, sortant_le: null },
    { id: "e", nom: "PRIS Émile", email: "amo@strateco.fr", sortant_le: null },
    { id: "f", nom: "SORTANT Fanny", email: "fanny@x.fr", sortant_le: "2026-09-22" },
  ];
  const espaces = new Map([
    ["a", { etat: "actif" as const }],
    ["b", { etat: "invite" as const }],
    ["c", { etat: "a_creer" as const }],
    ["d", { etat: "sans_email" as const }],
    ["e", { etat: "email_pris" as const }],
  ]);

  it("tous : fiches présentes, espace activé ou non, sans les adresses inutilisables", () => {
    const c = classerDestinataires(fiches, espaces, "tous", () => false);
    expect(c.retenues).toBe(5);
    expect(c.envoyables.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(c.envoyables.map((d) => d.espaceActif)).toEqual([true, false, false]);
    expect([c.avecEspace, c.sansEspace, c.sansEmail, c.emailPris]).toEqual([1, 2, 1, 1]);
  });

  it("non-répondants : les fiches qui ont un profil sont écartées", () => {
    const c = classerDestinataires(fiches, espaces, "nonrep", (id) => id === "a" || id === "d");
    expect(c.retenues).toBe(3);
    expect(c.envoyables.map((d) => d.id)).toEqual(["b", "c"]);
    expect(c.sansEmail).toBe(0);
  });
});

describe("paquets d'envoi", () => {
  it("garde ensemble les fiches qui partagent une adresse", () => {
    const cibles = [
      { id: "1", email: "a@x.fr" },
      { id: "2", email: "b@x.fr" },
      { id: "3", email: "A@x.fr " },
      { id: "4", email: null },
      { id: "5", email: "c@x.fr" },
    ];
    const paquets = paquetsParAdresse(cibles, 2);
    expect(paquets.map((p) => p.map((c) => c.id))).toEqual([["1", "3"], ["2", "4"], ["5"]]);
  });

  it("des fiches sans adresse ne sont jamais regroupées entre elles", () => {
    const paquets = paquetsParAdresse(
      [
        { id: "1", email: null },
        { id: "2", email: "" },
        { id: "3", email: null },
      ],
      2
    );
    expect(paquets.map((p) => p.length)).toEqual([2, 1]);
  });
});
