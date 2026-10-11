-- 0160 - État des espaces : l'adresse d'un compte AMO actif n'est plus « prise » (suite de 0159,
-- 11/10/2026).
--
-- Depuis 0159, une fiche qui reçoit l'adresse d'un compte AMO actif lui est reliée par le
-- déclencheur. Reste le cas d'une fiche qui porte déjà cette adresse sans être reliée (adresse
-- saisie avant la création du compte, ou quand il était inactif) : elle apparaissait « Adresse
-- prise », sans bouton. Elle est maintenant « à créer » : « Créer l'espace » (ou l'envoi d'une
-- campagne) la relie au compte AMO (creer-espace-coproprietaire v6). Un compte AMO inactif, un
-- syndic ou un prestataire gardent l'adresse « prise ».

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
      when x.role is not null and x.role <> 'copro' and not (x.role = 'amo' and x.active) then 'email_pris'
      else 'a_creer'
    end,
    cp.espace_invite_le,
    coalesce(pr.role, x.role)
  from coproprietaires cp
  left join auth.users u on u.id = cp.user_id
  left join public.profiles pr on pr.user_id = cp.user_id
  left join lateral (
    select p.role, p.active
    from auth.users u2
    join public.profiles p on p.user_id = u2.id
    where lower(u2.email) = premiere_adresse(cp.email)
    limit 1
  ) x on cp.user_id is null
  where cp.copro_id = p_copro_id
    and cp.sortant_le is null
    and is_amo();
$$;
