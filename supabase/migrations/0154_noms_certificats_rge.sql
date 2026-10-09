-- 0154 - Certificats RGE déjà déposés : « RGE {ENTREPRISE} », sans la copropriété (feedback
-- Amir du 09/10/2026, même règle que les nouveaux dépôts : src/lib/nommage.ts, SANS_COPRO).
--
--   « RGE - 53 RUE DE LA COURSE - Qualibat - DECOPEINT - 2026-10-09.pdf »
--   devient « RGE DECOPEINT - Qualibat - 2026-10-09.pdf »
--
-- Noms repris : « RGE - COPRO - ... » (0151 et vérification RGE jusqu'au 09/10) et l'ancien
-- format « COPRO - Attestation RGE - ... ». La copropriété doit être celle du dossier (sinon
-- le nom n'est pas touché). Entreprise = dernier segment en majuscules avant la date ; sans
-- entreprise, le nom devient « RGE - ... ». Fichiers et entrées montage_docs du même fichier.
--
-- Retour arrière : anciens noms dans public.sauvegarde_noms_cegee, cibles « fichiers (0154) »
-- et « montage_docs (0154) » (même procédure que 0153). Rejouer ne change plus rien.

-- Même nettoyage que nomFichierSansAccents (src/lib/nommage.ts), comme 0151 et 0153.
create function pg_temp.sans_accents(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    translate(replace(replace(t, 'œ', 'oe'), 'Œ', 'OE'),
              'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'),
    '[^A-Za-z0-9 ._()-]+', '-', 'g'), '-{2,}', '-', 'g'), ' {2,}', ' ', 'g'), ' ?- ?[.]', '.', 'g'))
$$;

-- Préfixe d'un nom de fichier pour une copropriété (chr(92) = barre oblique inverse).
create function pg_temp.prefixe(t text) returns text language sql immutable as $$
  select pg_temp.sans_accents(upper(regexp_replace(
    translate(coalesce(t, ''), chr(92) || '/:*?"<>|', '         '), '[[:space:]]+', ' ', 'g')))
$$;

-- Nouveau nom, ou null si le nom n'est pas concerné.
create function pg_temp.nom_rge(nom text, copro text) returns text
language plpgsql immutable as $$
declare
  sans_ext text := regexp_replace(nom, '[.][A-Za-z0-9]{1,8}$', '');
  ext text := coalesce(substring(nom from '[.][A-Za-z0-9]{1,8}$'), '');
  s text[] := string_to_array(sans_ext, ' - ');
  sn text[] := string_to_array(lower(sans_ext), ' - ');
  c text := upper(pg_temp.prefixe(copro));
  k int := coalesce(array_length(string_to_array(pg_temp.prefixe(copro), ' - '), 1), 0);
  reste text[];
  i int;
  j int;
  i_date int;
  i_emetteur int;
  emetteur text;
  resultat text;
begin
  if k = 0 or coalesce(array_length(s, 1), 0) < 2 then return null; end if;
  if upper(s[1]) = 'RGE' and upper(array_to_string(s[2:1 + k], ' - ')) = c then
    reste := s[2 + k:];
  else
    select min(g) into i from generate_subscripts(sn, 1) g
      where g between 2 and 4 and sn[g] = 'attestation rge'
        and upper(array_to_string(s[1:g - 1], ' - ')) = c;
    if i is null then return null; end if;
    reste := s[i + 1:];
  end if;

  i_date := null;
  for j in 1 .. coalesce(array_length(reste, 1), 0) loop
    if reste[j] ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then i_date := j; exit; end if;
  end loop;
  i_emetteur := null;
  for j in reverse coalesce(i_date - 1, coalesce(array_length(reste, 1), 0)) .. 1 loop
    if reste[j] = upper(reste[j]) and reste[j] ~ '[A-Z]' then i_emetteur := j; exit; end if;
  end loop;
  emetteur := reste[i_emetteur];
  if i_emetteur is not null then reste := reste[1:i_emetteur - 1] || reste[i_emetteur + 1:]; end if;

  resultat := pg_temp.sans_accents(array_to_string(
    array[case when emetteur is null then 'RGE' else 'RGE ' || emetteur end] || reste, ' - ')) || ext;
  return nullif(resultat, nom);
end
$$;

-- sauvegarde des anciens noms, avant toute modification
insert into public.sauvegarde_noms_cegee (cible, ref, ancien, nouveau)
select 'fichiers (0154)', f.id::text, f.name, x.nouveau
from public.fichiers f
join public.coproprietes c on c.id = f.copro_id
cross join lateral (select pg_temp.nom_rge(f.name, c.name) as nouveau) x
where f.dossier <> 'Facturation' and x.nouveau is not null
on conflict do nothing;

insert into public.sauvegarde_noms_cegee (cible, ref, ancien, nouveau)
select 'montage_docs (0154)', d.copro_id || '/' || d.montage || '/' || d.doc_key || '/' || (e ->> 'path'),
       e ->> 'name', x.nouveau
from public.montage_docs d
join public.coproprietes c on c.id = d.copro_id
cross join lateral jsonb_array_elements(d.files) e
cross join lateral (select pg_temp.nom_rge(e ->> 'name', c.name) as nouveau) x
where x.nouveau is not null
on conflict do nothing;

update public.fichiers f
set name = s.nouveau
from public.sauvegarde_noms_cegee s
where s.cible = 'fichiers (0154)' and s.ref = f.id::text and f.name = s.ancien;

update public.montage_docs d
set files = (
  select jsonb_agg(
    case when s.nouveau is not null and t.e ->> 'name' = s.ancien then jsonb_set(t.e, '{name}', to_jsonb(s.nouveau)) else t.e end
    order by t.ord)
  from jsonb_array_elements(d.files) with ordinality as t(e, ord)
  left join public.sauvegarde_noms_cegee s
    on s.cible = 'montage_docs (0154)'
   and s.ref = d.copro_id || '/' || d.montage || '/' || d.doc_key || '/' || (t.e ->> 'path')
)
where exists (
  select 1 from jsonb_array_elements(d.files) e
  join public.sauvegarde_noms_cegee s
    on s.cible = 'montage_docs (0154)'
   and s.ref = d.copro_id || '/' || d.montage || '/' || d.doc_key || '/' || (e ->> 'path')
   and s.ancien = e ->> 'name'
);
