-- Plusieurs e-mails par prestataire (demande d'Amir, 27/09/2026).
--
-- `email` reste l'adresse principale : identifiant du futur compte de
-- connexion, unique entre entreprises. `emails_secondaires` (liste) remplace
-- l'unique `email_secondaire` (0035) : ces adresses reçoivent en copie toutes
-- les alertes de l'entreprise (consultations, décisions, messages, rappels
-- d'agrément). Pas d'adresse en copie sans adresse principale : l'appli fait
-- monter la première en principale.
-- Aucune donnée perdue : email_secondaire n'était renseigné sur aucune fiche
-- (reprise quand même, par sûreté).

alter table prestataires add column emails_secondaires text[] not null default '{}';

update prestataires
set emails_secondaires = array[lower(trim(email_secondaire))]
where coalesce(trim(email_secondaire), '') <> '';

alter table prestataires drop column email_secondaire;

alter table prestataires add constraint prestataires_emails_principal_chk
  check (email is not null or cardinality(emails_secondaires) = 0);

comment on column prestataires.emails_secondaires is
  'Adresses en copie de toutes les alertes de l''entreprise (0106) - l''adresse principale reste `email`.';

-- Le prestataire gère lui-même ses adresses en copie (comme l'ancienne
-- adresse secondaire) ; métiers, référencement et raison sociale restent AMO.
create or replace function protege_prestataire_own()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  modifiables text[] := array[
    'email', 'emails_secondaires', 'telephone', 'adresse', 'ville',
    'code_postal', 'site_web', 'siret',
    'logo_path', 'contact_nom', 'updated_at'
  ];
begin
  if is_amo() then return new; end if;
  if to_jsonb(new) - modifiables <> to_jsonb(old) - modifiables then
    raise exception 'Champs réservés à l''équipe AMO (métiers, référencement, raison sociale…)';
  end if;
  return new;
end;
$$;
