# Règles de conversion d'un PF vers le logiciel

Règles établies lors des imports de septembre-octobre 2026 (arbitrages d'Amir sur Le Schimper,
Lamartine, Le Forum, Le Churchill, RPE, Grossau, Galilée, Hermite, Touraine, Armorial, Le
Rodin, 9 rue de la Gare, L'Hippocrate, Dornach III, Le Polygone, Les Renards, Saint-Michel,
147 route des Romains). Elles s'appliquent **par défaut** ; tout autre choix se demande.

Principe : **le classeur fait foi pour les montants saisis** (devis, honoraires, montants
notifiés) ; le logiciel recalcule ce qui est une formule. Quand le calcul du logiciel s'écarte
du classeur, on ne maquille pas : l'écart figure dans le rapport et on demande s'il faut garder
le montant du classeur (aide en `manuel`).

## 1. Choisir ce qu'on importe

- **Onglets masqués = anciennes versions** : on prend l'onglet visible. S'il y a plusieurs
  onglets visibles candidats (« Post AG », « rectifié », « AMOA »…), on demande.
- **Colonnes masquées ou en #REF! = scénarios abandonnés** : ignorées.
- Onglets d'un autre projet (DPGF, « Analyse des offres », grille AMO, « info copro » avec des
  données personnelles) : ignorés, jamais recopiés.
- **Le titre ne dit pas toujours la nature** : « PF estimatif Hermite » et « PF estimatif le
  Galilée » étaient des définitifs ; « PF prévisionnel » du Churchill aussi. En cas de doute,
  demander : « plan après les offres des entreprises (définitif, à valider et partager au
  syndic) ou comparatif de scénarios avant consultation (estimatif) ? ».
- **PF définitif à plusieurs colonnes de scénarios** : demander lequel ; si l'AG n'a pas
  tranché, un fichier définitif par scénario (Le Forum), l'équipe validera celui voté.
- **PF estimatif à plusieurs scénarios** : tous dans un seul fichier, sauf consigne
  (« scénario 4 seul », « V1 seulement »).

## 2. Travaux

