// Jeux de données du rapport d'enquête sociale (tests et rendu de contrôle).
import type { DossierCoproprietaire } from "@/api/dossiersCopros";
import { calculerOccupation, type DonneesFiche, type LotFiche, type ReponseFiche } from "@/lib/ficheEtat";
import type { EntreeSynthese } from "@/lib/rapportEnquete";

export const COPRO_TEST = { name: "RÉSIDENCE LES TILLEULS", adresse: "8 rue des Tilleuls", code_postal: "67000" };
const ICI = "8 rue des Tilleuls 67000 Strasbourg";
const AILLEURS = "12 rue de la Paix 75002 Paris";

interface Proprio {
  id: string;
  nom: string;
  adresse: string | null;
  lots: { id: string; num: string; bat: string; usage?: string; t?: number; rattache?: string; rep?: Record<string, unknown> }[];
  reponse?: {
    profil?: string | null;
    verifie?: string;
    personnes?: number;
    complet?: boolean;
    statut?: string;
    copro?: Record<string, unknown>;
  };
}

function construire(proprios: Proprio[]): EntreeSynthese & { donnees: DonneesFiche; reponses: ReponseFiche[] } {
  const lots: LotFiche[] = proprios.flatMap((p) =>
    p.lots.map((l) => ({
      id: l.id,
      num: l.num,
      usage: l.usage ?? "habitation",
      coproprietaire_id: p.id,
      rattache_a: l.rattache ?? null,
      batiment: { code: l.bat },
      tantiemes: { MUN: l.t ?? 100 },
    }))
  );
  const donnees: DonneesFiche = {
    batiments: [...new Set(lots.map((l) => l.batiment!.code))].sort().map((code) => ({ code, adresse: null })),
    lots,
    coproprietaires: proprios.map((p) => ({ id: p.id, nom: p.nom, adresse: p.adresse })),
    cles: [{ code: "MUN", is_default: true }],
  };
  const reponses: ReponseFiche[] = proprios
    .filter((p) => p.reponse)
    .map((p) => ({
      coproprietaire_id: p.id,
      statut_occupation: p.reponse!.statut ?? null,
      profil_mpr: p.reponse!.profil ?? null,
      profil_statut: p.reponse!.verifie ? "verifie" : "declaratif",
      profil_verifie_le: p.reponse!.verifie ?? null,
      reponses: {
        copro: p.reponse!.copro ?? {},
        lots: Object.fromEntries(p.lots.filter((l) => l.rep).map((l) => [l.id, l.rep!])),
        complet: p.reponse!.complet ?? true,
      },
    }));
  const occupation = calculerOccupation({ adresse: COPRO_TEST.adresse, code_postal: COPRO_TEST.code_postal }, donnees, reponses);
  const dossiers = proprios.map((p) => {
    const r = reponses.find((x) => x.coproprietaire_id === p.id);
    const rep = r?.reponses as { copro: Record<string, unknown>; lots: Record<string, Record<string, unknown>>; complet: boolean } | undefined;
    const profil = (r?.profil_mpr ?? null) as DossierCoproprietaire["enquete"]["profil"];
    return {
      id: p.id,
      nom: p.nom,
      lots: lots.filter((l) => l.coproprietaire_id === p.id),
      enquete: {
        repondu: !!r && (profil != null || !!rep?.copro),
        complet: !!rep?.complet,
        profil,
        profilStatut: profil ? (p.reponse?.verifie ? "verifie" : "declaratif") : null,
        profilVerifieLe: p.reponse?.verifie ?? null,
        nbPersonnes: p.reponse?.personnes ?? null,
        reponses: rep ?? null,
      },
    } as unknown as DossierCoproprietaire;
  });
  return { dossiers, lots, cles: donnees.cles, batiments: donnees.batiments.map((b) => b.code), occupation, donnees, reponses };
}

const PO = { "type-occupation": "Propriétaire occupant" };
const PB = { "type-occupation": "Propriétaire bailleur (logement loué)" };

