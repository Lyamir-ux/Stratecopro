// Export du dossier d'un adhérent en UN SEUL PDF par l'équipe AMO (08/10/2026) : la
// Caisse d'Épargne Grand Est veut « NOM prénom.PDF » avec toutes les pièces, dans
// l'ordre de sa nomenclature (src/lib/dossierAdherent.ts). Les pièces viennent de
// deux endroits :
//  - signature électronique (bulletin scellé, mandat SEPA signé, pièces d'identité,
//    RIB) : URL signée délivrée par l'edge function signature-flux. Le contenu des
//    pièces est réservé au niveau 1 (CGU art. 7.5.1) et chaque consultation est
//    journalisée : un niveau 2 ne peut pas exporter ;
//  - portail (avis d'imposition, justificatif de domicile, taxe foncière, pièces de SCI,
//    jugement) et ancien dossier d'adhésion : bucket pieces-copro, lu avec le droit AMO.
// L'assemblage se fait dans le navigateur (pdf-lib) : rien n'est déployé côté serveur.
import { supabase } from "@/lib/supabase";
import { appelSignature, ERREURS_SIGNATURE } from "@/api/signature";
import type { DossierCoproprietaire, PieceJustificative } from "@/api/dossiersCopros";
import type { CleLigne } from "@/lib/dossierAdherent";
import { nomFichierDossierAdherent, nomUniqueDansSerie } from "@/lib/dossierAdherent";
import { conventionNoms, type ConventionNoms } from "@/lib/nomFamille";
import { nomFichierSansAccents } from "@/lib/nommage";
import { fusionnerPieces, type PieceAFusionner } from "@/lib/pdf/dossierAdherent";

/** Une pièce à reprendre dans le PDF, lue seulement au moment de l'export. */
export interface SourcePiece {
  cle: CleLigne;
  label: string;
  ext: string;
  /** Pièce d'identité, RIB, mandat SEPA : niveau 1 seulement, consultation journalisée. */
  sensible: boolean;
  /** Pièce du portail pas encore validée par l'équipe : l'export le signale. */
  nonValidee: boolean;
  lire: () => Promise<Uint8Array>;
}

const extensionDe = (chemin: string): string => (chemin.split(".").pop() ?? "").toLowerCase();

async function lireUrl(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("document introuvable");
  return new Uint8Array(await r.arrayBuffer());
}

/** Document du module de signature : l'edge function renvoie une URL signée de 60 secondes. */
async function lireSignature(body: Record<string, unknown>): Promise<Uint8Array> {
  const r = await appelSignature(body);
  if (typeof r.url !== "string") throw new Error("document introuvable");
  return lireUrl(r.url);
}

async function lirePieces(chemin: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from("pieces-copro").download(chemin);
  if (error || !data) throw new Error("document introuvable");
  return new Uint8Array(await data.arrayBuffer());
}

/** Pièce déposée au portail : reprise sauf si l'équipe l'a refusée (le copropriétaire doit la redéposer). */
function pieceDuPortail(cle: CleLigne, label: string, p: PieceJustificative | undefined): SourcePiece[] {
  if (!p || p.statut === "refuse") return [];
  return [{ cle, label, ext: extensionDe(p.storage_path), sensible: false, nonValidee: p.statut !== "valide", lire: () => lirePieces(p.storage_path) }];
}

/**
 * Pièces d'un adhérent à reprendre dans son PDF, dans l'ordre de la nomenclature de la
 * banque. Ne lit rien : seules les pièces présentes sont listées, celles qui manquent se
 * lisent dans `d.banque.lignes`.
 */
