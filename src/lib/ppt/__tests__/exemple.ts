// Jeu d'essai : un PPPT fictif (Résidence Les Tilleuls, 11 logements) au format
// pppt-verif/1.1, avec des défauts volontaires pour exercer les contrôles :
//   - total annoncé 412 000 € alors que les postes font 423 000 € (C01) ;
//   - VMC non chiffrée (P03) ; gain total additionné brut (C12) ;
//   - contrôle R10 bloquant non conforme dans la grille du skill ;
//   - trois propositions du skill à valider (deux appliquées, une alternative).
import type { PpptVerifJson } from "../schema";

export const EXEMPLE: PpptVerifJson = {
  schema_version: "pppt-verif/1.1",
  genere_le: "2026-09-19",
  genere_par: "skill pppt-verif",
  document_source: {
    fichiers: [{ nom: "PPPT_Tilleuls.pdf", type: "pdf", pages: 42 }],
    nature_detectee: "PPPT",
    titre: "Projet de plan pluriannuel de travaux - Résidence Les Tilleuls",
    date_document: "2026-03-12",
    version: "v2",
    auteur: { raison_sociale: "Cabinet Exemple BET", type: "BET", siret: null, qualification: "Ingénieur bâtiment", assurance_rc_pro: true, signature_presente: true },
  },
  copropriete: {
    nom: "Résidence Les Tilleuls",
    adresse: "4 rue des Tilleuls",
    code_postal: "67000",
    commune: "Strasbourg",
    syndic: "Syndic Horizon Grand Est",
    annee_construction: 1972,
    nb_batiments: 1,
    noms_batiments: ["A"],
    nb_lots_total: 13,
    nb_logements: 11,
    surface_m2: 812,
    surface_type: "SHAB",
    chauffage: "collectif",
    energie_chauffage: "gaz",
    immeuble_plus_de_15_ans: true,
    immatriculation_rnc: null,
  },
  diagnostics_sources: {
    dtg: { present: true, date: "2025-11-04", auteur: "Cabinet Exemple BET" },
    dpe_collectif: { present: true, date: "2025-10-20", etiquette_energie: "E", etiquette_ges: "D", cep_kwhep_m2_an: 289, ges_kgco2_m2_an: 58, methode: "3CL-2021", diagnostiqueur: "Diag Alsace", numero_ademe: null, nb_lots: 13 },
    audit_energetique: { present: false, date: null, gain_scenario_max_pct: null },
    autres: [{ type: "carnet_entretien", date: "2025-06-01" }],
  },
  etat_des_lieux: [
    { ouvrage: "Façades", detail: "Enduit fissuré, décollements", etat: "Mauvais", pathologies: "fissures, infiltrations", page: 12 },
    { ouvrage: "Toitures", detail: "Tuiles mécaniques 1972", etat: "Moyen", pathologies: "mousses", page: 13 },
    { ouvrage: "Réseaux", detail: "Colonnes EU fonte", etat: "Mauvais", pathologies: "fuites récurrentes", page: 15 },
    { ouvrage: "Ascenseur", detail: null, etat: "Bon", pathologies: null, page: 16 },
  ],
  travaux_source: [
    { id: "T01", libelle_source: "Ravalement des façades avec isolation thermique par l'extérieur", batiment: null, ouvrage: "Façades", priorite_source: "Urgent", annee_source: 2027, periode_source: null, cout_source_eur: 186000, cout_source_base: "HT", tva_source_pct: 5.5, gain_energetique_source_pct: 25, justification: "Fissures + performance", page: 22 },
    { id: "T02", libelle_source: "Réfection de la couverture", batiment: null, ouvrage: "Toitures", priorite_source: "Court terme", annee_source: 2028, periode_source: null, cout_source_eur: 48000, cout_source_base: "HT", tva_source_pct: 10, gain_energetique_source_pct: null, justification: null, page: 23 },
    { id: "T03", libelle_source: "Installation d'une VMC hygroréglable", batiment: null, ouvrage: "Ventilation", priorite_source: "Court terme", annee_source: 2027, periode_source: null, cout_source_eur: null, cout_source_base: null, tva_source_pct: null, gain_energetique_source_pct: 4, justification: null, page: 24 },
    { id: "T04", libelle_source: "Remplacement des colonnes EU", batiment: null, ouvrage: "Réseaux", priorite_source: "Urgent", annee_source: 2027, periode_source: null, cout_source_eur: 31000, cout_source_base: "HT", tva_source_pct: 10, gain_energetique_source_pct: null, justification: "Fuites", page: 25 },
    { id: "T05", libelle_source: "Remplacement de la chaudière gaz par une chaudière THPE", batiment: null, ouvrage: "Chauffage", priorite_source: "Moyen terme", annee_source: 2029, periode_source: null, cout_source_eur: 42000, cout_source_base: "HT", tva_source_pct: 5.5, gain_energetique_source_pct: 20, justification: null, page: 26 },
    { id: "T06", libelle_source: "Remplacement des menuiseries des parties communes et logements", batiment: null, ouvrage: "Menuiseries", priorite_source: "Moyen terme", annee_source: 2030, periode_source: null, cout_source_eur: 96000, cout_source_base: "HT", tva_source_pct: 5.5, gain_energetique_source_pct: 10, justification: null, page: 27 },
    { id: "T07", libelle_source: "Peinture de la cage d'escalier", batiment: null, ouvrage: "Parties communes", priorite_source: "Long terme", annee_source: 2031, periode_source: null, cout_source_eur: 12000, cout_source_base: "HT", tva_source_pct: 10, gain_energetique_source_pct: null, justification: null, page: 28 },
    { id: "T08", libelle_source: "Mise en sécurité électrique des communs", batiment: null, ouvrage: "Électricité", priorite_source: "Long terme", annee_source: 2033, periode_source: null, cout_source_eur: 8000, cout_source_base: "HT", tva_source_pct: 10, gain_energetique_source_pct: null, justification: null, page: 29 },
  ],
  echeancier_source: {
    annee_base: 2026,
    horizon_annees: 10,
    premiere_annee: 2027,
    derniere_annee: 2033,
    total_annonce_eur: 412000,
    total_annonce_base: "HT",
    totaux_par_annee_annonces: { "2027": 217000, "2028": 48000, "2029": 42000, "2030": 96000, "2031": 12000, "2033": 8000 },
  },
  performance_energetique: { etiquette_visee: "C", cep_apres_kwhep_m2_an: 170, gain_total_annonce_pct: 59, ges_apres_kgco2_m2_an: null, methode_estimation: "addition des gains par geste" },
  hypotheses_financieres_source: { inflation_pct: null, honoraires_moe_pct: null, honoraires_syndic_pct: null, tva_par_defaut_pct: 10, fonds_travaux_mentionne: true, cotisation_fonds_travaux_pct_ou_eur: "5 % du budget", aides_mentionnees: ["MPR Copro", "CEE"] },
  controles: [
    { code: "R01", famille: "reglementaire", libelle: "Nature du document", reference: "art. 14-2", statut: "CONFORME", severite: "BLOQUANT", constat: "PPPT au sens de l'art. 14-2", attendu: null, observe: null, ecart: null, action: "-", page: 1 },
    { code: "R10", famille: "reglementaire", libelle: "Estimation sommaire des coûts", reference: "décret 2022-663", statut: "NON_CONFORME", severite: "BLOQUANT", constat: "1 travail non chiffré (VMC)", attendu: "chaque travail chiffré", observe: "T03 sans coût", ecart: null, action: "Demander le chiffrage", page: 24 },
    { code: "R17", famille: "reglementaire", libelle: "Isolation embarquée", reference: "décret 2017-919", statut: "CONFORME", severite: "MAJEUR", constat: "Ravalement avec ITE", attendu: null, observe: null, ecart: null, action: "-", page: 22 },
    { code: "C08", famille: "coherence", libelle: "Honoraires", reference: null, statut: "PARTIEL", severite: "MINEUR", constat: "Honoraires MOE non précisés", attendu: null, observe: null, ecart: null, action: "Préciser", page: 30 },
  ],
  synthese: { verdict: "A_REPRENDRE", nb_bloquants: 1, nb_majeurs: 0, nb_mineurs: 1, nb_partiels: 1, nb_propositions: 3, nb_propositions_appliquees: 2, score_conformite_pct: 75, score_coherence_pct: 80, points_forts: ["État des lieux détaillé"], questions_ouvertes: ["Année d'adoption prévue en AG ?"] },
  travaux_normalises: [
    { id: "T01", libelle: "Façade / Ravalement + ITE", priorite: "Énergétique", critere: "Énergie", batiment: null, ouvrage: "Façades", cout_ht_base_eur: 186000, cout_ht_origine: "source", tva_pct: 5.5, regle_tva: "energetique_5_5", avec_moe: false, annee_prevue: 2027, annee_origine: "source", gain_energetique_pct: 0.25, commentaire: null, controles_lies: [] },
    { id: "T02", libelle: "Toiture / Réfection de la couverture", priorite: "Préservation", critere: "Sauvegarde", batiment: null, ouvrage: "Toitures", cout_ht_base_eur: 48000, cout_ht_origine: "source", tva_pct: 10, regle_tva: "facade_toiture_exterieur_10", avec_moe: true, annee_prevue: 2028, annee_origine: "source", gain_energetique_pct: null, commentaire: null, controles_lies: [] },
    { id: "T03", libelle: "Ventilation / VMC hygro B", priorite: "Énergétique", critere: "Santé", batiment: null, ouvrage: "Ventilation", cout_ht_base_eur: null, cout_ht_origine: null, tva_pct: 5.5, regle_tva: "energetique_5_5", avec_moe: false, annee_prevue: 2027, annee_origine: "source", gain_energetique_pct: 0.04, commentaire: "coût absent du PPPT source", controles_lies: ["R10"] },
    { id: "T04", libelle: "Réseaux / Colonnes EU", priorite: "Préservation", critere: "Sauvegarde", batiment: null, ouvrage: "Réseaux", cout_ht_base_eur: 31000, cout_ht_origine: "source", tva_pct: 10, regle_tva: "autre_20", avec_moe: true, annee_prevue: 2027, annee_origine: "source", gain_energetique_pct: null, commentaire: null, controles_lies: [] },
    { id: "T05", libelle: "Chauffage / Chaudière THPE", priorite: "Énergétique", critere: "Énergie", batiment: null, ouvrage: "Chauffage", cout_ht_base_eur: 42000, cout_ht_origine: "source", tva_pct: 5.5, regle_tva: "energetique_5_5", avec_moe: false, annee_prevue: 2029, annee_origine: "source", gain_energetique_pct: 0.2, commentaire: null, controles_lies: [] },
    { id: "T06", libelle: "Menuiseries / Remplacement", priorite: "Énergétique", critere: "Énergie", batiment: null, ouvrage: "Menuiseries", cout_ht_base_eur: 96000, cout_ht_origine: "source", tva_pct: 5.5, regle_tva: "energetique_5_5", avec_moe: false, annee_prevue: 2030, annee_origine: "source", gain_energetique_pct: 0.1, commentaire: null, controles_lies: [] },
    { id: "T07", libelle: "Parties communes / Peinture cage", priorite: "Amélioration", critere: "Confort", batiment: null, ouvrage: "Parties communes", cout_ht_base_eur: 12000, cout_ht_origine: "source", tva_pct: 10, regle_tva: "facade_toiture_exterieur_10", avec_moe: false, annee_prevue: 2031, annee_origine: "source", gain_energetique_pct: null, commentaire: null, controles_lies: [] },
    { id: "T08", libelle: "Électricité / Mise en sécurité", priorite: "Préservation", critere: "Sécurité", batiment: null, ouvrage: "Électricité", cout_ht_base_eur: 8000, cout_ht_origine: "source", tva_pct: 10, regle_tva: "facade_toiture_exterieur_10", avec_moe: true, annee_prevue: 2033, annee_origine: "source", gain_energetique_pct: null, commentaire: null, controles_lies: [] },
  ],
  parametres_ppt: { annee_base: 2026, premiere_annee: 2027, horizon: 10, inflation: 0.035, tva_facades_toitures: 0.1, tva_energetique: 0.055, honoraires_moe: 0.06, honoraires_syndic: 0.03, cep_base_kwhep_m2_an: 289 },
  propositions: [
    { code: "P01", theme: "Classification Strat Eco + MOE", decision: "Classer le ravalement avec ITE en Énergétique (sans MOE, TVA 5,5 %) et la toiture en Préservation (avec MOE).", valeur_source: "Urgent / Court terme", valeur_proposee: "Énergétique / Préservation", impact: "MOE 6 % sur 87 000 € HT de préservation", alternative: "Ravalement seul en Préservation si l'ITE est abandonnée", appliquee_dans_ppt: true, lignes_concernees: ["T01", "T02", "T04", "T08"], controle_lie: null, statut_validation: "A_VALIDER", commentaire_validateur: null },
    { code: "P02", theme: "Hypothèses financières", decision: "Appliquer les hypothèses Strat Eco : inflation 3,5 %, MOE 6 %, syndic 3 %.", valeur_source: null, valeur_proposee: "3,5 % / 6 % / 3 %", impact: "+ 41 k€ TTC sur 10 ans", alternative: null, appliquee_dans_ppt: true, lignes_concernees: [], controle_lie: "C08", statut_validation: "A_VALIDER", commentaire_validateur: null },
    { code: "P03", theme: "Lissage des années chargées", decision: "Décaler les colonnes EU (T04) de 2027 à 2028 pour ramener 2027 sous 40 % du total.", valeur_source: "2027 : 217 000 € (51 %)", valeur_proposee: "2027 : 186 000 € (44 %)", impact: "- 31 000 € HT en 2027", alternative: "Garder 2027 et appeler le fonds de travaux", appliquee_dans_ppt: false, lignes_concernees: ["T04"], controle_lie: "C16", statut_validation: "A_VALIDER", commentaire_validateur: null },
  ],
};
