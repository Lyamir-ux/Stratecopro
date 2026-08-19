// Export d'un plan de financement définitif vers un classeur Excel reprenant
// la nomenclature de référence : onglets « PF définitif Eco PTZ collectif » /
// « PF définitif Eco PTZ individuel » + un onglet par lot avec colonne « Retenu ».
// Les montants sont exportés en valeurs (le recalcul vit dans le logiciel).
import { utils, type WorkBook } from "xlsx";
import type { PlanDefinitifData } from "./planDefinitif";
import { computePlanDefinitif, PHASES_MOE } from "./planDefinitif";

type Row = (string | number | null)[];

function fmtTaux(t: number): string {
  return String(t).replace(".", ",");
}

/** Nom d'onglet Excel valide (≤ 31 caractères, sans \ / ? * [ ] :). */
function sheetName(base: string, used: Set<string>): string {
  let name = base.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  let i = 2;
  while (used.has(name)) name = `${name.slice(0, 28)} ${i++}`;
  used.add(name);
  return name;
}

export function exportPlanDefinitif(data: PlanDefinitifData): WorkBook {
  const r = computePlanDefinitif(data);
  const wb = utils.book_new();
  const used = new Set<string>();

  const lotSheetNames = new Map<number, string>();

  // ---------- Onglets PF (collectif puis individuel) ----------
  // Seules les variantes retenues pour le dossier sont exportées ; à défaut de
  // choix (les deux masquées), on exporte quand même la variante collective.
  const variantesExport: ("collectif" | "individuel")[] = (["collectif", "individuel"] as const).filter(
    (v) => data.variantes?.[v] !== false
  );
  if (variantesExport.length === 0) variantesExport.push("collectif");
  for (const variante of variantesExport) {
    const rows: Row[] = [];
    const push = (a: string | number | null, b: string | number | null = null, c: string | number | null = null, d: string | number | null = null, e: string | number | null = null, f: string | number | null = null) =>
      rows.push([a, b, c, d, e, f]);

    push(null, `PLAN DE FINANCEMENT DEFINITIF ${data.infos.nomCopro.toUpperCase()} - ECO PTZ ${variante.toUpperCase()}`);
    push(null);
    push(null, "Nom de la copropriété :", null, data.infos.nomCopro);
    push(null, "Adresse de l'immeuble :", null, data.infos.adresse);
    push(null, "Nombre de logements principaux :", null, data.infos.nbLogements);
    push(null, "Nombre de logt + équivalent :", null, data.infos.nbLogementsEquiv, "La surface des locaux tertiaires est divisée par 75 pour avoir l'équivalent logement");
    push(null, "Surface habitable ou équivalent :", null, data.infos.surfaceHabitable, "La surface chauffée des locaux tertiaires doit être additionnée à la surface habitable");
    push(null, "Nombre d'étages :", null, data.infos.nbEtages);
    push(null, "Nombre d'entrées :", null, data.infos.nbEntrees);
    push(null, "Type de chauffage :", null, data.infos.typeChauffage);
    push(null, "Consommation énergie primaire initial", null, data.infos.cepInitial);
    push(null, "Consommation énergie primaire projet", null, data.infos.cepProjet);
    push(null, "Performance du scénario :", null, r.performancePct, "% d'économie d'énergie");
    push(null, "Dispositif CLIMAXION :", null, data.infos.dispositifClimaxion ? "Oui" : "Non");
    if (data.infos.etiquetteInitiale || data.infos.etiquetteProjet)
      push(null, "Etiquette énergétique :", null, `De ${data.infos.etiquetteInitiale} à ${data.infos.etiquetteProjet}`);
    push(null);
    push(null);

    // Descriptif des travaux
    push(null, "Descriptif des travaux", null, "Scénario 1", "Commentaires", "Total TTC");
    for (const lot of r.lots) {
      push(
        `Lot ${lot.numero}`,
        lot.titre,
        null,
        lot.totalHtApresRemise,
        lot.entreprise ? `${lot.titre} (${lot.entreprise})` : lot.titre,
        lot.totalTtc
      );
    }
    push(null, "TOTAL TRAVAUX HT €", null, r.totalTravauxHt);
    push(null, "Total travaux HT énergétiques et induits", null, r.assietteMprTravaux, `Travaux retenus MaPrimeRénov' plafonnés à ${data.params.plafondTravauxParLogement.toLocaleString("fr-FR")} € HT par logement`);
    push(null, "Total travaux TTC €", null, r.totalTravauxTtc);
    push(null, `Total travaux TTC € y compris imprévus ${fmtTaux(data.params.imprevusPct)}%`, null, r.totalTravauxTtcImprevus);
    push(null);
    push(null);

    // MOE et frais annexes
    push(null, "MOE et frais annexes", null, "Scénario 1");
    for (const ph of PHASES_MOE) {
      let first = true;
      data.moe.forEach((l, i) => {
        if (l.phase !== ph.id) return;
        push(
          first ? ph.label.replace(/\s/, "") : null,
          l.entreprise ? `${l.designation} (${l.entreprise})` : l.designation,
          null,
          r.moe[i].montantTtc,
          l.commentaire ?? null
        );
        first = false;
      });
    }
    push(null, "Total MOE et annexes TTC", null, r.totalMoeTtc);
    push(null, "Total de toutes les phases de l'opération TTC avec imprévus", null, r.totalOperationTtc);
    push(null, `Total restant en phase travaux TTC y compris imprévus ${fmtTaux(data.params.imprevusPct)}%`, null, r.totalPhaseTravauxTtc);
    push(null);
    push(null);

    // Aides mobilisables
    push(null, "Aides mobilisables", null, "Scénario 1", "Commentaires");
    let dernierGroupe = "";
    for (const a of r.aides) {
      push(a.groupe !== dernierGroupe ? a.groupe : null, a.libelle, null, a.montant, a.commentaire ?? null);
      dernierGroupe = a.groupe;
    }
    push(null, "Total Aides NET", null, r.totalAides);
    push(null, "Total aides publiques", null, r.totalAidesPubliques);
    if (variante === "individuel") {
      push(null, `${fmtTaux(data.params.pctAvanceAides)}% des aides publiques`, null, r.individuel.aidesAvancees);
      push(null, `${fmtTaux(100 - data.params.pctAvanceAides)}% des aides publiques`, null, r.individuel.aidesFinChantier);
    }
    push(null);
    push(null);

    // Indicateurs
    push(null, null, null, "Scénario 1", "Commentaires");
    push(null, "Taux de couverture %", null, r.tauxCouverture, "Pourcentage du montant de l'opération TTC couvert par les aides");
    push(null, "Fonds travaux disponible", null, data.params.fondsTravaux, data.params.commentaireFondsTravaux ?? null);
    push(null, "Reste à charge définitif collectif", null, r.resteACharge);
    if (variante === "collectif") {
      push(null, "Reste à financer", null, r.collectif.resteAFinancer);
      push(null);
      push(null, "Coût au tantième avant aides", data.params.totalTantiemes, r.coutTantiemeAvant);
      push(null, "Coût au tantième après déduction des aides publiques, montants déjà appelés et fonds travaux", data.params.totalTantiemes, r.collectif.coutTantiemeApres);
      push(null);
      push(null, "Quote part avant déduction des aides");
      for (const e of r.collectif.exemples)
        push(null, `Quote part pour un appartement de (${e.tantiemes}/${data.params.totalTantiemes})`, e.tantiemes, e.quotePartAvant);
      push(null);
      push(null, "Reste à financer après déduction des aides publiques");
      for (const e of r.collectif.exemples)
        push(null, `Reste à financer pour un appartement de (${e.tantiemes}/${data.params.totalTantiemes})`, e.tantiemes, e.resteAFinancer);
      push(null);
      push("Exemples", `Mensualité ECO PTZ pour une durée de ${data.params.dureeEcoPtzAns} ans`);
      for (const e of r.collectif.exemples)
        push(null, `Mensualité ECO PTZ pour (${e.tantiemes}/${data.params.totalTantiemes}) pour une durée de ${data.params.dureeEcoPtzAns} ans`, e.tantiemes, e.mensualiteEcoPtz, "Exemple pris pour un prêt collectif Eco PTZ");
      push(null);
      push("Exemples", "Montant des subventions publiques");
      for (const e of r.collectif.exemples)
        push(null, `Montant des subventions publiques pour ${e.tantiemes} tantièmes`, e.tantiemes, e.subventionsPubliques);
      push(null);
      push("Exemples", "Le coût du prêt avance de subventions publiques");
      for (const e of r.collectif.exemples)
        push(null, `Le coût du prêt avance de subventions publiques : (${e.tantiemes}/${data.params.totalTantiemes})`, e.tantiemes, e.coutPretAvance, "Prêt avance de subventions publiques : à payer en une fois à la fin des travaux");
      push(null);
      push("Exemples", "La prime des CEE");
      for (const e of r.collectif.exemples)
        push(null, `La prime des CEE : (${e.tantiemes}/${data.params.totalTantiemes})`, e.tantiemes, e.primeCee, "La prime CEE est attribuée à la fin des travaux");
      push(null);
      push(null, "Récapitulatif");
      for (const e of r.collectif.exemples)
        push("Exemples", `Prix de revient de l'opération pour ${e.tantiemes} tantièmes`, e.tantiemes, e.prixRevient, "Prix de revient : Reste à financer + Coût du prêt avance de subvention - Prime CEE");
    } else {
      push(null, `Appels de fonds avec déduction de ${fmtTaux(data.params.pctAvanceAides)}% des aides`, null, r.individuel.appelsFonds);
      push(null);
      push(null, "Coût au tantième avant aides", data.params.totalTantiemes, r.coutTantiemeAvant);
      push(null, "Coût au tantième après déduction des aides, montants déjà appelés et fonds travaux", data.params.totalTantiemes, r.individuel.coutTantiemeApresAides);
      push(null, `Coût au tantième avec ${fmtTaux(data.params.pctAvanceAides)}% des aides publiques déduites, montants déjà versés et fonds travaux`, data.params.totalTantiemes, r.individuel.coutTantiemeAvecAvance);
      push(null);
      push(null, "Quote part avant déduction des aides");
      for (const e of r.individuel.exemples)
        push(null, `Quote part pour un appartement de (${e.tantiemes}/${data.params.totalTantiemes})`, e.tantiemes, e.quotePartAvant);
      push(null);
      push(null, "Prix de revient après déduction des aides");
      for (const e of r.individuel.exemples)
        push(null, `Prix de revient pour un appartement de (${e.tantiemes}/${data.params.totalTantiemes})`, e.tantiemes, e.prixRevient);
      push(null);
      push(null, `Appels de fonds avec déduction de ${fmtTaux(data.params.pctAvanceAides)}% des aides selon tantièmes`, null, null, `Remboursement de ${fmtTaux(100 - data.params.pctAvanceAides)}% des aides en fin de chantier`);
      for (const e of r.individuel.exemples)
        push("Exemples", `Appels de fonds avec déduction de ${fmtTaux(data.params.pctAvanceAides)}% pour (${e.tantiemes}/${data.params.totalTantiemes})`, e.tantiemes, e.appelsFonds, e.remboursementFinChantier);
      push(null);
      push("Exemples", `Remboursement mensuel moyen par lot pendant ${data.params.dureeEcoPtzAns} ans`);
      for (const e of r.individuel.exemples)
        push(null, `Remboursement mensuel moyen par lot pendant ${data.params.dureeEcoPtzAns} ans : (${e.tantiemes}/${data.params.totalTantiemes})`, e.tantiemes, e.mensualiteEcoPtz, "Exemple pris pour un prêt ECO PTZ individuel");
    }
    push(null);
    push(null);

    // Garde-fous et mentions
    push("Garde-fous");
    for (const g of r.gardeFous) push(null, g.libelle, null, g.valeur, g.ok ? "OK" : "DÉPASSEMENT");
    push(null);
    push(null, "Les valeurs sont présentées à titre indicatif. Ce document n'a aucune valeur contractuelle.");
    push(null, "Document confidentiel à l'attention des copropriétaires.");
    push(null);
    push(null, "CEE : Certificat d'économie d'énergie");
    push(null, "ANAH : Agence nationale de l'habitat");
    push(null, "Climaxion : Dispositif aide région Grand Est");
    push(null, "EMS : Dispositif aide Eurométropole de Strasbourg");

    const ws = utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 62 }, { wch: 8 }, { wch: 16 }, { wch: 60 }, { wch: 14 }];
    utils.book_append_sheet(
      wb,
      ws,
      sheetName(`PF définitif Eco PTZ ${variante}`, used)
    );
  }

  // ---------- Onglets lots ----------
  for (const lot of data.lots) {
    const rl = r.lots.find((l) => l.numero === lot.numero)!;
    const rows: Row[] = [];
    const numStr = String(lot.numero).padStart(2, "0");
    rows.push([
      null,
      `Lot ${numStr} : ${lot.titre}${lot.entreprise ? ` (${lot.entreprise})` : ""}`,
      "Retenu",
      "Scénario",
      null,
    ]);
    rows.push([null, null, null, "€ HT", null]);
    for (const l of lot.lignes) {
      rows.push([l.groupe ?? null, l.designation, l.retenu ? "oui" : "non", l.montantHt, `TVA de ${fmtTaux(l.tvaPct)}%`]);
    }
    rows.push([null, "Total HT", null, rl.totalHt, null]);
    if (lot.remisePct > 0) {
      rows.push([null, `Remise ${fmtTaux(lot.remisePct)}%`, null, rl.remise, null]);
      rows.push([null, "Total HT avec remise", null, rl.totalHtApresRemise, null]);
      rows.push([null, "Total HT retenu avec remise", null, rl.totalHtRetenu, null]);
    } else {
      rows.push([null, "Total HT retenu", null, rl.totalHtRetenu, null]);
    }
    for (const t of rl.tvaParTaux) rows.push([null, `TVA ${fmtTaux(t.taux)}%`, null, t.montant, null]);
    rows.push([null, "Total TTC", null, rl.totalTtc, null]);

    const ws = utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 26 }, { wch: 58 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
    const name = sheetName(`Lot ${numStr}  ${lot.titre}`, used);
    lotSheetNames.set(lot.numero, name);
    utils.book_append_sheet(wb, ws, name);
  }

  return wb;
}
