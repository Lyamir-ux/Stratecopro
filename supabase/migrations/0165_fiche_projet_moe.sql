-- 0165 - Fiche projet de la maîtrise d'œuvre (espace prestataire, « Mes projets »)
--
-- Demande d'Amir du 14/10/2026 : un clic sur un projet ouvre une vue proche de
-- celle du syndic - Projet, Données de la copro (lecture seule, résumé de la
-- composition), Financement (PF définitif ou prévisionnel, lots de travaux et
-- TVA), Documents à produire (ceux du syndic, en couleur ce que la MOE a à
-- déposer), Fichiers et Suivi financier (lecture seule).
--
-- Périmètre : la MOE connectée lit les dossiers dont elle est la maîtrise
-- d'œuvre - retenue sur une consultation MOE (copros_moe_retenu) ou citée dans
-- coproprietes.maitre_oeuvre (copros_moe_cite, 0120/0162). Rien d'autre.
-- Données personnelles des copropriétaires : aucune (ni nom, ni contact) - la
-- composition passe par une fonction qui ne renvoie que des comptes et les lots
-- sans propriétaire.
--
-- Dépôt : la MOE dépose les pièces des « Documents à produire » qui lui
-- reviennent (fichier sous montage/<copro_id>/…, comme le syndic), par la
-- fonction montage_deposer_moe ; elle ne voit et ne retire que les fichiers de
-- son entreprise. Ses documents de projet (projet_docs) gardent désormais leur
-- type de document (nomenclature du dialogue de dépôt).

-- ---------------------------------------------------------------------------
-- 1. Type de document des documents de projet
alter table public.projet_docs add column if not exists type_document text;
comment on column public.projet_docs.type_document is
  'Type de document choisi au dépôt (id TYPES_DOCUMENT de src/lib/nommage.ts) - null avant le 14/10/2026.';

-- ---------------------------------------------------------------------------
-- 2. Dossiers de projet de la MOE connectée (retenue ou citée)
create or replace function public.copros_moe_projet()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x), '{}'::uuid[])
  from unnest(copros_moe_retenu() || copros_moe_cite()) as x;
$$;

-- Garde des fonctions de la fiche projet : AMO (aperçu de l'espace), ou
-- l'entreprise MOE elle-même sur un de ses dossiers.
create or replace function public.acces_projet_moe(p_copro_id uuid, p_prestataire_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_amo()
    or (p_prestataire_id = my_prestataire_id() and p_copro_id = any (copros_moe_projet()));
$$;

revoke execute on function public.copros_moe_projet() from anon;
revoke execute on function public.acces_projet_moe(uuid, uuid) from anon;

-- ---------------------------------------------------------------------------
-- 3. Lecture seule : PF (définitifs validés + estimatifs), suivi financier,
--    fichiers du dossier hors confidentiels et facturation
create policy plans_definitifs_moe_read on public.plans_definitifs
  for select to authenticated
  using (
    copro_id = any ((select copros_moe_projet())::uuid[])
    and ((nature = 'definitif' and statut = 'valide') or nature = 'estimatif')
  );

create policy suivi_financier_moe_read on public.suivi_financier
  for select to authenticated
  using (copro_id = any ((select copros_moe_projet())::uuid[]));

create policy fichiers_moe_read on public.fichiers
  for select to authenticated
  using (
    copro_id = any ((select copros_moe_projet())::uuid[])
    and not confidentiel
    and dossier <> 'Facturation'
  );

create policy storage_files_moe_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'copro-files'
    and exists (
      select 1 from public.fichiers f
      where f.storage_path = objects.name
        and f.copro_id = any ((select public.copros_moe_projet())::uuid[])
        and not f.confidentiel
        and f.dossier <> 'Facturation'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Pièces des « Documents à produire » : dépôt sous montage/<copro_id>/ sur
--    un dossier de la MOE ; lecture et retrait des seuls fichiers de l'entreprise
create policy storage_montage_moe_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'copro-files'
    and (storage.foldername(name))[1] = 'montage'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and ((storage.foldername(name))[2])::uuid = any ((select public.copros_moe_projet())::uuid[])
  );

create policy storage_montage_moe_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'copro-files'
    and (storage.foldername(name))[1] = 'montage'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and ((storage.foldername(name))[2])::uuid = any ((select public.copros_moe_projet())::uuid[])
    and owner_id in (
      select pc.user_id::text from public.prestataire_comptes pc
      where pc.prestataire_id = (select public.my_prestataire_id())
    )
  );

create policy storage_montage_moe_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'copro-files'
    and (storage.foldername(name))[1] = 'montage'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and ((storage.foldername(name))[2])::uuid = any ((select public.copros_moe_projet())::uuid[])
    and owner_id in (
      select pc.user_id::text from public.prestataire_comptes pc
      where pc.prestataire_id = (select public.my_prestataire_id())
    )
  );

