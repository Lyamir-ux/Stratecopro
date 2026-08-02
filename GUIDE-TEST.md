# Guide de test — Strat Eco Pro (V1 locale)

## Démarrer

1. Double-cliquez sur **`demarrer.bat`** (à la racine du projet). Une fenêtre noire s'ouvre — laissez-la ouverte.
2. Le navigateur s'ouvre sur `http://localhost:5173`.
3. Connectez-vous avec votre compte (`amir@strateco.fr`).

Pour tester l'**espace Copropriétaire** (portail), utilisez le compte de démo :
`copro@demo.strateco.fr` / `Demo-Copro-2026!` — il est rattaché à un copropriétaire
de Renaissance possédant 3 lots. (Utilisez une fenêtre de navigation privée pour
être connecté AMO et copropriétaire en même temps.)

Les données vivent dans Supabase (en ligne, chiffrées, hébergées en UE) : vous pouvez fermer et rouvrir, rien ne se perd. Tout ce que vous saisissez pendant les tests est conservé.

## Ce qu'il y a à tester, module par module

| Module | Ce qui doit marcher |
|---|---|
| **Tableau de bord** | KPI, 3 vues (Kanban / Galerie / Tableau), filtres Phase & Secteur, création d'une copropriété, export CSV, photo de dossier |
| **Dossier → Projet** | Kanban des tâches ; clic sur la pastille = changer le statut ; assignation |
| **Dossier → Données** | Import Excel/CSV des lots (mapping de colonnes, erreurs signalées), matrice bâtiments × clés (total 1 000 ‰), synthèse modifiable |
| **Dossier → Plans de financement** | Scénario partagé, montants, indicateurs, liste des plans individuels ; **panneau « Prêt collectif — adhésions »** : banque (CEGEE), durée votée en AG, ouverture de la campagne, dossiers reçus (statut, concordance RIB, téléchargement des bulletins signés) ; panneau « Choix de financement (portail) » |
| **Assistant 7 étapes** | Saisie du chiffrage, taux MPR/bonus passoire, profils, éco-PTZ (sliders), cascade, étape 7 : tableau des quote-parts + « Valider », multi-scénarios (dupliquer, partager) |
| **Dossier → Enquête sociale** | Saisie foyer/occupation/RFR → profil calculé ; configuration du questionnaire ; préparation d'envoi |
| **Dossier → Fichiers** | Dépôt, téléchargement, suppression ; checklists cochables ; icône œil = partager le fichier au portail copropriétaire |
| **Dossier → Communications** | Ajout de notes |
| **Vos tâches** | Agrégation par dossier, tri par phase |
| **Consultations** | Publication pour une copro de la plateforme **ou une copro externe** (études non démarrées) ; à la publication, bandeau « X prestataires alertés » ; candidatures du portail (badge Portail, montant, note, offre téléchargeable) + ajout manuel ; statut retenue/non retenue ; clôture |
| **Base prestataires** | Référencer une entreprise (métiers multiples), modifier, suspendre/réactiver, supprimer ; badge « Compte actif » si un compte de connexion est rattaché |
| **Collaborateurs / Paramètres** | Fonction modifiable ; barèmes éditables + duplication millésime ; couleur d'accent ; menu sombre |

## Espace Copropriétaire (portail) — nouveau

Connectez-vous avec le compte de démo ci-dessus. À tester :

