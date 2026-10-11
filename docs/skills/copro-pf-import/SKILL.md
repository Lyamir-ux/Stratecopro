---
name: copro-pf-import
description: >
  Convertit le plan de financement (PF) d'un chef de projet Strat Eco, définitif ou
  estimatif / prévisionnel, quel que soit son format Excel, en classeur directement importable
  dans le logiciel Strat Eco Pro (onglet Financement > « Importer un classeur »), avec un
  rapport qui compare le calcul du logiciel aux totaux du classeur. Utiliser dès que
  l'utilisateur veut « importer un PF dans le logiciel », « mettre le plan de financement au
  format du logiciel / de Strat Eco Pro », « préparer le PF pour l'import », signale que « le
  logiciel ne lit pas mon PF » ou « l'import donne des écarts / des travaux vides », ou joint un
  .xlsx de plan de financement de copropriété en parlant du logiciel, de l'import ou de la
  plateforme. Ne vérifie pas la conformité réglementaire du PF (skill copro-pf-verif pour cela).
---

# Convertir un plan de financement pour l'import dans Strat Eco Pro

## Ce que produit le skill

1. **Le classeur à importer** : `Import PF définitif - <copro>.xlsx` ou
   `Import PF estimatif - <copro>.xlsx`, au format exact relu par le logiciel.
2. **Le rapport** `Rapport conversion PF - <copro>.md` : totaux du classeur source face au
   calcul du logiciel, aides en formule ou en montant figé, alertes (garde-fous, palier MPR),
   et la liste de ce qu'il faudra reprendre dans l'éditeur après l'import.

L'import lui-même est fait par le chef de projet dans le logiciel : dossier de la copropriété >
onglet **Financement** > **Importer un classeur**. Le plan arrive en brouillon.

## Les deux formats du logiciel

| Nature | Quand | Ce que le logiciel en fait |
|---|---|---|
| **PF définitif** | après les offres des entreprises (plan présenté en AG travaux, suivi de chantier) | plan **définitif** : éditable, puis validable, partagé au syndic et au portail copropriétaires |
| **PF estimatif** (prévisionnel) | scénarios avant consultation, comparaison | **comparatif** de scénarios en brouillon, jamais validable ni visible du syndic ou du portail |

Un PF « prévisionnel » à un seul scénario qui doit être partagé au syndic s'importe en
**définitif**. Le titre du classeur ne suffit pas (des « PF estimatif » étaient des définitifs) :
en cas de doute, demander.

Détail de ce que lit chaque importeur : `references/format-import.md`.

## Méthode

### Étape 1 - Lire le classeur

```bash
python scripts/lire_classeur.py "CLASSEUR.xlsx" --onglets
python scripts/lire_classeur.py "CLASSEUR.xlsx" --onglet "PF" --max-lignes 400
python scripts/lire_classeur.py "CLASSEUR.xlsx" --onglet "Lot"
```

(`scripts/` est dans le dossier du skill.) Le script donne pour chaque cellule la valeur
**et la formule** (`D: 23109.31 [=(D29*4.5/100)*1.1]`), les onglets, lignes et colonnes
masqués, les fusions. Les formules disent ce que les valeurs taisent : HT et TVA des MOE,
lignes retenues (`Total travaux HT retenu = D21+D22+D24`), taux et coefficients des aides.

### Étape 2 - Décider de ce qu'on importe

Repérer l'onglet et la colonne de scénario à reprendre (onglets masqués et colonnes en #REF! =
anciennes versions), la nature (définitif / estimatif), les variantes de financement.
Règles par défaut : `references/regles-conversion.md` § 1.

### Étape 3 - Poser les questions, en une fois

Ne demander que ce qui change les montants ou la nature, avec la réponse par défaut proposée :
- nature (définitif / estimatif) si le classeur est ambigu ;
- onglet / scénario(s) s'il y a plusieurs candidats visibles ;
- incohérences du classeur (TVA du PF ≠ onglets de lots, ligne hors totaux, formule fausse) ;
- après l'étape 5 seulement : pour chaque aide en écart, garder le montant du classeur
  (montant figé) ou la formule du logiciel.

