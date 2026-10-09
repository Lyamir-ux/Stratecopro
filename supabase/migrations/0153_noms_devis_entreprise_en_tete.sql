-- 0153 - Devis et contrats déjà déposés : l'entreprise suit le terme de la banque, la
-- copropriété vient ensuite (feedback Amir du 09/10/2026, même règle que les nouveaux
-- dépôts : src/lib/nommage.ts, TERMES_ENTREPRISE_EN_TETE).
--
--   « 53 RUE DE LA COURSE - Devis - ITE - DECOPEINT - 2026-10-09 - signe.pdf »
--   devient « DEVIS ENTREPRISE - DECOPEINT - 53 RUE DE LA COURSE - ITE - 2026-10-09 - signe.pdf »
--   « LE RODIN - Contrat AMO - signe.pdf » devient « DEVIS HONORAIRES - STRAT ECO - LE RODIN - signe.pdf »
--
-- Ligne de la banque « Devis détaillés des travaux - 1 an / Marché de travaux » = DEVIS
-- ENTREPRISE : devis (sauf dossier des études), devis / DPGF des travaux, devis de
-- remplacement des fenêtres, marché de travaux. Ligne « Devis des honoraires (syndic,
-- maîtrise d'oeuvre, SPS, DO, bureau de contrôle, diagnostic amiante...) » = DEVIS
-- HONORAIRES : devis d'honoraires MOE et études, contrats AMO et MOE, offre de MOE, offre
-- d'assurance, convention de contrôle technique, devis classés dans « Devis des études
-- techniques et Frais Annexes » (SPS, contrôle technique, tests d'étanchéité...).
-- Les noms déjà convertis par 0151 (« DEVIS ENTREPRISE - COPRO - ... ») sont remis dans
-- le nouvel ordre.
--
-- Entreprise : le dernier segment en majuscules avant la date ; à défaut STRAT ECO pour un
-- contrat AMO, le maître d'oeuvre du dossier (coproprietes.maitre_oeuvre) pour un contrat
-- ou une offre de MOE ; sinon le nom reste sans entreprise.
-- Le nom change à deux endroits qui doivent rester identiques : fichiers.name et les
-- entrées montage_docs.files du même fichier (l'entrée prend le dossier du fichier de même
-- chemin). L'objet Storage ne bouge pas. Dossier Facturation non touché.
--
-- Retour arrière : anciens noms dans public.sauvegarde_noms_cegee, cibles « fichiers (0153) »
-- et « montage_docs (0153) » :
--   update fichiers f set name = s.ancien from sauvegarde_noms_cegee s
--     where s.cible = 'fichiers (0153)' and s.ref = f.id::text and f.name = s.nouveau;
--   et, pour chaque ligne cible = 'montage_docs (0153)', remettre files[].name = ancien là où
--   files[].path = dernier segment de ref.
-- Rejouer la migration ne change plus rien (les mises à jour partent de la sauvegarde et
-- ne touchent qu'un nom encore égal à l'ancien).

-- Même nettoyage que nomFichierSansAccents (src/lib/nommage.ts), comme 0151.
create function pg_temp.sans_accents(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    translate(replace(replace(t, 'œ', 'oe'), 'Œ', 'OE'),
              'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'),
    '[^A-Za-z0-9 ._()-]+', '-', 'g'), '-{2,}', '-', 'g'), ' {2,}', ' ', 'g'), ' ?- ?[.]', '.', 'g'))
$$;

-- Préfixe d'un nom de fichier pour une copropriété (construireNomFichier : caractères
-- interdits remplacés par une espace, majuscules, sans accent).
create function pg_temp.prefixe(t text) returns text language sql immutable as $$
  -- chr(92) = barre oblique inverse, écrite ainsi pour passer sans dommage par l'outil MCP
  select pg_temp.sans_accents(upper(regexp_replace(
    translate(coalesce(t, ''), chr(92) || '/:*?"<>|', '         '), '[[:space:]]+', ' ', 'g')))
$$;

-- Nouveau nom, ou null si le nom n'est pas concerné ou déjà dans le nouvel ordre.
create function pg_temp.nom_devis(nom text, copro text, moe text, dossier text) returns text
language plpgsql immutable as $$
declare
  sans_ext text := regexp_replace(nom, '[.][A-Za-z0-9]{1,8}$', '');
  ext text := coalesce(substring(nom from '[.][A-Za-z0-9]{1,8}$'), '');
  s text[] := string_to_array(sans_ext, ' - ');
  sn text[] := string_to_array(translate(lower(sans_ext), 'àâäéèêëîïôöùûüç''’', 'aaaeeeeiioouuuc--'), ' - ');
  c text[] := string_to_array(pg_temp.prefixe(copro), ' - ');
  k int := coalesce(array_length(string_to_array(pg_temp.prefixe(copro), ' - '), 1), 0);
  n int := coalesce(array_length(s, 1), 0);
  terme text;
  defaut text;
  copro_segs text[];
  reste text[];
  i int;
  j int;
  i_date int;
  i_emetteur int;
  emetteur text;
  r record;
  resultat text;