export function sourcesDossierAdherent(d: DossierCoproprietaire): SourcePiece[] {
  const elec = d.bulletinsElec.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const nonPurges = elec.filter((b) => !b.purge_effectuee_le);
  const sci = d.nature === "sci";

  const parCle: Partial<Record<CleLigne, () => SourcePiece[]>> = {
    bulletin: () => {
      const signes = elec.filter((b) => b.statut === "complet" && b.document_signe_path);
      if (signes.length)
        return signes.map((b) => ({
          cle: "bulletin" as const,
          label: `Bulletin d'adhésion - lot ${b.lot_reference}`,
          ext: "pdf",
          sensible: false,
          nonValidee: false,
          lire: () => lireSignature({ action: "amo_document_url", bulletin_id: b.id, quoi: "signe" }),
        }));
      // ancien dossier d'adhésion (signature simple), avant le module de signature électronique
      const anciens = d.adhesion?.statut === "signee" ? ((d.adhesion.bulletins as { lotNum: string; path: string }[] | null) ?? []) : [];
      return anciens.map((b) => ({
        cle: "bulletin" as const,
        label: `Bulletin d'adhésion - lot ${b.lotNum}`,
        ext: extensionDe(b.path),
        sensible: false,
        nonValidee: false,
        lire: () => lirePieces(b.path),
      }));
    },
    identite: () => {
      // un signataire n'est repris qu'une fois, même s'il a déposé sa pièce sur plusieurs bulletins
      const vus = new Set<string>();
      const deposees: SourcePiece[] = [];
      for (const b of nonPurges)
        for (const sg of b.signataires.slice().sort((x, y) => x.ordre - y.ordre)) {
          if (!sg.piece_identite_path) continue;
          const cle = `${sg.prenom} ${sg.nom}`.trim().toLowerCase();
          if (vus.has(cle)) continue;
          vus.add(cle);
          deposees.push({
            cle: "identite",
            label: `Pièce d'identité - ${sg.prenom} ${sg.nom}`.trim(),
            ext: extensionDe(sg.piece_identite_path),
            sensible: true,
            nonValidee: false,
            lire: () => lireSignature({ action: "amo_piece_url", signataire_id: sg.id, quoi: "piece" }),
          });
        }
      return deposees.length ? deposees : pieceDuPortail("identite", "Pièce d'identité", d.pieces.piece_identite);
    },
    domicile: () => pieceDuPortail("domicile", "Justificatif de domicile", d.pieces.justificatif_domicile),
    irpp: () =>
      sci
        ? pieceDuPortail("irpp", "Avis d'imposition des associés", d.pieces.avis_associes_sci)
        : [
            ...pieceDuPortail("irpp", "Avis d'imposition", d.pieces.avis_imposition),
            ...pieceDuPortail("irpp", "Avis d'imposition - second déclarant", d.pieces.avis_imposition_2),
          ],
    sepa: () => {
      // mandat signé électroniquement, un par bulletin ; sinon celui de l'ancien dossier (pré-rempli à signer à la main)
      const signes = elec.filter((b) => b.mandat_signe_path);
      if (signes.length)
        return signes.map((b) => ({
          cle: "sepa" as const,
          label: `Mandat SEPA - lot ${b.lot_reference}`,
          ext: "pdf",
          sensible: true,
          nonValidee: false,
          lire: () => lireSignature({ action: "amo_piece_url", bulletin_id: b.id, quoi: "mandat" }),
        }));
      const ancien = d.adhesion?.sepa_path;
      return ancien
        ? [{ cle: "sepa" as const, label: "Mandat SEPA (pré-rempli, ancien dossier)", ext: extensionDe(ancien), sensible: false, nonValidee: true, lire: () => lirePieces(ancien) }]
        : [];
    },
    rib: () => {
      const deposes = nonPurges.filter((b) => b.rib_path);
      if (deposes.length)
        return deposes.map((b) => ({
          cle: "rib" as const,
          label: `RIB - lot ${b.lot_reference}`,
          ext: extensionDe(b.rib_path!),
          sensible: true,
          nonValidee: false,
          lire: () => lireSignature({ action: "amo_piece_url", bulletin_id: b.id, quoi: "rib" }),
        }));
      return pieceDuPortail("rib", "RIB", d.pieces.rib);
    },
    taxe_fonciere: () => pieceDuPortail("taxe_fonciere", "Taxe foncière ou attestation notariée", d.pieces.taxe_fonciere),
    juge: () => pieceDuPortail("juge", "Jugement de tutelle et accord du juge", d.pieces.jugement_protection),
    kbis: () => pieceDuPortail("kbis", "Extrait Kbis de la SCI", d.pieces.kbis_sci),
    statuts: () => pieceDuPortail("statuts", "Statuts de la SCI", d.pieces.statuts_sci),
  };

  return d.banque.lignes.flatMap((l) => parCle[l.cle]?.() ?? []);
}

export interface BilanDossierAdherent {
  /** Pièces reprises dans le PDF, dans l'ordre. */
  integrees: string[];
  /** Lignes de la nomenclature sans aucune pièce reprise. */
  absentes: string[];
  /** Pièces trouvées mais laissées de côté, avec la raison. */
  ignorees: { label: string; raison: string }[];
  /** Pièces reprises mais pas encore validées par l'équipe. */
  nonValidees: string[];
}

export interface DossierAdherentPdf {
  nom: string;
  pdf: Uint8Array;
  pages: number;
  bilan: BilanDossierAdherent;
}

/** Niveau 2 : l'edge function refuse la lecture des pièces sensibles - l'export s'arrête net. */
const estRefusNiveau2 = (e: unknown): boolean => e instanceof Error && e.message === ERREURS_SIGNATURE.niveau_2_sans_lecture;

/**
 * Assemble le PDF unique d'un adhérent. Un fichier introuvable ou illisible est signalé
 * dans le bilan sans bloquer l'export ; un refus d'habilitation (niveau 2) l'interrompt.
 */
