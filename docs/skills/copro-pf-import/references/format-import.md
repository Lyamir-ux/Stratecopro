# Données attendues par l'import d'un plan de financement dans Strat Eco Pro

Relevé dans le code du logiciel le 11/10/2026 :
`src/lib/finance/importPlanDefinitif.ts` (PF définitif), `src/lib/finance/planEstimatif.ts`
(PF estimatif), `src/pages/PlanDefinitif/ImportPlanDefinitifDialog.tsx` (bouton d'import),
`src/lib/finance/planDefinitif.ts` (modèle de données et calculs).

Le script `scripts/generer_import.py` écrit ces formats. Ce document sert à comprendre ce
qu'il produit, et pourquoi un classeur « maison » est souvent mal lu.

## 1. Où et comment le logiciel importe

Dossier de la copropriété > onglet **Financement** > **Importer un classeur** (.xlsx ou .xls).
Le logiciel choisit le format tout seul :

| Le classeur… | Format reconnu | Ce qui est créé |
|---|---|---|
| a un onglet dont le nom commence par « PF définitif » | **PF définitif** | un plan **définitif** en brouillon, ouvert dans l'éditeur ; il peut ensuite être validé, partagé au syndic et au portail |
| n'a aucun onglet « PF définitif… », et a une feuille avec une cellule « Descriptif des travaux » suivie, sur la même ligne, d'au moins 2 colonnes « Scénario N » (ou d'une seule si l'onglet ou la cellule A1/B1 contient « estimatif ») | **PF estimatif** | un groupe de scénarios **estimatifs** en brouillon (comparatif). Un plan estimatif ne peut **jamais** être validé ni vu par le syndic ou le portail |
| autre cas | PF définitif | souvent « Aucun onglet PF définitif reconnu » ou des travaux vides |

Le classeur source est archivé dans l'onglet Fichiers (dossier Plans de financement).

Règle de lecture commune : les libellés sont comparés **sans accents, sans majuscules, sans
« : »**, espaces réduits ; « œ » vaut « oe ». L'apostrophe doit être **droite** (').
Une apostrophe typographique (’) fait rater « Adresse de l'immeuble », « Nombre d'étages »,
« Maîtrise d'œuvre »…

## 2. Format PF définitif

### 2.1 Onglets

- **Onglets de financement** : nom commençant par « PF » (ou ligne 1 contenant « plan de
  financement »). La variante se déduit du nom + de la ligne 1 :
  - contient « individuel » → variante **éco-PTZ individuel** (appels de fonds) ;
  - contient « sans avance » ou « hors avance » → variante **collectif sans avance** ;
  - sinon → variante **éco-PTZ collectif** (avec prêt avance de subventions).
  Seules les variantes présentes sont proposées dans le dossier. Toutes les données sont lues
  dans l'onglet principal (collectif, sinon sans avance, sinon individuel) ; l'onglet
  individuel ne sert qu'à lire le « N% des aides publiques » avancé et à contrôler les appels de fonds.
- **Onglets de lots** : nom commençant par « Lot » + numéro (« Lot 03 Façade »). **Les travaux
  ne sont lus QUE dans ces onglets** : les lignes « Lot N » du bloc « Descriptif des travaux »
  de l'onglet PF sont ignorées. Un classeur sans onglet de lot arrive avec des travaux vides.
- Tout autre onglet est ignoré.

### 2.2 Onglet PF : colonnes

La colonne des libellés est celle qui contient « Nom de la copropriété » (colonne B en
général). Par rapport à elle : groupe = colonne de gauche (A), tantièmes = colonne suivante
(C), **valeur = 2 colonnes à droite (D)**, commentaire = 3 colonnes à droite (E).
Une seule colonne de valeurs est lue : un PF définitif à plusieurs colonnes de scénarios n'en
lit que la première.

### 2.3 Onglet PF : lignes lues (libellé contenant…)

Chaque libellé est cherché du haut vers le bas ; **la première ligne qui le contient gagne**.

