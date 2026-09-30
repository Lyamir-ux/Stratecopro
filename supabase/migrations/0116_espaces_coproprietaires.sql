-- 0116 - Espaces copropriétaires : l'AMO ouvre l'accès au portail
--
-- Feedback Amir du 30/09/2026 (14:13) : « Des copropriétaires ont changé mais il
-- n'y a pas d'espace copropriétaires créé pour ces nouveaux entrants ». En fait
-- aucun copropriétaire n'avait d'espace : le portail existe, mais rien ne créait
-- le compte ni ne le reliait à la fiche (coproprietaires.user_id).
--
-- Règles tranchées par Amir le 30/09 :
--   • l'espace se crée seulement sur un clic de l'AMO (une fiche, ou « créer
--     les espaces manquants » d'un dossier), jamais automatiquement, pas même
--     au changement de propriétaire ;
--   • le copropriétaire reçoit un e-mail avec un lien pour choisir son mot de
--     passe (page /reinitialisation existante) ;
--   • une adresse qui appartient déjà à un compte AMO, syndic ou prestataire
--     est refusée et signalée : un compte garde un seul rôle.
-- La création du compte passe par l'edge function creer-espace-coproprietaire
-- (API d'administration de l'authentification) ; cette migration ne porte que
-- la trace de l'invitation et les deux lectures dont elle et l'écran ont besoin.

alter table coproprietaires
  add column if not exists espace_invite_le timestamptz,
  add column if not exists espace_invite_par uuid references auth.users (id) on delete set null;

comment on column coproprietaires.espace_invite_le is
  'Dernier envoi de l''e-mail d''accès au portail (création, rattachement ou renvoi par l''AMO).';
comment on column coproprietaires.espace_invite_par is
  'Compte AMO qui a envoyé le dernier e-mail d''accès au portail.';

-- Compte existant pour une adresse e-mail, avec son rôle : réservé à l'edge
-- function (service_role), l'annuaire des comptes n'a pas à être lisible.
create or replace function compte_par_email(p_email text)
returns table (user_id uuid, role app_role, derniere_connexion timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, p.role, u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
$$;

revoke execute on function compte_par_email(text) from public, anon, authenticated;
grant execute on function compte_par_email(text) to service_role;

-- État de l'espace de chaque copropriétaire présent d'un dossier (AMO seul) :
--   actif      compte relié, déjà connecté au moins une fois ;
--   invite     compte relié, lien pas encore utilisé ;
--   a_creer    adresse libre (ou compte copropriétaire d'un autre dossier, à relier) ;
--   sans_email aucune adresse sur la fiche ;
--   email_pris adresse d'un compte AMO, syndic ou prestataire (role_compte).
-- Les fiches sortantes (0090) n'ont plus d'espace et ne sont pas renvoyées.
create or replace function espaces_coproprietaires(p_copro_id uuid)
returns table (coproprietaire_id uuid, etat text, invite_le timestamptz, role_compte app_role)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    cp.id,
    case
      when cp.user_id is not null and u.last_sign_in_at is not null then 'actif'
      when cp.user_id is not null then 'invite'
      when nullif(btrim(cp.email), '') is null then 'sans_email'
      when x.role is not null and x.role <> 'copro' then 'email_pris'
      else 'a_creer'
    end,
    cp.espace_invite_le,
    x.role
  from coproprietaires cp
  left join auth.users u on u.id = cp.user_id
  left join lateral (
    select p.role
    from auth.users u2
    join public.profiles p on p.user_id = u2.id
    where lower(u2.email) = lower(btrim(cp.email))
    limit 1
  ) x on cp.user_id is null
  where cp.copro_id = p_copro_id
    and cp.sortant_le is null
    and is_amo();
$$;

revoke execute on function espaces_coproprietaires(uuid) from public, anon;
grant execute on function espaces_coproprietaires(uuid) to authenticated;
