-- 0086 - Prêt collectif : lien de souscription de la banque
--
-- L'adhésion au prêt collectif ne se fait plus dans le portail : le
-- copropriétaire qui clique « Adhérer au prêt collectif » est envoyé sur le
-- parcours en ligne de la banque (Caisse d'Épargne), qui collecte elle-même
-- l'identité, le RIB et les pièces du dossier de prêt. Le portail conserve la
-- trace du choix (choix_financement) : c'est lui qui alimente le suivi AMO.
--
-- Le lien est propre à chaque copropriété (il porte la référence de l'opération
-- côté banque) : il est saisi par l'AMO dans l'onglet Plans de financement.
-- Tant qu'il est vide, le bouton reste actif - le choix est bien transmis - mais
-- le portail annonce que le lien n'est pas encore ouvert plutôt que d'envoyer
-- le copropriétaire nulle part.
--
-- https obligatoire : ce lien est ouvert dans un nouvel onglet depuis le
-- portail, il n'y a aucune raison d'y accepter autre chose.

alter table copro_financement_config
  add column lien_adhesion text check (lien_adhesion is null or lien_adhesion ~* '^https://');

comment on column copro_financement_config.lien_adhesion is
  'Parcours de souscription en ligne de la banque, ouvert depuis le portail au clic sur « Adhérer au prêt collectif ».';