| Donnée du logiciel | Libellé (colonne B) contenant | Valeur |
|---|---|---|
| Nom de la copropriété (obligatoire) | `nom de la copropriete` | D, texte |
| Adresse | `adresse de l'immeuble` | D |
| Logements principaux | `logements principaux` | D, nombre |
| Logements + équivalents | `logt + equivalent` | D (défaut : logements principaux) |
| Surface habitable | `surface habitable` | D |
| Nombre d'étages | `nombre d'etages` | D |
| Nombre d'entrées | `nombre d'entrees` | D |
| Type de chauffage | `type de chauffage` | D |
| Cep initial / projet | `energie primaire initial` / `energie primaire projet` | D |
| Dispositif Climaxion | `dispositif climaxion` | D = « Oui » |
| Étiquettes | `etiquette energetique` | D = « De E à C » |
| Total travaux HT (base des % de MOE) | `total travaux ht` | D |
| Total travaux TTC (base du dommage-ouvrage) | `total travaux ttc` | D |
| Imprévus (%) | `y compris imprevus` + « N% » dans le libellé (« Total travaux TTC € y compris imprévus 7% ») ; à défaut, rapport TTC avec imprévus / TTC | |
| Section MOE | de `moe et frais annexes` à `total moe` | voir 2.5 |
| Section aides | de `aides mobilisables` à `total aides` | voir 2.6 |
| Fonds travaux | `fonds travaux` | D + commentaire E |
| Total des tantièmes | `cout au tantieme avant` | **C** |
| Tantièmes d'exemple | toute ligne contenant quote part / reste à financer / mensualité / appels de fonds / prix de revient, avec un nombre en C entre 0 et le total | C |
| Durée de l'éco-PTZ | « durée de N ans » ou « pendant N ans » (nombre entier) n'importe où | |
| Part des aides avancées (variante individuelle) | onglet individuel : ligne commençant par « N% des aides publiques », N > 50 | |

Pièges vus dans les classeurs reçus : « aléas » au lieu d'« imprévus », « Total TTC € avec
imprévus 10 % » (pas de « y compris ») → imprévus non lus ; « Montant déjà appelé » ignoré
(non déduit) ; « Nombre de niveaux » non lu (le libellé attendu est « Nombre d'étages ») ;
un libellé de MOE ou d'aide contenant « fonds travaux » placé avant la vraie ligne la remplace.

### 2.4 Onglets de lots

| Cellule | Contenu |
|---|---|
| B1 | « Lot 03 : Titre du lot (ENTREPRISE) » - numéro, titre, entreprise entre parenthèses (une parenthèse dans le titre est prise pour l'entreprise) |
| C1 / D1 | « Retenu » / « Scénario » (en-têtes, ignorés) |
| lignes suivantes | A = groupe (« Amélioration énergétique »), B = désignation, **C = « oui » / « non »** (retenu dans l'assiette MaPrimeRénov'), **D = montant HT**, E = « TVA de 5,5% » |
| ligne « Total HT » | fin des lignes (libellé exactement « Total HT ») |
| après le total | « Remise 2% » (remise du lot), « Total HT avec remise », « Total HT retenu », « Total TTC » (contrôles) |

- Une ligne sans désignation, sans montant, ou dont la désignation contient « € HT » est ignorée.
- Une ligne dont C n'est ni « oui », ni « non », ni vide est ignorée (en-tête).
- TVA absente : 5,5 % si la ligne est retenue, 10 % sinon (avertissement).
- La TVA d'un lot avec remise est calculée sur les montants **avant** remise (convention du
  classeur de référence).
- La colonne « Clé de répartition » (F) écrite par l'export du logiciel **n'est pas relue**.

### 2.5 MOE et frais annexes (onglet PF)

Phase = dernier repère vu en colonne A (« 1.Phase Étude », « 2.Phase Projet », « 3.Phase
Travaux » : contient etude / projet / travaux). Désignation en B, **montant TTC** en D,
commentaire en E. Seul le TTC est lu : HT, TVA, mode de calcul et éligibilité MPR sont
**devinés d'après la désignation** (première règle qui s'applique) :

| La désignation contient… | Mode | TVA | Éligible MPR études | Éligible MPR AMO |
|---|---|---|---|---|
| « assistance maîtrise d'ouvrage » ou le mot « AMO » | forfait | 20 % | non | **oui** |
| « maîtrise d'œuvre » et « travaux » | % des travaux HT | **5,5 %** | oui | non |
| « maîtrise d'œuvre » (autre) | forfait | 10 % ou 20 % (celle qui redonne un HT rond) | oui | non |
| « contrôle technique » ou « CSPS » | forfait | 20 % | oui | non |
| « dommage » et « ouvrage » | % des travaux TTC (hors imprévus) | 0 % | non | non |
| « syndic » | % des travaux HT | 20 % | non | non |
| « amiante » ou « étanchéité » | forfait | 20 % | non | non |
| autre | forfait | 20 % (avertissement « ligne non reconnue ») | non | non |

