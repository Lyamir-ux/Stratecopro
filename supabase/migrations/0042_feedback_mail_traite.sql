-- 0042 — Notification mail au traitement d'un feedback
-- Quand l'équipe AMO clique « Traiter » sur un retour (Paramètres), l'app
-- envoie automatiquement un mail de compte rendu à l'auteur du retour via
-- l'edge function notifier-feedback-traite (adresse lue dans auth.users).
-- Ces deux colonnes tracent le résultat de l'envoi, sur le modèle de
-- candidatures.decision_email_statut (migration 0035).
alter table feedbacks add column traite_email_statut text
  check (traite_email_statut in ('envoye', 'simule', 'erreur', 'sans_email'));
alter table feedbacks add column traite_email_le timestamptz;
