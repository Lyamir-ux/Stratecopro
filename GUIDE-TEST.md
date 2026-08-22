# Guide de test — Strat Eco Pro (V1 locale)

## Démarrer

1. Double-cliquez sur **`demarrer.bat`** (à la racine du projet). Une fenêtre noire s'ouvre — laissez-la ouverte.
2. Le navigateur s'ouvre sur `http://localhost:5173`.
3. Connectez-vous avec votre compte (`amir@strateco.fr`).

**Votre compte AMO accède à TOUS les espaces** : dans la barre latérale, groupe
« Aperçu des espaces » → Espace Syndic, Portail copropriétaire (choisissez la copro
puis le copropriétaire à consulter), Espace prestataire (choisissez l'entreprise).
Une barre sombre « Aperçu AMO » rappelle qui vous consultez, avec un bouton de
retour « Espace AMO ». Attention : en aperçu, les actions écrivent réellement
(répondre à l'enquête, transmettre un choix… comme si l'utilisateur l'avait fait).

Dans l'**Espace Syndic**, l'aperçu AMO affiche en plus un **rail « Organisations »
sur la gauche** : « Tous les dossiers » par défaut, puis une entrée par enseigne
(et « Hors organisation » pour les dossiers non rattachés), avec le nombre de
dossiers. Cliquez une enseigne pour ne voir qu'elle — le portefeuille **et** les
tâches se filtrent. Ce rail n'existe qu'en aperçu AMO : un vrai gestionnaire ne
voit que son propre portefeuille.

Pour tester les espaces **tels que les voient leurs utilisateurs** (connexion,
périmètre RLS), utilisez les comptes de démo :
`copro@demo.strateco.fr` / `Demo-Copro-2026!` — il est rattaché à un copropriétaire
de Renaissance possédant 3 lots. (Utilisez une fenêtre de navigation privée pour
être connecté AMO et copropriétaire en même temps.)

Un compte **AMO de démo** existe aussi pour tester l'espace équipe sans votre
compte nominatif : `amo@demo.strateco.fr` / `Demo-AMO-2026!` (Démo AMO).

Les données vivent dans Supabase (en ligne, chiffrées, hébergées en UE) : vous pouvez fermer et rouvrir, rien ne se perd. Tout ce que vous saisissez pendant les tests est conservé.

**Mot de passe oublié** : lien « Mot de passe oublié ? » sous le bouton de
connexion → saisissez votre e-mail → vous recevez un lien qui ouvre la page
« Nouveau mot de passe » (8 caractères minimum, saisi deux fois). Un lien expiré
ou déjà utilisé affiche « Lien invalide ou expiré » avec un bouton pour refaire
une demande.

## Ce qu'il y a à tester, module par module

| Module | Ce qui doit marcher |
|---|---|
| **Tableau de bord** | KPI, 3 vues (Kanban / Galerie / Tableau), filtres Phase & Secteur, création d'une copropriété (**nombre de bâtiments demandé d'entrée** — s'il y en a plusieurs, **adresse par bâtiment** ; ces bâtiments font foi même si l'import des lots en référence d'autres ; ville + **code postal**, syndic = société de gestion, **encadré gestionnaire** avec son mail, **nombre de logements** et **chef de projet**), export CSV, photo de dossier. Cartes, tableau et KPI comptent en **logements** — les lots à usage d'habitation une fois le tableau des lots importé, le nombre déclaré à la création tant qu'il ne l'est pas (caves, garages et parkings exclus) ; l'export CSV garde les deux colonnes |
| **Dossier → Projet** | Kanban des tâches ; clic sur la pastille = changer le statut ; assignation |
| **Dossier → Données** | Import Excel/CSV des lots : mapping de colonnes (**mail, téléphone et adresse postale du copropriétaire reconnus**), **les clés de tantièmes reprennent l'en-tête du fichier** (plus de MUN/ESC imposé), tantièmes repris tels quels **sans somme obligatoire** (10 000, 1 000 ou autre), erreurs signalées ; matrice bâtiments × clés ; synthèse modifiable (dont gestionnaire) |
| **Dossier → Plans de financement** | Scénario partagé, montants, indicateurs, liste des plans individuels ; **panneau « Prêt collectif — adhésions »** : banque (CEGEE), durée votée en AG, ouverture de la campagne, dossiers reçus (statut, concordance RIB, téléchargement des bulletins signés) ; panneau « Choix de financement (portail) » |
| **Plan de financement définitif — nouveau** | Panneau en tête de l'onglet Plans de financement. **Import du classeur Excel du chef de projet** (nomenclature « PF définitif Eco PTZ collectif / individuel » + un onglet par lot avec la colonne « Retenu » = assiette MaPrimeRénov') : l'aperçu affiche les contrôles fichier ↔ recalcul (chaque total du classeur comparé au moteur du logiciel, écart toléré 1 €). Puis **éditeur complet** : infos générales, lots et lignes de devis (case « Retenu », montant HT, TVA 5,5/10/20 %, remise), MOE par phase (forfait ou **% des travaux** — MOE travaux, honoraires syndic, dommage-ouvrage suivent le montant des travaux), catalogue d'aides paramétrables (CEE 27 €/m²×0,9, MPR travaux 45 %×0,9 plafonnée à 25 k€/logt, MPR études au prorata énergétique, MPR AMO 50 %, Climaxion, EMS), paramètres (imprévus 7 %, fonds travaux, tantièmes d'exemple, durée éco-PTZ, prêt avance 5,45 %, avance 70 %) ; **toute modification recalcule en direct les deux variantes** (éco-PTZ collectif + avance de subventions / éco-PTZ individuel 70-30) avec quotes-parts, mensualités et prix de revient par tantièmes ; garde-fous (25 k€/logt, MPR 11 250 €/logt, AMO 600 €/logt) ; **export .xlsx** à la même nomenclature. Testez avec « Plan de financement définitif optimisé - Les Violettes.xlsx » : tous les contrôles doivent être verts. Dans l'éditeur, **les lots sont repliés par défaut** : chevron (ou clic sur la ligne de totaux) pour dérouler le détail des lignes de devis. Une fois le plan enregistré, bouton **« Valider »** (dans l'éditeur ou sur la liste du panneau) : badge « Validé » (un seul plan validé par copro) et **les panneaux de l'onglet Financement se remplissent automatiquement** à partir du PF validé — coût de l'opération (travaux TTC, MOE, total), ingénierie financière (aides, fonds travaux, reste à charge, reste à financer) et indicateurs : gain énergétique, **les deux seuils MPR (35 % et 50 %)**, taux d'aides, **étiquette visée = étiquettes initiale → projet du PF**. Valider **partage aussi le plan avec le syndic** (son onglet Financement) et **remonte gain, étiquettes et montant TTC sur le tableau de bord** (carte, tableau, KPI, export CSV). **Plans individuels générés depuis le PF validé** : une seule clé de tantièmes dans la copro → tout est réparti automatiquement avec elle ; plusieurs clés → dialogue « Clés de répartition » qui demande, **lot par lot et item par item** (lots TTC imprévus inclus + MOE phase travaux), quelle clé appliquer ; aides et fonds travaux déduits au prorata ; quote-part, aides et reste par copropriétaire. **Cliquer un plan individuel ouvre le portail de ce copropriétaire en aperçu AMO** (retour par le bouton « Espace AMO » de la barre sombre). Bouton **« Partager aux copropriétaires »** sur le panneau : publie les quotes-parts sur le portail (accueil, « Mes quotes-parts », « Plan de la copropriété » — badge « Partagé au portail », **« Ne plus partager »** pour retirer) ; revalider ou repartager après une modification du PF met à jour les montants publiés. « Repasser en brouillon » pour revenir en arrière |
| **Assistant 7 étapes** | Saisie du chiffrage, taux MPR/bonus passoire, profils, éco-PTZ (sliders), cascade, étape 7 : tableau des quote-parts + « Valider », multi-scénarios (dupliquer, partager) |
| **Dossier → Enquête sociale** | Saisie foyer/occupation/RFR → profil calculé (barème Anah 2026) ; **« Configurer »** ouvre le catalogue complet (identité, situation & aides, avis, lots, enquête technique, confort) : interrupteur par question, questions socle verrouillées 🔒, conditions d'affichage, questions personnalisées ; préparation d'envoi |
| **Dossier → Fichiers** | Dépôt **multiple** (sélection de plusieurs fichiers) et **glissé-déposé** (sur une carte de dossier = dépôt dans ce dossier) ; cliquer une carte cale le sélecteur de dépôt dessus ; téléchargement, suppression ; checklists cochables. Trois icônes par fichier : **flèche de partage** = publier au portail copropriétaire (verte quand c'est le cas), **œil** = aperçu du document sans le télécharger, **flèche vers le bas** = téléchargement |
| **Dossier → Communications** | Ajout de notes |
| **Vos tâches** | Agrégation par dossier, tri par phase |
| **Recherche globale (bandeau)** | Tapez au moins 2 caractères : résultats en deux sections — **Copropriétés** (nom, ville, adresse, code postal, syndic — accents et casse ignorés) et **Copropriétaires** (nom). Clic (ou Entrée = premier résultat) : une copropriété ouvre son dossier, un copropriétaire ouvre l'onglet Données de sa copropriété. Échap ou clic ailleurs ferme le menu |
| **Consultations** | Publication pour une copro de la plateforme **ou une copro externe** (études non démarrées) ; **type « Diagnostiqueur » : sous-choix obligatoire** entre « Diagnostic amiante et plomb avant travaux » (la description devient « mission + programme de travaux pressentis ») et « Test d'étanchéité à l'air » ; le **nombre de bâtiments** est figé à la publication (auto pour une copro de la plateforme, champ saisi pour une copro externe) et affiché aux candidats ; **options demandées à cocher** (audit réglementaire, PPPT, DPE collectif, mémoire Climaxion) ; **documents joints** à la publication (cahier des charges, audit… téléchargeables par les candidats) ; à la publication, bandeau « X prestataires alertés » ; candidatures du portail (badge Portail, montant, note, offre téléchargeable, **détail tarifaire MOE par phase et par option**) + ajout manuel ; statut retenue/non retenue ; clôture ; **volet « N questions »** : questions posées par les candidats avant de postuler, badge orange « sans réponse », réponse inline visible de tous les candidats ; **« État de la consultation »** : ① à qui l'alerte a été envoyée (statut envoyé/simulé/erreur), ② qui a récupéré le dossier (ouverture du formulaire ou téléchargement d'une pièce — l'aperçu AMO ne compte pas), ③ réponses reçues avec téléchargement des offres |
| **Base prestataires** | Référencer une entreprise (métiers multiples), modifier, suspendre/réactiver, supprimer ; badge « Compte actif » si un compte de connexion est rattaché |
| **Collaborateurs / Paramètres** | Fonction modifiable ; barèmes éditables + duplication millésime ; couleur d'accent ; menu sombre ; retours de test : bouton **« Exporter en MD »** (copie les feedbacks à traiter au format Markdown, prêts à coller dans Claude) |

## Espace Copropriétaire (portail) — nouveau

Connectez-vous avec le compte de démo ci-dessus. À tester :

| Section | Ce qui doit marcher |
|---|---|
| **Accueil** | Timeline des phases, tuiles quote-part / aides / reste à charge (chiffres du plan individuel du scénario partagé), cartes « À faire » qui reflètent l'avancement réel |
| **Mes quotes-parts** | Bascule entre les lots, cascade quote-part → reste à charge par lot, sélecteur de scénario s'il y en a plusieurs de partagés |
| **Enquête sociale** | Questionnaire généré depuis la configuration AMO : carte « Vous » (ménage, RFR…) puis une carte par lot (technique, confort) ; questions conditionnelles en direct (ex. « Date de la chaudière » n'apparaît que si chauffage individuel gaz) ; panneau latéral : progression, badge « Questionnaire complet » quand tout est répondu, **plafonds Anah 2026** puis catégorie du ménage (très modeste → supérieur, sans couleurs) dès que ménage + RFR sont renseignés ; réponses enregistrables en plusieurs fois (visible ensuite côté AMO, onglet Enquête) |
| **Mon financement** | 3 choix : prêt collectif (banque + durée fixées par l'AMO — voir ci-dessous), éco-PTZ individuel (durée au choix, sélection des lots), fonds propres ; le choix transmis apparaît côté AMO |
| **Adhésion au prêt collectif** | Après le choix collectif : formulaire (adhérents, coordonnées, IBAN/BIC validés) → signature au doigt/souris → **bulletins CEGEE pré-remplis et signés** (1 par lot d'habitation) + **mandat SEPA pré-rempli à imprimer/signer à la main** ; concordance IBAN↔RIB vérifiée automatiquement si un RIB (PDF) est téléversé |
| **Mes documents** | Téléversement des pièces justificatives (compteur 0/3 → 3/3) ; téléchargement des documents partagés par l'AMO via l'icône œil |
| **Plan de la copropriété** | Cascade collective du scénario partagé, détail du coût et des aides |

Vérifiez aussi la **confidentialité** : le compte démo ne doit jamais voir les données
des autres copropriétaires (ni leurs réponses d'enquête, ni leurs plans), ni les
tâches internes, ni les scénarios non partagés.

## Espace Syndic — nouveau

**Compte de démo** : `syndic@demo.strateco.fr` / `Demo-Syndic-2026!`
(Camille Aubry, gestionnaire — rattachée à Renaissance, organisation GT Immo).
Tuile « Syndic » sur l'écran de connexion. Tout l'espace est en **lecture seule**,
à une exception près : l'onglet **Documents à produire**, où le syndic dépose les
documents du dossier de prêt et remplit les formulaires destinés à la banque.

| Section | Ce qui doit marcher |
|---|---|
| **Portefeuille** | Un **système par gestionnaire** : bulle grise au centre (ses initiales, le total de logements et le montant d'opération dont il a la charge), autour de laquelle **gravitent ses copropriétés**. La taille d'un satellite suit son nombre de logements, sa **couleur donne la phase** (orange Diagnostic, bleu Études, vert Travaux), « ! » = fragile. Les dossiers sans gestionnaire renseigné se regroupent sous « Non attribué ». Clic sur un satellite = ouvrir le dossier |
| **Vos tâches** | Actions du syndic par copropriété et phase (AG, PV, fiche État, compte travaux, DO, validations d'aides…) |
| **Dossier → Projet** | Les mêmes actions phase par phase, avec l'avancement |
| **Dossier → Données de la copro** | Lots (bâtiment, usage, copropriétaire, tantièmes), copropriétaires, bâtiments — sans import ni édition |
| **Dossier → Enquête sociale** | Vue d'information uniquement : profils MPR, réponses (foyer, occupation, profil — **jamais le RFR**), questionnaire, état de la campagne. **Aucun bouton d'envoi ou de relance** — l'enquête est pilotée par l'AMO |
| **Dossier → Financement** | **Mode de financement choisi par chaque copropriétaire** : fonds propres / éco-PTZ collectif / éco-PTZ individuel (+ « En attente » tant que rien n'est transmis), tuiles de comptage, paramètres du prêt collectif (banque, durée AG, adhésions ouvertes). **Le PF définitif validé par l'AMO est partagé automatiquement** (pas de bouton « partager ») : panneau « Plan de financement définitif — Validé » avec coût total de l'opération TTC, aides mobilisées, fonds travaux, reste à charge collectif et date de validation ; sans PF validé, le scénario partagé s'affiche comme avant |
| **Dossier → Documents à produire** | Cartes des montages (ANAH/MPR, CEE, ClimAxion = « Bientôt disponible ») ; **Éco-PTZ collectif CEGEE** = parcours en 3 étapes : ① Résolutions de prêt (fiche de renseignements avant AG pré-remplie depuis le projet + attestation du taux d'impayés avec modèle Word téléchargeable), ② Ouverture du compte travaux (14 pièces à déposer, dont un groupe conditionnel « signataire ≠ dirigeant » avec case « Non concerné »), ③ Dépôt du dossier de demande d'offre de prêt (formulaire « Demande de prêt CEGEE » pré-rempli + pièces éco-PTZ et avance de subventions). **Dommages-ouvrage ROEDERER** = parcours en 3 étapes : ① Demande de tarification (8 pièces, dont le questionnaire « Assurances de chantier » avec modèle Word téléchargeable — majoritairement MOE/AMO, affichées « En attente » pour suivi), ② Accord sur l'offre et établissement du contrat (offre « Bon pour accord » + pièces du contrat + groupe LCB-FT : Kbis, bénéficiaires effectifs), ③ Régularisation définitive (dans les 6 mois suivant la réception : coût définitif, PV de réception, rapport final du CT). Dans les deux parcours : dépôt multi-fichiers par document (**clic ou glissé-déposé directement sur la ligne** — la ligne passe au vert avec une coche une fois la pièce déposée), téléchargement, suppression, case « Non concerné » sur les pièces conditionnelles, compteurs d'avancement par étape |
| **Dossier → Fichiers** | **Toute la base documentaire du dossier**, pas seulement ce qui est publié aux copropriétaires : les documents déposés par l'AMO et la maîtrise d'œuvre **et** ceux que le syndic a lui-même fournis depuis « Documents à produire ». Chaque ligne porte un badge d'origine — **AMO**, **MOE** ou **Projet syndic** — et les mêmes filtres en tête de panneau (seules les origines présentes s'affichent). Deux actions : **l'œil ouvre un aperçu** du document sans le télécharger (PDF, images, texte ; les tableurs et documents Word annoncent qu'ils doivent être téléchargés), la flèche télécharge |

### Organisations (enseignes de gestion) — nouveau

Un cabinet de syndic peut désormais être modélisé comme une **organisation** avec
deux niveaux d'accès :

- **directeur** → tout le portefeuille de l'enseigne, sans rattachement copro par copro ;
- **gestionnaire** → ses seules copropriétés (rattachement `copro_members`, inchangé).

L'accès reste en lecture seule, avec les mêmes garde-fous de confidentialité
(pas de RFR, pas de tâches internes AMO, pas d'IBAN). Le bandeau de l'espace
syndic affiche l'enseigne et le périmètre (« IMMIUM Laemmel · Direction — tout
le portefeuille »).

Tout se pilote depuis **Paramètres → Organisations** (espace AMO) : créer,
renommer ou supprimer une enseigne ; ajouter un membre et basculer son rôle
entre direction et gestionnaire ; rattacher ou détacher les copropriétés. Un
compte n'appartient qu'à une seule enseigne (contrainte en base) : pour déplacer
un gestionnaire, retirez-le de l'une avant de l'ajouter à l'autre. Supprimer une
enseigne conserve les dossiers — ils sont simplement détachés.

**Organisations en base** (24 dossiers au total, toutes les copropriétés de test
ayant été effacées le 15/08/2026) :

| Organisation | Dossiers | Accès |
|---|---|---|
| **IMMIUM Laemmel** | 22 copropriétés, 1 067 logements | Lucie Chatteleyn directrice (les 22), Claude Lobstein (7), Nicolas Schmieg (3) et Christine Vautier (1) gestionnaires |
| **IMMIUM** | 19 copropriétés, 995 logements | Olivier Plat (9, dont BOUDHORS), Isabelle Gebel (3), Etienne Spenato, Gwennaelle Aubry, Marie Malard et Sofia Didou (1 chacun) — **aucun directeur désigné**, personne ne voit donc l'ensemble du portefeuille |
| **GT Immo** | Renaissance | Camille Aubry (compte de démo), rattachée au dossier |

Mots de passe provisoires : `Laemmel-2026!` pour IMMIUM Laemmel, `Immium-2026!`
pour IMMIUM — à changer à la première connexion via « Mot de passe oublié ».

IMMIUM et IMMIUM Laemmel sont **deux enseignes distinctes**, malgré la proximité
des noms : la direction de l'une ne voit pas le portefeuille de l'autre.

La flèche de partage de l'onglet Fichiers côté AMO ne concerne donc que le
**portail des copropriétaires** (des particuliers). Le syndic, lui, co-gère le
dossier : il voit l'ensemble des documents déposés, partagés ou non. Dans les deux
espaces, l'œil garde le même sens — un aperçu du document. Dites-le si certaines pièces
doivent rester internes à Strat Eco — il faudra alors un second niveau de
confidentialité.

Vérifiez aussi la **confidentialité côté syndic** : jamais les revenus fiscaux (RFR),
ni les tâches internes AMO, ni les notes de projet, ni les plans individuels chiffrés,
ni les adhésions bancaires (IBAN) — et uniquement SES copropriétés (les 22 dossiers
IMMIUM Laemmel et BOUDHORS restent invisibles pour elle).

## Espace MOE & intervenants (prestataires) — nouveau

**Compte de démo** : `presta@demo.strateco.fr` / `Demo-Presta-2026!`
(Claire Vernet, Atelier Vernet Architectes, référencée « Maîtrise d'œuvre »).
Tuile « MOE & intervenants » sur l'écran de connexion.

Le circuit complet à tester :

1. **Côté AMO** : « Base prestataires » → vérifier les 5 entreprises de démo ; « Consulter un
   intervenant » → publier une consultation Maîtrise d'œuvre → le bandeau confirme le nombre de
   prestataires alertés (envoi **simulé** tant qu'aucune clé d'envoi n'est configurée — le journal
   est visible sur la carte : « X alertés »).
2. **Côté prestataire** (compte démo) : la consultation apparaît dans « Consultations en cours »
   (uniquement celles de SES métiers) → « Poser une question » (avant de candidater) →
   Postuler : montant, note d'intention, offre PDF jointe — les pièces du dossier de
   consultation sont téléchargeables depuis la carte ET depuis la fiche « Postuler ».
3. **Côté AMO** : la candidature apparaît sur la carte avec le badge « Portail », le montant,
   la note et l'offre téléchargeable → passer le statut à « Retenue ». Le volet
   « N questions » de la carte (badge orange « sans réponse ») permet de répondre aux
   questions des candidats — la réponse est visible de TOUS les candidats de la consultation.
4. **Côté prestataire** : « Mes candidatures » passe à « Retenue » ; pour une MOE, l'opération
   apparaît dans « Mes projets » (fiche copro + bâtiments, en lecture).

| Section | Ce qui doit marcher |
|---|---|
| **Consultations en cours** | Seules les consultations EN LIGNE des métiers du prestataire ; carte avec copro (ou « études non démarrées »), phase, J−n, **options demandées et documents joints téléchargeables**, **adresse cliquable = plan de situation dans l'application** (avec lien « Ouvrir dans Google Maps » en nouvel onglet — on ne quitte plus la page) ; **bouton « Poser une question »** : Q&A avec l'AMO, réponses partagées entre candidats (l'identité de l'auteur n'est pas montrée aux autres candidats) ; dépôt d'offre une seule fois par consultation ; fiche « Postuler » avec adresse, nombre de logements/bâtiments, **pièces du dossier téléchargeables** et **mini-carte Google Maps** ; **la saisie du prix dépend de la mission** : MOE = grille par phase (DIAG/AVP au forfait ; PRO/DCE et suivi de chantier au forfait € ou en % du montant des travaux) + une ligne par option cochée, total automatique (forfaits en €, pourcentages cumulés à part) ; diagnostiqueur « étanchéité à l'air » = deux montants (avant / après travaux) ; CT et SPS = deux montants (phase conception / phase réalisation) ; diagnostiqueur « amiante et plomb » = **aucun montant**, dépôt de l'offre détaillée en pièce jointe |
| **Mes candidatures** | Historique avec statut (reçue / retenue / non retenue), montant, consultation clôturée signalée |
| **Mes projets** | MOE uniquement, et seulement si retenue : fiche de l'opération + bâtiments. Les diagnostiqueurs / CT / SPS n'ont PAS cette section |

Vérifiez aussi la **confidentialité côté prestataire** : le compte démo ne doit voir
ni les tâches, ni les lots, ni les enquêtes, ni les plans de financement, ni les
autres prestataires de la base — uniquement sa fiche, ses consultations et ses
candidatures (et, une fois retenu en MOE, la fiche copro + bâtiments du projet).

## Nommage structuré des fichiers au dépôt — nouveau

À chaque dépôt de fichier, un dialogue demande de **décrire le document** (type dans une
liste fermée, objet, émetteur, date, état) et construit en direct un nom normalisé —
`{COPRO} - {Type} - {Objet} - {ÉMETTEUR} - {AAAA-MM-JJ}[ - état]` — appliqué à la
validation. Exemple sur un devis d'artisan :
`BOUDHORS - Devis - Isolation ITE - SCHOENENBERGER FACADES - 2026-06-12.pdf`.

Où tester (les cinq points de dépôt sont couverts) :

| Point de dépôt | Particularité |
|---|---|
| **AMO → dossier copro → Fichiers** | Propose aussi le **dossier de classement** (Diagnostic & audit, Marchés de travaux…), qui suit le type choisi |
| **Syndic → Montage bancaire** | Dialogue à chaque pièce déposée (clic ou glissé-déposé) |
| **AMO → Consulter un intervenant → documents joints** | Chaque pièce jointe passe par le dialogue avant d'être listée |
| **Prestataire → déposer une offre** | Type présélectionné « Devis » |
| **Portail copropriétaire → Mes documents** | Type présélectionné selon la pièce demandée (avis d'imposition, RIB…) |

À vérifier : le nom se met à jour en direct pendant la saisie ; « Garder le nom
d'origine » fonctionne toujours ; un dépôt multiple enchaîne les fichiers un par un ;
côté AMO, le nom d'origine reste tracé en base (`fichiers.name_original`).

## Limitations connues de la V1 (pas des bugs)

- **Enquête sociale** : l'envoi prépare la campagne mais **n'envoie aucun e-mail réel** — le copropriétaire répond depuis son portail.
- **Portail copropriétaire** : le rattachement d'un copropriétaire à un compte se fait encore côté base (pas de bouton « Inviter » dans l'UI AMO pour l'instant).
- **Adhésion prêt collectif** : CEGEE uniquement (Domofinance viendra) ; personne physique, adhérents 1 et 2 (indivision >2 et SCI : plus tard) ; la signature électronique est une signature simple (dessin + horodatage) — la banque exigeant des originaux papier, les bulletins signés restent imprimables ; la concordance RIB ne se vérifie que sur les RIB PDF (photo/scan image = contrôle manuel).
- **Consultations** : l'alerte e-mail aux prestataires est **simulée** (journalisée mais pas envoyée) tant que la clé d'envoi `RESEND_API_KEY` n'est pas configurée côté Supabase — tout le reste du circuit est réel.
- **Prestataires** : le rattachement d'une entreprise à un compte de connexion se fait encore côté base (comme pour les copropriétaires) ; l'espace « Mes projets » d'une MOE retenue est en lecture (le pilotage des missions loi MOP viendra ensuite).
- **Espace Syndic** : les organisations se gèrent depuis Paramètres, mais le rattachement d'un **gestionnaire** à ses copropriétés se fait encore côté base (`copro_members`, rôle `syndic`) — seul le périmètre du directeur (toute l'enseigne) est administrable à l'écran. Les tâches syndic affichées sont des repères générés depuis la phase du dossier (pas encore cochables).
- **Collaborateurs** : l'ajout d'un compte passe par le tableau de bord Supabase pour l'instant.
- **Import Excel d'un scénario financier** : crée un scénario verrouillé avec les paramètres courants — il ne lit pas encore les chiffres du fichier.
- **Recherche globale** (barre du haut), notifications et bouton Aide : décoratifs pour l'instant.
- **Export PDF des plans individuels / quotes-parts** : pas encore — utilisez l'export CSV ou l'impression navigateur.
- Espace **Syndic** : phase 2 (grisé à la connexion). Les espaces **Copropriétaire** et **MOE & intervenants** sont actifs.

## Pour vos remarques : le bouton « Feedback » (en bas à droite)

Sur **toutes les pages**, une fois connecté (quel que soit votre espace : AMO, syndic, copropriétaire, prestataire), un bouton **Feedback** flotte en bas à droite. C'est le canal officiel des retours de test :

1. Cliquez sur **Feedback**, choisissez **Bug**, **Idée** ou **Remarque**
2. Décrivez ce que vous avez constaté — la **page en cours est jointe automatiquement**, inutile de la recopier
3. **Envoyer** — c'est enregistré, vous pouvez enchaîner

Tous les retours arrivent compilés dans **Paramètres → Retours de test** (avec auteur, page, date), où je les trie et les marque « traités » au fur et à mesure. Pas besoin d'e-mail ni de fichier partagé — et dès qu'un retour est marqué « traité », **vous recevez automatiquement un e-mail de compte rendu** (à l'adresse de votre compte) : votre remarque y est citée et la correction est en ligne.

Le plus utile pour corriger vite, pour chaque bug :

1. **Où** — la copropriété concernée si besoin (la page est déjà jointe)
2. **Quoi** — ce que vous avez fait, ce qui s'est passé, ce que vous attendiez
3. **Chiffres** — si c'est un calcul faux : les montants attendus vs affichés
4. Une capture d'écran si c'est visuel (à m'envoyer à part pour l'instant, en citant votre remarque)
