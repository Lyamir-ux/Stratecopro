-- 0162 - Un accès par personne dans une entreprise prestataire
--
-- Demande d'Amir du 12/10/2026 (« côté maître d'œuvre ») : « Un maître d'œuvre
-- peut avoir plusieurs adresses mail. Chaque adresse mail est une personne et a
-- un accès personnalisé, chaque personne a accès au même compte du maître
-- d'œuvre. Lorsqu'il y a une consultation d'intervenant, la consultation est
-- envoyée à toute la liste des adresses mail référencées du prestataire. »
--
-- Jusqu'ici une fiche n'avait qu'un compte (prestataires.user_id, adresse
-- principale, 0123) ; les adresses en copie (0106) recevaient les alertes sans
-- pouvoir se connecter. Désormais :
--   • prestataire_comptes relie à une fiche autant de comptes que d'adresses
--     (principale ou autres) ; un compte ne voit toujours qu'une entreprise
--     (user_id clé primaire, règle du 30/09) ;
--   • l'accès de chaque adresse s'ouvre sur un clic de l'équipe Strat Eco
--     (choix d'Amir du 12/10 : « Créer l'accès » devant chaque adresse de la
--     fiche, edge function creer-espace-prestataire v2) ;
--   • retirer une adresse de la fiche retire l'accès de la personne (choix
--     d'Amir du 12/10) ; une personne ne peut pas retirer sa propre adresse ;
--   • tous les droits (RLS, fichiers) passent par l'appartenance à la fiche :
--     chaque personne voit et fait la même chose pour l'entreprise ;
--   • les fichiers de l'entreprise (documents, logo, offres, pièces de projet)
--     se déposent dans le dossier de la fiche (<prestataire_id>/…) ; ceux déjà
--     déposés dans le dossier d'un compte restent lisibles par toute
--     l'entreprise tant que ce compte en fait partie.
-- Les consultations partaient déjà à toutes les adresses de la fiche (0106) :
-- inchangé.
-- prestataires.user_id et espace_invite_* ne sont plus lus par l'application ;
-- gardés (et espaces_prestataires() réécrite) tant que l'ancienne version de
-- l'application peut être en ligne, à supprimer ensuite.

-- ---------- Comptes des personnes de l'entreprise ----------
create table if not exists prestataire_comptes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  -- adresse de la fiche à laquelle l'accès a été ouvert (minuscules) : la
  -- retirer de la fiche retire l'accès
  email text not null check (email = lower(btrim(email)) and email <> ''),
  cree_le timestamptz not null default now(),
  invite_le timestamptz,
  invite_par uuid references auth.users (id) on delete set null
);

create unique index if not exists prestataire_comptes_adresse_uq on prestataire_comptes (prestataire_id, email);
create index if not exists prestataire_comptes_invite_par_idx on prestataire_comptes (invite_par);

comment on table prestataire_comptes is
  'Comptes des personnes d''une entreprise de la Base prestataires : un par adresse de la fiche, ouvert par l''équipe (creer-espace-prestataire). Toutes voient et agissent pour l''entreprise (0162).';
comment on column prestataire_comptes.email is
  'Adresse de la fiche (principale ou autre) à laquelle l''accès a été ouvert ; la retirer de la fiche retire l''accès.';
comment on column prestataire_comptes.invite_le is
  'Dernier envoi de l''e-mail d''accès à cette personne (création, rattachement ou renvoi par l''équipe).';
comment on column prestataires.user_id is
  'Obsolète depuis 0162 (remplacé par prestataire_comptes) : plus lu par l''application, à supprimer.';

-- Reprise du compte unique de chaque fiche
insert into prestataire_comptes (user_id, prestataire_id, email, cree_le, invite_le, invite_par)
select p.user_id, p.id, lower(btrim(u.email)), coalesce(p.espace_invite_le, now()), p.espace_invite_le, p.espace_invite_par
from prestataires p
join auth.users u on u.id = p.user_id
where p.user_id is not null and nullif(btrim(u.email), '') is not null
on conflict do nothing;

