# Le pivot JSON : le plan de financement décrit avec les champs du logiciel

`scripts/generer_import.py` lit un fichier JSON qui décrit le plan avec **exactement les
champs du modèle de Strat Eco Pro** (`PlanDefinitifData`). On remplit ce JSON à partir du
classeur du chef de projet ; le script écrit ensuite le classeur d'import et le rapport.
Exemple complet : `exemples/pivot-definitif-exemple.json`.

Tous les montants sont des **nombres** (`12000.5`, jamais `"12 000,50 €"`). Pourcentages en
points (`5.5` pour 5,5 %), coefficients en décimal (`0.9`). Les commentaires `//` ci-dessous
sont explicatifs : JSON strict dans le fichier (pas de commentaires).

## Enveloppe

```json
{
  "nature": "definitif",                 // ou "estimatif"
  "classeur_source": "Plan de financement définitif - X.xlsx",
  "onglet_source": "PF définitif …",      // facultatif, repris dans le rapport
  "scenarios": [ { … } ]                  // un seul pour un PF définitif (plusieurs = un fichier par scénario)
}
```

## Un scénario

```json
{
  "ordre": 1,                              // numéro du scénario (colonne « Scénario 1 »)
  "libelle": "Rénovation globale (E à C)", // description (estimatif) ; "" pour un définitif
  "infos": { … },
  "lots": [ … ],
  "moe": [ … ],
  "aides": [ … ],
  "params": { … },
  "variantes": { "collectif": true, "collectifSansAvance": false, "individuel": true },
  "totaux_source": { … },                  // totaux lus dans le classeur, pour le rapport
  "notes": [ "choix de conversion, une phrase par choix" ]
}
```

### infos

| Champ | Classeur | Remarque |
|---|---|---|
| `nomCopro` | « Nom de la copropriété » | obligatoire |
| `adresse` | « Adresse de l'immeuble » | |
| `nbLogements` | « Nombre de logements principaux » | > 0 ; base du plafond MPR et de l'AMO |
| `nbLogementsEquiv` | « Nombre de logt + équivalent » | tertiaire / 75 ; base Climaxion et EMS |
| `surfaceHabitable` | « Surface habitable ou équivalent » | base CEE (€/m²) |
| `nbEtages`, `nbEntrees` | « Nombre d'étages / de niveaux », « Nombre d'entrées » | |
| `typeChauffage` | « Type de chauffage » | texte (« Gaz Coll ») |
| `cepInitial`, `cepProjet` | « Consommation énergie primaire initial / projet » | kWhEP/m²/an ; gain = 100 - 100 × projet / initial |
| `dispositifClimaxion` | « Dispositif CLIMAXION : Oui/Non » | booléen |
| `etiquetteInitiale`, `etiquetteProjet` | « De E à C » | une lettre A à G |

### lots

```json
{
  "numero": 3,                         // entier unique ; numéro du classeur (« Lot 03 »)
  "titre": "Façade - Échafaudage",     // sans parenthèses
  "entreprise": "ERDAL ISOLATION",     // facultatif
  "remisePct": 2,                      // remise commerciale du lot (%), 0 sinon
  "lignes": [
    {
      "designation": "Isolation extérieure",
      "groupe": "Amélioration énergétique",   // facultatif (colonne A des onglets de lots)
      "retenu": true,                          // dans l'assiette MaPrimeRénov' (« oui »)
      "montantHt": 246353,
      "tvaPct": 5.5,
      "commentaire": "…",                      // facultatif
      "cleRepartition": "BATA",                // facultatif : code de clé (copro à plusieurs clés)
      "tvaMontant": 1234.56                    // estimatif seulement : TVA saisie en euros (rare)
    }
  ]
}
```

Un lot provisions / aléas d'un PF estimatif s'appelle exactement `"Provisions"`.

### moe (MOE et frais annexes)

```json
{
  "designation": "Maîtrise d'œuvre phase travaux",
  "phase": "travaux",                                  // "etude" | "projet" | "travaux"
  "montant": { "mode": "pctTravauxHt", "taux": 5.5 },  // voir ci-dessous
  "tvaPct": 5.5,
  "eligibleMprEtudes": true,
  "eligibleMprAmo": false,
  "entreprise": "M Associés",                          // facultatif
  "commentaire": "Pilotage et réception des travaux", // facultatif
  "ttc_source": 44395.16                               // facultatif : TTC du classeur
}
```