| Section | Ce qui doit marcher |
|---|---|
| **Accueil** | Timeline des phases, tuiles quote-part / aides / reste à charge (chiffres du plan individuel du scénario partagé), cartes « À faire » qui reflètent l'avancement réel |
| **Mes quotes-parts** | Bascule entre les lots, cascade quote-part → reste à charge par lot, sélecteur de scénario s'il y en a plusieurs de partagés |
| **Enquête sociale** | Formulaire prérempli si une réponse existe ; « Déterminer mon profil » recalcule et enregistre (visible ensuite côté AMO, onglet Enquête) |
| **Mon financement** | 3 choix : prêt collectif (banque + durée fixées par l'AMO — voir ci-dessous), éco-PTZ individuel (durée au choix, sélection des lots), fonds propres ; le choix transmis apparaît côté AMO |
| **Adhésion au prêt collectif** | Après le choix collectif : formulaire (adhérents, coordonnées, IBAN/BIC validés) → signature au doigt/souris → **bulletins CEGEE pré-remplis et signés** (1 par lot d'habitation) + **mandat SEPA pré-rempli à imprimer/signer à la main** ; concordance IBAN↔RIB vérifiée automatiquement si un RIB (PDF) est téléversé |
| **Mes documents** | Téléversement des pièces justificatives (compteur 0/3 → 3/3) ; téléchargement des documents partagés par l'AMO via l'icône œil |
| **Plan de la copropriété** | Cascade collective du scénario partagé, détail du coût et des aides |

Vérifiez aussi la **confidentialité** : le compte démo ne doit jamais voir les données
des autres copropriétaires (ni leurs réponses d'enquête, ni leurs plans), ni les
tâches internes, ni les scénarios non partagés.

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
   (uniquement celles de SES métiers) → Postuler : montant, note d'intention, offre PDF jointe.
3. **Côté AMO** : la candidature apparaît sur la carte avec le badge « Portail », le montant,
   la note et l'offre téléchargeable → passer le statut à « Retenue ».
4. **Côté prestataire** : « Mes candidatures » passe à « Retenue » ; pour une MOE, l'opération
   apparaît dans « Mes projets » (fiche copro + bâtiments, en lecture).

| Section | Ce qui doit marcher |
|---|---|
| **Consultations en cours** | Seules les consultations EN LIGNE des métiers du prestataire ; carte avec copro (ou « études non démarrées »), phase, J−n ; dépôt d'offre une seule fois par consultation |
| **Mes candidatures** | Historique avec statut (reçue / retenue / non retenue), montant, consultation clôturée signalée |
| **Mes projets** | MOE uniquement, et seulement si retenue : fiche de l'opération + bâtiments. Les diagnostiqueurs / CT / SPS n'ont PAS cette section |

Vérifiez aussi la **confidentialité côté prestataire** : le compte démo ne doit voir
ni les tâches, ni les lots, ni les enquêtes, ni les plans de financement, ni les
autres prestataires de la base — uniquement sa fiche, ses consultations et ses
candidatures (et, une fois retenu en MOE, la fiche copro + bâtiments du projet).

## Limitations connues de la V1 (pas des bugs)

- **Enquête sociale** : l'envoi prépare la campagne mais **n'envoie aucun e-mail réel** — le copropriétaire répond depuis son portail.
- **Portail copropriétaire** : le rattachement d'un copropriétaire à un compte se fait encore côté base (pas de bouton « Inviter » dans l'UI AMO pour l'instant).
- **Adhésion prêt collectif** : CEGEE uniquement (Domofinance viendra) ; personne physique, adhérents 1 et 2 (indivision >2 et SCI : plus tard) ; la signature électronique est une signature simple (dessin + horodatage) — la banque exigeant des originaux papier, les bulletins signés restent imprimables ; la concordance RIB ne se vérifie que sur les RIB PDF (photo/scan image = contrôle manuel).
- **Consultations** : l'alerte e-mail aux prestataires est **simulée** (journalisée mais pas envoyée) tant que la clé d'envoi `RESEND_API_KEY` n'est pas configurée côté Supabase — tout le reste du circuit est réel.
- **Prestataires** : le rattachement d'une entreprise à un compte de connexion se fait encore côté base (comme pour les copropriétaires) ; l'espace « Mes projets » d'une MOE retenue est en lecture (le pilotage des missions loi MOP viendra ensuite).
- **Collaborateurs** : l'ajout d'un compte passe par le tableau de bord Supabase pour l'instant.
- **Import Excel d'un scénario financier** : crée un scénario verrouillé avec les paramètres courants — il ne lit pas encore les chiffres du fichier.
- **Recherche globale** (barre du haut), notifications et bouton Aide : décoratifs pour l'instant.
- **Export PDF des plans individuels / quotes-parts** : pas encore — utilisez l'export CSV ou l'impression navigateur.
- Espace **Syndic** : phase 2 (grisé à la connexion). Les espaces **Copropriétaire** et **MOE & intervenants** sont actifs.

## Pour votre rapport de bugs

Le plus utile pour corriger vite, pour chaque bug :

1. **Où** — écran + copropriété concernée (ex. « Assistant étape 5, dossier Renaissance »)
2. **Quoi** — ce que vous avez fait, ce qui s'est passé, ce que vous attendiez
3. **Chiffres** — si c'est un calcul faux : les montants attendus vs affichés
4. Une capture d'écran si c'est visuel

Envoyez tout en vrac quand vous avez fini le tour — je trie, je corrige et je re-vérifie chaque point.
