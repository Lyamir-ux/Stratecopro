-- 0158 - Date limite d'adhésion au prêt collectif, e-mail d'ouverture et dernière relance
-- (retours d'Amir du 11/10/2026).
--
-- Le parcours d'adhésion est entièrement digital : plus de lien de souscription de la banque
-- (la colonne lien_adhesion, 0086, est supprimée : aucune copropriété n'en avait saisi, aucune
-- fonction, vue ni politique ne la lit). Quand la
-- cheffe de projet ouvre les adhésions sur le portail, elle fixe une date limite pour
-- DÉPOSER un dossier d'adhésion au prêt collectif (bulletin + mandat SEPA). L'éco-PTZ
-- individuel et les fonds propres n'ont pas de date limite propre (date_limite_choix, 0117,
-- reste le dernier jour pour choisir ou modifier son financement).
--
-- Elle peut ensuite relancer UNE dernière fois, en proposant une deuxième date limite
-- (date_limite_adhesion_2, postérieure à la première) : c'est elle qui fait foi quand elle existe.
--
-- Passée la date limite, un copropriétaire qui n'a pas déposé son dossier ne peut plus en
-- ouvrir un (ce déclencheur refuse la création d'un bulletin à un compte copropriétaire) ; celui
-- qui l'a déposé (bulletin et mandat SEPA signés) garde la main sur son dossier : il peut encore
-- ajouter des pièces pendant l'instruction, ce que rien ne bloque.
--
-- Traces des envois : e-mail d'ouverture (adhesion_email_*) et dernière relance (relance_adhesion_*).

alter table copro_financement_config drop column if exists lien_adhesion;

alter table copro_financement_config
  add column if not exists date_limite_adhesion date,
  add column if not exists date_limite_adhesion_2 date,
  add column if not exists adhesion_email_le timestamptz,
  add column if not exists adhesion_email_nb integer,
  add column if not exists relance_adhesion_le timestamptz,
  add column if not exists relance_adhesion_nb integer;

alter table copro_financement_config
  drop constraint if exists copro_financement_config_limite_2_apres_1;
alter table copro_financement_config
  add constraint copro_financement_config_limite_2_apres_1
  check (
    date_limite_adhesion_2 is null
    or (date_limite_adhesion is not null and date_limite_adhesion_2 > date_limite_adhesion)
  );

comment on column copro_financement_config.date_limite_adhesion is
  'Dernier jour (inclus, heure de Paris) pour déposer un dossier d''adhésion au prêt collectif depuis le portail ; null = sans limite.';
comment on column copro_financement_config.date_limite_adhesion_2 is
  'Deuxième date limite, fixée par la dernière relance (postérieure à la première) ; elle fait foi quand elle existe.';
comment on column copro_financement_config.adhesion_email_le is
  'Dernier envoi de l''e-mail d''ouverture des adhésions aux copropriétaires.';
comment on column copro_financement_config.adhesion_email_nb is
  'Nombre d''e-mails partis lors de ce dernier envoi.';
comment on column copro_financement_config.relance_adhesion_le is
  'Date de la dernière relance (une seule, avec la deuxième date limite).';
comment on column copro_financement_config.relance_adhesion_nb is
  'Nombre d''e-mails partis lors de la dernière relance.';

create or replace function bulletins_date_limite_adhesion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite date;
begin
  -- seul un compte copropriétaire est tenu par la date limite ; l'équipe garde la main
  if exists (select 1 from profiles where user_id = auth.uid() and role = 'copro') then
    select coalesce(fc.date_limite_adhesion_2, fc.date_limite_adhesion) into v_limite
    from copro_financement_config fc
    where fc.copro_id = new.copro_id;

    if v_limite is not null and (now() at time zone 'Europe/Paris')::date > v_limite then
      raise exception 'La date limite d''adhésion au prêt collectif (%) est passée : contactez votre AMO.',
        to_char(v_limite, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function bulletins_date_limite_adhesion() from anon, public;

drop trigger if exists trg_bulletins_date_limite on bulletins;
create trigger trg_bulletins_date_limite
  before insert on bulletins
  for each row execute function bulletins_date_limite_adhesion();
