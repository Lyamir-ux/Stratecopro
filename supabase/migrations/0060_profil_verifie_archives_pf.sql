-- 0060 - Feedbacks de Théa (équipe AMO) du 03/09/2026 :
-- 1. Profil de ressources DÉCLARATIF / VÉRIFIÉ et daté : le portail et les
--    exports distinguent un profil déclaré par le copropriétaire (enquête)
--    d'un profil vérifié par l'AMO sur l'avis d'imposition. Toute nouvelle
--    déclaration depuis le portail repasse le profil en déclaratif.
-- 2. Revenu fiscal de référence N-2 (terminologie Anah) à côté du RFR de
--    l'avis d'imposition N-1 qui détermine le profil.
-- 3. Archivage et versionnage automatiques du classeur « Plan de financement
--    définitif » dans l'onglet Fichiers : le classeur source à l'import, un
--    export de l'état validé à chaque validation (version incrémentée).

-- ========== 1 & 2. Profil de ressources ==========
alter table enquete_reponses
  add column if not exists rfr_n2 numeric,
  add column if not exists profil_statut text not null default 'declaratif'
    check (profil_statut in ('declaratif', 'verifie')),
  add column if not exists profil_verifie_le timestamptz,
  add column if not exists profil_verifie_par uuid references profiles (user_id) on delete set null;

comment on column enquete_reponses.rfr is
  'Revenu fiscal de référence de l''avis d''imposition N-1 (détermine le profil Anah) - ne jamais exposer hors AMO / intéressé';
comment on column enquete_reponses.rfr_n2 is
  'Revenu fiscal de référence N-2 (avant-dernier avis) - même confidentialité que rfr';
comment on column enquete_reponses.profil_statut is
  'declaratif = déclaré par le copropriétaire ; verifie = contrôlé par l''AMO sur l''avis d''imposition';

-- Un profil vérifié par l'AMO doit être daté et signé.
alter table enquete_reponses drop constraint if exists enquete_reponses_profil_verifie_coherent;
alter table enquete_reponses add constraint enquete_reponses_profil_verifie_coherent
  check (profil_statut <> 'verifie' or profil_verifie_le is not null);

-- ========== 3. Archives du PF définitif ==========
alter table plans_definitifs
  add column if not exists version int not null default 1,
  add column if not exists source_fichier_id uuid references fichiers (id) on delete set null,
  add column if not exists valide_fichier_id uuid references fichiers (id) on delete set null,
  add column if not exists valide_le timestamptz;

comment on column plans_definitifs.source_fichier_id is
  'Classeur source archivé dans fichiers (dossier Plans de financement) à l''import';
comment on column plans_definitifs.valide_fichier_id is
  'Export .xlsx de l''état validé, archivé dans fichiers à la dernière validation';
comment on column plans_definitifs.version is
  'Numéro de version incrémenté à chaque validation (archivage)';
