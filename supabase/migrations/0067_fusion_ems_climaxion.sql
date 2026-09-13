-- 0067 - Feedback d'Amir du 13/09/2026 : les checklists « Climaxion » et
-- « Eurométropole » fusionnent en une seule, « EMS & Climaxion », partout
-- (onglet Fichiers de l'AMO, dossier récapitulatif, page Documents à produire
-- du syndic). La clé `dispositif` conservée est « climaxion » ; la nouvelle
-- liste des 25 pièces vit dans le gabarit client (CHECKLIST_TEMPLATES) et le
-- dossier syndic dans CLIMAXION_ETAPES (src/api/montage.ts).
--
-- État vérifié le 13/09/2026 : 3 checklists Climaxion (21 items) et 3
-- Eurométropole (18 items), aucune case cochée, aucun fichier lié.

-- 1. Les checklists Eurométropole disparaissent (garde-fou : seulement si rien
--    n'y a été coché ni lié). Un ancien bundle qui les recréerait n'est plus
--    gênant : le client n'affiche que les dispositifs du gabarit.
delete from checklists c
  where c.dispositif = 'eurometropole'
    and not exists (
      select 1 from checklist_items i
      where i.checklist_id = c.id and (i.done or i.fichier_id is not null)
    );

-- 2. Libellé fusionné.
update checklists set label = 'EMS & Climaxion' where dispositif = 'climaxion';

-- 3. Pièces des checklists Climaxion existantes remplacées par la liste commune
--    (uniquement celles où rien n'est coché ni lié). Le client resynchronise
--    désormais aussi les pièces depuis le gabarit dans ce cas.
with cibles as (
  select c.id from checklists c
  where c.dispositif = 'climaxion'
    and not exists (
      select 1 from checklist_items i
      where i.checklist_id = c.id and (i.done or i.fichier_id is not null)
    )
),
suppr as (
  delete from checklist_items where checklist_id in (select id from cibles) returning 1
),
pieces(label, position) as (
  values
    ('Fiche synthétique de la copropriété', 0),
    ('Attestation de mise à jour du registre de copropriété', 1),
    ('Attestation de composition de la copropriété signée par le syndic', 2),
    ('Règlement de copropriété', 3),
    ('Attestation logement décent (modèle)', 4),
    ('PV d''AGE validant le lancement de l''AMO', 5),
    ('RIB du compte travaux', 6),
    ('Convention AMO', 7),
    ('Mandat de délégation de dépôt à l''AMO (modèle)', 8),
    ('PV d''AG validant la maîtrise d''œuvre', 9),
    ('Audit énergétique réglementaire et fichiers sources', 10),
    ('Offre de la maîtrise d''œuvre', 11),
    ('Plan de financement définitif de l''opération', 12),
    ('Rapport des tests initiaux d''étanchéité à l''air', 13),
    ('Mémoire technique', 14),
    ('Plans, coupes et photos des bâtiments', 15),
    ('PV d''AGE validant les travaux', 16),
    ('Attestation de conformité des offres (modèle)', 17),
    ('Rapport de conformité des offres (modèle)', 18),
    ('CCTP et DPGF des lots énergétiques', 19),
    ('Devis de remplacement des fenêtres', 20),
    ('Planning prévisionnel de l''opération', 21),
    ('Avis d''imposition des personnes éligibles aux aides (espace copropriétaires)', 22),
    ('Tableau récapitulatif des primes individuelles', 23),
    ('Liste des bénéficiaires', 24)
)
insert into checklist_items (checklist_id, label, position)
select c.id, p.label, p.position from cibles c cross join pieces p;

-- 4. Onglet Fichiers : libellé du dossier de montage « climaxion » aligné
--    (« ClimAxion » → « EMS & Climaxion »). Corps identique à 0066 sinon.
create or replace function documents_dossier(p_copro_id uuid)
returns table (
  id text,
  name text,
  path text,
  taille bigint,
  dossier text,
  depose_le timestamptz,
  origine text
)
language sql stable security definer
set search_path = public
as $$
  with autorise as (select is_syndic_of(p_copro_id) or is_amo() as ok, is_amo() as amo)
  select f.id::text,
         f.name,
         f.storage_path,
         f.size,
         f.dossier,
         f.created_at,
         case p.role when 'moe' then 'moe' when 'syndic' then 'syndic' else 'amo' end
  from fichiers f
  left join profiles p on p.user_id = f.uploaded_by
  cross join autorise a
  where f.copro_id = p_copro_id and a.ok

  union all

  select d.id::text || '-' || (e.ord - 1)::text,
         e.f ->> 'name',
         e.f ->> 'path',
         nullif(e.f ->> 'size', '')::bigint,
         coalesce(m.label, 'Documents à produire'),
         nullif(e.f ->> 'uploaded_at', '')::timestamptz,
         coalesce(
           (select case pp.role when 'moe' then 'moe' when 'amo' then 'amo' else 'syndic' end
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
revoke execute on function documents_dossier(uuid) from anon, public;
