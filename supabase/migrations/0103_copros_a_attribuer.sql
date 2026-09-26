-- 0103 - Feedback de Pierrot LEFOU (direction de SYNDIC 3000 GRAND EST) du
-- 25/09/2026 : « un tableau avec les nouvelles copropriétés arrivées sur le
-- compte direction pour l'attribuer à un gestionnaire, dans le portefeuille ou
-- Vos tâches, avec une pastille d'alerte ».
--
-- Une copropriété arrive sur le compte de la direction quand la demande d'AMO
-- qui l'a ouverte venait du directeur (le demandeur devient le gestionnaire du
-- dossier). La direction l'attribue à un gestionnaire (org_designer_gestionnaire,
-- 0102) ou la garde : certains directeurs suivent eux-mêmes des dossiers
-- (8 chez IMMIUM Laemmel au 26/09/2026). Ce choix est tracé ici pour que le
-- dossier sorte de la liste « à attribuer » ; il tombe dès que le gestionnaire
-- du dossier change. Les dossiers déjà confiés à la direction sont réputés
-- gardés : seules les nouvelles arrivées sont signalées.

alter table coproprietes add column if not exists attribution_gardee_le timestamptz;
comment on column coproprietes.attribution_gardee_le is
  'La direction de l''enseigne garde le dossier dont elle est le gestionnaire indiqué : il sort des copropriétés à attribuer. Remis à null quand le gestionnaire change.';

-- dossiers déjà suivis par un directeur de leur enseigne : réputés gardés
update coproprietes c
set attribution_gardee_le = now()
where c.deleted_at is null
  and exists (
    select 1
    from organisation_membres m
    join auth.users u on u.id = m.user_id
    where m.organisation_id = c.organisation_id
      and m.org_role = 'directeur'
      and lower(u.email) = lower(btrim(coalesce(c.gestionnaire_email, '')))
  );

-- changer de gestionnaire annule le choix de la direction
create or replace function coproprietes_reset_attribution()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(btrim(coalesce(new.gestionnaire_email, ''))) is distinct from lower(btrim(coalesce(old.gestionnaire_email, ''))) then
    new.attribution_gardee_le := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_coproprietes_reset_attribution on coproprietes;
create trigger trg_coproprietes_reset_attribution
  before update of gestionnaire_email on coproprietes
  for each row execute function coproprietes_reset_attribution();

-- ========== La direction garde un dossier arrivé sur son compte ==========
create or replace function org_garder_dossier(p_copro uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_email text;
begin
  select organisation_id, lower(btrim(coalesce(gestionnaire_email, '')))
    into v_org, v_email
  from coproprietes
  where id = p_copro and deleted_at is null;
  if v_org is null or not (is_amo() or ppt_is_directeur_org(v_org)) then
    raise exception 'Réservé à la direction de l''enseigne';
  end if;
  if not exists (
    select 1
    from organisation_membres m
    join auth.users u on u.id = m.user_id
    where m.organisation_id = v_org
      and m.org_role = 'directeur'
      and lower(u.email) = v_email
  ) then
    raise exception 'Ce dossier n''est pas confié à la direction : attribuez-le à un gestionnaire';
  end if;
  update coproprietes set attribution_gardee_le = now() where id = p_copro;
end;
$$;
revoke execute on function org_garder_dossier(uuid) from anon, public;
grant execute on function org_garder_dossier(uuid) to authenticated;