/** Petit jeu aux chiffres vérifiables à la main (11 copropriétaires, 12 logements, 2 bâtiments). */
export function petitJeu() {
  return construire([
    {
      id: "c1", nom: "Fatima AÏT-BRAHIM", adresse: ICI,
      lots: [{ id: "l1", num: "1", bat: "A", rep: PO }, { id: "k1", num: "101", bat: "A", usage: "cave", t: 10, rattache: "l1" }],
      reponse: {
        profil: "Bleu", verifie: "2026-09-12", personnes: 1,
        copro: { "composition-menage": "Personne seule", "csp-reference": "Retraité", "impayes-charges": "Oui, avec des impayés en cours", "situations-foyer": ["Personne isolée"], "importance-travaux": "Indispensables", "accord-visite": "Oui", "curatelle-tutelle": "Non" },
      },
    },
    {
      id: "c2", nom: "Jean-Pierre BAUER", adresse: ICI, lots: [{ id: "l2", num: "2", bat: "A", rep: PO }],
      reponse: { profil: "Violet", personnes: 2, copro: { "composition-menage": "Couple sans enfant", "impayes-charges": "Non", "situations-foyer": ["Aucune de ces situations"], "importance-travaux": "Utiles", "accord-visite": "Non", "curatelle-tutelle": "Non" } },
    },
    {
      id: "c3", nom: "Monique BECKER", adresse: ICI, lots: [{ id: "l7", num: "7", bat: "B", rep: { ...PO, "difficultes-logement": ["Aucune difficulté particulière"] } }],
      reponse: {
        profil: "Jaune", verifie: "2026-09-18", personnes: 3,
        copro: { "composition-menage": "Famille monoparentale", "csp-reference": "Employé", "impayes-charges": "Oui, ponctuellement", "situations-foyer": ["Famille monoparentale"], "curatelle-tutelle": "Curatelle", "importance-travaux": "Utiles", "accord-visite": "Oui, sous conditions (précisez)" },
      },
    },
    { id: "c4", nom: "Lucas BRAUN", adresse: ICI, lots: [{ id: "l8", num: "8", bat: "B" }] },
    {
      id: "c5", nom: "SCI LES PINS", adresse: AILLEURS,
      lots: [{ id: "l3", num: "3", bat: "A", rep: PB }, { id: "l4", num: "4", bat: "A", rep: { "type-occupation": "Logement vacant" } }],
      reponse: { copro: { "importance-travaux": "Peu utiles", "impayes-charges": "Non" } },
    },
    { id: "c6", nom: "Odile FREY", adresse: AILLEURS, lots: [{ id: "l9", num: "9", bat: "B" }] },
    {
      id: "c7", nom: "Karim HAMDI", adresse: ICI,
      lots: [
        { id: "l5", num: "5", bat: "A", rep: { ...PO, "difficultes-logement": ["Difficile à chauffer"] } },
        { id: "l10", num: "10", bat: "B", rep: { ...PB, "projet-vente": "Oui, avant les travaux" } },
      ],
      reponse: { profil: "Rose", verifie: "2026-09-25", personnes: 4, copro: { "composition-menage": "Couple avec enfant(s)", "impayes-charges": "Non" } },
    },
    { id: "c8", nom: "Gérard JUNG", adresse: null, lots: [{ id: "l6", num: "6", bat: "A" }] },
    { id: "c9", nom: "BOULANGERIE MEYER", adresse: AILLEURS, lots: [{ id: "m1", num: "C1", bat: "A", usage: "commerce", t: 200 }] },
    {
      id: "c10", nom: "Paul MULLER", adresse: ICI, lots: [{ id: "l11", num: "11", bat: "B", rep: PO }],
      reponse: { profil: "Bleu", personnes: 1, complet: false, copro: { "composition-menage": "Personne seule", "csp-reference": "Retraité" } },
    },
    { id: "c11", nom: "Anne KELLER", adresse: AILLEURS, lots: [{ id: "l12", num: "12", bat: "B" }], reponse: { statut: "Propriétaire bailleur" } },
  ]);
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRENOMS = ["Fatima", "Jean-Pierre", "Monique", "Lucas", "Nadia", "Christiane", "Hélène", "Marc", "Odile", "Thomas", "Yvonne", "Karim", "Bernard", "Sophie", "Gérard", "Anne", "Pierre", "Denise", "Julien", "Martine", "Paul", "Nicole", "Rémi", "Isabelle", "Céline", "Lucienne", "Éric", "Vincent", "Robert", "Rose-Marie", "Œnone", "Zoé"];
const NOMS = ["AÏT-BRAHIM", "BAUER", "BECKER", "BRAUN", "CHERIF", "DIETRICH", "ESCHBACH", "FISCHER", "FREY", "GASS", "HAAS", "HAMDI", "HEITZ", "HUBER", "JUNG", "KELLER", "KLEIN", "KOCH", "LANG", "MEYER", "MULLER", "OBERLE", "PFISTER", "RIEGER", "ROTH", "SCHMITT", "SCHNEIDER", "STOCK", "WOLFF", "ZIMMER", "ŒHLER", "VOGEL"];

/** Grand jeu pseudo-aléatoire (rendu de contrôle) : 2 bâtiments, ~64 copropriétaires, 72 logements. */
export function grandJeu(graine = 2026) {
  const alea = mulberry32(graine);
  const choix = <T,>(xs: T[]) => xs[Math.floor(alea() * xs.length)];
  const proprios: Proprio[] = [];
  let lot = 0;
  for (let i = 0; i < 64; i++) {
    const bat = i < 33 ? "A" : "B";
    const nbLogts = i % 9 === 0 ? 2 : 1;
    const occupant = alea() < 0.5;
    const repond = alea() < 0.74;
    const lots: Proprio["lots"] = Array.from({ length: i === 20 || i === 50 ? 0 : nbLogts }, () => {
      lot += 1;
      return { id: `l${lot}`, num: String(lot), bat, rep: repond ? (occupant ? PO : alea() < 0.92 ? PB : { "type-occupation": "Logement vacant" }) : undefined };
    });
    if (lots.length === 0) lots.push({ id: `m${i}`, num: `C${i}`, bat, usage: "commerce", t: 130 });
    const profil = occupant ? choix(["Bleu", "Bleu", "Jaune", "Violet", "Violet", "Rose", null]) : choix(["Violet", "Rose", null]);
    proprios.push({
      id: `c${i}`,
      nom: `${PRENOMS[i % PRENOMS.length]} ${NOMS[(i * 7) % NOMS.length]}`,
      adresse: alea() < 0.06 ? null : occupant ? ICI : AILLEURS,
      lots,
      reponse: repond
        ? {
            profil,
            verifie: profil && alea() < 0.68 ? `2026-09-${String(10 + Math.floor(alea() * 19)).padStart(2, "0")}` : undefined,
            personnes: occupant ? 1 + Math.floor(alea() * 4) : undefined,
            complet: alea() < 0.92,
            copro: {
              ...(occupant ? { "composition-menage": choix(["Personne seule", "Personne seule", "Couple sans enfant", "Couple avec enfant(s)", "Famille monoparentale", "Autre (colocation, hébergement familial…)"]), "csp-reference": choix(["Retraité", "Retraité", "Employé", "Profession intermédiaire", "Cadre, profession intellectuelle supérieure"]) } : {}),
              "impayes-charges": choix(["Non", "Non", "Non", "Non", "Non", "Non", "Oui, ponctuellement", "Oui, avec des impayés en cours"]),
              "situations-foyer": [choix(["Aucune de ces situations", "Aucune de ces situations", "Personne isolée", "Handicap ou perte d'autonomie", "Famille monoparentale"])],
              "curatelle-tutelle": choix(["Non", "Non", "Non", "Non", "Non", "Non", "Non", "Non", "Non", "Curatelle"]),
              "situation-sociale": choix(["Non", "Non", "Non", "Non", "Non", "Non", "Non", "Oui (précisez)"]),
              "importance-travaux": choix(["Indispensables", "Indispensables", "Utiles", "Utiles", "Peu utiles", "Inutiles", "Sans avis"]),
              "accord-visite": choix(["Oui", "Oui", "Non", "Oui, sous conditions (précisez)"]),
            },
          }
        : undefined,
    });
  }
  return construire(proprios);
}
