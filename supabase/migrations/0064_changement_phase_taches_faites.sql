-- 0064 - Feedback d'Amir du 09/09/2026 : « Tu ne peux pas mettre un projet en
-- phase travaux si toutes les tâches de la phase étude ne sont pas cochées
-- vert. » Le changement de phase d'un dossier arrive dans l'en-tête de la
-- fiche (aucun écran ne le permettait : la phase restait celle de la
-- création). Règle garantie ici, pas seulement dans l'UI : on n'avance un
-- dossier vers une phase que si toutes les tâches du plan (onglet Projet) des
-- phases précédentes sont faites. Revenir en arrière reste libre.

create or replace function coproprietes_verifie_phase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rang_ancien int := case old.phase when 'diagnostic' then 0 when 'etudes' then 1 else 2 end;
  rang_nouveau int := case new.phase when 'diagnostic' then 0 when 'etudes' then 1 else 2 end;
  restantes int;
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if rang_nouveau <= rang_ancien then
    return new;
  end if;
  select count(*) into restantes
  from taches t
  where t.copro_id = new.id
    and t.status <> 'done'
    and (case t.phase when 'diagnostic' then 0 when 'etudes' then 1 else 2 end) < rang_nouveau;
  if restantes > 0 then
    raise exception 'Impossible de passer en phase % : % tâche(s) des phases précédentes ne sont pas faites',
      new.phase, restantes
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function coproprietes_verifie_phase() from anon, authenticated, public;

drop trigger if exists trg_coproprietes_verifie_phase on coproprietes;
create trigger trg_coproprietes_verifie_phase
  before update of phase on coproprietes
  for each row when (old.phase is distinct from new.phase)
  execute function coproprietes_verifie_phase();
