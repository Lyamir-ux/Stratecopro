-- 0121 - Création d'un dossier : honoraires P1 et P2, date d'AG, maître d'œuvre
--
-- Idée d'Amir du 01/10/2026 (09:52, page « Vos copropriétés ») : « Ajouter
-- Honoraires P1 et P2, date d'AG, Maître d'Oeuvre parmi la liste ou nouveau
-- MOE, et un bouton d'importation CSV ».
--
--   - coproprietes.date_ag : date d'AG saisie à la création (fenêtre ou import
--     CSV) ;
--   - honoraires de la phase études saisis comme ceux de la phase travaux
--     (0112, 0113) : honoraires_saisir_p1 répartit le montant HT selon le
--     règlement du contrat AMO (50 % P1a au démarrage de la mission, 25 % P1b à
--     l'enquête sociale, 25 % P1c à la convocation de l'AG de vote des
--     travaux ; P1c prend le reste au centime), garde la base saisie sur le
--     dossier et journalise la saisie, que « Annuler » défait ;
--   - la P2 passe par honoraires_revaloriser_p2, inchangée ;
--   - le maître d'œuvre reste le texte libre coproprietes.maitre_oeuvre (0104),
--     relié aux fiches prestataires par leur raison sociale (0119, 0120) : rien
--     à changer côté base.

alter table coproprietes add column if not exists date_ag date;
comment on column coproprietes.date_ag is
  'Date d''AG saisie à la création du dossier (fenêtre « Nouvelle copropriété » ou import CSV, 0121).';

alter table honoraires_dossiers
  add column if not exists p1_montant_ht numeric(12, 2) check (p1_montant_ht is null or p1_montant_ht > 0),
  add column if not exists p1_saisi_le timestamptz,
  add column if not exists p1_saisi_par uuid references profiles(user_id) on delete set null;

comment on column honoraires_dossiers.p1_montant_ht is
  'Honoraires HT de la phase études saisis (0121) : 50 % P1a, 25 % P1b, 25 % P1c.';

alter table honoraires_saisies drop constraint if exists honoraires_saisies_type_check;
alter table honoraires_saisies add constraint honoraires_saisies_type_check check (type in ('p1', 'p2', 'cee'));

-- Photographie des jalons touchés et de la base du dossier, avant écriture (+ p1)
create or replace function honoraires_photo_avant(p_copro_id uuid, p_type text, p_codes text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'jalons', (
      select jsonb_object_agg(
        c.code,
        case when j.jalon is null then jsonb_build_object('existe', false)
             else jsonb_build_object('existe', true, 'montant', j.montant_ht, 'updated_at', j.updated_at, 'updated_by', j.updated_by)
        end)
      from unnest(p_codes) as c(code)
      left join honoraires_jalons j on j.copro_id = p_copro_id and j.jalon = c.code
    ),
    'base', (
      select case p_type
        when 'p1' then jsonb_build_object('valeur', d.p1_montant_ht, 'saisi_le', d.p1_saisi_le, 'saisi_par', d.p1_saisi_par)
        when 'p2' then jsonb_build_object('valeur', d.p2_montant_ht, 'saisi_le', d.p2_saisi_le, 'saisi_par', d.p2_saisi_par)
        else jsonb_build_object('valeur', d.cee_kwhc, 'saisi_le', d.cee_saisi_le, 'saisi_par', d.cee_saisi_par)
      end
      from (select 1) as un
      left join honoraires_dossiers d on d.copro_id = p_copro_id
    )
  );
$$;
revoke execute on function honoraires_photo_avant(uuid, text, text[]) from public, anon, authenticated;

