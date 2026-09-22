-- 0088 - Portail copropriétaire : onglet « Nous contacter » (fil privé avec l'AMO)
--
-- Feedback Amir 22/09/2026 (11:02) : « Créez un portail, un nouvel onglet pour
-- la communication du style : Envoyez-nous un message ».
--
-- Le canal « coproprietaires » de messages_projet existait déjà (0035) mais il
-- était collectif : tout copropriétaire de la copro lisait tout le fil. Un
-- message personnel (« ma quote-part », « ma situation ») ne peut pas être
-- envoyé là-dedans. On distingue donc deux usages sur le même canal :
--   • coproprietaire_id null  : annonce de l'AMO à tous les copropriétaires
--     (comportement actuel de l'onglet Communications, conservé) ;
--   • coproprietaire_id posé  : fil privé entre CE copropriétaire et l'équipe
--     AMO du dossier - invisible des autres copropriétaires, du syndic et des
--     entreprises.
-- Un copropriétaire ne peut écrire que dans son propre fil (jamais une annonce
-- à tous) ; l'AMO écrit dans les deux.

alter table messages_projet
  add column if not exists coproprietaire_id uuid references coproprietaires (id) on delete cascade;

-- un destinataire nominatif n'a de sens que sur le canal copropriétaires
alter table messages_projet
  drop constraint if exists messages_coproprietaire_chk;
alter table messages_projet
  add constraint messages_coproprietaire_chk
  check (coproprietaire_id is null or canal = 'coproprietaires');

create index if not exists idx_messages_coproprietaire
  on messages_projet (coproprietaire_id, created_at)
  where coproprietaire_id is not null;

-- ========== Helper : mes identités de copropriétaire dans CETTE copro ==========
-- (security definer : une sous-requête sur coproprietaires dans une policy
--  serait soumise à la RLS de cette table)
create or replace function my_coproprietaire_ids_of(p_copro_id uuid)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select id from coproprietaires where user_id = auth.uid() and copro_id = p_copro_id;
$$;

-- ========== RLS : le fil privé ne sort pas du couple copropriétaire ↔ AMO ==========
-- Lecture : les annonces à tous de sa copro + son propre fil.
drop policy if exists messages_copro_read on messages_projet;
create policy messages_copro_read on messages_projet
  for select to authenticated
  using (
    canal = 'coproprietaires'
    and is_copro_of(copro_id)
    and (
      coproprietaire_id is null
      or coproprietaire_id in (select my_coproprietaire_ids_of(copro_id))
    )
  );

-- Écriture : uniquement dans son propre fil (pas d'annonce à tous).
drop policy if exists messages_copro_insert on messages_projet;
create policy messages_copro_insert on messages_projet
  for insert to authenticated
  with check (
    canal = 'coproprietaires'
    and is_copro_of(copro_id)
    and user_id = auth.uid()
    and prestataire_id is null
    and coproprietaire_id in (select my_coproprietaire_ids_of(copro_id))
  );
