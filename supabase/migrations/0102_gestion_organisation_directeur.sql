-- 0102 - Feedback de Pierrot LEFOU (directeur de SYNDIC 3000 GRAND EST) du
-- 24/09/2026 : « sur le côté gauche avoir la possibilité de gérer mon
-- organisation en tant que directeur d'organisation, créer des gestionnaires
-- et/ou des administratifs, leur rattacher des copropriétés (RLS) ».
--
-- Arbitrage d'Amir (25/09/2026) : la direction d'une enseigne crée les comptes
-- de SA seule enseigne (gestionnaire, administratif, comptable - jamais un
-- autre directeur, désigné par Strat Eco), change leurs rôles et leur rattache
-- des copropriétés. Le dirigeant de Strat Eco est prévenu par e-mail de chaque
-- compte créé (edge function creer-collaborateur, étendue).
--
-- Tout passe par des fonctions security definer qui contrôlent la direction
-- de l'enseigne : les tables organisation_membres et copro_members restent
-- fermées en écriture au syndic (policies inchangées).
--   • Rénovations globales : l'accès d'un compte à un dossier = copro_members
--     'syndic' (lu par is_syndic_of) ; le gestionnaire désigné du dossier reste
--     coproprietes.gestionnaire_nom / gestionnaire_email, synchronisé par le
--     trigger 0063 (changer de gestionnaire retire l'accès de l'ancien).
--   • Suivi des PPT : un seul gestionnaire par copropriété (ppt_affectations,
--     trigger 0072), déjà modifiable par la direction sur la fiche PPT.

