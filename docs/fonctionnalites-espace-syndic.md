# Espace syndic - inventaire des fonctionnalités

*Strat Eco Pro - état au 9 septembre 2026, établi à partir du code en production.*

## Accès et périmètre

- Connexion par e-mail et mot de passe. Les comptes créés par le dirigeant reçoivent un mot de passe provisoire, à remplacer à la première connexion via « Mot de passe oublié ».
- Chaque compte appartient à une enseigne (cabinet de syndic) avec un rôle : direction, gestionnaire, administratif ou comptable.
- Tous les membres d'une enseigne voient le même portefeuille. La direction ouvre tous les dossiers ; les autres n'ouvrent que les dossiers dont ils sont le gestionnaire désigné. Les dossiers verrouillés apparaissent grisés et non cliquables.
- Rattachement automatique : un compte accède à un dossier dès que son e-mail est celui du gestionnaire renseigné par l'équipe AMO dans l'onglet Données de la copropriété.
- Widget de remarques flottant, commun à tous les espaces, pour remonter un feedback à l'équipe AMO.

## Portefeuille

- **Vue Bulles** : une bulle par gestionnaire (initiales, total de logements, montant d'opération), entourée de ses copropriétés. La couleur d'une copropriété suit l'avancement du dossier d'après les tâches validées.
- **Vue Kanban** : une colonne par étape - futur projet, diagnostic, études, travaux - avec barre d'avancement par dossier.
- **Vue Tableau** : colonnes triables - phase, DPE avant/après, logements, montant TTC, honoraires du syndic, avancement, tâches en retard.
- Recherche par gestionnaire ou par copropriété.
- Export CSV du portefeuille (ouvrable dans Excel).
- Nom de l'enseigne affiché en titre du portefeuille.

## Vos tâches

- Plan d'accompagnement du syndic par copropriété et par phase : cahier des charges MOE, intervenants annexes, transmission des documents, comptes d'aides, AG, registre de copropriété, SIRET, fiche État, résolution de prêt, dommages-ouvrage, documents signés, compte travaux, dossiers d'aides, appels de fonds. Vingt et une tâches semées automatiquement selon la phase du dossier.
- Statut à faire / en cours / fait, cochable en un clic.
- Échéance datée par tâche ; les tâches dont l'échéance est dépassée remontent en tête et alimentent le rapport mensuel.

## Messages

- Un fil de discussion par copropriété, partagé avec l'onglet Communications de l'équipe AMO.
- Pastille de messages non lus dans le menu ; l'ouverture d'un fil marque ses messages comme lus.
- Chaque envoi alerte l'équipe AMO par e-mail (sans le contenu du message), avec lien profond vers le fil.

## Fiche d'une copropriété - sept onglets

1. **Projet** : les tâches du syndic en kanban par phase, cochables directement ; badge de phase suivant l'avancement.
2. **Données de la copro** : bâtiments, copropriétaires et lots, en lecture seule (l'import et l'édition restent côté AMO).
3. **Enquête sociale** : répartition des profils MaPrimeRénov' en comptages, état des réponses et de la campagne, questionnaire. Sans revenu fiscal ni profil nominatif (données réservées à l'AMO et à l'intéressé).
4. **Financement** : mode de financement du reste à charge choisi par chaque copropriétaire depuis son portail (fonds propres, éco-PTZ collectif, éco-PTZ individuel). Le gestionnaire peut saisir un choix quand il a l'information en direct ; la saisie est tracée et le copropriétaire garde la main.
5. **Documents à produire** (montage bancaire) : parcours par montage - éco-PTZ collectif CEGEE, ANAH - MaPrimeRénov' Copro, CEE, EMS & Climaxion et dommages-ouvrage ROEDERER - en étapes, chaque étape listant les documents attendus. Dépôt des pièces par clic ou glissé-déposé sur la ligne du document ; les pièces Strat Eco et maîtrise d'œuvre sont affichées pour suivi. Trois formulaires pré-remplis depuis la base projet : fiche de renseignements avant AG et onglet « Demande de prêt » du classeur CEGEE, récapitulatif des coordonnées du syndic et de la copropriété pour la cotation CEE ; une saisie dans l'un complète les autres. Le dossier CEE suit trois étapes : demande de cotation (récapitulatif, CCTP/DPGF, audit et sources, attestations RGE, PV d'AG travaux), validation des aides (AIF pré-remplie par Strat Eco puis signée à la main et téléversée par le syndic, avis d'imposition confidentiels, rapport COFRAC 1), demande de solde (PV de réception, attestation sur l'honneur pré-remplie puis signée par le syndic, rapport COFRAC 2). Le dossier ANAH reprend les 15 pièces de la checklist MaPrimeRénov' en trois volets (copropriété et gouvernance, projet de travaux, volet social et plan de financement) ; les avis d'imposition et la liste des primes individuelles y sont confidentiels : invisibles et non téléchargeables par le syndic, y compris dans l'onglet Fichiers. Le dossier EMS & Climaxion (Eurométropole de Strasbourg et Région Grand Est, checklist commune de 25 pièces) suit cinq étapes : copropriété, lancement de l'AMO, études et maîtrise d'œuvre, travaux, aides individuelles ; mêmes règles de confidentialité pour les avis d'imposition et le tableau des primes individuelles. Quatre pièces reposent sur un modèle fourni par Strat Eco (attestation logement décent, mandat de délégation de dépôt, attestation et rapport de conformité des offres). **Pièces partagées** : une pièce attendue par plusieurs dispositifs (attestation de mise à jour du registre, PV d'AG, RIB du compte travaux, convention AMO, audit, plan de financement définitif…) n'est déposée qu'une fois. Le type de document choisi au dépôt, depuis l'onglet Fichiers ou depuis un dossier de Documents à produire, coche la pièce dans toutes les checklists de l'AMO et ajoute le fichier aux dossiers de montage qui attendent le même document. Le menu des types de document propose un nom pour chaque pièce de chaque checklist.
6. **Fichiers** : base documentaire du dossier - ce que l'AMO et la maîtrise d'œuvre ont déposé et ce que le syndic a fourni. Cartes de dossiers avec bulles d'aide, aperçu sans téléchargement ou téléchargement. Dépôt identique à celui de l'AMO : sélecteur de dossier, glissé-déposé, archives zip (extraire ou conserver), renommage assisté. Le syndic ne retire que ses propres dépôts.
7. **Suivi financier** : reprise ligne à ligne du plan de financement définitif validé (lots de travaux avec leur entreprise, MOE, frais annexes) avec le montant voté. Saisie du montant payé à chaque situation d'entreprise (1 à 10) ; total payé et montant restant calculés automatiquement.

## Automatismes

- **Rapport mensuel de portefeuille** par e-mail : la direction reçoit l'état de toute son enseigne, chaque gestionnaire celui de ses copropriétés. Un envoi par enseigne et par mois, relançable à la main depuis les Paramètres de l'équipe AMO.
- **Alertes e-mail** au syndic sur les événements du dossier (dépôt de document, consultation, message).
- **Tâches semées côté serveur** à la première ouverture d'un dossier, avec les phases déjà franchies marquées faites.

## Aperçu AMO

- L'équipe AMO ouvre le même espace en aperçu, avec un filtre par enseigne (et « Hors organisation »).
- Clic sur un gestionnaire pour entrer dans sa vue exacte, sur toutes les sections ; l'AMO peut cocher ses tâches à sa place, l'action est tracée.

## Administration côté équipe AMO (Paramètres, Organisations)

- Création et renommage des enseignes (clic sur le nom).
- Ajout d'un membre par nom + e-mail (compte créé et rattaché à l'enseigne, réservé au dirigeant) ou rattachement d'un compte existant.
- Rôle de chaque membre modifiable ; nombre de dossiers ouvrables affiché par membre ; renommage d'un membre au clic sur son nom.
- Rattachement et détachement des copropriétés à l'enseigne.