Si l'utilisateur a déjà dit « applique les règles habituelles » ou « sans vérification »,
appliquer les défauts et les lister dans `notes`.

### Étape 4 - Écrire le pivot JSON

Décrire le plan avec les champs du logiciel : `references/pivot.md` (schéma) et
`exemples/pivot-definitif-exemple.json`. Pour chaque donnée :
- reprendre les **montants saisis** du classeur au centime (HT des lignes, forfaits MOE,
  montants notifiés) ;
- traduire les **formules** du classeur en modes du logiciel (`pctTravauxHt`, `pctEtudes`…) ;
- appliquer `references/regles-conversion.md` ;
- remplir `totaux_source` avec les totaux affichés par le classeur, `montant_source` des aides
  et `ttc_source` des MOE ;
- consigner chaque choix dans `notes`.

### Étape 5 - Générer et contrôler

```bash
python scripts/generer_import.py pivot.json --sortie DOSSIER_DE_SORTIE
```

- **Erreurs** (code 1, rien n'est écrit) : corriger le pivot et relancer.
- **Colonne « Écart » du rapport** : chaque écart doit être expliqué. Un écart vient soit d'une
  erreur de saisie dans le pivot (la corriger), soit d'une règle du logiciel qui diffère du
  classeur (plafond de 25 000 € HT/logt, prorata recalculé, TVA de MOE, base du DO…) : la
  citer, et proposer de garder le montant du classeur en `manuel` si l'utilisateur le souhaite.
- Relancer jusqu'à ce que les totaux concordent ou que chaque écart soit justifié.

Le script simule l'import du classeur produit (mêmes règles de lecture que le logiciel) : la
section « À reprendre dans l'éditeur après l'import » liste ce que l'import lira autrement
(TVA d'une MOE devinée d'après son libellé, aide qui arrivera en montant figé, clés de
répartition, entreprises, paramètres non relus).

Sur claude.ai, écrire dans `/mnt/user-data/outputs/` pour que les fichiers soient
téléchargeables.

### Étape 6 - Livrer

Donner le classeur d'import et le rapport, puis résumer en quelques lignes :
- nature, scénario(s), nombre de lots / lignes MOE / aides ;
- totaux clés (opération TTC, aides, reste à charge) et les écarts avec le classeur, expliqués ;
- ce qu'il faudra corriger dans l'éditeur après l'import ;
- le mode d'emploi : onglet Financement > Importer un classeur > vérifier les contrôles >
  « Importer et ouvrir l'éditeur » (définitif) ou « Importer les scénarios et comparer ».

Le classeur d'import peut être ouvert (et même réenregistré) dans Excel avant l'import : ses
formules redonnent exactement les valeurs écrites. Il ne faut pas le retoucher à la main :
toute correction passe par le pivot et une nouvelle génération.

## Règles impératives

- Jamais inventer un montant : ce qui manque se demande ou se laisse à 0 avec une note.
- Jamais recopier de données personnelles (noms, revenus des copropriétaires) : le PF n'en a
  pas besoin.
- Tirets simples « - », jamais « — » ; apostrophes droites.
- Le skill ne valide rien dans le logiciel et n'envoie rien : il prépare le fichier.
- Pour une vérification réglementaire du PF (paliers, plafonds, cohérence), utiliser
  `copro-pf-verif` ; ce skill-ci reproduit fidèlement le classeur.

## Fichiers du skill

- `scripts/lire_classeur.py` - lecture du classeur source (valeurs + formules, masqués, fusions).
- `scripts/generer_import.py` - pivot JSON → classeur d'import + rapport (bibliothèque standard).
- `scripts/moteur_pf.py` - moteur de calcul du logiciel porté en Python (mêmes formules).
- `scripts/xlsx_ecriture.py` - écriture .xlsx avec formules ET valeurs (openpyxl n'écrit pas les valeurs des formules).
- `references/format-import.md` - données attendues par chaque importeur du logiciel.
- `references/pivot.md` - schéma du pivot JSON.
- `references/regles-conversion.md` - règles de conversion issues des imports précédents.
- `exemples/pivot-definitif-exemple.json` - pivot complet (copropriété fictive).