-- Comptes de l'entreprise (uid en texte, comme storage.objects.owner_id)
create or replace function public.comptes_entreprise(p_prestataire_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(pc.user_id::text), '{}'::text[])
  from prestataire_comptes pc
  where pc.prestataire_id = p_prestataire_id;
$$;
-- interne aux fonctions ci-dessous (security definer) : fermée aux comptes
revoke execute on function public.comptes_entreprise(uuid) from public, anon, authenticated;

-- État des Documents à produire vu de la MOE : statut et nombre de fichiers de
-- chaque pièce non confidentielle, fichiers de l'entreprise seulement ;
-- statut des formulaires du montage (sans leur contenu).
create or replace function public.montage_moe(p_copro_id uuid, p_prestataire_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_comptes text[];
begin
  if not acces_projet_moe(p_copro_id, p_prestataire_id) then
    raise exception 'Accès refusé à ce dossier' using errcode = '42501';
  end if;
  v_comptes := comptes_entreprise(p_prestataire_id);
  return jsonb_build_object(
    'docs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'montage', d.montage,
        'doc_key', d.doc_key,
        'statut', d.statut,
        'nb_fichiers', jsonb_array_length(d.files),
        'fichiers', coalesce((
          select jsonb_agg(e.f order by e.ord)
          from jsonb_array_elements(d.files) with ordinality as e(f, ord)
          where e.f ->> 'uploaded_by' = any (v_comptes)
        ), '[]'::jsonb)
      ))
      from montage_docs d
      where d.copro_id = p_copro_id and not d.confidentiel
    ), '[]'::jsonb),
    'formulaires', coalesce((
      select jsonb_agg(jsonb_build_object('type', f.type, 'statut', f.statut, 'updated_at', f.updated_at))
      from montage_formulaires f
      where f.copro_id = p_copro_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Dépôt d'un fichier par la MOE sur une pièce, puis sur les pièces du même type
-- des autres montages (p_cibles : [{montage, doc_key}], la première est la pièce
-- choisie). Le fichier doit avoir été envoyé par l'utilisateur sous
-- montage/<copro_id>/. Pièces confidentielles ignorées ; une pièce cible
-- « non concerné » reste en l'état (même règle que propagerDocument).
create or replace function public.montage_deposer_moe(p_copro_id uuid, p_cibles jsonb, p_fichier jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_path text := p_fichier ->> 'path';
  v_entree jsonb;
  v_cible jsonb;
  v_rang int := 0;
  v_row montage_docs%rowtype;
begin
  if my_prestataire_id() is null or not (p_copro_id = any (copros_moe_projet())) then
    raise exception 'Accès refusé à ce dossier' using errcode = '42501';
  end if;
  if v_path is null or v_path not like 'montage/' || p_copro_id::text || '/%' then
    raise exception 'Chemin de fichier invalide';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'copro-files' and o.name = v_path and o.owner_id = v_uid::text
  ) then
    raise exception 'Fichier introuvable';
  end if;
  if jsonb_typeof(p_cibles) <> 'array' or jsonb_array_length(p_cibles) = 0 then
    raise exception 'Aucune pièce cible';
  end if;

  v_entree := jsonb_build_object(
    'name', coalesce(p_fichier ->> 'name', regexp_replace(v_path, '^.*/', '')),
    'name_original', p_fichier -> 'name_original',
    'path', v_path,
    'size', p_fichier -> 'size',
    'mime', p_fichier -> 'mime',
    'uploaded_at', now(),
    'uploaded_by', v_uid
  );

  for v_cible in select value from jsonb_array_elements(p_cibles) loop
    v_rang := v_rang + 1;
    select * into v_row from montage_docs
    where copro_id = p_copro_id and montage = v_cible ->> 'montage' and doc_key = v_cible ->> 'doc_key';
    if found then
      if v_row.confidentiel then
        if v_rang = 1 then raise exception 'Pièce réservée à l''équipe Strat Eco'; end if;
        continue;
      end if;
      if v_rang > 1 and v_row.statut = 'non_applicable' then continue; end if;
      if exists (select 1 from jsonb_array_elements(v_row.files) e where e ->> 'path' = v_path) then continue; end if;
      update montage_docs
      set files = files || jsonb_build_array(v_entree), statut = 'depose', updated_by = v_uid
      where id = v_row.id;
    else
      insert into montage_docs (copro_id, montage, doc_key, statut, files, confidentiel, updated_by)
      values (p_copro_id, v_cible ->> 'montage', v_cible ->> 'doc_key', 'depose', jsonb_build_array(v_entree), false, v_uid);
    end if;
  end loop;
end;
$$;

-- Retrait d'un fichier déposé par l'entreprise : il sort de toutes les pièces
-- qui le référencent (la pièce redevient « à fournir » si elle est vide). Le
-- client supprime ensuite l'objet du Storage (policy storage_montage_moe_delete).
create or replace function public.montage_retirer_moe(p_copro_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_presta uuid := my_prestataire_id();
begin
  if v_presta is null or not (p_copro_id = any (copros_moe_projet())) then
    raise exception 'Accès refusé à ce dossier' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'copro-files' and o.name = p_path and o.owner_id = any (comptes_entreprise(v_presta))
  ) then
    raise exception 'Seuls les fichiers de votre entreprise peuvent être retirés';
  end if;
  update montage_docs d
  set files = r.restants,
      statut = case when jsonb_array_length(r.restants) = 0 and d.statut = 'depose' then 'a_fournir' else d.statut end,
      updated_by = auth.uid()
  from (
    select m.id, coalesce((
      select jsonb_agg(e.f order by e.ord)
      from jsonb_array_elements(m.files) with ordinality as e(f, ord)
      where e.f ->> 'path' <> p_path
    ), '[]'::jsonb) as restants
    from montage_docs m
    where m.copro_id = p_copro_id and not m.confidentiel
      and exists (select 1 from jsonb_array_elements(m.files) e where e ->> 'path' = p_path)
  ) r
  where d.id = r.id;
end;
$$;

revoke execute on function public.montage_moe(uuid, uuid) from anon;
revoke execute on function public.montage_deposer_moe(uuid, jsonb, jsonb) from anon;
revoke execute on function public.montage_retirer_moe(uuid, text) from anon;

-- ---------------------------------------------------------------------------
-- 5. Composition de la copropriété, sans aucune donnée personnelle
create or replace function public.composition_copro_moe(p_copro_id uuid, p_prestataire_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cle cles_repartition%rowtype;
  v_lots int;
begin
  if not acces_projet_moe(p_copro_id, p_prestataire_id) then
    raise exception 'Accès refusé à ce dossier' using errcode = '42501';
  end if;
  select * into v_cle from cles_repartition
  where copro_id = p_copro_id
  order by is_default desc, code
  limit 1;
  select count(*) into v_lots from lots where copro_id = p_copro_id;
  return jsonb_build_object(
    'nb_lots', v_lots,
    -- lots d'habitation dès qu'un lot est importé, sinon le nombre déclaré (règle nbLogements)
    'nb_logements', case when v_lots > 0
      then (select count(*) from lots where copro_id = p_copro_id and usage = 'habitation')
      else (select nb_logements from coproprietes where id = p_copro_id) end,
    'nb_coproprietaires', (select count(*) from coproprietaires where copro_id = p_copro_id),
    'par_usage', coalesce((
      select jsonb_object_agg(u.usage, u.n)
      from (select usage::text as usage, count(*) as n from lots where copro_id = p_copro_id group by usage) u
    ), '{}'::jsonb),
    'cle', case when v_cle.id is null then null else jsonb_build_object(
      'code', v_cle.code,
      'label', v_cle.label,
      'total', (select coalesce(sum(t.tantiemes), 0) from lot_tantiemes t where t.cle_id = v_cle.id),
      'nb_cles', (select count(*) from cles_repartition where copro_id = p_copro_id)
    ) end,
    'batiments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'code', b.code,
        'label', b.label,
        'adresse', b.adresse,
        'nb_lots', (select count(*) from lots l where l.batiment_id = b.id),
        'nb_logements', (select count(*) from lots l where l.batiment_id = b.id and l.usage = 'habitation')
      ) order by b.position, b.code)
      from batiments b where b.copro_id = p_copro_id
    ), '[]'::jsonb),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'num', l.num,
        'batiment', b.code,
        'usage', l.usage,
        'tantiemes', t.tantiemes,
        'rattache', l.rattache_a is not null
      ) order by b.position nulls last, b.code, l.num)
      from lots l
      left join batiments b on b.id = l.batiment_id
      left join lot_tantiemes t on t.lot_id = l.id and t.cle_id = v_cle.id
      where l.copro_id = p_copro_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.composition_copro_moe(uuid, uuid) from anon;

