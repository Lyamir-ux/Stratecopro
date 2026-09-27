// PDF « Analyse des offres » d'une consultation PPPT + DPE collectif (0109,
// idée d'Amir 27/09/2026) : ce que le syndic présente en assemblée générale.
// Même charte que les PDF de la branche PPT (paysage, bandeau bleu, signé
// Strat Eco pro) : la consultation, le comparatif des offres, l'avis de
// l'équipe et un projet de résolution à adapter. Généré côté client, pour
// l'équipe (aperçu avant publication) comme pour le syndic.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { syntheseOffres, type OffreComparee, type PrestationOffre } from "@/lib/ppt/analyseOffres";
import {
  BLEU_FONCE,
  Flux,
  GRIS,
  LARGEUR,
  VERT_CLAIR,
  VERT_FONCE,
  bandeau,
  chargerLogo,
  completer,
  euro,
  tableau,
  txt,
  wrap,
  type CellulePdf,
} from "./echeancierPpt";

export interface AnalyseOffresPdfInput {
  copro: {
    nom: string;
    adresse?: string | null;
    code_postal?: string | null;
    commune?: string | null;
    nb_logements?: number | null;
    nb_lots?: number | null;
  };
  nomEnseigne?: string | null;
  mission: string;
  publieeLe?: string | null;
  dateLimite?: string | null;
  bureauxConsultes?: number | null;
  /** Offres comparées (comparerOffres), recommandée marquée. */
  offres: OffreComparee[];
  avis: string;
  /** Date de génération (défaut : aujourd'hui) - injectable pour les tests. */
  genereLe?: string;
  logoPng?: Uint8Array | ArrayBuffer;
}

const dateCourte = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

