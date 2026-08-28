-- 0048 — Feedbacks d'Amir du 28/08 (page Projet syndic) : refonte du gabarit
-- des tâches du syndic, phase par phase.
--   Diagnostic : validation du CDC de la MOE, validation des intervenants
--     annexes, transmission des documents signés et des données, ouverture des
--     comptes d'aides, préparation de l'AG si nécessaire.
--   Études : registre, SIRET si nécessaire, fiche État, résolution de prêt
--     bancaire, tarification DO, préparation de l'AG - vote des travaux.
--   Travaux : envoi des documents signés, compte travaux, dossiers d'aides,
--     accord DO, appels de fonds, signature de la demande de prêt, OS travaux,
--     suivi de chantier, acompte d'aides, solde (PV de réception).
--
-- Le semis du 28/08 (ancien gabarit, 46 dossiers) n'a reçu aucune coche
-- manuelle ni échéance (vérifié : fait_par et echeance null partout) : on
-- purge l'ancien semis, le nouveau gabarit se sème au prochain chargement.

delete from syndic_taches
where cle in (
  'registre', 'comptes-aides', 'odj-ag',
  'ag-vote', 'pv-ag', 'fiche-etat', 'compte-travaux', 'assurance-do',
  'dossiers-aides', 'suivi-chantier', 'acomptes', 'solde-aides', 'ag-quitus'
)
-- garde-fou : on ne supprime jamais une tâche touchée à la main
and fait_par is null and echeance is null;

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
