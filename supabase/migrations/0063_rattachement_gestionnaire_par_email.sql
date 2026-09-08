-- 0063 - Feedback de Lakdar BOUBOU (syndic) du 08/09/2026 : « Je n'ai pas accès
-- à mes copropriétés rattachées ». Son compte venait d'être créé comme
-- gestionnaire de l'enseigne et l'AMO l'avait désigné gestionnaire (nom +
-- e-mail) de deux dossiers dans l'onglet Données… mais l'accès réel d'un
-- gestionnaire passe par copro_members (member_role 'syndic'), qu'aucun écran
-- ne créait : seuls les scripts SQL de seed le faisaient. Même trou pour
-- Isabelle GEBEL sur Le Rodin (créé en SQL sans rattachement).
--
-- Règle désormais garantie en base : le compte syndic dont l'e-mail est celui
-- du gestionnaire d'un dossier (coproprietes.gestionnaire_email) est rattaché
-- à ce dossier, à condition d'appartenir à l'enseigne du dossier (ou que le
-- dossier n'ait pas d'enseigne). Changer le gestionnaire d'un dossier retire
-- l'accès de l'ancien (celui dont l'e-mail correspondait) et rattache le
-- nouveau. Les rattachements posés autrement ne sont jamais touchés.

-- ========== Synchronisation ==========
create or replace function sync_rattachement_gestionnaire(p_copro_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into copro_members (copro_id, user_id, member_role)
  select c.id, p.user_id, 'syndic'
  from coproprietes c
  join auth.users u on lower(u.email) = lower(btrim(c.gestionnaire_email))
  join profiles p on p.user_id = u.id and p.role = 'syndic' and p.active
  where c.deleted_at is null
    and c.gestionnaire_email is not null
    and (p_copro_id is null or c.id = p_copro_id)
    and (c.organisation_id is null
         or exists (select 1 from organisation_membres m
                    where m.user_id = p.user_id and m.organisation_id = c.organisation_id))
    and not exists (select 1 from copro_members cm
                    where cm.copro_id = c.id and cm.user_id = p.user_id and cm.member_role = 'syndic');
end;
$$;
revoke execute on function sync_rattachement_gestionnaire(uuid) from anon, authenticated, public;

-- ========== Déclencheurs ==========
-- Dossier : e-mail du gestionnaire ou enseigne modifiés (onglet Données, rattachement à une enseigne).
create or replace function coproprietes_sync_gestionnaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.gestionnaire_email is not null
     and lower(btrim(old.gestionnaire_email)) is distinct from lower(btrim(coalesce(new.gestionnaire_email, ''))) then
    -- l'ancien gestionnaire (identifié par son e-mail) n'a plus la charge du dossier
    delete from copro_members cm
     using auth.users u
     where cm.copro_id = new.id
       and cm.member_role = 'syndic'
       and cm.user_id = u.id
       and lower(u.email) = lower(btrim(old.gestionnaire_email));
  end if;
  perform sync_rattachement_gestionnaire(new.id);
  return new;
end;
$$;
revoke execute on function coproprietes_sync_gestionnaire() from anon, authenticated, public;

drop trigger if exists trg_coproprietes_sync_gestionnaire on coproprietes;
create trigger trg_coproprietes_sync_gestionnaire
  after insert or update of gestionnaire_email, organisation_id on coproprietes
  for each row execute function coproprietes_sync_gestionnaire();

-- Membre ajouté à une enseigne (compte créé depuis Paramètres → Organisations,
-- ou compte existant rattaché) : il récupère les dossiers dont il est déjà le
-- gestionnaire désigné.
create or replace function organisation_membres_sync_gestionnaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_rattachement_gestionnaire(null);
  return new;
end;
$$;
revoke execute on function organisation_membres_sync_gestionnaire() from anon, authenticated, public;

drop trigger if exists trg_organisation_membres_sync_gestionnaire on organisation_membres;
create trigger trg_organisation_membres_sync_gestionnaire
  after insert on organisation_membres
  for each row execute function organisation_membres_sync_gestionnaire();

-- ========== Rattrapage ==========
select sync_rattachement_gestionnaire(null);
