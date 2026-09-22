-- 0090 - Vente ou décès : le syndic met à jour le propriétaire d'un lot
--
-- Feedback Amir 22/09/2026 (12:53) : « En cas de vente de logement ou décès, le
-- syndic peut cliquer sur le lot en question et mettre le nouveau
-- copropriétaire. Bien sûr la table sera remise à jour. »
--
-- Principes retenus :
--   • le nouveau propriétaire est une NOUVELLE ligne coproprietaires (ou une
--     ligne existante de la copro) : l'historique du vendeur - enquête, plan
--     individuel, choix de financement, bulletins signés - reste attaché à lui,
--     il ne doit jamais être réécrit au nom de l'acquéreur ;
--   • les lots annexes rattachés au lot vendu (cave, garage - 0038) suivent le
--     lot d'habitation : ils changent de main avec lui ; et un lot annexe vendu
--     seul est détaché du lot d'habitation du vendeur ;
--   • quand le vendeur ne possède plus rien dans la copropriété, sa ligne est
--     marquée sortante et son accès au portail est coupé (user_id vidé) - un
--     ancien propriétaire n'a pas à continuer de lire le dossier ;
--   • chaque mutation est tracée (qui, quand, motif) : l'équipe AMO doit voir
--     qu'un lot a changé de main, l'aide individuelle du nouveau propriétaire
--     étant à réinstruire.

alter table coproprietaires
  add column if not exists sortant_le timestamptz;

comment on column coproprietaires.sortant_le is
  'Date à laquelle ce copropriétaire a cessé de posséder un lot (vente, succession). Son historique est conservé.';

create table lots_mutations (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  lot_id uuid not null references lots (id) on delete cascade,
  ancien_coproprietaire_id uuid references coproprietaires (id) on delete set null,
  nouveau_coproprietaire_id uuid not null references coproprietaires (id) on delete cascade,
  motif text not null check (motif in ('vente', 'succession', 'autre')),
  commentaire text,
  -- lot annexe emporté par le lot d'habitation vendu
  annexe boolean not null default false,
  fait_par uuid references profiles (user_id) on delete set null,
  fait_le timestamptz not null default now()
);

create index idx_lots_mutations_copro on lots_mutations (copro_id, fait_le desc);
create index idx_lots_mutations_lot on lots_mutations (lot_id, fait_le desc);

alter table lots_mutations enable row level security;

create policy lots_mutations_amo_all on lots_mutations
  for all to authenticated using (is_amo()) with check (is_amo());

-- Lecture seule pour le syndic : l'écriture passe par la fonction ci-dessous.
create policy lots_mutations_syndic_read on lots_mutations
  for select to authenticated using (is_syndic_of(copro_id));

/* Changement de propriétaire d'un lot, déclenché par le syndic (ou l'AMO).
   Soit p_coproprietaire_id (une ligne existante de la copro), soit p_nom pour
   créer l'acquéreur. Renvoie l'identifiant du nouveau propriétaire. */
create or replace function syndic_changer_proprietaire(
  p_lot_id uuid,
  p_coproprietaire_id uuid default null,
  p_nom text default null,
  p_email text default null,
  p_telephone text default null,
  p_type text default null,
  p_motif text default 'vente',
  p_commentaire text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lot lots%rowtype;
  v_cible uuid;
  v_ancien uuid;
  v_nom text := nullif(btrim(coalesce(p_nom, '')), '');
  v_motif text := coalesce(nullif(btrim(coalesce(p_motif, '')), ''), 'vente');
  v_restants integer;
  v_annexe record;
begin
  select * into v_lot from lots where id = p_lot_id;
  if not found then raise exception 'Lot introuvable'; end if;
  if not (is_amo() or is_syndic_of(v_lot.copro_id)) then
    raise exception 'Accès refusé à cette copropriété';
  end if;
  if v_motif not in ('vente', 'succession', 'autre') then
    raise exception 'Motif inconnu : %', v_motif;
  end if;
  if p_type is not null and p_type not in ('occupant', 'bailleur') then
    raise exception 'Type de copropriétaire inconnu : %', p_type;
  end if;

  v_ancien := v_lot.coproprietaire_id;

  if p_coproprietaire_id is not null then
    select id into v_cible from coproprietaires
      where id = p_coproprietaire_id and copro_id = v_lot.copro_id;
    if v_cible is null then
      raise exception 'Ce copropriétaire n''appartient pas à cette copropriété';
    end if;
    -- il redevient propriétaire : il n'est plus sortant
    update coproprietaires set sortant_le = null where id = v_cible;
  else
    if v_nom is null or length(v_nom) < 2 then
      raise exception 'Le nom du nouveau copropriétaire est obligatoire';
    end if;
    insert into coproprietaires (copro_id, nom, email, telephone, type)
    values (
      v_lot.copro_id,
      v_nom,
      nullif(btrim(coalesce(p_email, '')), ''),
      nullif(btrim(coalesce(p_telephone, '')), ''),
      p_type
    )
    returning id into v_cible;
  end if;

  if v_ancien is not null and v_ancien = v_cible then
    raise exception 'Ce lot appartient déjà à ce copropriétaire';
  end if;

  -- un lot annexe vendu seul quitte son lot d'habitation : le rattachement
  -- (0038) suppose un propriétaire commun
  update lots
     set coproprietaire_id = v_cible,
         rattache_a = case when v_lot.rattache_a is not null then null else rattache_a end
   where id = p_lot_id;
  insert into lots_mutations (copro_id, lot_id, ancien_coproprietaire_id, nouveau_coproprietaire_id, motif, commentaire, annexe, fait_par)
  values (v_lot.copro_id, p_lot_id, v_ancien, v_cible, v_motif, nullif(btrim(coalesce(p_commentaire, '')), ''), false, auth.uid());

  -- les annexes rattachées suivent le lot d'habitation
  for v_annexe in select id, coproprietaire_id from lots where rattache_a = p_lot_id loop
    if v_annexe.coproprietaire_id is distinct from v_cible then
      update lots set coproprietaire_id = v_cible where id = v_annexe.id;
      insert into lots_mutations (copro_id, lot_id, ancien_coproprietaire_id, nouveau_coproprietaire_id, motif, commentaire, annexe, fait_par)
      values (v_lot.copro_id, v_annexe.id, v_annexe.coproprietaire_id, v_cible, v_motif, nullif(btrim(coalesce(p_commentaire, '')), ''), true, auth.uid());
    end if;
  end loop;

  -- le vendeur ne possède plus rien ici : ligne sortante, accès au portail coupé
  if v_ancien is not null then
    select count(*) into v_restants from lots where coproprietaire_id = v_ancien;
    if v_restants = 0 then
      update coproprietaires set sortant_le = now(), user_id = null where id = v_ancien;
    end if;
  end if;

  return v_cible;
end;
$$;

revoke all on function syndic_changer_proprietaire(uuid, uuid, text, text, text, text, text, text) from public;
grant execute on function syndic_changer_proprietaire(uuid, uuid, text, text, text, text, text, text) to authenticated;