-- ---------- Appartenance du compte connecté ----------
-- Fiche de l'entreprise du compte connecté, suspendue ou non (sa fiche reste
-- lisible et modifiable, comme avant).
create or replace function my_prestataire_fiche_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select prestataire_id from prestataire_comptes where user_id = auth.uid();
$$;

revoke execute on function my_prestataire_fiche_id() from public, anon;
grant execute on function my_prestataire_fiche_id() to authenticated;

-- Fiche active de l'entreprise du compte connecté (droits sur les consultations,
-- candidatures, projets…).
create or replace function my_prestataire_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from prestataire_comptes pc
  join prestataires p on p.id = pc.prestataire_id
  where pc.user_id = auth.uid() and p.actif;
$$;

create or replace function my_presta_types()
returns type_consultation[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select types from prestataires where id = my_prestataire_id()),
    '{}'::type_consultation[]
  );
$$;

alter table prestataire_comptes enable row level security;

drop policy if exists prestataire_comptes_read on prestataire_comptes;
create policy prestataire_comptes_read on prestataire_comptes
  for select to authenticated
  using (( SELECT is_amo() ) or prestataire_id = ( SELECT my_prestataire_fiche_id() ));

-- « Retirer l'accès » d'une personne : équipe Strat Eco seulement (création et
-- rattachement : edge function, service_role)
drop policy if exists prestataire_comptes_amo_delete on prestataire_comptes;
create policy prestataire_comptes_amo_delete on prestataire_comptes
  for delete to authenticated
  using (( SELECT is_amo() ));

-- ---------- Fiche de l'entreprise : lisible et modifiable par chacun ----------
drop policy if exists prestataires_own_read on prestataires;
create policy prestataires_own_read on prestataires
  for select to authenticated
  using (id = ( SELECT my_prestataire_fiche_id() ));

drop policy if exists prestataires_own_update on prestataires;
create policy prestataires_own_update on prestataires
  for update to authenticated
  using (id = ( SELECT my_prestataire_fiche_id() ))
  with check (id = ( SELECT my_prestataire_fiche_id() ));

-- ---------- Droits de l'entreprise : appartenance plutôt que user_id ----------
create or replace function a_postule(p_consultation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from candidatures ca
    where ca.consultation_id = p_consultation_id and ca.prestataire_id = my_prestataire_fiche_id()
  );
$$;

create or replace function copro_visible_presta(p_copro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from consultations c
    join prestataires p on p.id = my_prestataire_id()
    where c.copro_id = p_copro_id
      and (
        (
          c.statut = 'en_ligne'
          and c.type = any (p.types)
          and (c.prestataires_choisis is null or p.id = any (c.prestataires_choisis))
        )
        or exists (
          select 1 from candidatures ca
          where ca.consultation_id = c.id and ca.prestataire_id = p.id
        )
      )
  );
$$;

create or replace function copros_moe_cite()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
  from prestataires p
  join coproprietes c on c.deleted_at is null and moe_cite(c.maitre_oeuvre, p.raison_sociale)
  where p.id = my_prestataire_id() and 'moe' = any (p.types);
$$;

create or replace function copros_moe_retenu()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct c.copro_id), '{}'::uuid[])
  from candidatures ca
  join consultations c on c.id = ca.consultation_id
  where c.type = 'moe' and ca.statut = 'retenue' and ca.prestataire_id = my_prestataire_id()
    and c.copro_id is not null;
$$;

create or replace function copros_presta_retenu()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct c.copro_id), '{}'::uuid[])
  from candidatures ca
  join consultations c on c.id = ca.consultation_id
  where ca.statut = 'retenue' and ca.prestataire_id = my_prestataire_id()
    and c.copro_id is not null;
$$;

