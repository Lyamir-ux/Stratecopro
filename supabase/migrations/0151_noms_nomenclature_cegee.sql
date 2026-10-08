-- 0151 - Pièces déjà déposées : le nom commence par le terme de la nomenclature de la
-- Caisse d'Épargne Grand Est (colonne D du classeur reçu le 08/10/2026), la copropriété
-- vient après - même règle que les nouveaux dépôts (src/lib/nommage.ts, NOMENCLATURE_CEGEE).
--
--   « LEO LAGRANGE - PV AG vote des travaux - TAH - 2026-06-23 - signe.pdf »
--   devient « PV AG TRAVAUX - LEO LAGRANGE - TAH - 2026-06-23 - signe.pdf »
--
-- Types concernés (les seuls présents en base sous l'ancien format) : devis / DPGF des
-- travaux, devis d'honoraires MOE et études, audit énergétique, PV d'AG de vote des
-- travaux et de mandat du syndic, demande de prêt, plus le RIB du compte de la copropriété
-- de l'éco-PTZ de Léo LAGRANGE (type reconnu par sa pièce, pas par son nom).
-- Le nom change à deux endroits qui doivent rester identiques : fichiers.name et les
-- entrées montage_docs.files du même fichier. L'objet Storage ne bouge pas (son chemin
-- n'est jamais affiché). Les noms déjà au nouveau format (saisis à la main) et le dossier
-- Facturation ne sont pas touchés ; rejouer la migration ne change plus rien.
-- « LA VIOLETTE - Convocation AG - Argumentaire » est volontairement laissé : c'est un
-- argumentaire typé par erreur « Convocation AG ».
--
-- Retour arrière : tout est dans public.sauvegarde_noms_cegee (ancien / nouveau nom) :
--   update fichiers f set name = s.ancien from sauvegarde_noms_cegee s
--     where s.cible = 'fichiers' and s.ref = f.id::text and f.name = s.nouveau;
--   et, pour chaque ligne cible = 'montage_docs', remettre files[].name = ancien là où
--   files[].path = dernier segment de ref.

create table if not exists public.sauvegarde_noms_cegee (
  cible text not null,
  ref text not null,
  ancien text not null,
  nouveau text not null,
  fait_le timestamptz not null default now(),
  primary key (cible, ref)
);
alter table public.sauvegarde_noms_cegee enable row level security;
revoke all on public.sauvegarde_noms_cegee from anon, authenticated;
comment on table public.sauvegarde_noms_cegee is
  'Anciens noms des pièces renommées selon la nomenclature de la Caisse d''Épargne (0151) - à supprimer une fois la reprise validée.';

-- Même nettoyage que nomFichierSansAccents (src/lib/nommage.ts) : ni accent ni caractère spécial.
create function pg_temp.sans_accents(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    translate(replace(replace(t, 'œ', 'oe'), 'Œ', 'OE'),
              'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'),
    '[^A-Za-z0-9 ._()-]+', '-', 'g'), '-{2,}', '-', 'g'), ' {2,}', ' ', 'g'), ' ?- ?[.]', '.', 'g'))
$$;

-- Nouveau nom d'un fichier à l'ancien format « COPRO - Type - objet - ÉMETTEUR - date » ;
-- null si le nom n'est pas à convertir. Le type se lit dans l'un des 4 premiers segments
-- (une copropriété peut avoir « - » dans son nom).
create function pg_temp.nom_cegee(nom text) returns text language plpgsql immutable as $$
declare
  sans_ext text := regexp_replace(nom, '[.][A-Za-z0-9]{1,8}$', '');
  ext text := coalesce(substring(nom from '[.][A-Za-z0-9]{1,8}$'), '');
  s text[] := string_to_array(sans_ext, ' - ');
  sn text[] := string_to_array(translate(lower(sans_ext), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), ' - ');
  r record;
  i int;
begin
  for r in select * from (values
      ('devis', 'dpgf des travaux', 'DEVIS ENTREPRISE', 2),
      ('devis honoraires moe et etudes', null, 'DEVIS HONORAIRES', 1),
      ('audit energetique', null, 'AUDIT', 1),
      ('pv ag vote des travaux', null, 'PV AG TRAVAUX', 1),
      ('pv ag mandat du syndic', null, 'PV AG SYNDIC', 1),
      ('demande de pret', null, 'DEMANDE DE PRET', 1)
    ) as fam(l1, l2, terme, len)
  loop
    select min(g) into i from generate_subscripts(sn, 1) g
      where g <= 4 and sn[g] = r.l1 and (r.l2 is null or sn[g + 1] = r.l2);
    if i is not null then
      return pg_temp.sans_accents(array_to_string(array[r.terme] || s[1:i - 1] || s[i + r.len:], ' - ') || ext);
    end if;
  end loop;
  -- type reconnu par sa pièce (éco-PTZ de Léo LAGRANGE, ligne rib_copro) plutôt que par son nom
  if nom = 'LEO LAGRANGE - RIB - copropriete.pdf' then
    return 'RIB COMPTE TRAVAUX - LEO LAGRANGE - copropriete.pdf';
  end if;
  return null;
end
$$;

-- sauvegarde des anciens noms, avant toute modification
insert into public.sauvegarde_noms_cegee (cible, ref, ancien, nouveau)
select 'fichiers', f.id::text, f.name, pg_temp.nom_cegee(f.name)
from public.fichiers f
where f.dossier <> 'Facturation' and pg_temp.nom_cegee(f.name) is not null
on conflict do nothing;

insert into public.sauvegarde_noms_cegee (cible, ref, ancien, nouveau)
select 'montage_docs', d.copro_id || '/' || d.montage || '/' || d.doc_key || '/' || (e ->> 'path'),
       e ->> 'name', pg_temp.nom_cegee(e ->> 'name')
from public.montage_docs d, jsonb_array_elements(d.files) e
where pg_temp.nom_cegee(e ->> 'name') is not null
on conflict do nothing;

update public.fichiers f
set name = s.nouveau
from public.sauvegarde_noms_cegee s
where s.cible = 'fichiers' and s.ref = f.id::text and f.name = s.ancien;

update public.montage_docs d
set files = (
  select jsonb_agg(
    case when n.nouveau is not null then jsonb_set(t.e, '{name}', to_jsonb(n.nouveau)) else t.e end
    order by t.ord)
  from jsonb_array_elements(d.files) with ordinality as t(e, ord)
  cross join lateral (select pg_temp.nom_cegee(t.e ->> 'name') as nouveau) n
)
where exists (select 1 from jsonb_array_elements(d.files) e where pg_temp.nom_cegee(e ->> 'name') is not null);
