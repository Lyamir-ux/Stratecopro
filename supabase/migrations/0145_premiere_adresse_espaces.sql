-- 0145 - Espaces copropriétaires : seule la première adresse e-mail d'une fiche compte
--
-- Retour d'Amir du 07/10/2026 (17:34, onglet Données) : « il se peut qu'il y ait
-- plusieurs adresses mail référencées. Il ne faut prendre en compte que la première
-- adresse mail donnée pour créer l'espace et envoyer l'e-mail ». 28 fiches portent
-- « a@x.fr / b@y.fr » ou « a@x.fr ; b@y.fr » dans le champ e-mail.
--
-- premiere_adresse() extrait la première adresse (même règle que premiereAdresse()
-- de src/lib/adresseEmail.ts et que l'edge function creer-espace-coproprietaire) ;
-- espaces_coproprietaires() s'en sert pour l'état de l'espace (sans_email si le
-- champ ne contient aucune adresse, email_pris si la première appartient à un
-- compte AMO, syndic ou prestataire).

create or replace function premiere_adresse(p_email text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(substring(p_email from '[A-Za-z0-9._%+''-]+@[A-Za-z0-9-]+(?:[.][A-Za-z0-9-]+)+'));
$$;

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
      when premiere_adresse(cp.email) is null then 'sans_email'
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
    where lower(u2.email) = premiere_adresse(cp.email)
    limit 1
  ) x on cp.user_id is null
  where cp.copro_id = p_copro_id
    and cp.sortant_le is null
    and is_amo();
$$;

revoke execute on function espaces_coproprietaires(uuid) from public, anon;
grant execute on function espaces_coproprietaires(uuid) to authenticated;
