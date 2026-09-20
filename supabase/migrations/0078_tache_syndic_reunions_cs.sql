-- 0078 - Feedback Amir 17/09/2026 (page Projet syndic, phase Diagnostic) :
-- « Ajouter dans les plateaux de diagnostic : organisation de réunions de
-- conseils syndicaux ». Nouvelle tâche du gabarit syndic, phase Diagnostic,
-- rang 6 (après la préparation de l'AG), clé 'reunions-cs'.
--
-- Gabarit : la fonction seed_syndic_taches (0048) est recréée avec la ligne
-- supplémentaire - elle reste idempotente (on conflict do nothing) et semée
-- au chargement des vues syndic.
-- Dossiers existants : la tâche est insérée tout de suite. Elle est marquée
-- faite quand le dossier a dépassé le diagnostic OU quand toutes ses autres
-- tâches de diagnostic sont déjà faites, pour ne pas faire reculer la couleur
-- d'avancement (phaseAvancement = première phase avec une tâche non faite).

create or replace function seed_syndic_taches(p_copro_ids uuid[])
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c record;
  rang int;
begin
  for c in
    select id, phase from coproprietes
    where id = any (p_copro_ids) and deleted_at is null
  loop
    if not (is_amo() or is_syndic_of(c.id)) then continue; end if;
    rang := case c.phase when 'diagnostic' then 0 when 'etudes' then 1 else 2 end;
    insert into syndic_taches (copro_id, cle, titre, tag, phase, ordre, statut)
    values
      -- Diagnostic
      (c.id, 'cdc-moe',               'Validation du cahier des charges de la MOE',                        null,     'diagnostic', 1, case when rang > 0 then 'done' else 'todo' end),
      (c.id, 'intervenants-annexes',  'Validation des intervenants annexes',                               null,     'diagnostic', 2, case when rang > 0 then 'done' else 'todo' end),
      (c.id, 'transmission-documents','Transmission des documents signés et des données de la copropriété', null,     'diagnostic', 3, case when rang > 0 then 'done' else 'todo' end),
      (c.id, 'comptes-aides',         'Ouverture des comptes sur les plateformes d''aides',                'Aides',  'diagnostic', 4, case when rang > 0 then 'done' else 'todo' end),
      (c.id, 'preparation-ag-diag',   'Préparation de l''AG si nécessaire',                                'AG',     'diagnostic', 5, case when rang > 0 then 'done' else 'todo' end),
      (c.id, 'reunions-cs',           'Organisation des réunions de conseil syndical',                     null,     'diagnostic', 6, case when rang > 0 then 'done' else 'todo' end),
      -- Études
      (c.id, 'registre',              'Mise à jour du registre de copropriété',                            null,     'etudes', 1, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'siret',                 'Demande d''un numéro SIRET pour la copropriété si nécessaire',      null,     'etudes', 2, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'fiche-etat',            'Signature de la fiche État',                                        null,     'etudes', 3, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'resolution-pret',       'Résolution de prêt bancaire',                                       'Banque', 'etudes', 4, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'tarification-do',       'Demande de tarification dommages-ouvrage',                          'DO',     'etudes', 5, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'ag-vote-travaux',       'Préparation de l''AG - vote des travaux',                           'AG',     'etudes', 6, case when rang > 1 then 'done' else 'todo' end),
      -- Travaux
      (c.id, 'docs-signes',           'Envoi des documents signés',                                        null,     'travaux', 1, 'todo'),
      (c.id, 'compte-travaux',        'Ouverture du compte bancaire travaux',                              'Banque', 'travaux', 2, 'todo'),
      (c.id, 'dossiers-aides',        'Validation des dossiers d''aides',                                  'Aides',  'travaux', 3, 'todo'),
      (c.id, 'accord-do',             'Demande d''accord dommages-ouvrage',                                'DO',     'travaux', 4, 'todo'),
      (c.id, 'appels-fonds',          'Suivi des appels de fonds',                                         null,     'travaux', 5, 'todo'),
      (c.id, 'signature-pret',        'Signature de la demande de prêt',                                   'Banque', 'travaux', 6, 'todo'),
      (c.id, 'os-travaux',            'Démarrage de chantier - OS travaux',                                null,     'travaux', 7, 'todo'),
      (c.id, 'suivi-chantier',        'Suivi de chantier',                                                 null,     'travaux', 8, 'todo'),
      (c.id, 'acompte-aides',         'Demande d''acompte d''aides',                                       'Aides',  'travaux', 9, 'todo'),
      (c.id, 'solde-pv',              'Demande de solde (PV de réception)',                                'Aides',  'travaux', 10, 'todo')
    on conflict (copro_id, cle) do nothing;
  end loop;
end;
$$;

-- 0070 : la fonction n'est pas exécutable par anon (le create or replace
-- conserve les droits, on le réaffirme par sécurité).
revoke execute on function public.seed_syndic_taches(uuid[]) from anon;

-- Dossiers déjà semés : ajout immédiat de la nouvelle tâche.
insert into syndic_taches (copro_id, cle, titre, tag, phase, ordre, statut)
select
  c.id,
  'reunions-cs',
  'Organisation des réunions de conseil syndical',
  null,
  'diagnostic',
  6,
  case
    when c.phase <> 'diagnostic' then 'done'
    when exists (select 1 from syndic_taches t where t.copro_id = c.id and t.phase = 'diagnostic')
     and not exists (select 1 from syndic_taches t where t.copro_id = c.id and t.phase = 'diagnostic' and t.statut <> 'done')
      then 'done'
    else 'todo'
  end
from coproprietes c
where c.deleted_at is null
  and exists (select 1 from syndic_taches t where t.copro_id = c.id)
on conflict (copro_id, cle) do nothing;