Le TTC est toujours conservé. Si la vraie TVA diffère (MOE travaux à 10 %, syndic sans TVA…),
seuls le HT et donc la MPR études changent : à corriger dans l'éditeur après l'import.
« SPS » seul n'est pas reconnu (écrire « CSPS »). L'entreprise d'une ligne MOE n'est pas lue.

### 2.6 Aides mobilisables (onglet PF)

Groupe = dernier texte vu en colonne A (CEE, ANAH, Climaxion, EMS). Libellé en B, montant en
D (vide = ligne informative), commentaire en E. **Seul le groupe « CEE » rend une aide privée**
(exclue des aides publiques, versée en fin de travaux) ; tout le reste est public.

Formule associée au libellé, puis **calibrée** sur le montant du fichier :

| Le libellé contient… | Formule standard |
|---|---|
| « CEE » | surface habitable × 27 €/m² × 0,9 |
| « MaPrimeRénov' » + « fragile » | 20 % de l'assiette travaux × 0,9 |
| « MaPrimeRénov' » + « travaux » | 45 % de l'assiette travaux × 0,9 |
| « MaPrimeRénov' » + « études » | 45 % des études HT éligibles × 0,9 × prorata énergétique |
| « MaPrimeRénov' » + « AMO » | 50 % de l'AMO HT (plafond 600 € HT/logt au-delà de 20 logts, 1 000 € sinon) |
| « Climaxion » + « travaux » | 10 000 + 2 500 € × logements équivalents |
| « EMS » + « travaux » | 1 000 € × logements équivalents |
| « BBC » | 500 € × logements |
| autre | montant saisi |

Calibrage : pour CEE, MPR travaux et MPR études, le logiciel essaie le coefficient de
prudence 0,9 puis 1 ; si aucun ne redonne le montant du fichier (à 1 € près), **le montant
est repris tel quel (figé)**. Le **taux** n'est jamais recalibré : une MPR à 30 %, un bonus
fragile à 20 % sur des études, une CEE à 43 €/m², un Climaxion à 1 200 €/logt arrivent en
montant figé (exact, mais qui ne suivra plus les travaux). Le libellé doit contenir
« MaPrimeRénov' » (ou « Maprimerénov' ») pour être reconnu ; « MPR » seul ne l'est pas.

### 2.7 Contrôles affichés à l'import

Pour chaque lot (total HT, HT retenu, TTC), puis : total travaux HT, travaux énergétiques
retenus (ligne contenant « énergétiques et induits »), TTC, TTC avec imprévus, total MOE,
total opération (« toutes les phases »), total restant en phase travaux, total aides NET,
total aides publiques, reste à charge définitif, reste à financer, appels de fonds. Écart
toléré : 1 €. Un écart n'empêche pas l'import : il signale que le logiciel calcule autrement
que le classeur.

### 2.8 Non lu par l'import du PF définitif (valeurs par défaut du logiciel)

Coût du prêt avance (5,45 %), coefficient d'assurance des mensualités (×1,03), plafond des
travaux MPR (25 000 € HT/logt, toujours appliqué), garde-fou MPR travaux (11 250 €/logt),
clés de répartition (lignes, MOE, aides, fonds travaux), entreprise des lignes MOE, TVA
saisie en euros, « montant déjà appelé ». À reprendre dans l'éditeur après l'import.

## 3. Format PF estimatif

Une seule feuille. Repère : cellule « **Descriptif des travaux** » (colonne B), suivie sur la
même ligne des colonnes « **Scénario 1** », « Scénario 2 »… (« Scénario V1 » et « Scénario 4 :
Scénario choisi » sont acceptés ; le numéro donne l'ordre du scénario). La ligne suivante peut
porter la description de chaque scénario. **Commentaires = colonne juste après le dernier
scénario.** Valeurs ET formules sont lues : le logiciel retrouve dans les formules ce que les
valeurs ne disent pas.

### 3.1 Informations (au-dessus de « Descriptif des travaux »)

Même libellés qu'en 2.3 (valeur dans la colonne du scénario, sinon la première renseignée
de la ligne), avec en plus « Nombre de niveaux » accepté, « Logements + équivalent » accepté,
et l'étiquette lue dans toute ligne contenant « étiquette » (« Passage d'étiquette : De D à C »).

### 3.2 Travaux (entre l'en-tête et « Total travaux HT »)

