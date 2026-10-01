-- 0123 - Accès des prestataires : l'AMO crée le compte depuis la fiche
--
-- Question d'Amir du 01/10/2026 (fiche « Best Ryan ») : « avec son adresse
-- mail, est-ce qu'un accès lui a été créé ? ». Non : aucune entreprise réelle
-- n'avait de compte, le rattachement (prestataires.user_id) se faisait en SQL,
-- alors que les alertes de consultation invitent à se connecter à l'espace
-- prestataire.
--
-- Même mécanique que les espaces copropriétaires (0116, règles du 30/09) :
--   • l'accès se crée seulement sur un clic de l'AMO (« Créer l'accès » dans la
--     fiche de la Base prestataires), jamais à la création de la fiche ;
--   • l'entreprise reçoit à son e-mail principal un lien pour choisir son mot
--     de passe (/activer-espace puis /reinitialisation) ;
--   • une adresse qui appartient déjà à un compte AMO, syndic ou copropriétaire,
--     ou au compte d'une autre entreprise, est refusée : un compte garde un seul
--     rôle et ne voit qu'une entreprise (my_prestataire_id).
-- La création du compte passe par l'edge function creer-espace-prestataire ;
-- cette migration porte la trace de l'invitation, la lecture de l'état et le
-- rattachement par le serveur.

alter table prestataires
  add column if not exists espace_invite_le timestamptz,
  add column if not exists espace_invite_par uuid references auth.users (id) on delete set null;

comment on column prestataires.espace_invite_le is
  'Dernier envoi de l''e-mail d''accès à l''espace prestataire (création, rattachement ou renvoi par l''AMO).';
comment on column prestataires.espace_invite_par is
  'Compte AMO qui a envoyé le dernier e-mail d''accès à l''espace prestataire.';

-- Le serveur (edge function, service_role) relie le compte et trace l'envoi :
-- user_id et espace_invite_* restent hors de portée du prestataire.
create or replace function protege_prestataire_own()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  modifiables text[] := array[
    'email', 'emails_secondaires', 'telephone', 'adresse', 'ville',
    'code_postal', 'site_web', 'siret',
    'logo_path', 'contact_nom', 'updated_at',
    'types', 'departements', 'ne_pas_consulter', 'ne_pas_consulter_le'
  ];
begin
  if is_amo() or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if to_jsonb(new) - modifiables <> to_jsonb(old) - modifiables then
    raise exception 'Champs réservés à l''équipe AMO (raison sociale, référencement…)';
  end if;
  if cardinality(new.types) = 0 then
    raise exception 'Cochez au moins une prestation couverte';
  end if;
  return new;
end;
$$;

revoke execute on function public.protege_prestataire_own() from anon, authenticated;

-- État de l'accès de chaque fiche de la Base prestataires (AMO seul) :
--   actif      compte relié, déjà connecté au moins une fois ;
--   invite     compte relié, lien pas encore utilisé ;
--   a_creer    adresse libre (ou compte prestataire relié à aucune fiche) ;
--   sans_email aucune adresse principale ;
--   email_pris adresse d'un compte AMO, syndic, copropriétaire (role_compte),
--              ou d'un compte prestataire déjà relié à autre_fiche.
-- email_compte : identifiant de connexion du compte relié - il ne suit pas
-- l'e-mail de la fiche si celui-ci change ensuite.
create or replace function espaces_prestataires()
returns table (
  prestataire_id uuid,
  etat text,
  invite_le timestamptz,
  email_compte text,
  role_compte app_role,
  autre_fiche text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id,
    case
      when p.user_id is not null and u.last_sign_in_at is not null then 'actif'
      when p.user_id is not null then 'invite'
      when nullif(btrim(p.email), '') is null then 'sans_email'
      when x.role is not null and (x.role <> 'presta' or x.autre_fiche is not null) then 'email_pris'
      when x.user_id is not null and x.role is null then 'email_pris'
      else 'a_creer'
    end,
    p.espace_invite_le,
    u.email::text,
    x.role,
    x.autre_fiche
  from prestataires p
  left join auth.users u on u.id = p.user_id
  left join lateral (
    select
      u2.id as user_id,
      pr.role,
      (select o.raison_sociale from prestataires o where o.user_id = u2.id and o.id <> p.id limit 1) as autre_fiche
    from auth.users u2
    left join public.profiles pr on pr.user_id = u2.id
    where lower(u2.email) = lower(btrim(p.email))
    limit 1
  ) x on p.user_id is null
  where is_amo();
$$;

revoke execute on function espaces_prestataires() from public, anon;
grant execute on function espaces_prestataires() to authenticated;
