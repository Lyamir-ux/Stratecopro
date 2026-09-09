-- 0065 - Feedback d'Amir du 09/09/2026 (suite du 0064) : « La phase en cours est
-- toujours travaux, alors que certaines tâches dans études ne sont pas cochées
-- vert. » La phase d'un dossier n'est plus un choix : elle découle du plan de
-- tâches (onglet Projet). Phase en cours = première phase, dans l'ordre
-- diagnostic → études → travaux, qui compte au moins une tâche non faite ;
-- toutes les tâches faites = travaux. Recalculée à chaque coche, ajout ou
-- suppression de tâche. Le verrou manuel du 0064 devient sans objet.

drop trigger if exists trg_coproprietes_verifie_phase on coproprietes;
drop function if exists coproprietes_verifie_phase();

/* Phase déduite des tâches ; null si le dossier n'a pas encore de plan de tâches. */
create or replace function phase_calculee(p_copro_id uuid)
returns phase_copro
language sql stable security definer
set search_path = public
as $$
  select case
    when exists (select 1 from taches t where t.copro_id = p_copro_id and t.phase = 'diagnostic' and t.status <> 'done') then 'diagnostic'::phase_copro
    when exists (select 1 from taches t where t.copro_id = p_copro_id and t.phase = 'etudes' and t.status <> 'done') then 'etudes'::phase_copro
    when exists (select 1 from taches t where t.copro_id = p_copro_id) then 'travaux'::phase_copro
  end;
$$;
revoke execute on function phase_calculee(uuid) from anon, public;

create or replace function taches_recalcule_phase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := coalesce(new.copro_id, old.copro_id);
  p phase_copro := phase_calculee(cid);
begin
  if p is not null then
    update coproprietes set phase = p where id = cid and phase is distinct from p;
  end if;
  return null;
end;
$$;
revoke execute on function taches_recalcule_phase() from anon, authenticated, public;

drop trigger if exists trg_taches_recalcule_phase on taches;
create trigger trg_taches_recalcule_phase
  after insert or update of status, phase or delete on taches
  for each row execute function taches_recalcule_phase();

-- ========== Rattrapage : aligne tous les dossiers sur leur plan de tâches ==========
-- (au 09/09/2026, seul BOUDHORS - travaux avec 4 tâches d'études non faites - change : → études)
update coproprietes c
   set phase = phase_calculee(c.id)
 where c.deleted_at is null
   and phase_calculee(c.id) is not null
   and phase_calculee(c.id) is distinct from c.phase;