- **Retenu (assiette MaPrimeRénov')** : colonne « Retenu oui/non » des onglets de lots, ou
  références de la formule « Total travaux HT retenu » (`=D21+D22+D24`) quand les lots sont en
  lignes. Si la formule contredit le « oui » d'une ligne, la formule l'emporte (Galilée).
- **TVA** : celle des onglets de lots, sinon celle de la formule du TTC (`*1.055`, `*1.1`).
  Un lot dont seul le TTC global est connu se **découpe en lignes par taux** (une à 5,5 %, une
  à 10 %) pour retrouver le TTC (Le Schimper, Grossau). Sans aucune indication : 5,5 % pour une
  ligne retenue, 10 % sinon (règle de Wafaa), et le signaler.
- **Options, parties privatives, « non comptabilisé », montants hors totaux** : exclus, avec
  une note (sauf si le classeur les additionne au total, comme l'option biosourcée du Forum).
- **Aléas / imprévus** :
  - pourcentage global (« y compris imprévus 7 % », « aléas 5 % », « avec imprévus 10 % ») →
    `imprevusPct` ;
  - inclus dans chaque lot (« 10 % inclus ») → `imprevusPct` = 0 ;
  - lignes « Divers / imprévus » dans les lots → lignes **non retenues**, `imprevusPct` = 0
    (Lamartine) ; si les honoraires sont en % des travaux hors imprévus, passer ces honoraires
    en **forfait** (montant du classeur) pour ne pas les gonfler (Grossau).
- **Chaudière** : retenue en 2026, plus à partir de 2027.
- **Remise** d'un lot : `remisePct` (format définitif). La TVA se calcule avant remise.
- **Plusieurs bâtiments dans des onglets séparés** : un seul PF pour la copro, lignes
  suffixées « - Bât A » / « - Bât B », MOE additionnées en forfaits, Cep moyen pondéré par la
  surface, total des tantièmes additionné (Le Churchill, 147 route des Romains). Le logiciel
  n'accepte qu'un PF validé par copropriété.

## 3. MOE et frais annexes

- HT et TVA d'après la formule (`=4410*1.2` → 4 410 € HT à 20 %). Une ligne qui mélange deux
  taux se scinde (Lamartine : MOE 7 000 € à 10 % + DPE 1 800 € à 20 %).
- **Phase** : colonne A du classeur (étude / projet / travaux).
- **MOE travaux, honoraires syndic** en % des travaux HT ; **dommage-ouvrage** en % des
  travaux TTC **hors imprévus** sans TVA. Si le classeur calcule le DO sur le TTC avec
  imprévus, convertir le taux (taux × (1 + imprévus)) ou le saisir en forfait.
- Honoraires syndic sans TVA au classeur : TVA 0 (fidélité au classeur).
- **Éligibilité MPR études** : exactement les lignes de la formule « MPR partie études » du
  classeur ; **MPR AMO** : les lignes de la formule « MPR AMO ».
- Entreprise de la mission : champ `entreprise` (repris au suivi financier du syndic).
- Écrire « CSPS » (pas « SPS » seul) et « Maîtrise d'œuvre » en toutes lettres : c'est ainsi
  que l'import du PF définitif reconnaît la ligne.

## 4. Aides

- **Groupes** : `CEE`, `ANAH` (toutes les MaPrimeRénov'), `Climaxion` (jamais « Région » : le
  suivi financier du syndic retrouve les aides notifiées par groupe), `EMS`. Un bonus confort
  d'été ou biosourcé de l'Eurométropole va sous `EMS`.
- **CEE** : seule aide privée (`publique: false`), groupe `CEE`.
- **Libellés MaPrimeRénov'** : commencer par « Maprimerénov' » (ou « MaPrimeRénov' ») et
  contenir « travaux », « études » ou « AMO » ; un bonus contient « bonus » ou « fragile »
  (il sort du garde-fou MPR travaux).
- **Formule quand le classeur calcule**, **montant (`manuel`) quand il saisit** (montant
  notifié, EMS MOE 15 000, aide calculée hors du tableau).
- **Coefficient de prudence** : celui du classeur (0,9, 0,95 ou aucun = 1).
- **MPR travaux** : taux du classeur (30 % entre 35 et 50 % de gain, 45 % au-delà) ; le
  logiciel plafonne toujours l'assiette à 25 000 € HT × logements principaux. Garde-fou
  `plafondMprParLogement` : 7 500 à 30 %, 11 250 à 45 %.
- **MPR études** : formule du logiciel (prorata recalculé). Si le classeur fige un prorata ou
  divise par la mauvaise TVA, l'écart apparaît dans le rapport : demander s'il faut garder le
  montant du classeur (Galilée, Grossau : oui ; Dornach III, 9 rue de la Gare, Le Polygone :
  recalcul du logiciel).
- **Climaxion** : base + montant par logement **équivalent** ; garder le montant par logement
  du classeur (1 200, 1 500, 2 500 €).
- **EMS travaux / bonus** : par logement **équivalent** ; garder le calcul du classeur s'il
  dépend du bouquet de travaux (Saint-Michel).
- **Aides individuelles** (MPR individuelle, Climaxion individuelle) : `info`, sans montant.
- Règles d'Amir **non appliquées automatiquement** par le logiciel, à signaler sans corriger
  le plan : MPR études = taux socle + bonus (fragile, sortie de passoire) ; plancher de l'aide
  AMO ANAH à 3 000 € ; EMS MOE = 75 % du HT DIAG + AVP, plafond 15 000 €.

## 5. Financement

- **Montant déjà appelé / déjà versé** (études, ravalement) : **cumulé au fonds travaux**,
  détail dans `commentaireFondsTravaux` (« Fonds travaux disponible 21 337,59 € + montant
  déjà appelé 56 863,94 € »). Exception RPE : aucun fonds déduit, sur consigne.
- **Variantes** : celles du classeur (onglet individuel → `individuel`, bloc prêt avance →
  `collectif`) ; `pctAvanceAides` d'après « N % des aides » (65 % à Touraine).
- **Durée de l'éco-PTZ** : celle du classeur (15 ou 20 ans).
- **Assurance des mensualités** : ×1,03 même si le classeur divise sans assurance (9 rue de la
  Gare) ; garder une caution particulière (×1,036 Les Renards).
- **Prêt avance** : 5,45 % sur **toutes** les aides publiques, même si la formule du classeur
  s'arrête avant (Lamartine, Le Polygone).
- **Tantièmes** : total en colonne C de « Coût au tantième » (10 000, 1 000…) ; exemples =
  tantièmes des lignes d'exemple.

## 6. Informations

- Logements principaux ≠ logements + équivalents (tertiaire / 75).
- Cep absents mais gain connu : Cep projet = Cep initial × (1 - gain) (Saint-Michel) ; rien de
  connu : 0 et le dire (le PF affichera 0 % de gain).
- Étiquettes : lettres avant / après (« De E à C »).

## 7. Toujours

- Ne recopier aucune donnée personnelle (noms, revenus des copropriétaires).
- Tirets simples « - », jamais « — », dans tout ce qui part vers le logiciel.
- Apostrophes droites ('), pas typographiques (’).
- Chaque choix qui s'écarte du classeur = une phrase dans `notes` (reprise dans le rapport).