| `montant.mode` | Champ | Formule du classeur |
|---|---|---|
| `forfait` | `montantHt` | `=4410*1.2` → 4410 (HT) avec `tvaPct` 20 |
| `pctTravauxHt` | `taux` | `=(D28*5.5/100)*1.055` → 5.5 % du total travaux HT |
| `pctTravauxTtc` | `taux` | `=D30*1.9/100` → 1.9 % du total travaux TTC **hors imprévus** |

Éligibilité : `eligibleMprEtudes` = la ligne entre dans la formule MPR études du classeur
(maîtrise d'œuvre, diagnostics, contrôle technique, CSPS, tests… selon le classeur) ;
`eligibleMprAmo` = la ligne entre dans la formule MPR AMO (AMO Strat Eco).

### aides

```json
{
  "groupe": "ANAH",                      // "CEE" | "ANAH" | "Climaxion" | "EMS" (voir règles)
  "libelle": "Maprimerénov' partie travaux",
  "calcul": { "mode": "pctAssietteTravaux", "taux": 45, "coef": 0.9 },
  "publique": true,                      // false pour la prime CEE uniquement
  "commentaire": "…",                    // facultatif
  "cleRepartition": "SANS-HLM",          // facultatif : aide déduite des seuls copropriétaires de cette clé
  "montant_source": 243000               // facultatif : montant du classeur, pour le rapport
}
```

| `calcul.mode` | Champs | Montant calculé | Formule type du classeur |
|---|---|---|---|
| `parM2Shab` | `tauxEurM2`, `coef` | surface × taux × coef | `=D7*27*0.9` |
| `pctAssietteTravaux` | `taux`, `coef` | min(retenu, 25 000 × logts) × taux × coef | `=D29*0.45*0.9` |
| `pctEtudes` | `taux`, `coef` | HT des MOE éligibles études × taux × coef × (assiette / travaux HT) | `=((D36+D39)/1.1+…)*0.45*0.9*(D29/D28)` |
| `pctAmo` | `taux` | min(HT AMO, 600 ou 1 000 × logts) × taux | `=((D35+D38+D43)/1.2)*0.5` |
| `forfaitPlusParLogement` | `base`, `parLogement`, `surEquivalent` | base + parLogement × logts (équiv. si true) | `=10000+D6*2500` |
| `parLogement` | `montant`, `surEquivalent` | montant × logts | `=1000*D6` |
| `manuel` | `montant` | montant saisi | `15000` |
| `info` | - | ligne sans montant (aide individuelle) | vide |

Le prorata énergétique et le plafond de 25 000 € HT/logement sont **toujours** appliqués par
le logiciel ; ne pas les intégrer au taux ou au coefficient.

### params

| Champ | Défaut | Classeur |
|---|---|---|
| `imprevusPct` | 7 | « y compris imprévus 7 % », « aléas 5 % », 0 si inclus dans les lots |
| `fondsTravaux` | 0 | « Fonds travaux disponible » (+ montants déjà appelés, voir règles) |
| `commentaireFondsTravaux` | - | détail du cumul |
| `totalTantiemes` | 10000 | colonne C de « Coût au tantième avant aides » (1 000 si « millièmes ») |
| `tantiemesExemples` | [] | tantièmes des exemples (colonne C) |
| `dureeEcoPtzAns` | 20 | « pendant 20 ans », `/240` dans la formule des mensualités |
| `coefAssurance` | 1.03 | `*1.03` dans la formule des mensualités |
| `tauxPretAvancePct` | 5.45 | `*0.0545` dans le coût du prêt avance |
| `pctAvanceAides` | 70 | « Appels de fonds avec déduction de 70 % des aides » |
| `plafondTravauxParLogement` | 25000 | ne pas changer (règle ANAH) |
| `plafondMprParLogement` | 11250 | garde-fou ; 7500 si MPR à 30 % |

### variantes

`collectif` (prêt collectif + prêt avance de subventions), `collectifSansAvance`,
`individuel` (appels de fonds avec N % des aides déduites). Reprendre celles présentes dans le
classeur (onglets « collectif » / « individuel », bloc « appels de fonds »…).

### totaux_source (facultatif, conseillé)

Totaux lus dans le classeur source, pour le tableau « classeur source / logiciel » du rapport :
`totalTravauxHt`, `travauxRetenusHt`, `assietteMprTravaux`, `totalTravauxTtc`,
`totalTravauxTtcImprevus`, `totalMoeTtc`, `totalOperationTtc`, `totalAides`,
`totalAidesPubliques`, `resteACharge`, `resteAFinancer`, `appelsFonds`.
Ne renseigner que ceux que le classeur affiche réellement.
