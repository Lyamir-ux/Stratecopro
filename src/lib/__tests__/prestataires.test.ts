import { describe, expect, it } from "vitest";
import {
  accesPerdus,
  envoisParEntreprise,
  adressesEntreprise,
  adressesFiche,
  adressesParDefaut,
  estChoixParDefaut,
  filtrerEntreprises,
  motifNonAlertable,
  resumeAcces,
} from "../prestataires";

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

describe("adressesEntreprise (choix de l'adresse d'envoi d'une consultation)", () => {
  const fiche = { email: "Contact@MOE.fr ", emails_secondaires: ["compta@moe.fr", "contact@moe.fr", " "] };
  const contacts = [
    { nom: "Anne Frög", role: "Directrice", email: "anne@moe.fr" },
    { nom: "Paul Roth", role: null, email: "COMPTA@moe.fr" },
    { nom: "Sans adresse", role: "Stagiaire", email: null },
    { nom: "Marc Lang", role: "", email: "marc@moe.fr" },
  ];

  it("principale, copies, puis contacts ; adresses nettoyées et sans doublon", () => {
    const l = adressesEntreprise(fiche, contacts);
    expect(l.map((a) => [a.email, a.origine])).toEqual([
      ["contact@moe.fr", "principale"],
      ["compta@moe.fr", "copie"],
      ["anne@moe.fr", "contact"],
      ["marc@moe.fr", "contact"],
    ]);
  });

  it("un contact dont l'adresse est déjà celle de la fiche n'apparaît qu'une fois, avec le rang de la fiche", () => {
    const l = adressesEntreprise(fiche, contacts);
    expect(l.filter((a) => a.email === "compta@moe.fr")).toHaveLength(1);
    expect(l.find((a) => a.email === "compta@moe.fr")?.origine).toBe("copie");
  });

  it("libellé des contacts : nom et fonction, nom seul sans fonction", () => {
    const l = adressesEntreprise(fiche, contacts);
    expect(l.find((a) => a.email === "anne@moe.fr")?.libelle).toBe("Anne Frög, Directrice");
    expect(l.find((a) => a.email === "marc@moe.fr")?.libelle).toBe("Marc Lang");
    expect(l[0].libelle).toBeNull();
  });

  it("par défaut : la principale et les copies, jamais les contacts (comportement d'avant)", () => {
    expect(adressesParDefaut(adressesEntreprise(fiche, contacts))).toEqual(["contact@moe.fr", "compta@moe.fr"]);
  });

  it("sans adresse principale : aucune adresse par défaut", () => {
    expect(adressesEntreprise({ email: null, emails_secondaires: [] }, [])).toEqual([]);
    expect(adressesParDefaut(adressesEntreprise({ email: null, emails_secondaires: [] }, [contacts[0]]))).toEqual([]);
  });

  it("estChoixParDefaut : même ensemble que principale + copies, quel que soit l'ordre", () => {
    const l = adressesEntreprise(fiche, contacts);
    expect(estChoixParDefaut(["compta@moe.fr", "contact@moe.fr"], l)).toBe(true);
    expect(estChoixParDefaut(new Set(["contact@moe.fr"]), l)).toBe(false);
    expect(estChoixParDefaut(["contact@moe.fr", "compta@moe.fr", "anne@moe.fr"], l)).toBe(false);
    expect(estChoixParDefaut(["anne@moe.fr"], l)).toBe(false);
  });
});

describe("accès par personne (0162)", () => {
  it("adressesFiche : principale puis autres, en minuscules, sans vide ni doublon", () => {
    expect(adressesFiche(" Contact@MOE.fr ", ["jean@moe.fr", "", "CONTACT@moe.fr", " paul@moe.fr"])).toEqual([
      "contact@moe.fr",
      "jean@moe.fr",
      "paul@moe.fr",
    ]);
    expect(adressesFiche(null, null)).toEqual([]);
  });

  it("accesPerdus : les adresses avec accès qui ne sont plus sur la fiche", () => {
    const avecAcces = ["contact@moe.fr", "jean@moe.fr"];
    expect(accesPerdus(avecAcces, "contact@moe.fr", ["jean@moe.fr", "paul@moe.fr"])).toEqual([]);
    expect(accesPerdus(avecAcces, "contact@moe.fr", ["paul@moe.fr"])).toEqual(["jean@moe.fr"]);
    // une adresse qui passe d'autre à principale n'est pas retirée
    expect(accesPerdus(avecAcces, "JEAN@moe.fr", ["contact@moe.fr"])).toEqual([]);
    expect(accesPerdus(avecAcces, "", [])).toEqual(["contact@moe.fr", "jean@moe.fr"]);
  });

  it("resumeAcces : décompte par état", () => {
    expect(
      resumeAcces([{ etat: "actif" }, { etat: "invite" }, { etat: "a_creer" }, { etat: "a_creer" }, { etat: "email_pris" }])
    ).toEqual({ total: 5, actifs: 1, invites: 1, aCreer: 2, pris: 1 });
    expect(resumeAcces([])).toEqual({ total: 0, actifs: 0, invites: 0, aCreer: 0, pris: 0 });
  });
});

describe("envoisParEntreprise", () => {
  const l = (prestataire_id: string | null, email: string, statut: string, sent_at: string, raison = "Acceo") => ({
    prestataire_id,
    email,
    statut,
    sent_at,
    prestataire: prestataire_id ? { raison_sociale: raison } : null,
  });

  it("éclate les anciennes lignes groupées et ajoute les lignes par adresse", () => {
    const r = envoisParEntreprise([
      l("a", "Julien@acceo.eu, jules@acceo.eu", "envoye", "2026-10-05T12:20:00Z"),
      l("a", "nouvelle@acceo.eu", "envoye", "2026-10-12T09:00:00Z"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].raisonSociale).toBe("Acceo");
    expect(r[0].adresses.map((a) => a.email)).toEqual(["julien@acceo.eu", "jules@acceo.eu", "nouvelle@acceo.eu"]);
  });

  it("le dernier envoi d'une adresse l'emporte, quel que soit l'ordre des lignes", () => {
    const r = envoisParEntreprise([
      l("a", "julien@acceo.eu", "envoye", "2026-10-12T09:00:00Z"),
      l("a", "julien@acceo.eu, jules@acceo.eu", "erreur", "2026-10-05T12:20:00Z"),
    ]);
    expect(r[0].adresses).toEqual([
      { email: "julien@acceo.eu", statut: "envoye", sentAt: "2026-10-12T09:00:00Z" },
      { email: "jules@acceo.eu", statut: "erreur", sentAt: "2026-10-05T12:20:00Z" },
    ]);
  });

  it("une entreprise par fiche, dans l'ordre du premier envoi", () => {
    const r = envoisParEntreprise([
      l("b", "nicolas@atelierg5.fr", "envoye", "2026-10-05T12:21:00Z", "Atelier G5"),
      l("a", "julien@acceo.eu", "envoye", "2026-10-05T12:20:00Z"),
      l(null, "x@ex.fr", "simule", "2026-10-05T12:22:00Z"),
    ]);
    expect(r.map((e) => [e.prestataireId, e.raisonSociale])).toEqual([
      ["a", "Acceo"],
      ["b", "Atelier G5"],
      [null, "x@ex.fr"],
    ]);
  });
});