- Colonne A : « Lot 02 » ou « Lot 02 - Toiture » (numéro et titre du lot) ; sans « Lot NN »,
  la ligne va dans un lot « Provisions » ; si aucune ligne n'a de « Lot NN », chaque ligne
  (ou chaque bloc fusionné en A) devient un lot.
- Colonne B : désignation ; colonnes des scénarios : montant HT (vide ou 0 = absent du scénario).
- TVA : « TVA de 10% » dans le commentaire, sinon la formule du TTC (« =(D20+D22)*1.055+(D21)*1.1 »),
  sinon 5,5 %.
- **Lignes retenues (assiette MPR) = références de la formule « Total travaux HT retenu »**
  (« =D20+D22+D24 », « =MIN(D20+D22,25000*D5) » ou « =D35-D22 »). Sans formule : aucune ligne
  retenue (à cocher dans l'éditeur).
- « TOTAL TRAVAUX TTC » saisi en dur : la différence avec HT × TVA devient une ligne
  « Ajustement de TVA (TTC travaux du classeur) » dans le lot Provisions.
- Imprévus : « Total TTC € avec imprévus 7 % » (ou formule « =D37*1.07 »).

### 3.3 MOE et frais annexes

Entre « MOE et frais annexes » et « Total MOE ». Phase en colonne A. Formules relues :
`=4410*1.2` (forfait 4 410 € HT à 20 %), `=(D35*3/100)*1.2` (3 % des travaux HT, TVA 20 %),
`=D37*1.8/100` (1,8 % des travaux TTC, sans TVA), `=4410*1` (forfait sans TVA). Montant saisi
sans formule : forfait à la TVA devinée du libellé (tableau 2.5). Éligibilité MPR études / AMO =
lignes MOE référencées par la formule de la première aide « MaPrimeRénov' … études » (resp.
« … AMO ») ; à défaut, devinée du libellé.

### 3.4 Aides

Entre « Aides mobilisables » et « Total aides ». Formules relues :

| Formule | Mode |
|---|---|
| `=D36*0.45*0.9` (D36 = total HT retenu) | % de l'assiette travaux × coef |
| `=D7*27*0.9` (D7 = surface) | €/m² × coef |
| `=((D44+D50)/1.2+(D54)/1.055)*0.45*0.9*(D36/D35)` | % des études × coef × prorata |
| `=((D43+D49)/1.2)*0.5` (libellé avec « AMO ») | % de l'AMO |
| `=10000+(2500)*D6` | forfait + €/logement (D6 = équivalents, D5 = principaux) |
| `=1000*D6` | €/logement |
| montant saisi | montant figé (après essai de la formule standard du libellé) |

Aide privée = groupe « CEE » ou mot « CEE » dans le libellé.

### 3.5 Paramètres

« Fonds travaux disponible » et « Montant(s) déjà appelé(s) » (cumulés au fonds travaux),
« Coût au tantième avant » (total des tantièmes en colonne C), « Quote part pour N
tantièmes » (exemples), « pendant 20 ans » (durée), formule des mensualités `=D95/240*1.03`
(coefficient d'assurance), formule du prêt avance `=D80*0.0545*…` (coût de l'avance).
Variantes : lignes « prêt avance » → collectif ; mensualités sans prêt avance → collectif sans
avance ; « appels de fonds » → individuel.

### 3.6 Non lu par l'import estimatif

Plafond des travaux MPR (25 000 € HT/logt), garde-fou MPR (11 250 €/logt), part des aides
avancées (70 %), clés de répartition, entreprises, remises de lot (à intégrer au HT).

## 4. Modèle de données cible (PlanDefinitifData)

Les champs et modes de calcul sont décrits dans `pivot.md`. Formules du moteur :

- TTC lot = HT après remise + TVA (calculée avant remise) ; total travaux = somme des lots.
- Assiette MPR travaux = min(lignes retenues après remise, 25 000 € × logements principaux).
- Prorata énergétique = assiette MPR / total travaux HT.
- Total opération TTC = travaux TTC × (1 + imprévus) + MOE et frais annexes TTC (toutes phases).
- Taux de couverture = total aides / total opération.
- Reste à charge = total opération - total aides - fonds travaux.
- Reste à financer = reste à charge + prime CEE (versée en fin de travaux).
- Appels de fonds (individuel) = total opération - aides publiques × % avancé - fonds travaux.
- Mensualité = reste à financer de l'exemple / (durée × 12) × coefficient d'assurance.
- Coût du prêt avance = aides publiques × 5,45 % × quote-part.
