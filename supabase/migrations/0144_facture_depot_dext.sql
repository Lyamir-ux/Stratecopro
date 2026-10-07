-- Dépôt automatique des factures et avoirs dans Dext (demande d'Amir du 07/10/2026).
--
-- Dext n'a pas d'API publique de dépôt : la pièce validée lui est envoyée par
-- e-mail (adresse « ventes » du compte Dext), par la fonction envoyer-facture,
-- séparément de l'e-mail du client. Les pièces de test ne partent jamais.
--
-- Ces colonnes gardent la trace du dépôt : une reprise de « Terminer l'envoi »
-- ne redépose pas une pièce déjà déposée (doublon dans Dext).

alter table factures
  add column if not exists dext_statut text check (dext_statut in ('envoye', 'simule', 'erreur')),
  add column if not exists dext_le timestamptz,
  add column if not exists dext_detail text;

comment on column factures.dext_statut is
  'Dépôt dans Dext par e-mail (0144) : envoye | simule (clé Resend absente) | erreur ; null = jamais tenté (pièce de test, ou émise avant 0144).';
comment on column factures.dext_le is 'Date du dernier essai de dépôt dans Dext (0144).';
comment on column factures.dext_detail is 'Détail du dernier essai de dépôt dans Dext (0144).';
