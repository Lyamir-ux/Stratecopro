# Logique du logiciel AMOA Pro

*Document de rétro-documentation fonctionnelle — réalisé en lecture seule*
*Objectif : reconstruire et améliorer AMOA Pro dans une nouvelle version intégrée au site de Strateco*

---

## 1. Vue d'ensemble

### 1.1 Objet du logiciel
AMOA Pro (app.amoa.fr) est un progiciel SaaS d'assistance à maîtrise d'ouvrage (AMO) destiné à piloter des projets de **rénovation énergétique de copropriétés**. Il couvre l'ensemble du cycle : diagnostic, études, montage du plan de financement collectif et individuel, ingénierie financière (mobilisation des aides), communication avec les copropriétaires et suivi des travaux.

### 1.2 Utilisateurs
- **Opérateurs AMO / bureaux d'études** (ex. Strateco) : pilotage complet du dossier.
- **Collaborateurs internes** : gérés via « Votre entreprise > Collaborateurs ».
- **Syndics / gestionnaires** : référencés sur chaque dossier copropriété.
- **Copropriétaires** : accès à un portail dédié (enquête sociale, fichiers partagés, aides individuelles).

### 1.3 Processus métier global
1. Création/sélection d'une copropriété (Phase : Diagnostic → Études → Travaux).
2. Recensement des copropriétaires et lots, saisie des tantièmes par bâtiment.
3. Enquête sociale (profils MaPrimeRénov', revenus) → portail copropriétaire.
4. Définition de scénarios de travaux et chiffrage (travaux, honoraires, aléas).
5. **Ingénierie financière** : application des dispositifs d'aides, calcul des subventions collectives et individuelles, prêts, reste à charge par copropriétaire.
6. Génération des plans de financement individuels et envoi du recensement.
7. Communication et suivi (notes de projet, fichiers, checklists de pièces).

### 1.4 Arborescence des menus
- **Votre entreprise** → Collaborateurs
- **Votre activité** → Copropriétés ; Vos tâches
- **Dossier copropriété** (par copropriété ouverte) :
  - Projet (Kanban Diagnostic/Études/Travaux + Liste des tâches)
  - Données de la copro → Copropriétaires & lots ; Bâtiments & tantièmes
  - Plans de financement
  - Enquête sociale → Résultats ; Portail copropriétaire
  - Communications (Notes du projet)
  - Fichiers ; Fichiers copropriétaires (+ Checklists de pièces)
  - Financement (scénarios) → Ingénierie financière (paramétrage 7 étapes, Configuration des prêts, plans) → Envoi recensement dynamique

---

## 2. Description écran par écran

### 2.1 Liste des copropriétés (/coproprietes)
Tableau des dossiers (ex. 5 copropriétés). Colonnes : nom, phase, étiquette énergétique, nb de lots, utilisateurs. Action « Ouvrir ».

### 2.2 Projet (/projet)
Vue **Kanban** par phase (Diagnostic, Études, Travaux) avec vignettes de tâches, et onglet **Liste des tâches** avec filtres. Pas de bouton de modification utilisé (lecture seule).

### 2.3 Copropriétaires & lots (/coproprietaires-et-lots)
Liste des copropriétaires (nom anonymisé, adresse, type) et des lots (n°, bâtiment, usage : Habitation/Garage/Caves/Autres, tantièmes). Compteurs en tête (nb copropriétaires, nb lots).

### 2.4 Bâtiments & tantièmes (/batiments-tantiemes)
Matrice lots × bâtiments. Clés de répartition (ex. « MUN », par escalier, par bâtiment). Totaux par colonne.

### 2.5 Plans de financement (/plans-financement)
Liste des plans individuels (Nom, Copropriétaire, Lots associés). Lien vers le détail PDF du plan par copropriétaire.

### 2.6 Communications (/communications)
Fil de notes du projet (messages datés).

### 2.7 Fichiers (/fichiers) et Fichiers copropriétaires (/fichiers-coproprietaires)
Grille de dossiers. **Checklists de pièces** par dispositif : CEE (Avant/Après), MPR Copro (Après), MPR Copropriété 2024, Éco-PTZ 2024.

### 2.8 Enquête — Résultats (/enquete-resultats)
Onglets Copropriétaires / Lots. Modal de détail : Profil MPR (Bleu/Jaune/Violet/Rose), type de copropriété, revenus, etc.

### 2.9 Portail copropriétaire (/coproprietaire-portail)
Espace individuel : Enquête sociale, Fichiers partagés, Vos aides individuelles.

### 2.10 Financement (/financement)
Liste des scénarios par dossier (ex. NOUVELLE CITE : Colonnes, Option relamping, Scénario 2 ; RENAISSANCE : Rénovation > 35%, Rénovation sans PAS). Statut « Partagé » ON/OFF. Accès à l'ingénierie financière.

### 2.11 Ingénierie financière (/ingenierie-financiere/...)
Assistant de paramétrage en **7 étapes** (chiffrage travaux → répartition → aides collectives → aides individuelles → prêts → reste à charge → validation). Bouton « Valider » NON cliqué (recalcule les quote-parts). Écran **Configuration des prêts** et **tableau des plans** (≈27 colonnes). Détail PDF par plan.

### 2.12 Envoi recensement dynamique (/envoi-recensement-dynamique/...)
Préparation et envoi du recensement aux copropriétaires (non envoyé — lecture seule).

---

## 3. Règles de gestion et calculs

- **Étiquette énergétique** : A→G ; gain de classe via amélioration du Cep.
- **Seuil 35 %** : un gain énergétique > 35 % débloque des taux d'aide majorés.
- **Quote-part individuelle** = (tantièmes du lot / total de la clé de répartition) × montant à répartir.
- **Reste à charge** = coût total − subventions collectives − subventions individuelles − prêts mobilisés (cascade).
- **Coût d'un prêt** = (coût total pour 1000 € × montant emprunté / 1000) ; mensualité = coût total / durée en mois.
- **Éco-PTZ** : plafond 50 000 €/logement, durée jusqu'à 20 ans.
- **Copropriété fragile** : taux d'impayés > 8 %.

---

## 4. Ingénierie financière (section détaillée)

### 4.1 Dispositifs mobilisés
MaPrimeRénov' Copropriétés (MPR Copro), MaPrimeRénov' individuelle (profils Bleu/Jaune/Violet/Rose), CEE (Certificats d'Économies d'Énergie), Éco-PTZ collectif, aides locales, Fonds (Alur).

### 4.2 Paramètres de prêts (relevés)
- **Éco-PTZ** : 1 036 € pour 1 000 € empruntés ; assiette 100 % ; durée jusqu'à 20 ans ; plafond 50 000 €/logement.
- **Avance de subvention** : 1 054,50 € pour 1 000 € ; durée max 36 mois ; prise en charge sub. individuelle paramétrable (0 / 70 / 100 %).
- **Prêt complémentaire** : coûts variables selon la durée (3 à 20 ans).

### 4.3 Assistant 7 étapes
Chiffrage → clés de répartition (PC1 / Escalier / Bâtiment) → subventions collectives → subventions individuelles → prêts → reste à charge → validation. La dernière étape recalcule l'ensemble des quote-parts (action non exécutée).

---

## 5. Workflow / parcours utilisateur

### 5.1 Dossier Nouvelle Cité (Phase Travaux)
Copropriété de grande taille, classe F, ~284/351 lots, 158 copropriétaires, 9 bâtiments. Scénario « Colonnes » chiffré à 1 653 782,56 € TTC. Plans individuels générés, recensement préparé. Illustre un dossier en phase avancée (Travaux).

### 5.2 Dossier Renaissance (Phase Études)
Copropriété de petite taille, classe E, 14 logements (40 lots), 1 bâtiment. Scénario « Rénovation > 35 % » : projet 454 101,48 € TTC (travaux 327 944,81 € + honoraires 92 156,67 € + aléas 34 000 €), déductions 187 727,40 €, Fonds 41 283 €, subventions préfinançables 125 078,40 €, CEE 21 366 €. Illustre le montage financier en phase amont (Études).

---

## 6. Recommandations d'amélioration
- Centraliser les barèmes des aides dans une table paramétrable versionnée (millésime annuel MPR/CEE/Éco-PTZ).
- Sécuriser les recalculs (étape 7) avec un mode simulation/brouillon avant validation.
- API d'export structuré (plans de financement, dictionnaire de champs) pour intégration au site Strateco.
- Historisation/audit des modifications de paramètres financiers.
- Améliorer l'ergonomie du panneau de menu latéral (repli intempestif des sous-menus).

---
*Données personnelles anonymisées (Copropriétaire 1, 2, …). Paramètres financiers conservés intégralement.*