create or replace function honoraires_saisir_p1(p_copro_id uuid, p_montant_ht numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric(12, 2);
  a numeric(12, 2);
  b numeric(12, 2);
  photo jsonb;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  if p_montant_ht is null or p_montant_ht <= 0 then
    raise exception 'Indiquez un montant HT positif pour la phase études';
  end if;
  if not exists (select 1 from coproprietes where id = p_copro_id and deleted_at is null) then
    raise exception 'Dossier introuvable';
  end if;

  total := round(p_montant_ht, 2);
  a := round(total * 0.5, 2);
  b := round(total * 0.25, 2);
  photo := honoraires_photo_avant(p_copro_id, 'p1', array['P1a', 'P1b', 'P1c']);

  -- P1c prend le reste : la somme des trois jalons égale toujours le montant saisi
  insert into honoraires_jalons (copro_id, jalon, montant_ht, updated_at, updated_by)
  values
    (p_copro_id, 'P1a', a, now(), auth.uid()),
    (p_copro_id, 'P1b', b, now(), auth.uid()),
    (p_copro_id, 'P1c', total - a - b, now(), auth.uid())
  on conflict (copro_id, jalon) do update
    set montant_ht = excluded.montant_ht, updated_at = now(), updated_by = auth.uid();

  insert into honoraires_dossiers (copro_id, p1_montant_ht, p1_saisi_le, p1_saisi_par)
  values (p_copro_id, total, now(), auth.uid())
  on conflict (copro_id) do update
    set p1_montant_ht = excluded.p1_montant_ht, p1_saisi_le = now(), p1_saisi_par = auth.uid();

  insert into honoraires_saisies (copro_id, type, valeur, avant, apres, saisi_le, saisi_par)
  values (p_copro_id, 'p1', total, photo, jsonb_build_object('P1a', a, 'P1b', b, 'P1c', total - a - b), now(), auth.uid());
end;
$$;

revoke execute on function honoraires_saisir_p1(uuid, numeric) from public, anon;
grant execute on function honoraires_saisir_p1(uuid, numeric) to authenticated;

-- Annulation : même mécanique qu'en 0113, étendue à la saisie de la P1
create or replace function honoraires_annuler_saisie(p_copro_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s honoraires_saisies%rowtype;
  code text;
  j jsonb;
  base jsonb;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  if p_type not in ('p1', 'p2', 'cee') then
    raise exception 'Type de saisie inconnu';
  end if;

  select * into s from honoraires_saisies
  where copro_id = p_copro_id and type = p_type and annule_le is null
  order by ordre desc
  limit 1
  for update;
  if not found then
    raise exception 'Aucune saisie à annuler pour ce dossier';
  end if;

  for code, j in select * from jsonb_each(s.avant -> 'jalons') loop
    if (j ->> 'existe')::boolean then
      update honoraires_jalons
        set montant_ht = (j ->> 'montant')::numeric,
            updated_at = coalesce((j ->> 'updated_at')::timestamptz, now()),
            updated_by = (j ->> 'updated_by')::uuid
      where copro_id = p_copro_id and jalon = code;
    else
      -- jalon créé par la saisie : retiré, sauf s'il a été facturé entre-temps
      delete from honoraires_jalons where copro_id = p_copro_id and jalon = code and etat = 'a_facturer';
      update honoraires_jalons set montant_ht = null, updated_at = now(), updated_by = auth.uid()
      where copro_id = p_copro_id and jalon = code;
    end if;
  end loop;

  base := s.avant -> 'base';
  if p_type = 'p1' then
    update honoraires_dossiers
      set p1_montant_ht = (base ->> 'valeur')::numeric,
          p1_saisi_le = (base ->> 'saisi_le')::timestamptz,
          p1_saisi_par = (base ->> 'saisi_par')::uuid
    where copro_id = p_copro_id;
  elsif p_type = 'p2' then
    update honoraires_dossiers
      set p2_montant_ht = (base ->> 'valeur')::numeric,
          p2_saisi_le = (base ->> 'saisi_le')::timestamptz,
          p2_saisi_par = (base ->> 'saisi_par')::uuid
    where copro_id = p_copro_id;
  else
    update honoraires_dossiers
      set cee_kwhc = (base ->> 'valeur')::numeric,
          cee_saisi_le = (base ->> 'saisi_le')::timestamptz,
          cee_saisi_par = (base ->> 'saisi_par')::uuid
    where copro_id = p_copro_id;
  end if;

  update honoraires_saisies set annule_le = now(), annule_par = auth.uid() where id = s.id;
end;
$$;

revoke execute on function honoraires_annuler_saisie(uuid, text) from public, anon;
grant execute on function honoraires_annuler_saisie(uuid, text) to authenticated;