begin
  if n = 0 then return null; end if;
  if upper(s[1]) in ('DEVIS ENTREPRISE', 'DEVIS HONORAIRES') then
    -- format de 0151 : « TERME - COPRO - ... » ; déjà au nouvel ordre si la copropriété est en 3e
    terme := upper(s[1]);
    if k > 0 and upper(array_to_string(s[3:2 + k], ' - ')) = upper(array_to_string(c, ' - ')) then return null; end if;
    if k > 0 and upper(array_to_string(s[2:1 + k], ' - ')) = upper(array_to_string(c, ' - ')) then
      copro_segs := s[2:1 + k];
      reste := s[2 + k:];
    else
      copro_segs := s[2:2];
      reste := s[3:];
    end if;
  else
    -- ancien format « COPRO - Type - ... » : le type suit la copropriété (son nom, ou un seul segment)
    -- « Devis - DPGF des travaux » (libellé à « / » coupé au dépôt) avant le « Devis » seul
    for r in select * from (values
        (1, 'devis', 'dpgf des travaux', 'DEVIS ENTREPRISE', 2, null),
        (2, 'devis remplacement des fenetres', null, 'DEVIS ENTREPRISE', 1, null),
        (3, 'marche de travaux', null, 'DEVIS ENTREPRISE', 1, null),
        (4, 'devis', null, 'DEVIS', 1, null),
        (5, 'devis honoraires moe et etudes', null, 'DEVIS HONORAIRES', 1, null),
        (6, 'contrat amo', null, 'DEVIS HONORAIRES', 1, 'amo'),
        (7, 'contrat moe', null, 'DEVIS HONORAIRES', 1, 'moe'),
        (8, 'offre de maitrise d-oeuvre', null, 'DEVIS HONORAIRES', 1, 'moe'),
        (9, 'offre d-assurance', null, 'DEVIS HONORAIRES', 1, null),
        (10, 'convention de controle technique', null, 'DEVIS HONORAIRES', 1, null)
      ) as fam(ordre, l1, l2, terme, len, defaut) order by ordre
    loop
      select min(g) into i from generate_subscripts(sn, 1) g
        where g between 2 and 4 and sn[g] = r.l1 and (r.l2 is null or sn[g + 1] = r.l2)
          and (g = 2 or upper(array_to_string(s[1:g - 1], ' - ')) = upper(array_to_string(c, ' - ')));
      if i is not null then
        terme := case when r.terme <> 'DEVIS' then r.terme
                      when dossier = 'Devis des études techniques et Frais Annexes' then 'DEVIS HONORAIRES'
                      else 'DEVIS ENTREPRISE' end;
        defaut := case r.defaut when 'amo' then 'STRAT ECO' when 'moe' then nullif(trim(upper(moe)), '') end;
        copro_segs := s[1:i - 1];
        reste := s[i + r.len:];
        exit;
      end if;
    end loop;
    if terme is null then return null; end if;
  end if;

  -- entreprise : dernier segment en majuscules avant la date (ou avant la fin, sans date)
  i_date := null;
  for j in 1 .. coalesce(array_length(reste, 1), 0) loop
    if reste[j] ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then i_date := j; exit; end if;
  end loop;
  i_emetteur := null;
  for j in reverse coalesce(i_date - 1, coalesce(array_length(reste, 1), 0)) .. 1 loop
    if reste[j] = upper(reste[j]) and reste[j] ~ '[A-Z]' then i_emetteur := j; exit; end if;
  end loop;
  emetteur := coalesce(reste[i_emetteur], defaut);
  if i_emetteur is not null then reste := reste[1:i_emetteur - 1] || reste[i_emetteur + 1:]; end if;

  resultat := pg_temp.sans_accents(array_to_string(
    array[terme] || case when emetteur is null then '{}'::text[] else array[emetteur] end || copro_segs || reste,
    ' - ')) || ext;
  return nullif(resultat, nom);
end
$$;

-- sauvegarde des anciens noms, avant toute modification
insert into public.sauvegarde_noms_cegee (cible, ref, ancien, nouveau)
select 'fichiers (0153)', f.id::text, f.name, x.nouveau
from public.fichiers f
join public.coproprietes c on c.id = f.copro_id
cross join lateral (select pg_temp.nom_devis(f.name, c.name, c.maitre_oeuvre, f.dossier) as nouveau) x
where f.dossier <> 'Facturation' and x.nouveau is not null
on conflict do nothing;

insert into public.sauvegarde_noms_cegee (cible, ref, ancien, nouveau)
select 'montage_docs (0153)', d.copro_id || '/' || d.montage || '/' || d.doc_key || '/' || (e ->> 'path'),
       e ->> 'name', x.nouveau
from public.montage_docs d
join public.coproprietes c on c.id = d.copro_id
cross join lateral jsonb_array_elements(d.files) e
cross join lateral (
  select pg_temp.nom_devis(e ->> 'name', c.name, c.maitre_oeuvre,
    (select f.dossier from public.fichiers f where f.storage_path = e ->> 'path' limit 1)) as nouveau
) x
where x.nouveau is not null
on conflict do nothing;

update public.fichiers f
set name = s.nouveau
from public.sauvegarde_noms_cegee s
where s.cible = 'fichiers (0153)' and s.ref = f.id::text and f.name = s.ancien;

update public.montage_docs d
set files = (
  select jsonb_agg(
    case when s.nouveau is not null and t.e ->> 'name' = s.ancien then jsonb_set(t.e, '{name}', to_jsonb(s.nouveau)) else t.e end
    order by t.ord)
  from jsonb_array_elements(d.files) with ordinality as t(e, ord)
  left join public.sauvegarde_noms_cegee s
    on s.cible = 'montage_docs (0153)'
   and s.ref = d.copro_id || '/' || d.montage || '/' || d.doc_key || '/' || (t.e ->> 'path')
)
where exists (
  select 1 from jsonb_array_elements(d.files) e
  join public.sauvegarde_noms_cegee s
    on s.cible = 'montage_docs (0153)'
   and s.ref = d.copro_id || '/' || d.montage || '/' || d.doc_key || '/' || (e ->> 'path')
   and s.ancien = e ->> 'name'
);

comment on table public.sauvegarde_noms_cegee is
  'Anciens noms des pièces renommées selon la nomenclature de la Caisse d''Épargne (0151, puis 0153 pour les devis et contrats) - à supprimer une fois la reprise validée.';
