-- 0038 — Rattachement des lots annexes (garage, cave, autres) à un lot
-- d'habitation du MÊME copropriétaire. Utilisé par le portail : le bulletin
-- d'adhésion n'affiche que le lot d'habitation, avec les tantièmes des lots
-- rattachés additionnés ; la génération des documents est bloquée tant qu'un
-- lot annexe n'est pas rattaché.

alter table lots add column rattache_a uuid references lots (id) on delete set null;
create index idx_lots_rattache_a on lots (rattache_a);

-- Intégrité : seul un lot annexe se rattache, toujours à un lot d'habitation
-- du même copropriétaire, dans la même copropriété.
create or replace function check_lot_rattachement()
returns trigger
language plpgsql
as $$
declare
  cible lots%rowtype;
begin
  if new.rattache_a is null then
    return new;
  end if;
  if new.rattache_a = new.id then
    raise exception 'Un lot ne peut pas être rattaché à lui-même';
  end if;
  if new.usage = 'habitation' then
    raise exception 'Un lot d''habitation ne peut pas être rattaché à un autre lot';
  end if;
  select * into cible from lots where id = new.rattache_a;
  if cible.id is null then
    raise exception 'Lot cible introuvable';
  end if;
  if cible.usage <> 'habitation' then
    raise exception 'Le lot de rattachement doit être un lot d''habitation';
  end if;
  if cible.copro_id <> new.copro_id then
    raise exception 'Le lot de rattachement doit être dans la même copropriété';
  end if;
  if cible.coproprietaire_id is distinct from new.coproprietaire_id then
    raise exception 'Le lot de rattachement doit appartenir au même copropriétaire';
  end if;
  return new;
end;
$$;

create trigger trg_lots_rattachement
  before insert or update of rattache_a on lots
  for each row execute function check_lot_rattachement();

-- RPC portail : le copropriétaire (ou l'AMO) rattache / détache un lot.
-- security definer : la RLS des copropriétaires sur `lots` reste en lecture
-- seule ; seul rattache_a est modifiable ici, le trigger valide le reste.
create or replace function rattacher_lot(p_lot_id uuid, p_cible_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not (is_amo() or exists (select 1 from my_lot_ids() l where l = p_lot_id)) then
    raise exception 'Lot non autorisé';
  end if;
  if p_cible_id is not null
     and not (is_amo() or exists (select 1 from my_lot_ids() l where l = p_cible_id)) then
    raise exception 'Lot de rattachement non autorisé';
  end if;
  update lots set rattache_a = p_cible_id where id = p_lot_id;
end;
$$;
