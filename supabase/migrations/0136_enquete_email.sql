-- 0136 - Enquête : e-mail aux copropriétaires vérifiable et modifiable avant l'envoi
--
-- Idée d'Amir du 04/10/2026 (13:28) : « un petit bouton avant l'envoi des
-- questionnaires pour vérifier le mail envoyé aux copropriétaires, afin de le
-- modifier si nécessaire ». Jusqu'ici le bouton de l'onglet Enquête ne faisait
-- que marquer la campagne « préparée », sans e-mail. Désormais l'envoi part
-- réellement (edge function creer-espace-coproprietaire, mode enquête) et
-- l'AMO relit l'e-mail, en modifie l'objet et le message, avant d'envoyer.
--
-- Objet et message null = texte proposé par l'application (il reprend le nom
-- de la copropriété). La date limite, jusqu'ici saisie sans être enregistrée,
-- est rappelée dans l'e-mail. email_envoye_le / email_envoye_nb tracent le
-- dernier envoi réel ; sent_at et statut gardent leur sens (campagne lancée),
-- y compris pour les trois campagnes « préparées » sans e-mail avant 0136.

alter table enquetes
  add column if not exists date_limite date,
  add column if not exists email_sujet text,
  add column if not exists email_message text,
  add column if not exists email_envoye_le timestamptz,
  add column if not exists email_envoye_nb integer;

alter table enquetes drop constraint if exists enquetes_email_sujet_longueur;
alter table enquetes add constraint enquetes_email_sujet_longueur
  check (char_length(email_sujet) <= 150);
alter table enquetes drop constraint if exists enquetes_email_message_longueur;
alter table enquetes add constraint enquetes_email_message_longueur
  check (char_length(email_message) <= 4000);

comment on column enquetes.date_limite is
  'Date limite de réponse rappelée dans l''e-mail d''envoi du questionnaire (0136).';
comment on column enquetes.email_sujet is
  'Objet de l''e-mail d''envoi du questionnaire, modifié par l''AMO ; null = objet proposé (0136).';
comment on column enquetes.email_message is
  'Message de l''e-mail d''envoi du questionnaire, modifié par l''AMO ; null = message proposé (0136).';
comment on column enquetes.email_envoye_le is
  'Dernier envoi réel du questionnaire par e-mail (0136).';
comment on column enquetes.email_envoye_nb is
  'Nombre d''e-mails partis lors du dernier envoi du questionnaire (0136).';