export async function assemblerDossierAdherent(
  d: DossierCoproprietaire,
  coproNom: string,
  convention: ConventionNoms
): Promise<DossierAdherentPdf> {
  const sources = sourcesDossierAdherent(d);
  const pieces: PieceAFusionner[] = [];
  const bilan: BilanDossierAdherent = { integrees: [], absentes: [], ignorees: [], nonValidees: [] };
  const clesLues = new Set<CleLigne>();

  for (const s of sources) {
    try {
      pieces.push({ label: s.label, ext: s.ext, octets: await s.lire() });
      clesLues.add(s.cle);
      bilan.integrees.push(s.label);
      if (s.nonValidee) bilan.nonValidees.push(s.label);
    } catch (e) {
      if (estRefusNiveau2(e)) throw e;
      bilan.ignorees.push({ label: s.label, raison: "fichier introuvable (déjà purgé ?)" });
    }
  }
  if (!pieces.length) throw new Error(`Aucune pièce disponible pour ${d.nom}.`);

  const nom = nomFichierDossierAdherent(d.nom, coproNom, convention);
  const fusion = await fusionnerPieces(pieces, { titre: nom.replace(/\.pdf$/i, "") });
  bilan.ignorees.push(...fusion.ignorees);
  bilan.integrees = bilan.integrees.filter((l) => !fusion.ignorees.some((i) => i.label === l));
  // une pièce illisible compte comme absente de la ligne si c'était la seule
  const reprises = new Set(pieces.filter((p) => !fusion.ignorees.some((i) => i.label === p.label)).map((p) => p.label));
  for (const l of d.banque.lignes) {
    if (l.etat === "na") continue;
    const aLigne = sources.some((s) => s.cle === l.cle && reprises.has(s.label));
    if (!aLigne) bilan.absentes.push(l.label);
  }
  return { nom, pdf: fusion.pdf, pages: fusion.pages, bilan };
}

/** Déclenche le téléchargement d'un Blob. */
function telechargerBlob(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Exporte le PDF unique d'un adhérent (téléchargement) et en rend le bilan. */
export async function exporterDossierAdherent(
  d: DossierCoproprietaire,
  coproNom: string,
  tous: DossierCoproprietaire[]
): Promise<BilanDossierAdherent & { nom: string; pages: number }> {
  const r = await assemblerDossierAdherent(d, coproNom, conventionNoms(tous.map((x) => x.nom)));
  telechargerBlob(new Blob([r.pdf as BlobPart], { type: "application/pdf" }), r.nom);
  return { ...r.bilan, nom: r.nom, pages: r.pages };
}

export interface BilanLot {
  /** Dossiers repris dans l'archive. */
  exportes: number;
  /** Adhérents dont le PDF n'a pas pu être assemblé. */
  echecs: { nom: string; raison: string }[];
  /** Adhérents dont certaines pièces n'ont pas pu être reprises. */
  avecReserves: { nom: string; reserves: string[] }[];
  archive: string;
}

/**
 * Exporte d'un coup les dossiers de plusieurs adhérents : une archive ZIP qui contient le
 * dossier « 03 - ADHERENTS » de la nomenclature de la banque, un PDF par adhérent. Trois
 * dossiers sont assemblés en parallèle ; `arret()` vrai interrompt avant le suivant.
 */
export async function exporterDossiersAdherents(
  dossiers: DossierCoproprietaire[],
  coproNom: string,
  tous: DossierCoproprietaire[],
  suivi?: { progression?: (faits: number, total: number) => void; arret?: () => boolean }
): Promise<BilanLot> {
  if (!dossiers.length) throw new Error("Aucun dossier à exporter.");
  const convention = conventionNoms(tous.map((x) => x.nom));
  const { default: JSZip } = await import("jszip");
  const resultats: (DossierAdherentPdf | null)[] = new Array(dossiers.length).fill(null);
  const echecs: BilanLot["echecs"] = [];
  let suivant = 0;
  let faits = 0;
  const interruption: { refus: Error | null } = { refus: null };
  suivi?.progression?.(0, dossiers.length);

  const travailleur = async () => {
    while (suivant < dossiers.length && !interruption.refus && !suivi?.arret?.()) {
      const i = suivant++;
      try {
        resultats[i] = await assemblerDossierAdherent(dossiers[i], coproNom, convention);
      } catch (e) {
        if (estRefusNiveau2(e)) interruption.refus = e as Error;
        else echecs.push({ nom: dossiers[i].nom, raison: e instanceof Error ? e.message : "export impossible" });
      }
      suivi?.progression?.(++faits, dossiers.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, dossiers.length) }, travailleur));
  if (interruption.refus) throw interruption.refus;
  if (suivi?.arret?.()) throw new Error("Export annulé : aucune archive n'a été créée.");

  const dejaPris = new Set<string>();
  const zip = new JSZip();
  const avecReserves: BilanLot["avecReserves"] = [];
  let exportes = 0;
  resultats.forEach((r, i) => {
    if (!r) return;
    zip.file(`03 - ADHERENTS/${nomUniqueDansSerie(r.nom, dejaPris)}`, r.pdf);
    exportes++;
    const reserves = [...r.bilan.ignorees.map((x) => `${x.label} (${x.raison})`), ...r.bilan.nonValidees.map((x) => `${x} (non validée)`)];
    if (reserves.length) avecReserves.push({ nom: dossiers[i].nom, reserves });
  });
  if (!exportes) throw new Error("Aucun dossier n'a pu être assemblé.");
  const archive = nomFichierSansAccents(`03 - ADHERENTS - ${coproNom.trim().toUpperCase()}.zip`);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  telechargerBlob(blob, archive);
  return { exportes, echecs, avecReserves, archive };
}