create or replace function copros_visibles_presta()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct c.copro_id), '{}'::uuid[])
  from consultations c
  join prestataires p on p.id = my_prestataire_id()
  where c.copro_id is not null
    and (
      (
        c.statut = 'en_ligne'
        and c.type = any (p.types)
        and (c.prestataires_choisis is null or p.id = any (c.prestataires_choisis))
      )
      or exists (
        select 1 from candidatures ca
        where ca.consultation_id = c.id and ca.prestataire_id = p.id
      )
    );
$$;

create or replace function is_moe_designe_of(p_copro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from coproprietes c
    join prestataires p on p.id = my_prestataire_id() and 'moe' = any (p.types)
    where c.id = p_copro_id
      and c.deleted_at is null
      and moe_cite(c.maitre_oeuvre, p.raison_sociale)
  );
$$;

create or replace function is_moe_retenu_of(p_copro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from candidatures ca
    join consultations c on c.id = ca.consultation_id
    where c.copro_id = p_copro_id
      and c.type = 'moe'
      and ca.statut = 'retenue'
      and ca.prestataire_id = my_prestataire_id()
  );
$$;

create or replace function is_presta_retenu_of(p_copro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from candidatures ca
    join consultations c on c.id = ca.consultation_id
    where c.copro_id = p_copro_id
      and ca.statut = 'retenue'
      and ca.prestataire_id = my_prestataire_id()
  );
$$;

create or replace function peut_postuler(p_consultation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from consultations c
    join prestataires p on p.id = my_prestataire_id()
    where c.id = p_consultation_id
      and c.statut = 'en_ligne'
      and c.type = any (p.types)
      and (c.prestataires_choisis is null or p.id = any (c.prestataires_choisis))
  );
$$;

-- ---------- Retirer une adresse de la fiche retire l'accès ----------
create or replace function prestataire_adresses_retirees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  retirees text[];
begin
  retirees := array(
    select lower(btrim(e)) from unnest(array[old.email] || old.emails_secondaires) e
    where nullif(btrim(e), '') is not null
    except
    select lower(btrim(e)) from unnest(array[new.email] || new.emails_secondaires) e
    where nullif(btrim(e), '') is not null
  );
  if cardinality(retirees) = 0 then
    return new;
  end if;
  if not is_amo() and coalesce(auth.role(), '') <> 'service_role' and exists (
    select 1 from prestataire_comptes
    where user_id = auth.uid() and prestataire_id = new.id and email = any (retirees)
  ) then
    raise exception 'Vous ne pouvez pas retirer votre propre adresse : elle vous sert d''identifiant de connexion';
  end if;
  delete from prestataire_comptes where prestataire_id = new.id and email = any (retirees);
  return new;
end;
$$;

revoke execute on function prestataire_adresses_retirees() from public, anon, authenticated;

drop trigger if exists trg_prestataire_adresses_retirees on prestataires;
create trigger trg_prestataire_adresses_retirees
  before update of email, emails_secondaires on prestataires
  for each row execute function prestataire_adresses_retirees();

-- ---------- Fichiers de l'entreprise ----------
-- Dossiers du stockage ouverts à toute l'entreprise : celui de la fiche (dépôts
-- depuis 0162) et ceux des comptes de ses personnes (dépôts d'avant). Les
-- chemins enregistrés par l'entreprise elle-même ne sont pas pris en compte :
-- ils sont libres et ouvriraient le dossier d'une autre.
create or replace function dossiers_mon_entreprise()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(pc.user_id::text) || array[pc.prestataire_id::text],
    '{}'::text[]
  )
  from prestataire_comptes pc
  where pc.prestataire_id = my_prestataire_fiche_id()
  group by pc.prestataire_id;
$$;

revoke execute on function dossiers_mon_entreprise() from public, anon;
grant execute on function dossiers_mon_entreprise() to authenticated;