-- ---------------------------------------------------------------------------
-- 6. Fichiers du dossier vus de la MOE : fichiers non confidentiels hors
--    facturation, et pièces des Documents à produire déposées par l'entreprise
create or replace function public.documents_dossier_moe(p_copro_id uuid, p_prestataire_id uuid)
returns table(id text, name text, path text, taille bigint, dossier text, depose_le timestamptz, origine text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_comptes text[];
begin
  if not acces_projet_moe(p_copro_id, p_prestataire_id) then
    raise exception 'Accès refusé à ce dossier' using errcode = '42501';
  end if;
  v_comptes := comptes_entreprise(p_prestataire_id);
  return query
  select f.id::text,
         f.name,
         f.storage_path,
         f.size,
         f.dossier,
         f.created_at,
         case when f.uploaded_by::text = any (v_comptes) then 'moe'
              else case p.role when 'presta' then 'moe' when 'moe' then 'moe' when 'syndic' then 'syndic' else 'amo' end end
  from fichiers f
  left join profiles p on p.user_id = f.uploaded_by
  where f.copro_id = p_copro_id and not f.confidentiel and f.dossier <> 'Facturation'

  union all

  select d.id::text || '-' || (e.ord - 1)::text,
         e.f ->> 'name',
         e.f ->> 'path',
         nullif(e.f ->> 'size', '')::bigint,
         coalesce(m.label, 'Documents à produire'),
         nullif(e.f ->> 'uploaded_at', '')::timestamptz,
         'moe'
  from montage_docs d
  cross join lateral jsonb_array_elements(d.files) with ordinality as e(f, ord)
  left join (values
    ('ecoptz', 'Éco-PTZ collectif'),
    ('anah', 'ANAH - MaPrimeRénov'' Copro'),
    ('cee', 'Certificats d''économie d''énergie'),
    ('climaxion', 'EMS & Climaxion'),
    ('do', 'Dommages-ouvrage')
  ) as m(id, label) on m.id = d.montage
  where d.copro_id = p_copro_id and not d.confidentiel
    and e.f ->> 'uploaded_by' = any (v_comptes)

  order by 6 desc nulls last;
end;
$$;
revoke execute on function public.documents_dossier_moe(uuid, uuid) from anon;

-- Base documentaire AMO / syndic : un dépôt d'un compte prestataire (MOE) porte
-- l'origine « moe » (il était compté « amo » ou « syndic »).
create or replace function public.documents_dossier(p_copro_id uuid)
returns table(id text, name text, path text, taille bigint, dossier text, depose_le timestamptz, origine text)
language sql
stable
security definer
set search_path = public
as $$
  with autorise as (select is_syndic_of(p_copro_id) or is_amo() as ok, is_amo() as amo)
  select f.id::text,
         f.name,
         f.storage_path,
         f.size,
         f.dossier,
         f.created_at,
         case p.role when 'moe' then 'moe' when 'presta' then 'moe' when 'syndic' then 'syndic' else 'amo' end
  from fichiers f
  left join profiles p on p.user_id = f.uploaded_by
  cross join autorise a
  where f.copro_id = p_copro_id and a.ok
    and (not f.confidentiel or a.amo)

  union all

  select d.id::text || '-' || (e.ord - 1)::text,
         e.f ->> 'name',
         e.f ->> 'path',
         nullif(e.f ->> 'size', '')::bigint,
         coalesce(m.label, 'Documents à produire'),
         nullif(e.f ->> 'uploaded_at', '')::timestamptz,
         coalesce(
           (select case pp.role when 'moe' then 'moe' when 'presta' then 'moe' when 'amo' then 'amo' else 'syndic' end
            from profiles pp where pp.user_id = nullif(e.f ->> 'uploaded_by', '')::uuid),
           'syndic'
         )
  from montage_docs d
  cross join lateral jsonb_array_elements(d.files) with ordinality as e(f, ord)
  left join (values
    ('ecoptz', 'Éco-PTZ collectif'),
    ('anah', 'ANAH - MaPrimeRénov'' Copro'),
    ('cee', 'Certificats d''économie d''énergie'),
    ('climaxion', 'EMS & Climaxion'),
    ('do', 'Dommages-ouvrage')
  ) as m(id, label) on m.id = d.montage
  cross join autorise a
  where d.copro_id = p_copro_id and a.ok
    and (not d.confidentiel or a.amo)

  order by 6 desc nulls last;
$$;
