-- 0125 - Consultation restreinte aux entreprises choisies (idée d'Amir du
-- 01/10/2026 à 17:57, page /consultations) : à côté de « Mettre en ligne et
-- alerter les prestataires », « Choisir les prestataires à alerter » ouvre la
-- liste des entreprises du métier demandé ; seules celles cochées sont alertées.
--
-- consultations.prestataires_choisis :
--   null  = consultation ouverte à toutes les entreprises du métier (règle
--           0122 : prestations, départements, « Ne pas consulter ») ;
--   liste = consultation restreinte : seules ces entreprises sont alertées
--           (notifier-consultation, relances comprises) et la voient dans leur
--           espace (fiche, dossier, questions, candidature, fiche copropriété).
-- Le choix de l'équipe passe outre les départements de l'entreprise, jamais
-- son « Ne pas consulter » (filtres de notifier-consultation et de
-- src/lib/departements.ts). Une entreprise qui a candidaté garde son suivi
-- (a_postule), même retirée de la liste.

alter table consultations add column if not exists prestataires_choisis uuid[];

alter table consultations drop constraint if exists consultations_prestataires_choisis_non_vide;
alter table consultations add constraint consultations_prestataires_choisis_non_vide
  check (prestataires_choisis is null or cardinality(prestataires_choisis) > 0);

comment on column consultations.prestataires_choisis is
  'Entreprises choisies par l''équipe (0125) : seules alertées et seules à voir la consultation. null = toutes les entreprises du métier.';

-- ---------- Lecture de la consultation par une entreprise ----------
drop policy if exists consultations_presta_read on consultations;
create policy consultations_presta_read on consultations
  for select to authenticated
  using (
    (
      statut = 'en_ligne'
      and type = any (my_presta_types())
      and (prestataires_choisis is null or my_prestataire_id() = any (prestataires_choisis))
    )
    or a_postule(id)
  );

-- dossier de consultation (documents, stockage), questions, traces d'accès
create or replace function peut_voir_consultation(p_consultation_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select is_amo() or exists (
    select 1 from consultations c
    where c.id = p_consultation_id
      and (
        (
          c.statut = 'en_ligne'
          and c.type = any (my_presta_types())
          and (c.prestataires_choisis is null or my_prestataire_id() = any (c.prestataires_choisis))
        )
        or a_postule(c.id)
      )
  );
$$;

-- dépôt d'une candidature
create or replace function peut_postuler(p_consultation_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from consultations c
    join prestataires p on p.user_id = auth.uid() and p.actif
    where c.id = p_consultation_id
      and c.statut = 'en_ligne'
      and c.type = any (p.types)
      and (c.prestataires_choisis is null or p.id = any (c.prestataires_choisis))
  );
$$;

-- fiche de la copropriété (nom, adresse, phase) pour situer la consultation
create or replace function copro_visible_presta(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from consultations c
    join prestataires p on p.user_id = auth.uid() and p.actif
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

-- question posée à l'équipe sur une consultation en ligne
drop policy if exists consultation_questions_presta_insert on consultation_questions;
create policy consultation_questions_presta_insert on consultation_questions
  for insert to authenticated
  with check (
    prestataire_id = my_prestataire_id()
    and reponse is null
    and answered_at is null
    and exists (
      select 1 from consultations c
      where c.id = consultation_questions.consultation_id
        and c.statut = 'en_ligne'
        and c.type = any (my_presta_types())
        and (c.prestataires_choisis is null or my_prestataire_id() = any (c.prestataires_choisis))
    )
  );

revoke execute on function peut_voir_consultation(uuid) from anon;
revoke execute on function peut_postuler(uuid) from anon;
revoke execute on function copro_visible_presta(uuid) from anon;