drop policy if exists storage_presta_docs_entreprise on storage.objects;
create policy storage_presta_docs_entreprise on storage.objects
  for all to authenticated
  using (bucket_id = 'presta-docs' and (storage.foldername(name))[1] = any (( SELECT dossiers_mon_entreprise() )::text[]))
  with check (bucket_id = 'presta-docs' and (storage.foldername(name))[1] = any (( SELECT dossiers_mon_entreprise() )::text[]));

drop policy if exists storage_offres_entreprise on storage.objects;
create policy storage_offres_entreprise on storage.objects
  for all to authenticated
  using (bucket_id = 'offres-presta' and (storage.foldername(name))[1] = any (( SELECT dossiers_mon_entreprise() )::text[]))
  with check (bucket_id = 'offres-presta' and (storage.foldername(name))[1] = any (( SELECT dossiers_mon_entreprise() )::text[]));

-- ---------- État des accès, adresse par adresse (équipe Strat Eco) ----------
--   actif      compte relié à la fiche par cette adresse, déjà connecté ;
--   invite     compte relié, lien pas encore utilisé ;
--   a_creer    adresse libre (ou compte prestataire relié à aucune fiche) ;
--   email_pris adresse d'un compte AMO, syndic, copropriétaire (role_compte),
--              ou d'un compte prestataire déjà relié à autre_fiche.
-- hors_fiche : compte relié par une adresse qui n'est plus sur la fiche
-- (seulement par une modification en SQL : la fiche retire l'accès d'elle-même).
create or replace function acces_prestataires(p_prestataire_id uuid default null)
returns table (
  prestataire_id uuid,
  email text,
  principale boolean,
  hors_fiche boolean,
  etat text,
  user_id uuid,
  nom text,
  invite_le timestamptz,
  derniere_connexion timestamptz,
  role_compte app_role,
  autre_fiche text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with adresses as (
    select distinct on (p.id, lower(btrim(a.e)))
      p.id as prestataire_id, lower(btrim(a.e)) as email, a.ord = 1 as principale, a.ord
    from prestataires p
    cross join lateral unnest(array[p.email] || p.emails_secondaires) with ordinality as a(e, ord)
    where nullif(btrim(a.e), '') is not null
      and (p_prestataire_id is null or p.id = p_prestataire_id)
    order by p.id, lower(btrim(a.e)), a.ord
  )
  select
    a.prestataire_id,
    a.email,
    a.principale,
    false,
    case
      when pc.user_id is not null and u.last_sign_in_at is not null then 'actif'
      when pc.user_id is not null then 'invite'
      when x.user_id is null then 'a_creer'
      when x.role is null or x.role <> 'presta' or x.autre_fiche is not null then 'email_pris'
      else 'a_creer'
    end,
    pc.user_id,
    pr.full_name,
    pc.invite_le,
    u.last_sign_in_at,
    x.role,
    x.autre_fiche
  from adresses a
  left join prestataire_comptes pc on pc.prestataire_id = a.prestataire_id and pc.email = a.email
  left join auth.users u on u.id = pc.user_id
  left join public.profiles pr on pr.user_id = pc.user_id
  left join lateral (
    select
      u2.id as user_id,
      pr2.role,
      (select o.raison_sociale
         from prestataire_comptes oc join prestataires o on o.id = oc.prestataire_id
        where oc.user_id = u2.id
        limit 1) as autre_fiche
    from auth.users u2
    left join public.profiles pr2 on pr2.user_id = u2.id
    where lower(u2.email) = a.email
    limit 1
  ) x on pc.user_id is null
  where is_amo()
  union all
  select
    pc.prestataire_id,
    pc.email,
    false,
    true,
    case when u.last_sign_in_at is not null then 'actif' else 'invite' end,
    pc.user_id,
    pr.full_name,
    pc.invite_le,
    u.last_sign_in_at,
    null,
    null
  from prestataire_comptes pc
  join prestataires p on p.id = pc.prestataire_id
  left join auth.users u on u.id = pc.user_id
  left join public.profiles pr on pr.user_id = pc.user_id
  where is_amo()
    and (p_prestataire_id is null or pc.prestataire_id = p_prestataire_id)
    and pc.email <> all (
      select lower(btrim(e)) from unnest(array[p.email] || p.emails_secondaires) e
      where nullif(btrim(e), '') is not null
    );
$$;

revoke execute on function acces_prestataires(uuid) from public, anon;
grant execute on function acces_prestataires(uuid) to authenticated;

-- Ancienne lecture (une ligne par fiche, adresse principale) : réécrite sur les
-- comptes pour l'ancienne version de l'application, à supprimer ensuite.
create or replace function espaces_prestataires()
returns table (
  prestataire_id uuid,
  etat text,
  invite_le timestamptz,
  email_compte text,
  role_compte app_role,
  autre_fiche text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id,
    coalesce(a.etat, 'sans_email'),
    a.invite_le,
    case when a.user_id is not null then a.email end,
    a.role_compte,
    a.autre_fiche
  from prestataires p
  left join acces_prestataires() a on a.prestataire_id = p.id and a.principale
  where is_amo();
$$;

-- ---------- Les personnes de l'entreprise (vue de l'entreprise) ----------
-- Adresses de la fiche et accès de chacune, sans rien dire des comptes d'autres
-- entreprises : pour l'entreprise elle-même ou l'équipe Strat Eco.
create or replace function equipe_prestataire(p_prestataire_id uuid)
returns table (
  email text,
  principale boolean,
  user_id uuid,
  nom text,
  active boolean,
  moi boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with adresses as (
    select distinct on (lower(btrim(a.e)))
      lower(btrim(a.e)) as email, a.ord = 1 as principale, a.ord
    from prestataires p
    cross join lateral unnest(array[p.email] || p.emails_secondaires) with ordinality as a(e, ord)
    where p.id = p_prestataire_id and nullif(btrim(a.e), '') is not null
    order by lower(btrim(a.e)), a.ord
  )
  select a.email, a.principale, pc.user_id, pr.full_name, u.last_sign_in_at is not null,
    coalesce(pc.user_id = auth.uid(), false)
  from adresses a
  left join prestataire_comptes pc on pc.prestataire_id = p_prestataire_id and pc.email = a.email
  left join auth.users u on u.id = pc.user_id
  left join public.profiles pr on pr.user_id = pc.user_id
  where is_amo() or p_prestataire_id = my_prestataire_fiche_id()
  order by a.ord;
$$;

revoke execute on function equipe_prestataire(uuid) from public, anon;
grant execute on function equipe_prestataire(uuid) to authenticated;

-- ---------- Chaque personne règle son nom ----------
-- Le nom signe ses messages à l'équipe ; à la création de l'accès il vaut le
-- contact connu de l'adresse, à défaut la raison sociale.
create or replace function prestataire_mon_nom(p_nom text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text := regexp_replace(btrim(coalesce(p_nom, '')), '[[:space:]]+', ' ', 'g');
  v_mots text[];
begin
  if my_prestataire_fiche_id() is null then
    raise exception 'Réservé aux personnes d''une entreprise prestataire';
  end if;
  if char_length(v_nom) < 2 or char_length(v_nom) > 80 then
    raise exception 'Indiquez votre nom (2 à 80 caractères)';
  end if;
  v_mots := string_to_array(v_nom, ' ');
  update profiles
     set full_name = v_nom,
         initials = upper(
           left(v_mots[1], 1)
           || case when cardinality(v_mots) > 1 then left(v_mots[cardinality(v_mots)], 1) else substr(v_mots[1], 2, 1) end
         )
   where profiles.user_id = auth.uid();
end;
$$;

revoke execute on function prestataire_mon_nom(text) from public, anon;
grant execute on function prestataire_mon_nom(text) to authenticated;