const pctEcart = (f: number | null) => (f == null ? "-" : f === 0 ? "moins-disant" : txt("+ " + (f * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " %"));

export async function genererAnalyseOffresPdf(input: AnalyseOffresPdfInput): Promise<Uint8Array> {
  const { copro, offres } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`Analyse des offres PPPT + DPE collectif - ${copro.nom}`);
  doc.setAuthor("Strat Eco pro");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await chargerLogo(doc, input.logoPng);
  const genereLe = input.genereLe ?? new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const f = new Flux(doc, font, bold, logo, genereLe, `Analyse des offres - ${copro.nom}`);

  const lieu = [copro.adresse, [copro.code_postal, copro.commune].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  bandeau(
    f,
    "Analyse des offres - PPPT et DPE collectif",
    [copro.nom, lieu].filter(Boolean).join(" - "),
    input.nomEnseigne ? `Préparée par Strat Eco pro pour ${input.nomEnseigne}` : "Préparée par Strat Eco pro"
  );

  const s = syntheseOffres(offres);

  // ----- la consultation -----
  f.titreSection("La consultation", 60);
  f.tuiles([
    { label: "Bureaux d'études consultés", valeur: input.bureauxConsultes != null ? String(input.bureauxConsultes) : "-", pied: dateCourte(input.publieeLe) ? `lancée le ${dateCourte(input.publieeLe)}` : undefined },
    { label: "Offres reçues", valeur: String(s.nb), pied: s.chiffrees < s.nb ? `dont ${s.chiffrees} chiffrée${s.chiffrees > 1 ? "s" : ""}` : dateCourte(input.dateLimite) ? `date limite : ${dateCourte(input.dateLimite)}` : undefined },
    { label: "Moins-disant", valeur: s.minHt != null ? euro(s.minHt) + " HT" : "-" },
    { label: "Moyenne", valeur: s.moyenneHt != null ? euro(s.moyenneHt) + " HT" : "-", pied: s.delaiMinSemaines != null ? `délai le plus court : ${s.delaiMinSemaines} sem.` : undefined },
    {
      label: "Offre recommandée",
      valeur: s.recommandee?.montantHt != null ? euro(s.recommandee.montantHt) + " HT" : s.recommandee ? "non chiffrée" : "-",
      pied: s.recommandee ? [s.recommandee.bureau, s.recommandee.delaiMaxSemaines != null ? `${s.recommandee.delaiMaxSemaines} sem.` : null].filter(Boolean).join(" - ") : undefined,
      accent: true,
    },
  ]);
  f.paragraphe(`Mission : ${input.mission}`, { size: 8.5, color: GRIS });
  if (copro.nb_logements || copro.nb_lots) {
    f.paragraphe([copro.nb_lots ? `${copro.nb_lots} lots` : null, copro.nb_logements ? `${copro.nb_logements} logements` : null].filter(Boolean).join(" - "), { size: 8.5, color: GRIS });
  }

  // ----- comparatif -----
  f.titreSection("Comparatif des offres", 50);
  // prix et délais séparés PPPT / DPE (0110) : deux colonnes de plus, la pièce jointe reste sur la plateforme
  const detail = s.detaillees > 0;
  const largeurs = detail ? [170, 92, 92, 78, 78, 70] : [210, 82, 82, 78, 130];
  const colObs = LARGEUR - largeurs.reduce((t, w) => t + w, 0);
  const cols = completer(
    detail
      ? [
          { titre: "Bureau d'études", w: 170 },
          { titre: "PPPT HT", w: 92, align: "right" },
          { titre: "DPE collectif HT", w: 92, align: "right" },
          { titre: "Total HT", w: 78, align: "right" },
          { titre: "Total TTC", w: 78, align: "right" },
          { titre: "Écart", w: 70, align: "right" },
          { titre: "Observations du bureau d'études", w: 0 },
        ]
      : [
          { titre: "Bureau d'études", w: 210 },
          { titre: "Montant HT", w: 82, align: "right" },
          { titre: "Montant TTC", w: 82, align: "right" },
          { titre: "Écart", w: 78, align: "right" },
          { titre: "Pièce jointe", w: 130 },
          { titre: "Observations du bureau d'études", w: 0 },
        ]
  );
  const prestation = (p: PrestationOffre): CellulePdf => [txt(p.ht != null ? euro(p.ht) : "-"), ...(p.delaiSemaines != null ? [txt(`en ${p.delaiSemaines} sem.`)] : [])];
  tableau(
    f,
    cols,
    offres.map((o) => {
      const precision = [o.recommandee ? "Offre recommandée par Strat Eco" : null, o.moinsDisante && !o.recommandee ? "Moins-disante" : null].filter(Boolean).join(" - ");
      const bureau: CellulePdf = [txt(`${o.rang != null ? o.rang + ". " : ""}${o.bureau}`), ...(precision ? [txt(precision)] : [])];
      return {
        fond: o.recommandee ? VERT_CLAIR : undefined,
        cellules: detail
          ? [
              bureau,
              prestation(o.pppt),
              prestation(o.dpe),
              { texte: o.montantHt != null ? euro(o.montantHt) : "non chiffrée", bold: o.recommandee },
              { texte: o.montantTtc != null ? euro(o.montantTtc) : "-" },
              { texte: pctEcart(o.ecart), couleur: o.ecart === 0 ? VERT_FONCE : undefined },
              wrap(o.message ?? "-", font, 8, colObs - 12, 5),
            ]
          : [
              bureau,
              { texte: o.montantHt != null ? euro(o.montantHt) : "non chiffrée", bold: o.recommandee },
              { texte: o.montantTtc != null ? euro(o.montantTtc) : "-" },
              { texte: pctEcart(o.ecart), couleur: o.ecart === 0 ? VERT_FONCE : undefined },
              wrap(o.fichier?.name ?? "-", font, 8, 118, 2),
              wrap(o.message ?? "-", font, 8, colObs - 12, 4),
            ],
      };
    }),
    { size: 8 }
  );
  f.paragraphe(
    `Montants TTC calculés avec une TVA de 20 % (prestations intellectuelles).${detail ? " Délais de réalisation annoncés par les bureaux d'études, en semaines à compter de la commande." : ""} Les offres complètes sont jointes sur la plateforme, fiche de la copropriété, onglet Consultation.`,
    { size: 7.5, color: GRIS }
  );

  // ----- avis -----
  f.titreSection("Avis de Strat Eco", 40);
  for (const bloc of input.avis.split(/\n{2,}/)) {
    f.paragraphe(bloc.replace(/\n/g, " "), { size: 9.5 });
    f.y -= 4;
  }

  // ----- projet de résolution -----
  if (s.recommandee) {
    f.titreSection("Projet de résolution à adapter", 60);
    const r = s.recommandee;
    const detailPrix = [r.pppt.ht != null ? `PPPT ${euro(r.pppt.ht)} HT` : null, r.dpe.ht != null ? `DPE collectif ${euro(r.dpe.ht)} HT` : null].filter(Boolean).join(", ");
    const montant = r.montantTtc != null ? `, pour un montant total de ${euro(r.montantTtc)} TTC${detailPrix ? ` (${detailPrix})` : ""}` : "";
    f.paragraphe(
      `L'assemblée générale, après avoir pris connaissance des offres reçues et de leur analyse, décide de confier la réalisation du projet de plan pluriannuel de travaux et du diagnostic de performance énergétique collectif à ${s.recommandee.bureau}${montant}, conformément à son offre, et mandate le syndic pour la signer.`,
      { size: 9.5, color: BLEU_FONCE }
    );
    f.paragraphe("Texte indicatif : le syndic l'adapte à l'ordre du jour et vérifie la majorité applicable.", { size: 7.5, color: GRIS });
  }

  return doc.save();
}