-- ========== Lecture : l'équipe de l'enseigne ==========
create or replace function org_equipe(p_org uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  org_role org_role,
  job_title text,
  active boolean,
  mot_de_passe_provisoire boolean,
  derniere_connexion timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select m.user_id, p.full_name, u.email::text, m.org_role, p.job_title, p.active,
         coalesce((u.raw_user_meta_data ->> 'mot_de_passe_provisoire')::boolean, false),
         u.last_sign_in_at
  from organisation_membres m
  join profiles p on p.user_id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.organisation_id = p_org
    and (is_amo() or ppt_is_directeur_org(p_org))
  order by case m.org_role when 'directeur' then 0 when 'gestionnaire' then 1 when 'administratif' then 2 else 3 end,
           p.full_name;
$$;
revoke execute on function org_equipe(uuid) from anon, public;
grant execute on function org_equipe(uuid) to authenticated;

-- ========== Lecture : qui ouvre quel dossier ==========
-- branche 'reno' : accès aux dossiers de rénovation globale (gestionnaire = il
-- est le gestionnaire désigné du dossier) ; branche 'ppt' : affectation
-- courante d'une copropriété PPT.
create or replace function org_rattachements(p_org uuid)
returns table (branche text, copro_id uuid, user_id uuid, gestionnaire boolean)
language sql stable security definer
set search_path = public
as $$
  select 'reno'::text, cm.copro_id, cm.user_id,
         lower(btrim(coalesce(c.gestionnaire_email, ''))) = lower(u.email)
  from copro_members cm
  join coproprietes c on c.id = cm.copro_id and c.deleted_at is null and c.organisation_id = p_org
  join organisation_membres m on m.user_id = cm.user_id and m.organisation_id = p_org
  join auth.users u on u.id = cm.user_id
  where cm.member_role = 'syndic'
    and (is_amo() or ppt_is_directeur_org(p_org))
  union all
  select 'ppt'::text, a.ppt_copro_id, a.user_id, true
  from ppt_affectations a
  join ppt_coproprietes c on c.id = a.ppt_copro_id and c.deleted_at is null and c.organisation_id = p_org
  join organisation_membres m on m.user_id = a.user_id and m.organisation_id = p_org
  where a.au is null
    and (is_amo() or ppt_is_directeur_org(p_org));
$$;
revoke execute on function org_rattachements(uuid) from anon, public;
grant execute on function org_rattachements(uuid) to authenticated;

-- ========== Rôle d'un membre ==========
create or replace function org_changer_role(p_org uuid, p_user uuid, p_role org_role)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_actuel org_role;
begin
  if not (is_amo() or ppt_is_directeur_org(p_org)) then
    raise exception 'Réservé à la direction de l''enseigne';
  end if;
  select org_role into v_actuel from organisation_membres where organisation_id = p_org and user_id = p_user;
  if v_actuel is null then
    raise exception 'Ce compte n''appartient pas à votre enseigne';
  end if;
  if not is_amo() then
    if p_user = auth.uid() then
      raise exception 'Vous ne pouvez pas modifier votre propre rôle';
    end if;
    if v_actuel = 'directeur' or p_role = 'directeur' then
      raise exception 'La direction de l''enseigne est désignée par Strat Eco';
    end if;
  end if;
  update organisation_membres set org_role = p_role where organisation_id = p_org and user_id = p_user;
end;
$$;
revoke execute on function org_changer_role(uuid, uuid, org_role) from anon, public;
grant execute on function org_changer_role(uuid, uuid, org_role) to authenticated;

-- ========== Contrôle commun : direction du dossier + membre de l'enseigne ==========
create or replace function org_membre_du_dossier(p_copro uuid, p_user uuid)
returns table (org_id uuid, gestionnaire_actuel text, role org_role, email text, nom text)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select c.organisation_id into v_org from coproprietes c where c.id = p_copro and c.deleted_at is null;
  if v_org is null then
    raise exception 'Copropriété introuvable ou rattachée à aucune enseigne';
  end if;
  if not (is_amo() or ppt_is_directeur_org(v_org)) then
    raise exception 'Réservé à la direction de l''enseigne';
  end if;
  return query
    select v_org,
           lower(btrim(coalesce(c.gestionnaire_email, ''))),
           m.org_role,
           lower(u.email::text),
           p.full_name
    from coproprietes c
    join organisation_membres m on m.organisation_id = v_org and m.user_id = p_user
    join auth.users u on u.id = m.user_id
    join profiles p on p.user_id = m.user_id
    where c.id = p_copro;
  if not found then
    raise exception 'Ce compte n''appartient pas à l''enseigne du dossier';
  end if;
end;
$$;
revoke execute on function org_membre_du_dossier(uuid, uuid) from anon, authenticated, public;

-- ========== Accès d'un membre à un dossier de rénovation globale ==========
create or replace function org_acces_copro(p_copro uuid, p_user uuid, p_acces boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from org_membre_du_dossier(p_copro, p_user);
  if v.role = 'directeur' then
    raise exception 'La direction ouvre déjà tous les dossiers de l''enseigne';
  end if;
  if p_acces then
    insert into copro_members (copro_id, user_id, member_role)
    values (p_copro, p_user, 'syndic')
    on conflict (copro_id, user_id) do update set member_role = 'syndic';
    -- un gestionnaire rattaché à un dossier sans gestionnaire en devient le gestionnaire désigné
    if v.role = 'gestionnaire' and v.gestionnaire_actuel = '' then
      update coproprietes set gestionnaire_nom = v.nom, gestionnaire_email = v.email where id = p_copro;
    end if;
  else
    if v.gestionnaire_actuel = v.email then
      -- il était le gestionnaire désigné : le dossier repasse « non attribué »
      -- (le trigger 0063 retire l'accès attaché à l'ancien e-mail)
      update coproprietes set gestionnaire_nom = null, gestionnaire_email = null where id = p_copro;
    end if;
    delete from copro_members where copro_id = p_copro and user_id = p_user and member_role = 'syndic';
  end if;
end;
$$;
revoke execute on function org_acces_copro(uuid, uuid, boolean) from anon, public;
grant execute on function org_acces_copro(uuid, uuid, boolean) to authenticated;

-- ========== Gestionnaire désigné d'un dossier de rénovation globale ==========
-- p_user null : le dossier n'a plus de gestionnaire désigné (l'ancien perd l'accès).
create or replace function org_designer_gestionnaire(p_copro uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v record;
  v_org uuid;
begin
  if p_user is null then
    select organisation_id into v_org from coproprietes where id = p_copro and deleted_at is null;
    if v_org is null or not (is_amo() or ppt_is_directeur_org(v_org)) then
      raise exception 'Réservé à la direction de l''enseigne';
    end if;
    update coproprietes set gestionnaire_nom = null, gestionnaire_email = null where id = p_copro;
    return;
  end if;
  select * into v from org_membre_du_dossier(p_copro, p_user);
  if v.role <> 'gestionnaire' then
    raise exception 'Seul un compte au rôle gestionnaire peut être désigné gestionnaire du dossier';
  end if;
  update coproprietes set gestionnaire_nom = v.nom, gestionnaire_email = v.email where id = p_copro;
end;
$$;
revoke execute on function org_designer_gestionnaire(uuid, uuid) from anon, public;
grant execute on function org_designer_gestionnaire(uuid, uuid) to authenticated;
