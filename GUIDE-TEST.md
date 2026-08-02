# Guide de test — Strat Eco Pro (V1 locale)

## Démarrer

1. Double-cliquez sur **`demarrer.bat`** (à la racine du projet). Une fenêtre noire s'ouvre — laissez-la ouverte.
2. Le navigateur s'ouvre sur `http://localhost:5173`.
3. Connectez-vous avec votre compte (`amir@strateco.fr`).

Les données vivent dans Supabase (en ligne, chiffrées, hébergées en UE) : vous pouvez fermer et rouvrir, rien ne se perd. Tout ce que vous saisissez pendant les tests est conservé.

## Ce qu'il y a à tester, module par module

| Module | Ce qui doit marcher |
|---|---|
| **Tableau de bord** | KPI, 3 vues (Kanban / Galerie / Tableau), filtres Phase & Secteur, création d'une copropriété, export CSV, photo de dossier |
| **Dossier → Projet** | Kanban des tâches ; clic sur la pastille = changer le statut ; assignation |
| **Dossier → Données** | Import Excel/CSV des lots (mapping de colonnes, erreurs signalées), matrice bâtiments × clés (total 1 000 ‰), synthèse modifiable |
| **Dossier → Plans de financement** | Scénario partagé, montants, indicateurs, liste des plans individuels |
| **Assistant 7 étapes** | Saisie du chiffrage, taux MPR/bonus passoire, profils, éco-PTZ (sliders), cascade, étape 7 : tableau des quote-parts + « Valider », multi-scénarios (dupliquer, partager) |
| **Dossier → Enquête sociale** | Saisie foyer/occupation/RFR → profil calculé ; configuration du questionnaire ; préparation d'envoi |
| **Dossier → Fichiers** | Dépôt, téléchargement, suppression ; checklists cochables |
| **Dossier → Communications** | Ajout de notes |
| **Vos tâches** | Agrégation par dossier, tri par phase |
| **Consultations** | Publication, ajout manuel de candidatures, statut retenue/non retenue, clôture |
| **Collaborateurs / Paramètres** | Fonction modifiable ; barèmes éditables + duplication millésime ; couleur d'accent ; menu sombre |

## Limitations connues de la V1 (pas des bugs)

- **Enquête sociale** : l'envoi prépare la campagne mais **n'envoie aucun e-mail réel** (viendra avec le portail copropriétaire).
- **Consultations** : les candidatures se saisissent à la main (le portail intervenant est en phase 2).
- **Collaborateurs** : l'ajout d'un compte passe par le tableau de bord Supabase pour l'instant.
- **Import Excel d'un scénario financier** : crée un scénario verrouillé avec les paramètres courants — il ne lit pas encore les chiffres du fichier.
- **Recherche globale** (barre du haut), notifications et bouton Aide : décoratifs pour l'instant.
- **Export PDF des plans individuels** : pas encore — utilisez l'export CSV ou l'impression navigateur.
- Espaces **Syndic / MOE / Copropriétaire** : phase 2 (grisés à la connexion).

## Pour votre rapport de bugs

Le plus utile pour corriger vite, pour chaque bug :

1. **Où** — écran + copropriété concernée (ex. « Assistant étape 5, dossier Renaissance »)
2. **Quoi** — ce que vous avez fait, ce qui s'est passé, ce que vous attendiez
3. **Chiffres** — si c'est un calcul faux : les montants attendus vs affichés
4. Une capture d'écran si c'est visuel

Envoyez tout en vrac quand vous avez fini le tour — je trie, je corrige et je re-vérifie chaque point.
